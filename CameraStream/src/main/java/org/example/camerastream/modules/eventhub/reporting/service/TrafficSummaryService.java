package org.example.camerastream.modules.eventhub.reporting.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.entity.CameraType;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.eventhub.entity.SystemEvent;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryFilterQuery;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryItemDto;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryResult;
import org.example.camerastream.modules.eventhub.repository.SystemEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Báo cáo tổng hợp lượt ra/vào theo biển số (port HPParking pattern:
 * tải có giới hạn → gộp in-memory → báo truncated).
 *
 * <p>Chiến lược:
 *  1. Đọc tối đa {@value #MAX_EXPORT_LIMIT} event mới nhất trong khoảng (QueryDSL).
 *  2. Đếm tổng sự thật để biết có bị cắt cụt không (1 COUNT query).
 *  3. Parse payload_json (JACKSON, không regex) → extract plateNumber, vehicleType, laneId.
 *  4. Gộp theo plate+camera; phân loại vào/ra theo CameraType của camera
 *     (IN_GATE = vào, OUT_GATE = ra, khác = chưa phân biệt).
 */
@Service
@Slf4j
public class TrafficSummaryService {

    /** Giới hạn trên — HPParking dùng 10k; giữ nguyên (chiến lược "count then truncate"). */
    public static final int MAX_EXPORT_LIMIT = 10_000;

    private final SystemEventRepository eventRepository;
    private final CameraRepository cameraRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TrafficSummaryService(SystemEventRepository eventRepository,
                                CameraRepository cameraRepository) {
        this.eventRepository = eventRepository;
        this.cameraRepository = cameraRepository;
    }

    @Transactional(readOnly = true)
    public TrafficSummaryResult getTrafficSummary(TrafficSummaryFilterQuery query) {
        LocalDateTime from = query.getFromDate() != null
                ? query.getFromDate().atStartOfDay()
                : LocalDate.now().minusDays(7).atStartOfDay();
        LocalDateTime to = query.getToDate() != null
                ? query.getToDate().plusDays(1).atStartOfDay()
                : LocalDate.now().plusDays(1).atStartOfDay();

        String eventType = query.getEventType() != null && !query.getEventType().isBlank()
                ? query.getEventType() : "VEHICLE_ANPR";

        // 1. Đếm thật (không bị giới hạn)
        long totalRows = eventRepository.countTrafficSummaryEvents(
                eventType, query.getCameraId(), query.getPlateKeyword(), from, to);
        boolean isTruncated = totalRows > MAX_EXPORT_LIMIT;

        // 2. Tải về tối đa MAX_EXPORT_LIMIT event (mới nhất trước)
        List<SystemEvent> events = eventRepository.findTrafficSummaryEvents(
                eventType, query.getCameraId(), query.getPlateKeyword(), from, to, MAX_EXPORT_LIMIT);

        // 3. Cache camera type để phân loại vào/ra (1 lần, tránh N+1)
        Map<Long, Camera> cameraCache = new HashMap<>();
        cameraRepository.findAllActive().forEach(c -> cameraCache.put(c.getId(), c));

        // 4. Group by (plate, cameraId) — in-memory
        Map<String, TrafficSummaryItemDto> grouped = new HashMap<>();
        Map<String, Double> confidenceSums = new HashMap<>();
        Map<String, Integer> confidenceCounts = new HashMap<>();

        for (SystemEvent ev : events) {
            JsonNode payload = parsePayload(ev.getPayloadJson());
            String plate = textOr(payload, "plateNumber", "UNKNOWN");
            String vehicleType = textOr(payload, "vehicleType", "UNKNOWN");
            String laneId = textOr(payload, "laneId", null);
            Float confidence = ev.getConfidence();
            LocalDateTime createdAt = ev.getCreated_at();

            Long cameraId = ev.getCameraId();
            String key = plate + "|" + cameraId;

            Camera cam = cameraId != null ? cameraCache.get(cameraId) : null;
            String resolvedLane = laneId;
            if (resolvedLane == null || resolvedLane.isBlank() || "default".equalsIgnoreCase(resolvedLane)) {
                if (cam != null) {
                    if (cam.getLocation() != null && !cam.getLocation().isBlank()) {
                        resolvedLane = cam.getLocation();
                    } else if (cam.getType() != null) {
                        resolvedLane = cam.getType() == CameraType.IN_GATE ? "Cổng Vào"
                                : (cam.getType() == CameraType.OUT_GATE ? "Cổng Ra" : cam.getType().name());
                    }
                }
            } else if (cam != null && cam.getLocation() != null && !cam.getLocation().isBlank()) {
                if ("IN_GATE".equalsIgnoreCase(resolvedLane) || "OUT_GATE".equalsIgnoreCase(resolvedLane)) {
                    resolvedLane = cam.getLocation();
                }
            }

            final String finalLane = resolvedLane;
            TrafficSummaryItemDto item = grouped.computeIfAbsent(key, k -> {
                String cameraName = cam != null && cam.getName() != null
                        ? cam.getName()
                        : (cameraId != null ? "Camera #" + cameraId : "Camera giám sát");
                return TrafficSummaryItemDto.builder()
                        .plateNumber(plate)
                        .vehicleType(vehicleType)
                        .cameraId(cameraId)
                        .cameraName(cameraName)
                        .lastSeenAt(createdAt)
                        .lastLane(finalLane)
                        .build();
            });

            item.setTotalEvents(item.getTotalEvents() + 1);
            if (createdAt != null && (item.getLastSeenAt() == null || createdAt.isAfter(item.getLastSeenAt()))) {
                item.setLastSeenAt(createdAt);
                if (finalLane != null) {
                    item.setLastLane(finalLane);
                }
            }
            if ((item.getLastLane() == null || item.getLastLane().isBlank()) && finalLane != null) {
                item.setLastLane(finalLane);
            }

            // Xác định hướng: IN_GATE = vào, OUT_GATE = ra
            if (cam != null) {
                if (cam.getType() == CameraType.IN_GATE) {
                    item.setInCount(item.getInCount() + 1);
                } else if (cam.getType() == CameraType.OUT_GATE) {
                    item.setOutCount(item.getOutCount() + 1);
                }
            }

            if (confidence != null) {
                confidenceSums.merge(key, confidence.doubleValue(), Double::sum);
                confidenceCounts.merge(key, 1, Integer::sum);
            }
        }

        // Gán confidenceAvg
        grouped.forEach((k, item) -> {
            Integer cnt = confidenceCounts.get(k);
            if (cnt != null && cnt > 0) {
                item.setConfidenceAvg(confidenceSums.get(k) / cnt);
            }
        });

        List<TrafficSummaryItemDto> items = new ArrayList<>(grouped.values());
        items.sort(Comparator.comparing(
                (TrafficSummaryItemDto x) -> x.getPlateNumber() == null ? "" : x.getPlateNumber(),
                String.CASE_INSENSITIVE_ORDER));

        long totalPlates = items.size();
        long totalIns = 0L;
        long totalOuts = 0L;
        for (TrafficSummaryItemDto it : items) {
            totalIns += it.getInCount();
            totalOuts += it.getOutCount();
        }

        int page = query.getPage() != null ? Math.max(0, query.getPage()) : 0;
        int size = query.getSize() != null && query.getSize() > 0 ? query.getSize() : items.size();
        if (size == 0) size = 20;

        int totalPages = items.isEmpty() ? 0 : (int) Math.ceil((double) items.size() / size);

        List<TrafficSummaryItemDto> pagedItems;
        if (query.getPage() != null || (query.getSize() != null && query.getSize() < items.size())) {
            int start = Math.min(page * size, items.size());
            int end = Math.min(start + size, items.size());
            pagedItems = items.subList(start, end);
        } else {
            pagedItems = items;
        }

        log.info("TrafficSummary: {} plates (page {}/{}, size={}, total events {}, truncated={})",
                items.size(), page, totalPages, size, totalRows, isTruncated);

        return TrafficSummaryResult.builder()
                .items(pagedItems)
                .isTruncated(isTruncated)
                .totalRows(totalRows)
                .page(page)
                .size(size)
                .totalPages(totalPages)
                .totalPlates(totalPlates)
                .totalIns(totalIns)
                .totalOuts(totalOuts)
                .build();
    }

    private JsonNode parsePayload(String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(payloadJson);
        } catch (Exception e) {
            log.debug("Cannot parse payload JSON: {}", e.getMessage());
            return null;
        }
    }

    private String textOr(JsonNode payload, String key, String fallback) {
        if (payload == null) return fallback;
        JsonNode node = payload.get(key);
        return node != null && !node.isNull() ? node.asText() : fallback;
    }
}
