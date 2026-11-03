package org.example.camerastream.modules.eventhub.repository;

import org.example.camerastream.modules.eventhub.entity.EventSeverity;
import org.example.camerastream.modules.eventhub.entity.SystemEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public interface SystemEventRepositoryCustom {

    Page<SystemEvent> searchEvents(
            String eventType,
            Long cameraId,
            String keyword,
            String vehicleType,
            LocalDateTime fromTime,
            LocalDateTime toTime,
            Pageable pageable
    );

    Page<SystemEvent> searchEvents(
            String eventType,
            Long cameraId,
            String keyword,
            LocalDateTime fromTime,
            LocalDateTime toTime,
            Pageable pageable
    );

    Page<SystemEvent> searchAlerts(
            EventSeverity severity,
            Boolean acknowledged,
            LocalDateTime fromTime,
            LocalDateTime toTime,
            Pageable pageable
    );

    Map<String, Long> getEventStats(
            String eventType,
            LocalDateTime fromTime,
            LocalDateTime toTime,
            String keyword
    );

    /**
     * Đếm KPI dashboard trong khoảng thời gian: tổng event, phân bố theo severity,
     * và số cảnh báo chưa xác nhận. Trả về map với các key:
     * {@code total, severity_INFO, severity_WARNING, severity_CRITICAL, unackedAlerts}.
     */
    Map<String, Long> getDashboardCounts(LocalDateTime fromTime, LocalDateTime toTime);

    /**
     * Phân bố event VEHICLE_ANPR theo loại xe (từ JSON payload, kiểu JSON-LIKE như
     * {@code getEventStats}). Trả về map key: {@code CAR, MOTO, TRUCK, PERSON, OTHER}.
     */
    Map<String, Long> getVehicleTypeBreakdown(LocalDateTime fromTime, LocalDateTime toTime);

    /**
     * Lấy danh sách event dùng cho báo cáo tổng hợp lượt ra/vào (giới hạn bằng limit).
     * Sắp xếp mới nhất trước.
     */
    List<org.example.camerastream.modules.eventhub.entity.SystemEvent> findTrafficSummaryEvents(
            String eventType, Long cameraId, String plateKeyword,
            LocalDateTime fromTime, LocalDateTime toTime, int limit);

    /** Đếm toàn bộ event khớp bộ lọc (không bị giới hạn) — để báo truncated. */
    long countTrafficSummaryEvents(
            String eventType, Long cameraId, String plateKeyword,
            LocalDateTime fromTime, LocalDateTime toTime);
}
