package org.example.camerastream.modules.eventhub.reporting.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** 1 dòng báo cáo tổng hợp theo 1 biển số (mỗi biển = 1 dòng, gộp nhiều camera). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrafficSummaryItemDto {

    private String plateNumber;
    private String vehicleType;

    /** Camera xuất hiện gần nhất (tên thân thiện cho UI). */
    private Long cameraId;
    private String cameraName;

    /** Lượt vào / lượt ra (xác định từ CameraType IN_GATE / OUT_GATE của camera). */
    private long inCount;
    private long outCount;

    /** Tổng số event cho biển số này trong khoảng (bất kể hướng). */
    private long totalEvents;

    /** Độ tin cậy trung bình (0..1) trong khoảng. */
    private Double confidenceAvg;

    /** Thời điểm event gần nhất của biển số này. */
    private LocalDateTime lastSeenAt;

    /** Làn/cổng cuối (laneId trong payload, nếu có). */
    private String lastLane;
}
