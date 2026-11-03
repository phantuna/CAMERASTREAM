package org.example.camerastream.modules.eventhub.reporting.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Kết quả báo cáo tổng hợp.
 *
 * <p>{@code totalRows} = số dòng thực sự có trong DB (có thể > items.length
 * khi bị cắt cụt tại {@code MAX_EXPORT_LIMIT}). {@code isTruncated} báo cho UI
 * biết rằng kết quả đang bị cắt để hiển thị cảnh báo.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrafficSummaryResult {
    private List<TrafficSummaryItemDto> items;
    private boolean isTruncated;
    private long totalRows;
    private int page;
    private int size;
    private int totalPages;
    private long totalPlates;
    private long totalIns;
    private long totalOuts;
}
