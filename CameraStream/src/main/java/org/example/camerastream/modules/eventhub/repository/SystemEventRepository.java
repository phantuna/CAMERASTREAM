package org.example.camerastream.modules.eventhub.repository;

import org.example.camerastream.modules.eventhub.entity.SystemEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface SystemEventRepository extends JpaRepository<SystemEvent, Long>, SystemEventRepositoryCustom {

    @Query("SELECT e FROM SystemEvent e WHERE e.active = true ORDER BY e.created_at DESC")
    List<SystemEvent> findRecentActiveEvents(Pageable pageable);

    /**
     * Lấy các event MỚI HƠN mốc thời gian cho incremental polling.
     * Sắp xếp tăng dần theo thời gian để client áp dụng theo đúng thứ tự.
     */
    @Query("SELECT e FROM SystemEvent e WHERE e.active = true " +
           "AND (:eventType IS NULL OR e.eventType = :eventType) " +
           "AND e.created_at > :since " +
           "ORDER BY e.created_at ASC")
    List<SystemEvent> findEventsSince(
            @Param("eventType") String eventType,
            @Param("since") LocalDateTime since,
            Pageable pageable
    );

    /**
     * Mốc thời gian của event mới nhất — dùng để tính ETag.
     */
    @Query("SELECT MAX(e.created_at) FROM SystemEvent e WHERE e.active = true")
    LocalDateTime findMaxCreatedAt();

    /**
     * Tổng số event đang active — dùng để tính ETag.
     */
    @Query("SELECT COUNT(e) FROM SystemEvent e WHERE e.active = true")
    long countActiveEvents();

    /**
     * Đếm event theo bucket thời gian (line chart KPI dashboard).
     * granularity = 'hour' | 'day' (Postgres date_trunc). Trả về [bucket (LocalDateTime), count].
     */
    @Query(value = "SELECT date_trunc(CAST(:granularity AS text), created_at) AS bucket, COUNT(*) " +
            "FROM system_events " +
            "WHERE is_active = TRUE " +
            "AND created_at >= :from AND created_at < :to " +
            "AND (:eventType IS NULL OR event_type = :eventType) " +
            "GROUP BY bucket ORDER BY bucket", nativeQuery = true)
    List<Object[]> countEventsByBucket(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("granularity") String granularity,
            @Param("eventType") String eventType
    );
}
