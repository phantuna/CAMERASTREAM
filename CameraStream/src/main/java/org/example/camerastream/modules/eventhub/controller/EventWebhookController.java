package org.example.camerastream.modules.eventhub.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.eventhub.dto.EventWebhookRequest;
import org.example.camerastream.modules.eventhub.dto.SystemEventDto;
import org.example.camerastream.modules.eventhub.entity.EventSeverity;
import org.example.camerastream.modules.eventhub.service.IEventHubService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping({"/api/v1/events", "/api/ai/events"})
@RequiredArgsConstructor
@Slf4j
public class EventWebhookController {

    private final IEventHubService eventHubService;

    /**
     * Universal Webhook Endpoint for any module (AI Services, IoT, Camera, External)
     * Supports both /api/v1/events/webhook and /api/v1/events/ai
     */
    @PostMapping({"", "/webhook", "/ai"})
    public ApiResponse<SystemEventDto> receiveEvent(@RequestBody EventWebhookRequest request) {
        if (request.getEventType() == null || request.getEventType().trim().isEmpty()) {
            return ApiResponse.error(400, "eventType is required");
        }
        SystemEventDto published = eventHubService.publishEvent(request);
        return ApiResponse.success("Event received and broadcasted successfully", published);
    }

    /**
     * High-throughput Asynchronous Ingestion Endpoint.
     * Offloads DB persistence and WebSocket fan-out to the dedicated cameraEventExecutor thread-pool.
     * Returns immediately (<2ms) without blocking AI detection workers.
     */
    @PostMapping("/async")
    public ApiResponse<String> receiveEventAsync(@RequestBody EventWebhookRequest request) {
        if (request.getEventType() == null || request.getEventType().trim().isEmpty()) {
            return ApiResponse.error(400, "eventType is required");
        }
        eventHubService.publishEventAsync(request);
        return ApiResponse.success("Event queued for async processing", "QUEUED");
    }

    /**
     * Get recent active events for quick feed / notification center
     */
    @RequirePermission("ALPR_VIEW")
    @GetMapping("/recent")
    public ApiResponse<List<SystemEventDto>> getRecentEvents(
            @RequestParam(defaultValue = "20") int limit) {
        return ApiResponse.success(eventHubService.getRecentEvents(limit));
    }

    /**
     * Search and paginate system events with filters
     */
    @RequirePermission("ALPR_VIEW")
    @GetMapping
    public ApiResponse<Page<SystemEventDto>> searchEvents(
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) Long cameraId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String vehicleType,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<SystemEventDto> result = eventHubService.searchEvents(
                eventType,
                cameraId,
                keyword != null && !keyword.trim().isEmpty() ? keyword.trim() : null,
                vehicleType != null && !vehicleType.trim().isEmpty() ? vehicleType.trim() : null,
                fromDate,
                toDate,
                PageRequest.of(page, Math.min(size, 500))
        );
        return ApiResponse.success(result);
    }

    /**
     * Get aggregate statistics for events within a date range (Total, Cars, Motos, Persons)
     */
    @RequirePermission("ALPR_VIEW")
    @GetMapping("/stats")
    public ApiResponse<java.util.Map<String, Long>> getEventStats(
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate) {
        return ApiResponse.success(eventHubService.getEventStats(
                eventType,
                keyword != null && !keyword.trim().isEmpty() ? keyword.trim() : null,
                fromDate,
                toDate
        ));
    }

    /**
     * Search and paginate Alerts (events with WARNING / CRITICAL severity or unacknowledged)
     */
    @RequirePermission("ALERTS_VIEW")
    @GetMapping("/alerts")
    public ApiResponse<Page<SystemEventDto>> searchAlerts(
            @RequestParam(required = false) EventSeverity severity,
            @RequestParam(required = false) Boolean acknowledged,
            @RequestParam(required = false) LocalDate fromDate,
            @RequestParam(required = false) LocalDate toDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<SystemEventDto> result = eventHubService.searchAlerts(
                severity,
                acknowledged,
                fromDate,
                toDate,
                PageRequest.of(page, Math.min(size, 500))
        );
        return ApiResponse.success(result);
    }

    /**
     * Incremental polling: lấy các event MỚI HƠN mốc thời gian cho trước.
     *
     * <p>Thay cho việc tải toàn bộ danh sách mỗi chu kỳ. Client gửi {@code since}
     * (ISO-8601) của lần poll trước và nhận về chỉ phần mới.
     *
     * <p>Kèm header {@code ETag} mã hoá trạng thái hiện tại — client gửi lại
     * {@code If-None-Match} và nhận {@code 304 Not Modified} nếu không có gì mới,
     * tiết kiệm toàn bộ body.
     */
    @RequirePermission("ALPR_VIEW")
    @GetMapping("/incremental")
    public ResponseEntity<ApiResponse<List<SystemEventDto>>> getIncrementalEvents(
            @RequestParam(required = false) LocalDateTime since,
            @RequestParam(required = false) String eventType,
            @RequestParam(defaultValue = "100") int size,
            @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {

        List<SystemEventDto> events = eventHubService.getEventsSince(eventType, since, size);
        String etag = eventHubService.buildCollectionEtag();

        // Client đang giữ đúng phiên bản hiện tại -> không có gì mới -> 304.
        // ETag phải mã hoá trạng thái COLLECTION, không phụ thuộc `since`:
        // nếu mã hoá `since` thì client đổi mốc là ETag đổi theo, mất ý nghĩa.
        if (ifNoneMatch != null && ifNoneMatch.equals(etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(etag)
                    .build();
        }

        return ResponseEntity.ok()
                .eTag(etag)
                .body(ApiResponse.success(events));
    }

    private final java.util.concurrent.ConcurrentHashMap<String, Long> idempotencyCache = new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * Acknowledge an event (Chuẩn HPTicket Idempotency-Key chống click đúp khi mạng giật)
     */
    @RequirePermission("ALERTS_ACK")
    @PostMapping({"/{id}/ack", "/ack/{id}"})
    public ApiResponse<Boolean> acknowledgeEventPost(
            @PathVariable Long id,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return doAcknowledge(id, idempotencyKey);
    }

    @RequirePermission("ALERTS_ACK")
    @PutMapping({"/{id}/ack", "/ack/{id}"})
    public ApiResponse<Boolean> acknowledgeEventPut(
            @PathVariable Long id,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return doAcknowledge(id, idempotencyKey);
    }

    private ApiResponse<Boolean> doAcknowledge(Long id, String idempotencyKey) {
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Long existingTime = idempotencyCache.get(idempotencyKey);
            long now = System.currentTimeMillis();
            if (existingTime != null && (now - existingTime) < 600_000) { // 10 phút
                return ApiResponse.success("Event acknowledged (Idempotent replay)", true);
            }
            idempotencyCache.put(idempotencyKey, now);
            // Dọn dẹp cache nếu quá 1000 phần tử
            if (idempotencyCache.size() > 1000) {
                idempotencyCache.entrySet().removeIf(e -> (now - e.getValue()) > 600_000);
            }
        }

        boolean success = eventHubService.acknowledgeEvent(id);
        if (success) {
            return ApiResponse.success("Event acknowledged", true);
        }
        return ApiResponse.error(404, "Event not found with ID: " + id);
    }
}
