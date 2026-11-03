package org.example.camerastream.modules.camera.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.dto.CameraAiConfigDto;
import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.entity.CameraAiConfig;
import org.example.camerastream.modules.camera.entity.CameraAiType;
import org.example.camerastream.modules.camera.entity.CameraType;
import org.example.camerastream.modules.camera.repository.CameraAiConfigRepository;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.example.camerastream.modules.eventhub.audit.service.IAuditLogService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class CameraAiServiceImpl implements ICameraAiService {

    private final CameraAiConfigRepository aiConfigRepository;
    private final CameraRepository cameraRepository;
    private final IAuditLogService auditLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    @Transactional(readOnly = true)
    public List<CameraAiConfigDto> getAiConfigsByCamera(Long cameraId) {
        Camera camera = cameraRepository.findActiveById(cameraId)
                .orElseThrow(() -> new IllegalArgumentException("Camera not found with ID: " + cameraId));

        List<CameraAiConfig> existing = aiConfigRepository.findByCameraIdActive(cameraId);
        Map<String, CameraAiConfig> map = existing.stream()
                .collect(Collectors.toMap(CameraAiConfig::getAiType, c -> c, (a, b) -> a));

        List<CameraAiConfigDto> result = new ArrayList<>();
        for (CameraAiType aiType : CameraAiType.values()) {
            CameraAiConfig config = map.get(aiType.getCode());
            if (config != null) {
                result.add(mapToDto(config, camera));
            } else {
                // Chỉ tự động BẬT mặc định nếu Camera mới toanh chưa từng lưu bất kỳ cấu hình AI nào
                boolean defaultEnabled = false;
                if (existing.isEmpty() && aiType == CameraAiType.VEHICLE_ANPR) {
                    defaultEnabled = (camera.getType() == CameraType.IN_GATE 
                                   || camera.getType() == CameraType.OUT_GATE 
                                   || camera.getId().equals(39L)
                                   || (camera.getName() != null && camera.getName().contains("192.168.1.61")));
                }

                result.add(CameraAiConfigDto.builder()
                        .cameraId(camera.getId())
                        .cameraName(camera.getName())
                        .streamPath(camera.getStreamPath())
                        .rtspSubStreamUrl(camera.getRtspSubStreamUrl() != null ? camera.getRtspSubStreamUrl() : camera.getRtspSourceUrl())
                        .aiType(aiType.getCode())
                        .enabled(defaultEnabled)
                        .inferenceFps(aiType.getDefaultFps())
                        .confidenceThreshold(aiType.getDefaultConfidence())
                        .roiCoordinates("[]")
                        .build());
            }
        }
        return result;
    }

    @Override
    @Transactional
    @org.springframework.cache.annotation.CacheEvict(value = "active_cameras", allEntries = true)
    public List<CameraAiConfigDto> saveCameraAiConfigs(Long cameraId, List<CameraAiConfigDto> dtos) {
        Camera camera = cameraRepository.findActiveById(cameraId)
                .orElseThrow(() -> new IllegalArgumentException("Camera not found with ID: " + cameraId));

        List<CameraAiConfigDto> savedResults = new ArrayList<>();

        for (CameraAiConfigDto dto : dtos) {
            if (dto.getAiType() == null || dto.getAiType().isBlank()) continue;

            CameraAiType resolvedType = CameraAiType.fromCode(dto.getAiType());
            String aiType = resolvedType != null ? resolvedType.getCode() : dto.getAiType().trim().toUpperCase();

            CameraAiConfig entity = aiConfigRepository.findByCameraIdAndAiTypeActive(cameraId, aiType)
                    .orElse(CameraAiConfig.builder()
                            .cameraId(cameraId)
                            .aiType(aiType)
                            .build());

            entity.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : false);
            entity.setInferenceFps(dto.getInferenceFps() != null 
                    ? Math.max(1, Math.min(dto.getInferenceFps(), 30)) 
                    : (resolvedType != null ? resolvedType.getDefaultFps() : 6));
            entity.setConfidenceThreshold(dto.getConfidenceThreshold() != null 
                    ? dto.getConfidenceThreshold() 
                    : (resolvedType != null ? resolvedType.getDefaultConfidence() : 0.80f));
            if (dto.getRoiCoordinates() != null) {
                entity.setRoiCoordinates(dto.getRoiCoordinates());
            }
            if (dto.getNotes() != null) {
                entity.setNotes(dto.getNotes());
            }

            CameraAiConfig saved = aiConfigRepository.save(entity);
            savedResults.add(mapToDto(saved, camera));

            Map<String, Object> newData = new LinkedHashMap<>();
            newData.put("aiType", saved.getAiType());
            newData.put("enabled", saved.getEnabled());
            newData.put("inferenceFps", saved.getInferenceFps());
            newData.put("confidenceThreshold", saved.getConfidenceThreshold());
            newData.put("roiCoordinates", saved.getRoiCoordinates());

            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("note", "Cập nhật cấu hình AI (" + saved.getAiType() + ") cho camera " + camera.getName());
                payload.put("newData", newData);
                auditLogService.record(AuditRecord.builder()
                        .actionType("UPDATE")
                        .targetEntity("CameraAiConfig")
                        .targetId(camera.getId())
                        .targetDisplay(camera.getName() + " [" + saved.getAiType() + "]")
                        .reason(objectMapper.writeValueAsString(payload))
                        .success(true)
                        .build());
            } catch (Exception ignored) {
            }
        }

        log.info("Updated AI configs for Camera #{} ({} pipelines)", cameraId, savedResults.size());
        return savedResults;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CameraAiConfigDto> getActiveTasksByAiType(String aiType) {
        CameraAiType parsed = CameraAiType.fromCode(aiType);
        String targetType = parsed != null ? parsed.getCode() : (aiType != null ? aiType.trim().toUpperCase() : CameraAiType.VEHICLE_ANPR.getCode());
        List<CameraAiConfig> configs = aiConfigRepository.findEnabledByAiTypeActive(targetType);

        List<CameraAiConfigDto> result = new ArrayList<>();
        for (CameraAiConfig c : configs) {
            cameraRepository.findActiveById(c.getCameraId()).ifPresent(camera -> {
                result.add(mapToDto(c, camera));
            });
        }

        // Fallback tự động: CHỈ KHI hệ thống chưa từng lưu bất kỳ cấu hình nào trong CSDL (lần đầu cài đặt)
        // Nếu người dùng đã từng cấu hình và chủ động tắt hết, tuyệt đối không tự động bật lại!
        boolean hasAnySavedConfig = aiConfigRepository.count() > 0;
        if (result.isEmpty() && !hasAnySavedConfig && CameraAiType.VEHICLE_ANPR.getCode().equals(targetType)) {
            List<Camera> gateCameras = cameraRepository.findAllActive().stream()
                    .filter(c -> c.getType() == CameraType.IN_GATE 
                              || c.getType() == CameraType.OUT_GATE 
                              || c.getId().equals(39L)
                              || (c.getName() != null && c.getName().contains("192.168.1.61")))
                    .collect(Collectors.toList());
            for (Camera camera : gateCameras) {
                result.add(CameraAiConfigDto.builder()
                        .cameraId(camera.getId())
                        .cameraName(camera.getName())
                        .streamPath(camera.getStreamPath())
                        .rtspSubStreamUrl(camera.getRtspSubStreamUrl() != null ? camera.getRtspSubStreamUrl() : camera.getRtspSourceUrl())
                        .aiType(CameraAiType.VEHICLE_ANPR.getCode())
                        .enabled(true)
                        .inferenceFps(CameraAiType.VEHICLE_ANPR.getDefaultFps())
                        .confidenceThreshold(CameraAiType.VEHICLE_ANPR.getDefaultConfidence())
                        .roiCoordinates("[]")
                        .build());
            }
        }

        return result;
    }

    private CameraAiConfigDto mapToDto(CameraAiConfig entity, Camera camera) {
        String subUrl = camera.getRtspSubStreamUrl();
        if (subUrl == null || subUrl.isBlank()) {
            subUrl = camera.getRtspSourceUrl();
        }

        return CameraAiConfigDto.builder()
                .id(entity.getId())
                .cameraId(camera.getId())
                .cameraName(camera.getName())
                .streamPath(camera.getStreamPath())
                .rtspSubStreamUrl(subUrl)
                .aiType(entity.getAiType())
                .enabled(entity.getEnabled())
                .inferenceFps(entity.getInferenceFps())
                .confidenceThreshold(entity.getConfidenceThreshold())
                .roiCoordinates(entity.getRoiCoordinates())
                .notes(entity.getNotes())
                .build();
    }
}
