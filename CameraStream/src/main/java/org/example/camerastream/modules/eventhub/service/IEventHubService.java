package org.example.camerastream.modules.eventhub.service;

import org.example.camerastream.modules.eventhub.dto.EventWebhookRequest;
import org.example.camerastream.modules.eventhub.dto.SystemEventDto;
import org.example.camerastream.modules.eventhub.entity.EventSeverity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public interface IEventHubService {

    CompletableFuture<SystemEventDto> publishEventAsync(EventWebhookRequest request);

    SystemEventDto publishEvent(EventWebhookRequest request);

    List<SystemEventDto> getRecentEvents(int limit);

    Page<SystemEventDto> searchEvents(String eventType, Long cameraId, String keyword,
                                      String vehicleType,
                                      LocalDate fromDate, LocalDate toDate,
                                      Pageable pageable);

    Page<SystemEventDto> searchEvents(String eventType, Long cameraId, String keyword,
                                      LocalDate fromDate, LocalDate toDate,
                                      Pageable pageable);

    Map<String, Long> getEventStats(String eventType, String keyword,
                                    LocalDate fromDate, LocalDate toDate);

    Page<SystemEventDto> searchAlerts(EventSeverity severity,
                                      Boolean acknowledged,
                                      LocalDate fromDate, LocalDate toDate,
                                      Pageable pageable);

    /**
     * Lấy các event mới hơn mốc thời gian, dùng cho incremental polling.
     *
     * @return danh sách event tăng dần theo thời gian (rỗng nếu không có gì mới)
     */
    List<SystemEventDto> getEventsSince(String eventType, LocalDateTime since, int size);

    /**
     * ETag mã hoá trạng thái hiện tại của collection event.
     *
     * <p>Mã hoá {@code max(created_at) + count}, độc lập với mốc {@code since}
     * mà client gửi lên — nếu phụ thuộc {@code since} thì client đổi mốc là
     * ETag đổi theo, mất ý nghĩa của {@code If-None-Match}.
     */
    String buildCollectionEtag();

    boolean acknowledgeEvent(Long id);
}
