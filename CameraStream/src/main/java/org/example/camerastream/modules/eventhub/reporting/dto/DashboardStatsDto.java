package org.example.camerastream.modules.eventhub.reporting.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Snapshot KPI + series cho Dashboard. Port pattern từ HPParking
 * (DashboardStatisticsDto: scalar + categorical breakdown + series).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardStatsDto {

    // --- Tổng quan (số "hiện tại" trong khung thời gian query) ---
    private long totalEvents;
    private long activeCameraCount;
    private long totalCameraCount;
    private long inCount;
    private long outCount;
    private long totalGates;
    private long totalLanes;
    private long activeLanes;

    // --- Phân loại (categorical breakdown -> KPI + pie/bar chart) ---
    private Map<String, Long> eventsByVehicleType;
    private Map<String, Long> eventsBySeverity;

    // --- Series thời gian (line/area chart) ---
    private List<TimePoint> hourlyEventCounts;

    // --- Tỷ lệ & cảnh báo suy ra ---
    private double criticalRatePct;
    private long unacknowledgedAlertCount;

    /** 1 điểm dữ liệu series: mốc bucket + giá trị. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TimePoint {
        private String bucket;      // ISO-8601 của bucket (vd "2026-10-29T14:00")
        private long value;
    }
}
