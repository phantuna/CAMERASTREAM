package org.example.camerastream.modules.eventhub.reporting.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/** Bộ lọc báo cáo tổng hợp lượt ra/vào theo biển số. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrafficSummaryFilterQuery {
    private LocalDate fromDate;
    private LocalDate toDate;
    /** Mặc định VEHICLE_ANPR (lượt xe qua cổng). */
    private String eventType;
    private Long cameraId;
    /** Từ khóa biển số (substring, case-insensitive). */
    private String plateKeyword;
    /** Phân trang: số trang (0-based). */
    private Integer page;
    /** Phân trang: số dòng mỗi trang. */
    private Integer size;
}
