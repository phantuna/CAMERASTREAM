package org.example.camerastream.modules.eventhub.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.example.camerastream.modules.eventhub.audit.service.IAuditLogService;
import org.example.camerastream.modules.eventhub.dto.EventWebhookRequest;
import org.example.camerastream.modules.eventhub.dto.SystemEventDto;
import org.example.camerastream.modules.eventhub.entity.EventSeverity;
import org.example.camerastream.modules.eventhub.entity.SystemEvent;
import org.example.camerastream.modules.eventhub.repository.SystemEventRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class EventHubServiceImpl implements IEventHubService {

    private final SystemEventRepository eventRepository;
    private final CameraRepository cameraRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ApplicationEventPublisher eventPublisher;
    private final IAuditLogService auditLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Cache tên camera dạng Thread-safe để loại bỏ hàng nghìn lệnh SELECT DB lặp lại vô nghĩa
    private final ConcurrentHashMap<Long, String> cameraNameCache = new java.util.concurrent.ConcurrentHashMap<>();

    @Override
    @org.springframework.scheduling.annotation.Async("cameraEventExecutor")
    public CompletableFuture<SystemEventDto> publishEventAsync(EventWebhookRequest request) {
        return java.util.concurrent.CompletableFuture.completedFuture(publishEvent(request));
    }

    @Override
    @Transactional
    public SystemEventDto publishEvent(EventWebhookRequest request) {
        String eventType = request.getEventType() != null ? request.getEventType().trim().toUpperCase() : "GENERAL_EVENT";
        EventSeverity severity = request.getSeverity() != null ? request.getSeverity() : EventSeverity.INFO;

        String cameraName = request.getCameraName();
        if (request.getCameraId() != null && (cameraName == null || cameraName.trim().isEmpty())) {
            cameraName = cameraNameCache.computeIfAbsent(request.getCameraId(), id ->
                    cameraRepository.findById(id)
                            .map(cam -> cam.getName())
                            .orElse("Camera #" + id)
            );
        }

        String payloadJson = null;
        if (request.getPayload() != null) {
            if ("VEHICLE_ANPR".equals(eventType) && "ALPR_YOLOX".equals(request.getModuleSource())
                    && request.getPayload() instanceof java.util.Map<?, ?> rawMap) {
                Object digest = rawMap.remove("syncDigest");
                if (digest == null || String.valueOf(digest).isBlank()) {
                    return null;
                }
            }
            try {
                if (request.getPayload() instanceof String) {
                    payloadJson = (String) request.getPayload();
                } else {
                    payloadJson = objectMapper.writeValueAsString(request.getPayload());
                }
            } catch (JsonProcessingException e) {
                log.warn("Could not serialize event payload to JSON: {}", e.getMessage());
                payloadJson = String.valueOf(request.getPayload());
            }
        }

        SystemEvent entity = SystemEvent.builder()
                .eventType(eventType)
                .moduleSource(request.getModuleSource() != null ? request.getModuleSource() : "EXTERNAL")
                .cameraId(request.getCameraId())
                .cameraName(cameraName)
                .snapshotUrl(request.getSnapshotUrl())
                .confidence(request.getConfidence())
                .severity(severity)
                .payloadJson(payloadJson)
                .acknowledged(false)
                .build();

        SystemEvent saved = eventRepository.save(entity);
        SystemEventDto dto = mapToDto(saved, request.getPayload());

        // 1. Broadcast STOMP WebSocket to Frontend (/topic/events & /topic/events/{eventType})
        try {
            messagingTemplate.convertAndSend("/topic/events", dto);
            messagingTemplate.convertAndSend("/topic/events/" + eventType, dto);
        } catch (Exception ex) {
            log.warn("Failed to broadcast WebSocket event: {}", ex.getMessage());
        }

        // 2. Publish internal Spring ApplicationEvent for local decoupled listeners
        try {
            eventPublisher.publishEvent(dto);
        } catch (Exception ex) {
            log.warn("Failed to publish Spring ApplicationEvent: {}", ex.getMessage());
        }

        log.debug("System Event [{} - {}] captured from module '{}' for Camera '{}'",
                saved.getId(), eventType, saved.getModuleSource(), saved.getCameraName());

        return dto;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SystemEventDto> getRecentEvents(int limit) {
        int cappedLimit = Math.min(Math.max(limit, 1), 200);
        return eventRepository.findRecentActiveEvents(PageRequest.of(0, cappedLimit))
                .stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SystemEventDto> searchEvents(String eventType, Long cameraId, String keyword,
                                             LocalDate fromDate, LocalDate toDate,
                                             Pageable pageable) {
        return searchEvents(eventType, cameraId, keyword, null, fromDate, toDate, pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SystemEventDto> searchEvents(String eventType, Long cameraId, String keyword,
                                             String vehicleType,
                                             LocalDate fromDate, LocalDate toDate,
                                             Pageable pageable) {
        // Luôn truyền mốc thời gian không-null (tránh lỗi kiểu tham số null của PostgreSQL)
        LocalDateTime from = fromDate != null
                ? fromDate.atStartOfDay()
                : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime to = toDate != null
                ? toDate.plusDays(1).atStartOfDay()
                : LocalDateTime.of(2100, 1, 1, 0, 0);
        return eventRepository.searchEvents(eventType, cameraId, keyword, vehicleType, from, to, pageable)
                .map(this::mapToDto);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Long> getEventStats(String eventType, String keyword,
                                                     LocalDate fromDate, LocalDate toDate) {
        LocalDateTime from = fromDate != null
                ? fromDate.atStartOfDay()
                : LocalDateTime.of(2000, 1, 1, 0, 0);
        LocalDateTime to = toDate != null
                ? toDate.plusDays(1).atStartOfDay()
                : LocalDateTime.of(2100, 1, 1, 0, 0);
        return eventRepository.getEventStats(eventType, from, to, keyword);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SystemEventDto> searchAlerts(EventSeverity severity,
                                             Boolean acknowledged,
                                             LocalDate fromDate, LocalDate toDate,
                                             Pageable pageable) {
        // SLA 24H: Cảnh báo chưa xử lý mặc định chỉ lấy trong 24 giờ gần nhất
        LocalDateTime from;
        if (fromDate != null) {
            from = fromDate.atStartOfDay();
        } else if (Boolean.FALSE.equals(acknowledged)) {
            from = LocalDateTime.now().minusHours(24);
        } else {
            from = LocalDateTime.of(2000, 1, 1, 0, 0);
        }

        LocalDateTime to = toDate != null
                ? toDate.plusDays(1).atStartOfDay()
                : LocalDateTime.of(2100, 1, 1, 0, 0);
        return eventRepository.searchAlerts(severity, acknowledged, from, to, pageable)
                .map(this::mapToDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SystemEventDto> getEventsSince(String eventType, java.time.LocalDateTime since, int size) {
        LocalDateTime from = since != null
                ? since
                : LocalDateTime.of(2000, 1, 1, 0, 0);
        return eventRepository.findEventsSince(eventType, from, PageRequest.of(0, Math.min(size, 500)))
                .stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Override
    public String buildCollectionEtag() {
        LocalDateTime maxCreatedAt = eventRepository.findMaxCreatedAt();
        long count = eventRepository.countActiveEvents();
        String marker = (maxCreatedAt != null ? maxCreatedAt.toString() : "empty") + "|" + count;
        return "\"" + Integer.toHexString(marker.hashCode()) + "\"";
    }

    @Override
    @Transactional
    public boolean acknowledgeEvent(Long id) {
        boolean found = eventRepository.findById(id).map(e -> {
            e.setAcknowledged(true);
            eventRepository.save(e);
            // Ghi audit (khép transaction, không bắt lỗi — audit không phá nghiệp vụ)
            auditLogService.record(AuditRecord.builder()
                    .actorUsername("SYSTEM")
                    .source("WEBADMIN")
                    .actionType("ACK")
                    .targetEntity("SystemEvent")
                    .targetId(id)
                    .targetDisplay("Event #" + id + " [" + e.getEventType() + "]")
                    .reason("acknowledge")
                    .success(true)
                    .build());
            return true;
        }).orElse(false);

        if (!found) {
            auditLogService.record(AuditRecord.builder()
                    .actorUsername("SYSTEM")
                    .source("WEBADMIN")
                    .actionType("ACK")
                    .targetEntity("SystemEvent")
                    .targetId(id)
                    .reason("acknowledge (failed: not found)")
                    .success(false)
                    .errorMessage("Event not found with ID: " + id)
                    .build());
        }
        return found;
    }

    // Helper mapping
    private SystemEventDto mapToDto(SystemEvent entity) {
        return mapToDto(entity, null);
    }

    private SystemEventDto mapToDto(SystemEvent entity, Object explicitPayload) {
        Object parsedPayload = explicitPayload;
        if (parsedPayload == null && entity.getPayloadJson() != null && !entity.getPayloadJson().isEmpty()) {
            try {
                parsedPayload = objectMapper.readValue(entity.getPayloadJson(), Object.class);
            } catch (Exception e) {
                parsedPayload = entity.getPayloadJson();
            }
        }

        return SystemEventDto.builder()
                .id(entity.getId())
                .eventType(entity.getEventType())
                .moduleSource(entity.getModuleSource())
                .cameraId(entity.getCameraId())
                .cameraName(entity.getCameraName())
                .snapshotUrl(entity.getSnapshotUrl())
                .confidence(entity.getConfidence())
                .severity(entity.getSeverity())
                .payload(parsedPayload)
                .acknowledged(entity.getAcknowledged())
                .createdAt(entity.getCreated_at())
                .build();
    }
}
