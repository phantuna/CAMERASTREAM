package org.example.camerastream.modules.eventhub.reporting.service;

import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.eventhub.entity.QSystemEvent;
import org.example.camerastream.modules.eventhub.reporting.dto.DashboardQueryDto;
import org.example.camerastream.modules.eventhub.reporting.dto.DashboardStatsDto;
import org.example.camerastream.modules.eventhub.repository.SystemEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

/**
 * KPI + series cho Dashboard (port pattern HPParking StatisticsService:
 * chạy N QueryDSL song song trong 1 round-trip thay vì tuần tự).
 *
 * <p>Phạm vi: event VEHICLE_ANPR + số camera active. Các field "gates/lanes"
 * là placeholder (hệ này chưa có entity Gate/Lane) — giá trị mặc định 0,
 * backend session có thể thay bằng thật nếu có module mới.
 */
@Service
@Slf4j
public class StatisticsService {

    private final SystemEventRepository eventRepository;
    private final CameraRepository cameraRepository;
    private final JPAQueryFactory queryFactory;
    private final Executor kpiExecutor;
    private final Clock clock = Clock.systemDefaultZone();

    /**
     * 4 pool Executor tồn tại (cameraEvent/Snapshot/HealthCheck/BackupRecovery) —
     * phải @Qualifier rõ để Spring không injection sai. Dùng cameraEventExecutor:
     * pool riêng cho AI event, bounded queue + CallerRunsPolicy, phù hợp load nhẹ của KPI query.
     */
    public StatisticsService(
            SystemEventRepository eventRepository,
            CameraRepository cameraRepository,
            JPAQueryFactory queryFactory,
            @org.springframework.beans.factory.annotation.Qualifier("cameraEventExecutor") Executor kpiExecutor) {
        this.eventRepository = eventRepository;
        this.cameraRepository = cameraRepository;
        this.queryFactory = queryFactory;
        this.kpiExecutor = kpiExecutor;
    }

    /** Mặc định khung thời gian khi query không truyền from/to (24h). */
    private static final Duration DEFAULT_WINDOW = Duration.ofHours(24);

    @Transactional(readOnly = true)
    public DashboardStatsDto getDashboardStats(DashboardQueryDto query) {
        LocalDateTime to = resolveTo(query != null ? query.getToDate() : null);
        LocalDateTime from = resolveFrom(to, query != null ? query.getFromDate() : null);
        
        String granularity;
        if (query != null && query.getGranularity() != null && !query.getGranularity().isBlank()) {
            granularity = "DAY".equalsIgnoreCase(query.getGranularity()) ? "day" : "hour";
        } else {
            // Tự động suy luận: nếu lọc trong 1 ngày -> hour (24 giờ), nếu nhiều ngày -> day
            long daysBetween = ChronoUnit.DAYS.between(from.toLocalDate(), to.toLocalDate());
            granularity = daysBetween <= 1 ? "hour" : "day";
        }

        int bucketCount;
        if ("hour".equals(granularity)) {
            long hours = ChronoUnit.HOURS.between(from, to);
            bucketCount = Math.max(1, (int) Math.min(168, hours));
        } else {
            long days = ChronoUnit.DAYS.between(from.toLocalDate(), to.toLocalDate());
            bucketCount = Math.max(1, (int) Math.min(366, days));
        }

        // ==== 3 truy vấn CHẠY SONG SONG (mimicking HPParking Task.WhenAll) ====
        CompletableFuture<Map<String, Long>> countsF =
                CompletableFuture.supplyAsync(() -> eventRepository.getDashboardCounts(from, to), kpiExecutor);
        CompletableFuture<Map<String, Long>> vehicleF =
                CompletableFuture.supplyAsync(() -> eventRepository.getVehicleTypeBreakdown(from, to), kpiExecutor);
        CompletableFuture<List<org.example.camerastream.modules.camera.entity.Camera>> allCamerasF =
                CompletableFuture.supplyAsync(() -> cameraRepository.findAllActive(), kpiExecutor);
        CompletableFuture<Map<String, Long>> eventsBySeverityF =
                CompletableFuture.supplyAsync(() -> buildSeverityBreakdown(from, to), kpiExecutor);

        CompletableFuture.allOf(countsF, vehicleF, allCamerasF, eventsBySeverityF).join();

        Map<String, Long> counts = countsF.join();
        long totalEvents = counts.getOrDefault("total", 0L);
        List<org.example.camerastream.modules.camera.entity.Camera> allCams = allCamerasF.join();
        long totalCameraCount = allCams.size();
        long activeCameraCount = allCams.stream()
                .filter(c -> c.getStatus() == org.example.camerastream.modules.camera.entity.CameraStatus.ONLINE)
                .count();
        if (activeCameraCount == 0 && totalCameraCount > 0) {
            // Fallback neu chua co heartbeat ONVIF
            activeCameraCount = totalCameraCount;
        }

        // Tinh luot xe vao (IN) va xe ra (OUT) theo phan loai Camera IN_GATE / OUT_GATE
        java.util.Set<Long> inCamIds = allCams.stream()
                .filter(c -> c.getType() == org.example.camerastream.modules.camera.entity.CameraType.IN_GATE)
                .map(org.example.camerastream.modules.camera.entity.Camera::getId)
                .collect(java.util.stream.Collectors.toSet());
        java.util.Set<Long> outCamIds = allCams.stream()
                .filter(c -> c.getType() == org.example.camerastream.modules.camera.entity.CameraType.OUT_GATE)
                .map(org.example.camerastream.modules.camera.entity.Camera::getId)
                .collect(java.util.stream.Collectors.toSet());

        QSystemEvent event = QSystemEvent.systemEvent;
        long inCount = 0L;
        long outCount = 0L;
        if (!inCamIds.isEmpty()) {
            Long cIn = queryFactory.select(event.count()).from(event)
                    .where(event.active.isTrue().and(event.created_at.goe(from).and(event.created_at.lt(to))).and(event.cameraId.in(inCamIds)))
                    .fetchOne();
            inCount = cIn != null ? cIn : 0L;
        }
        if (!outCamIds.isEmpty()) {
            Long cOut = queryFactory.select(event.count()).from(event)
                    .where(event.active.isTrue().and(event.created_at.goe(from).and(event.created_at.lt(to))).and(event.cameraId.in(outCamIds)))
                    .fetchOne();
            outCount = cOut != null ? cOut : 0L;
        }

        Map<String, Long> eventsByVehicleType = vehicleF.join();
        Map<String, Long> eventsBySeverity = eventsBySeverityF.join();

        long critical = eventsBySeverity.getOrDefault("CRITICAL", 0L);
        double criticalRatePct = totalEvents == 0 ? 0.0
                : Math.round((critical * 10000.0) / totalEvents) / 100.0;
        long unacknowledgedAlertCount = counts.getOrDefault("unackedAlerts", 0L);

        // ==== Series thời gian ====
        List<DashboardStatsDto.TimePoint> hourlyEventCounts =
                buildSeries(from, to, granularity, bucketCount, "VEHICLE_ANPR");

        return DashboardStatsDto.builder()
                .totalEvents(totalEvents)
                .activeCameraCount(activeCameraCount)
                .totalCameraCount(totalCameraCount)
                .inCount(inCount)
                .outCount(outCount)
                .totalGates(0L)   // placeholder — chưa có entity Gate
                .totalLanes(0L)   // placeholder — chưa có entity Lane
                .activeLanes(0L)   // placeholder
                .eventsByVehicleType(eventsByVehicleType)
                .eventsBySeverity(eventsBySeverity)
                .hourlyEventCounts(hourlyEventCounts)
                .criticalRatePct(criticalRatePct)
                .unacknowledgedAlertCount(unacknowledgedAlertCount)
                .build();
    }

    // ============================ HELPERS ============================

    private Map<String, Long> buildSeverityBreakdown(LocalDateTime from, LocalDateTime to) {
        QSystemEvent event = QSystemEvent.systemEvent;
        com.querydsl.core.BooleanBuilder base = new com.querydsl.core.BooleanBuilder();
        base.and(event.active.isTrue());
        base.and(event.created_at.goe(from).and(event.created_at.lt(to)));

        Map<String, Long> result = new HashMap<>();
        for (org.example.camerastream.modules.eventhub.entity.EventSeverity s
                : org.example.camerastream.modules.eventhub.entity.EventSeverity.values()) {
            com.querydsl.core.BooleanBuilder sb = new com.querydsl.core.BooleanBuilder(base);
            sb.and(event.severity.eq(s));
            Long c = queryFactory.select(event.count()).from(event).where(sb).fetchOne();
            result.put(s.name(), c != null ? c : 0L);
        }
        return result;
    }

    /**
     * Sinh series bucket (hourly hoặc daily) — fill giá trị thiếu bằng 0 để chart liền mạch.
     * Dùng QueryDSL date_trunc để lấy nhóm bucket thật, rồi fill thiếu.
     */
    private List<DashboardStatsDto.TimePoint> buildSeries(
            LocalDateTime from, LocalDateTime to, String granularity, int bucketCount, String eventType) {
        QSystemEvent event = QSystemEvent.systemEvent;
        com.querydsl.core.BooleanBuilder base = new com.querydsl.core.BooleanBuilder();
        base.and(event.active.isTrue());
        base.and(event.created_at.goe(from).and(event.created_at.lt(to)));
        if (eventType != null && !eventType.isBlank()) {
            base.and(event.eventType.eq(eventType));
        }

        // Native date_trunc (giống HPParking: SQL-side, không phải in-memory group)
        List<Object[]> rows = eventRepository.countEventsByBucket(
                from, to, "hour".equals(granularity) ? "hour" : "day", eventType);

        DateTimeFormatter fmt = "hour".equals(granularity)
                ? DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:00")
                : DateTimeFormatter.ofPattern("yyyy-MM-dd");

        // Map bucket -> count
        Map<String, Long> countsByBucket = new HashMap<>();
        long totalInWindow = 0;
        for (Object[] row : rows) {
            LocalDateTime bucketTs = (LocalDateTime) row[0];
            long c = (Long) row[1];
            countsByBucket.put(bucketTs.format(fmt), c);
            totalInWindow += c;
        }

        // Fill thiếu
        List<DashboardStatsDto.TimePoint> series = new java.util.ArrayList<>(bucketCount);
        LocalDateTime start = "hour".equals(granularity)
                ? from.truncatedTo(ChronoUnit.HOURS)
                : from.toLocalDate().atStartOfDay();
        for (int i = 0; i < bucketCount; i++) {
            LocalDateTime bucketTs = "hour".equals(granularity)
                    ? start.plusHours(i)
                    : start.plusDays(i);
            String key = bucketTs.format(fmt);
            long val = countsByBucket.getOrDefault(key, 0L);
            series.add(DashboardStatsDto.TimePoint.builder().bucket(key).value(val).build());
        }
        log.debug("Built {} series buckets (sum={} vs in-window={})",
                series.size(), series.stream().mapToLong(DashboardStatsDto.TimePoint::getValue).sum(), totalInWindow);
        return series;
    }

    private LocalDateTime resolveFrom(LocalDateTime to, LocalDate fromDate) {
        return fromDate != null ? fromDate.atStartOfDay() : to.minus(DEFAULT_WINDOW);
    }

    private LocalDateTime resolveTo(LocalDate toDate) {
        return toDate != null ? toDate.plusDays(1).atStartOfDay() : LocalDateTime.now(clock);
    }
}
