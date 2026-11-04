package org.example.camerastream.modules.camera.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.dto.CameraCreateRequest;
import org.example.camerastream.modules.camera.dto.CameraDto;
import org.example.camerastream.modules.camera.dto.CameraEventMessage;
import org.example.camerastream.modules.camera.dto.CameraUpdateRequest;
import org.example.camerastream.modules.camera.dto.PlateDetectionRequest;
import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.entity.CameraStatus;
import org.example.camerastream.modules.camera.entity.CameraType;
import org.example.camerastream.modules.camera.hardware.ICameraHardwareConnector;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.example.camerastream.modules.eventhub.audit.service.IAuditLogService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;

import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class CameraServiceImpl implements ICameraService {

    private final CameraRepository cameraRepository;
    private final ICameraHardwareConnector hardwareConnector;
    private final SimpMessagingTemplate messagingTemplate;
    private final org.example.camerastream.modules.eventhub.service.IEventHubService eventHubService;
    private final org.example.camerastream.modules.snapshot.service.ISnapshotStorageService snapshotStorageService;
    private final org.example.camerastream.modules.camera.repository.CameraAiConfigRepository aiConfigRepository;
    private final IAuditLogService auditLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    @Transactional(readOnly = true)
    @Cacheable(value = "active_cameras")
    public List<CameraDto> getAllCameras() {
        return cameraRepository.findAllActive().stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public Page<CameraDto> getCamerasPaginated(String keyword, Pageable pageable) {
        return cameraRepository.searchActivePaginated(
                keyword != null && !keyword.trim().isEmpty() ? keyword.trim() : null,
                pageable
        ).map(this::mapToDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<CameraDto> searchCameras(String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return getAllCameras();
        }
        return cameraRepository.searchActive(keyword.trim()).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<CameraDto> getCameraById(Long id) {
        return cameraRepository.findActiveById(id).map(this::mapToDto);
    }

    @Override
    @CacheEvict(value = "active_cameras", allEntries = true)
    public CameraDto createCamera(CameraCreateRequest request) {
        String streamPath = (request.getStreamPath() != null && !request.getStreamPath().isBlank())
                ? request.getStreamPath().trim().replaceAll("[^a-zA-Z0-9_-]", "_")
                : "cam_" + UUID.randomUUID().toString().substring(0, 8);

        int onvifPort = request.getOnvifPort() != null ? request.getOnvifPort() : 80;
        int rtspPort = request.getRtspPort() != null ? request.getRtspPort() : 554;

        String resolvedRtspUrl = request.getRtspSourceUrl();
        CameraStatus initialStatus = CameraStatus.ONLINE;
        String lastError = null;

        if (resolvedRtspUrl == null || resolvedRtspUrl.isBlank()) {
            log.info("Resolving RTSP URL via ONVIF for {}:{}", request.getIpAddress(), onvifPort);
            try {
                resolvedRtspUrl = hardwareConnector.resolveRtspUri(
                        request.getIpAddress(),
                        onvifPort,
                        request.getUsername(),
                        request.getPassword()
                );
            } catch (Exception e) {
                log.warn("Could not resolve RTSP URL via ONVIF: {}", e.getMessage());
                initialStatus = CameraStatus.ERROR;
                lastError = e.getMessage();
            }
        }

        // UPSERT LOGIC: If a camera with this streamPath already exists, update and resurrect it instead of failing
        Optional<Camera> existingOpt = cameraRepository.findByStreamPath(streamPath);
        Camera camera;
        if (existingOpt.isPresent()) {
            camera = existingOpt.get();
            log.info("Camera with streamPath '{}' already exists (ID: {}). Updating existing camera (UPSERT).", streamPath, camera.getId());
            camera.setName(request.getName());
            camera.setIpAddress(request.getIpAddress());
            camera.setOnvifPort(onvifPort);
            camera.setRtspPort(rtspPort);
            camera.setUsername(request.getUsername());
            if (request.getPassword() != null && !request.getPassword().isBlank()) {
                camera.setPassword(request.getPassword());
            }
            if (resolvedRtspUrl != null && !resolvedRtspUrl.isBlank()) {
                camera.setRtspSourceUrl(resolvedRtspUrl);
            }
            if (request.getType() != null) camera.setType(request.getType());
            if (request.getLocation() != null) camera.setLocation(request.getLocation());
            camera.setStatus(initialStatus);
            camera.setLastError(lastError);
            camera.setActive(true);
            camera.setDeleted_at(null);
        } else {
            camera = mapToEntity(request, streamPath, resolvedRtspUrl, onvifPort, rtspPort, initialStatus, lastError);
        }

        Camera saved = cameraRepository.save(camera);

        if (saved.getRtspSourceUrl() != null && !saved.getRtspSourceUrl().isBlank()) {
            hardwareConnector.registerStream(streamPath, saved.getRtspSourceUrl());
        }

        CameraDto dto = mapToDto(saved);
        broadcastCameraEvent("CAMERA_CREATED", saved.getId(), saved.getName(), streamPath, dto);

        Map<String, Object> newData = new LinkedHashMap<>();
        newData.put("name", saved.getName());
        newData.put("ipAddress", saved.getIpAddress());
        newData.put("rtspPort", saved.getRtspPort());
        newData.put("onvifPort", saved.getOnvifPort());
        newData.put("type", saved.getType() != null ? saved.getType().name() : null);
        newData.put("location", saved.getLocation());
        newData.put("streamPath", saved.getStreamPath());

        auditLogService.record(AuditRecord.builder()
                .actionType("CREATE")
                .targetEntity("Camera")
                .targetId(saved.getId())
                .targetDisplay(saved.getName() + " (" + saved.getIpAddress() + ")")
                .reason(toJsonReason("Thêm mới camera giám sát " + saved.getName(), null, newData, null))
                .success(true)
                .build());

        return dto;
    }

    @Override
    @CacheEvict(value = "active_cameras", allEntries = true)
    public CameraDto updateCamera(Long id, CameraUpdateRequest request) {
        Camera camera = cameraRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Camera not found with ID: " + id));

        Map<String, Object> oldData = new LinkedHashMap<>();
        oldData.put("name", camera.getName());
        oldData.put("ipAddress", camera.getIpAddress());
        oldData.put("rtspPort", camera.getRtspPort());
        oldData.put("onvifPort", camera.getOnvifPort());
        oldData.put("type", camera.getType() != null ? camera.getType().name() : null);
        oldData.put("location", camera.getLocation());

        boolean connectionChanged = !Objects.equals(camera.getIpAddress(), request.getIpAddress())
                || (request.getOnvifPort() != null && !Objects.equals(camera.getOnvifPort(), request.getOnvifPort()))
                || (request.getRtspPort() != null && !Objects.equals(camera.getRtspPort(), request.getRtspPort()))
                || (request.getUsername() != null && !Objects.equals(camera.getUsername(), request.getUsername()))
                || (request.getPassword() != null && !request.getPassword().isBlank());

        if (request.getName() != null && !request.getName().isBlank()) {
            camera.setName(request.getName().trim());
        }
        if (request.getIpAddress() != null && !request.getIpAddress().isBlank()) {
            camera.setIpAddress(request.getIpAddress().trim());
        }
        if (request.getOnvifPort() != null) camera.setOnvifPort(request.getOnvifPort());
        if (request.getRtspPort() != null) camera.setRtspPort(request.getRtspPort());
        if (request.getUsername() != null) camera.setUsername(request.getUsername());
        if (request.getPassword() != null && !request.getPassword().isBlank()) camera.setPassword(request.getPassword());
        if (request.getType() != null) camera.setType(request.getType());
        if (request.getLocation() != null) camera.setLocation(request.getLocation());
        if (request.getRtspSubStreamUrl() != null) camera.setRtspSubStreamUrl(request.getRtspSubStreamUrl());

        String resolvedRtsp = request.getRtspSourceUrl();
        boolean hasExistingRtsp = camera.getRtspSourceUrl() != null && !camera.getRtspSourceUrl().isBlank();
        if ((resolvedRtsp == null || resolvedRtsp.isBlank()) && (!hasExistingRtsp || connectionChanged) && camera.getIpAddress() != null) {
            try {
                resolvedRtsp = hardwareConnector.resolveRtspUri(
                        camera.getIpAddress(),
                        camera.getOnvifPort() != null ? camera.getOnvifPort() : 80,
                        camera.getUsername(),
                        camera.getPassword()
                );
            } catch (Exception e) {
                log.warn("Could not re-resolve RTSP URL for camera {}: {}", id, e.getMessage());
            }
        }

        if (resolvedRtsp != null && !resolvedRtsp.isBlank()) {
            camera.setRtspSourceUrl(resolvedRtsp.trim());
            try {
                hardwareConnector.registerStream(camera.getStreamPath(), camera.getRtspSourceUrl());
            } catch (Exception e) {
                log.warn("Could not register stream for camera {}: {}", id, e.getMessage());
            }
        }

        Camera saved = cameraRepository.save(camera);
        CameraDto dto = mapToDto(saved);
        broadcastCameraEvent("CAMERA_UPDATED", saved.getId(), saved.getName(), saved.getStreamPath(), dto);

        try {
            Map<String, Object> newData = new LinkedHashMap<>();
            newData.put("name", saved.getName());
            newData.put("ipAddress", saved.getIpAddress());
            newData.put("rtspPort", saved.getRtspPort());
            newData.put("onvifPort", saved.getOnvifPort());
            newData.put("type", saved.getType() != null ? saved.getType().name() : null);
            newData.put("location", saved.getLocation());

            Map<String, Object> changes = computeDiff(oldData, newData);
            auditLogService.record(AuditRecord.builder()
                    .actionType("UPDATE")
                    .targetEntity("Camera")
                    .targetId(saved.getId())
                    .targetDisplay(saved.getName() + " (" + saved.getIpAddress() + ")")
                    .reason(toJsonReason("Cập nhật cấu hình camera " + saved.getName(), oldData, newData, changes))
                    .success(true)
                    .build());
        } catch (Exception e) {
            log.warn("Failed to record audit log for camera update {}: {}", id, e.getMessage());
        }

        return dto;
    }

    @Override
    @CacheEvict(value = "active_cameras", allEntries = true)
    public void deleteCamera(Long id) {
        cameraRepository.findById(id).ifPresent(camera -> {
            Map<String, Object> oldData = new LinkedHashMap<>();
            oldData.put("name", camera.getName());
            oldData.put("ipAddress", camera.getIpAddress());
            oldData.put("type", camera.getType() != null ? camera.getType().name() : null);
            oldData.put("location", camera.getLocation());
            oldData.put("streamPath", camera.getStreamPath());

            hardwareConnector.removeStream(camera.getStreamPath());
            cameraRepository.delete(camera);
            log.info("Successfully deleted camera ID: {} with streamPath: {}", id, camera.getStreamPath());
            broadcastCameraEvent("CAMERA_DELETED", camera.getId(), camera.getName(), camera.getStreamPath(), null);

            auditLogService.record(AuditRecord.builder()
                    .actionType("DELETE")
                    .targetEntity("Camera")
                    .targetId(camera.getId())
                    .targetDisplay(camera.getName() + " (" + camera.getIpAddress() + ")")
                    .reason(toJsonReason("Xóa thiết bị camera " + camera.getName(), oldData, null, null))
                    .success(true)
                    .build());
        });
    }

    private Map<String, Object> computeDiff(Map<String, Object> oldData, Map<String, Object> newData) {
        Map<String, Object> changes = new LinkedHashMap<>();
        if (oldData == null || newData == null) return changes;
        for (String key : newData.keySet()) {
            Object oldVal = oldData.get(key);
            Object newVal = newData.get(key);
            if (!Objects.equals(oldVal, newVal)) {
                Map<String, Object> pair = new LinkedHashMap<>();
                pair.put("old", oldVal);
                pair.put("new", newVal);
                changes.put(key, pair);
            }
        }
        return changes;
    }

    private String toJsonReason(String note,Map<String, Object> oldData, Map<String, Object> newData, Map<String, Object> changes) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            if (note != null) payload.put("note", note);
            if (oldData != null && !oldData.isEmpty()) payload.put("oldData", oldData);
            if (newData != null && !newData.isEmpty()) payload.put("newData", newData);
            if (changes != null && !changes.isEmpty()) payload.put("changes", changes);
            return objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            return note;
        }
    }

    @Override
    public byte[] getCameraSnapshot(Long id) {
        Camera camera = cameraRepository.findActiveById(id)
                .orElseThrow(() -> new IllegalArgumentException("Camera not found with ID: " + id));

        return hardwareConnector.fetchSnapshot(
                camera.getIpAddress(),
                camera.getOnvifPort(),
                camera.getUsername(),
                camera.getPassword()
        );
    }

    // Quản lý bộ đệm chống spam sự kiện nhận diện cùng 1 biển số lặp lại (15s cooldown theo từng camera)
    private static final long PLATE_COOLDOWN_MS = 15_000L;
    private final ConcurrentHashMap<String, Long> recentPlateDetections = new ConcurrentHashMap<>();

    private boolean isSimilarPlate(String p1, String p2) {
        if (p1.equals(p2)) return true;
        if (Math.abs(p1.length() - p2.length()) > 1) return false;

        // Nếu chênh lệch 1 ký tự (lẹm mép): chỉ coi là cùng biển khi chuỗi ngắn nằm ở đầu hoặc cuối chuỗi dài
        if (p1.length() != p2.length()) {
            String shortS = p1.length() < p2.length() ? p1 : p2;
            String longS = p1.length() < p2.length() ? p2 : p1;
            return shortS.length() >= 7 && (longS.startsWith(shortS) || longS.endsWith(shortS));
        }

        // Cùng độ dài: chỉ coi là cùng 1 biển nếu trùng hoàn toàn 5 số cuối (số đăng ký) và chỉ lệch 1 ký tự phần đầu
        // Tuyệt đối KHÔNG gộp 2 biển số khác nhau xuất hiện gần nhau trên cùng 1 camera!
        if (p1.length() >= 7) {
            String tail1 = p1.substring(p1.length() - 5);
            String tail2 = p2.substring(p2.length() - 5);
            if (tail1.equals(tail2) && computeLevenshteinDistance(p1, p2) <= 1) {
                return true;
            }
        }
        return false;
    }

    private int computeLevenshteinDistance(String s1, String s2) {
        int[] prev = new int[s2.length() + 1];
        for (int j = 0; j <= s2.length(); j++) prev[j] = j;
        for (int i = 1; i <= s1.length(); i++) {
            int[] curr = new int[s2.length() + 1];
            curr[0] = i;
            for (int j = 1; j <= s2.length(); j++) {
                int cost = (s1.charAt(i - 1) == s2.charAt(j - 1)) ? 0 : 1;
                curr[j] = Math.min(Math.min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            prev = curr;
        }
        return prev[s2.length()];
    }

    @Override
    public void processPlateDetection(Long cameraId, PlateDetectionRequest request) {
        String rawPlate = request.getPlateNumber();
        if (rawPlate == null || rawPlate.trim().isEmpty()) {
            return;
        }
        String cleanPlate = rawPlate.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        long now = System.currentTimeMillis();
        String camPrefix = (cameraId != null ? cameraId : 0L) + ":";

        // Dọn dẹp các biển số đã hết hạn > 2 phút
        recentPlateDetections.entrySet().removeIf(entry -> (now - entry.getValue()) > 120_000L);

        // Kiểm tra trùng lặp với các biển số đã ghi nhận gần đây trên CÙNG camera
        for (Map.Entry<String, Long> entry : recentPlateDetections.entrySet()) {
            String key = entry.getKey();
            if (!key.startsWith(camPrefix)) {
                continue;
            }
            String recordedPlate = key.substring(camPrefix.length());
            if (isSimilarPlate(cleanPlate, recordedPlate)) {
                long elapsed = (now - entry.getValue()) / 1000L;
                if (elapsed < (PLATE_COOLDOWN_MS / 1000L)) {
                    log.info("Chống spam AI Detection [Camera #{}]: Biển số '{}' (~'{}') vừa được ghi nhận cách đây {}s -> Bỏ qua phát sóng lặp.",
                            cameraId, rawPlate, recordedPlate, elapsed);
                    return;
                }
            }
        }

        recentPlateDetections.put(camPrefix + cleanPlate, now);

        Camera camera = cameraRepository.findActiveById(cameraId).orElse(null);
        String cameraName = camera != null ? camera.getName() : ("Cổng Camera #" + cameraId);
        String streamPath = camera != null ? camera.getStreamPath() : ("cam-" + cameraId);

        log.info("AI Plate Detection at '{}': Plate='{}', Conf={}%",
                cameraName, request.getPlateNumber(),
                request.getConfidence() != null ? Math.round(request.getConfidence() * 100) : 0);

        broadcastCameraEvent("PLATE_DETECTED", cameraId, cameraName, streamPath, request);

        // Forward to Universal Event Hub for persistent storage and dynamic module routing
        try {
            Map<String, Object> payloadMap = new HashMap<>();
            payloadMap.put("plateNumber", request.getPlateNumber());
            payloadMap.put("vehicleType", request.getVehicleType() != null ? request.getVehicleType() : "UNKNOWN");
            payloadMap.put("detectedAt", request.getDetectedAt());
            String lane = request.getLaneId();
            if (lane == null || lane.isBlank() || "default".equalsIgnoreCase(lane)) {
                if (camera != null && camera.getLocation() != null && !camera.getLocation().isBlank()) {
                    lane = camera.getLocation();
                } else if (camera != null && camera.getType() != null) {
                    lane = camera.getType() == org.example.camerastream.modules.camera.entity.CameraType.IN_GATE ? "Cổng Vào"
                            : (camera.getType() == org.example.camerastream.modules.camera.entity.CameraType.OUT_GATE ? "Cổng Ra" : camera.getType().name());
                }
            }
            if (lane != null) {
                payloadMap.put("laneId", lane);
            }

            // Ảnh được AI service lưu ra đĩa và gửi kèm TÊN FILE. Ta ghép thành
            // URL tuyệt đối để frontend tải được; DB chỉ giữ URL, không giữ ảnh.
            String plateCropUrl = snapshotStorageService.buildPublicUrl(request.getPlateCropFile());
            String fullImageUrl = snapshotStorageService.buildPublicUrl(request.getFullImageFile());

            if (plateCropUrl != null) {
                payloadMap.put("hasPlateCrop", true);
                payloadMap.put("plateCropUrl", plateCropUrl);
            } else if (request.getPlateCropBase64() != null) {
                // Tương thích ngược: AI service phiên bản cũ gửi base64.
                // Chỉ phục vụ tạm thời — ảnh base64 không lưu được trong DB và
                // sẽ mất khi server restart.
                payloadMap.put("hasPlateCrop", true);
                payloadMap.put("plateCropUrl", request.getPlateCropBase64());
                log.warn("[ANPR] Nhận được ảnh dạng base64 từ AI service cũ — nên cập nhật sang gửi tên file");
            }

            eventHubService.publishEvent(org.example.camerastream.modules.eventhub.dto.EventWebhookRequest.builder()
                    .eventType("VEHICLE_ANPR")
                    .moduleSource("ALPR_YOLOX")
                    .cameraId(cameraId)
                    .cameraName(cameraName)
                    .snapshotUrl(fullImageUrl != null ? fullImageUrl : plateCropUrl)
                    .confidence(request.getConfidence() != null ? request.getConfidence().floatValue() : null)
                    .severity(org.example.camerastream.modules.eventhub.entity.EventSeverity.INFO)
                    .payload(payloadMap)
                    .build());
        } catch (Exception ex) {
            // KHÔNG nuốt lỗi im lặng: trước đây chỉ log.warn khiến ảnh hỏng
            // mất tiếng mà không ai biết. Giờ log đầy đủ stack trace.
            log.error("Could not forward plate detection to Universal Event Hub", ex);
        }
    }

    @Override
    public boolean ptzControl(Long id, String action) {
        Camera camera = cameraRepository.findActiveById(id)
                .orElseThrow(() -> new IllegalArgumentException("Camera not found with ID: " + id));

        return hardwareConnector.ptzControl(
                camera.getIpAddress(),
                camera.getOnvifPort(),
                camera.getUsername(),
                camera.getPassword(),
                action
        );
    }

    @Override
    public void broadcastCameraEvent(String eventType, Long cameraId, String cameraName, String streamPath, Object payload) {
        try {
            CameraEventMessage message = CameraEventMessage.builder()
                    .eventType(eventType)
                    .cameraId(cameraId)
                    .cameraName(cameraName)
                    .streamPath(streamPath)
                    .payload(payload)
                    .build();
            messagingTemplate.convertAndSend("/topic/cameras/events", message);
        } catch (Exception e) {
            log.debug("WebSocket broadcast error: {}", e.getMessage());
        }
    }

    // =========================================================================
    // HELPER MAPPING METHODS (MANDATED BY RULE.MD AT THE END OF SERVICE FILE)
    // =========================================================================

    private CameraDto mapToDto(Camera camera) {
        List<org.example.camerastream.modules.camera.entity.CameraAiConfig> configs = 
                aiConfigRepository != null ? aiConfigRepository.findByCameraIdActive(camera.getId()) : List.of();
        List<String> activeMods;
        if (configs == null || configs.isEmpty()) {
            activeMods = List.of("VEHICLE_ANPR");
        } else {
            activeMods = configs.stream()
                    .filter(c -> Boolean.TRUE.equals(c.getEnabled()))
                    .map(org.example.camerastream.modules.camera.entity.CameraAiConfig::getAiType)
                    .collect(Collectors.toList());
        }

        return CameraDto.builder()
                .id(camera.getId())
                .name(camera.getName())
                .ipAddress(camera.getIpAddress())
                .onvifPort(camera.getOnvifPort())
                .rtspPort(camera.getRtspPort())
                .username(camera.getUsername())
                .streamPath(camera.getStreamPath())
                .type(camera.getType())
                .location(camera.getLocation())
                .status(camera.getStatus())
                .lastError(camera.getLastError())
                .rtspSourceUrl(camera.getRtspSourceUrl())
                .rtspSubStreamUrl(camera.getRtspSubStreamUrl())
                .webrtcUrl(hardwareConnector.buildWebrtcUrl(camera.getStreamPath()))
                .hlsUrl(hardwareConnector.buildHlsUrl(camera.getStreamPath()))
                .rtspRelayUrl(hardwareConnector.buildRtspRelayUrl(camera.getStreamPath()))
                .snapshotApiUrl("/api/cameras/" + camera.getId() + "/snapshot")
                .activeAiModules(activeMods)
                .createdAt(camera.getCreated_at())
                .updatedAt(camera.getUpdated_at())
                .build();
    }

    private Camera mapToEntity(CameraCreateRequest request, String streamPath, String resolvedRtspUrl,
                               int onvifPort, int rtspPort, CameraStatus status, String lastError) {
        return Camera.builder()
                .name(request.getName())
                .ipAddress(request.getIpAddress())
                .onvifPort(onvifPort)
                .rtspPort(rtspPort)
                .username(request.getUsername())
                .password(request.getPassword())
                .streamPath(streamPath)
                .rtspSourceUrl(resolvedRtspUrl)
                .rtspSubStreamUrl(request.getRtspSubStreamUrl())
                .type(request.getType() != null ? request.getType() : CameraType.IN_GATE)
                .location(request.getLocation())
                .status(status)
                .lastError(lastError)
                .build();
    }
}
