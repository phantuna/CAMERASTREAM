package org.example.camerastream.modules.eventhub.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.example.camerastream.modules.eventhub.entity.EventSeverity;
import org.example.camerastream.modules.eventhub.entity.QSystemEvent;
import org.example.camerastream.modules.eventhub.entity.SystemEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Repository
@RequiredArgsConstructor
public class SystemEventRepositoryCustomImpl implements SystemEventRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<SystemEvent> searchEvents(
            String eventType,
            Long cameraId,
            String keyword,
            LocalDateTime fromTime,
            LocalDateTime toTime,
            Pageable pageable
    ) {
        return searchEvents(eventType, cameraId, keyword, null, fromTime, toTime, pageable);
    }

    @Override
    public Page<SystemEvent> searchEvents(
            String eventType,
            Long cameraId,
            String keyword,
            String vehicleType,
            LocalDateTime fromTime,
            LocalDateTime toTime,
            Pageable pageable
    ) {
        QSystemEvent event = QSystemEvent.systemEvent;
        BooleanBuilder builder = buildFilter(event, eventType, cameraId, keyword, vehicleType, fromTime, toTime);

        JPAQuery<SystemEvent> query = queryFactory
                .selectFrom(event)
                .where(builder)
                .orderBy(event.created_at.desc());

        if (pageable.isPaged()) {
            query.offset(pageable.getOffset()).limit(pageable.getPageSize());
        }

        List<SystemEvent> content = query.fetch();

        Long totalCount = queryFactory
                .select(event.count())
                .from(event)
                .where(builder)
                .fetchOne();

        long total = totalCount != null ? totalCount : 0L;

        return new PageImpl<>(content, pageable, total);
    }

    @Override
    public Map<String, Long> getEventStats(
            String eventType,
            LocalDateTime fromTime,
            LocalDateTime toTime,
            String keyword
    ) {
        QSystemEvent event = QSystemEvent.systemEvent;
        BooleanBuilder baseBuilder = buildFilter(event, eventType, null, keyword, null, fromTime, toTime);

        Long total = queryFactory.select(event.count()).from(event).where(baseBuilder).fetchOne();
        long totalVal = total != null ? total : 0L;

        BooleanBuilder carBuilder = new BooleanBuilder(baseBuilder);
        carBuilder.and(
            event.payloadJson.containsIgnoreCase("\"vehicleType\":\"CAR\"")
                .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"CAR\""))
                .or(event.payloadJson.containsIgnoreCase("\"vehicleType\":\"TRUCK\""))
                .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"TRUCK\""))
        );
        Long cars = queryFactory.select(event.count()).from(event).where(carBuilder).fetchOne();

        BooleanBuilder motoBuilder = new BooleanBuilder(baseBuilder);
        motoBuilder.and(
            event.payloadJson.containsIgnoreCase("\"vehicleType\":\"MOTO\"")
                .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"MOTO\""))
                .or(event.payloadJson.containsIgnoreCase("\"vehicleType\":\"MOTORCYCLE\""))
                .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"MOTORCYCLE\""))
        );
        Long motos = queryFactory.select(event.count()).from(event).where(motoBuilder).fetchOne();

        BooleanBuilder personBuilder = new BooleanBuilder(baseBuilder);
        personBuilder.and(
            event.payloadJson.containsIgnoreCase("\"personName\"")
                .or(event.payloadJson.containsIgnoreCase("\"vehicleType\":\"PERSON\""))
                .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"PERSON\""))
        );
        Long persons = queryFactory.select(event.count()).from(event).where(personBuilder).fetchOne();

        Map<String, Long> stats = new java.util.HashMap<>();
        stats.put("total", totalVal);
        stats.put("cars", cars != null ? cars : 0L);
        stats.put("motos", motos != null ? motos : 0L);
        stats.put("persons", persons != null ? persons : 0L);
        return stats;
    }

    private BooleanBuilder buildFilter(
            QSystemEvent event,
            String eventType,
            Long cameraId,
            String keyword,
            String vehicleType,
            LocalDateTime fromTime,
            LocalDateTime toTime
    ) {
        BooleanBuilder builder = new BooleanBuilder();
        builder.and(event.active.isTrue());

        if (eventType != null && !eventType.isBlank()) {
            builder.and(event.eventType.eq(eventType));
        }

        if (cameraId != null) {
            builder.and(event.cameraId.eq(cameraId));
        }

        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.trim().toLowerCase();
            builder.and(
                event.payloadJson.toLowerCase().contains(kw)
                    .or(event.cameraName.toLowerCase().contains(kw))
            );
        }

        if (vehicleType != null && !vehicleType.isBlank() && !"ALL".equalsIgnoreCase(vehicleType)) {
            String vt = vehicleType.trim().toUpperCase();
            if ("CAR".equals(vt)) {
                builder.and(
                    event.payloadJson.containsIgnoreCase("\"vehicleType\":\"CAR\"")
                        .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"CAR\""))
                );
            } else if ("MOTO".equals(vt)) {
                builder.and(
                    event.payloadJson.containsIgnoreCase("\"vehicleType\":\"MOTO\"")
                        .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"MOTO\""))
                        .or(event.payloadJson.containsIgnoreCase("\"vehicleType\":\"MOTORCYCLE\""))
                        .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"MOTORCYCLE\""))
                );
            } else if ("TRUCK".equals(vt)) {
                builder.and(
                    event.payloadJson.containsIgnoreCase("\"vehicleType\":\"TRUCK\"")
                        .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"TRUCK\""))
                );
            } else if ("PERSON".equals(vt)) {
                builder.and(
                    event.payloadJson.containsIgnoreCase("\"personName\"")
                        .or(event.payloadJson.containsIgnoreCase("\"vehicleType\":\"PERSON\""))
                );
            }
        }

        if (fromTime != null) {
            builder.and(event.created_at.goe(fromTime));
        }

        if (toTime != null) {
            builder.and(event.created_at.lt(toTime));
        }

        return builder;
    }

    @Override
    public Map<String, Long> getDashboardCounts(LocalDateTime fromTime, LocalDateTime toTime) {
        QSystemEvent event = QSystemEvent.systemEvent;
        BooleanBuilder base = new BooleanBuilder();
        base.and(event.active.isTrue());
        base.and(event.created_at.goe(fromTime).and(event.created_at.lt(toTime)));

        Long total = queryFactory.select(event.count()).from(event).where(base).fetchOne();

        Map<String, Long> result = new java.util.HashMap<>();
        result.put("total", total != null ? total : 0L);

        for (org.example.camerastream.modules.eventhub.entity.EventSeverity severity
                : org.example.camerastream.modules.eventhub.entity.EventSeverity.values()) {
            BooleanBuilder sb = new BooleanBuilder(base);
            sb.and(event.severity.eq(severity));
            Long c = queryFactory.select(event.count()).from(event).where(sb).fetchOne();
            result.put("severity_" + severity.name(), c != null ? c : 0L);
        }

        BooleanBuilder unacked = new BooleanBuilder(base);
        unacked.and(event.acknowledged.eq(false));
        Long unackedCount = queryFactory.select(event.count()).from(event).where(unacked).fetchOne();
        result.put("unackedAlerts", unackedCount != null ? unackedCount : 0L);

        return result;
    }

    @Override
    public Map<String, Long> getVehicleTypeBreakdown(LocalDateTime fromTime, LocalDateTime toTime) {
        QSystemEvent event = QSystemEvent.systemEvent;
        BooleanBuilder base = new BooleanBuilder();
        base.and(event.active.isTrue());
        base.and(event.eventType.eq("VEHICLE_ANPR"));
        base.and(event.created_at.goe(fromTime).and(event.created_at.lt(toTime)));

        Map<String, Long> result = new java.util.HashMap<>();
        for (String vt : new String[]{"CAR", "MOTO", "TRUCK", "PERSON"}) {
            BooleanBuilder vb = new BooleanBuilder(base);
            vb.and(
                event.payloadJson.containsIgnoreCase("\"vehicleType\":\"" + vt + "\"")
                    .or(event.payloadJson.containsIgnoreCase("\"vehicleType\": \"" + vt + "\""))
            );
            Long c = queryFactory.select(event.count()).from(event).where(vb).fetchOne();
            result.put(vt, c != null ? c : 0L);
        }
        return result;
    }

    @Override
    public List<SystemEvent> findTrafficSummaryEvents(
            String eventType, Long cameraId, String plateKeyword,
            LocalDateTime fromTime, LocalDateTime toTime, int limit) {
        QSystemEvent event = QSystemEvent.systemEvent;
        BooleanBuilder builder = buildTrafficSummaryFilter(event, eventType, cameraId, plateKeyword, fromTime, toTime);

        JPAQuery<SystemEvent> query = queryFactory
                .selectFrom(event)
                .where(builder)
                .orderBy(event.created_at.desc());
        if (limit > 0) {
            query.limit(limit);
        }
        return query.fetch();
    }

    @Override
    public long countTrafficSummaryEvents(
            String eventType, Long cameraId, String plateKeyword,
            LocalDateTime fromTime, LocalDateTime toTime) {
        QSystemEvent event = QSystemEvent.systemEvent;
        BooleanBuilder builder = buildTrafficSummaryFilter(event, eventType, cameraId, plateKeyword, fromTime, toTime);
        Long count = queryFactory.select(event.count()).from(event).where(builder).fetchOne();
        return count != null ? count : 0L;
    }

    /** Bộ lọc dùng chung cho cả find + count của báo cáo traffic summary. */
    private BooleanBuilder buildTrafficSummaryFilter(
            QSystemEvent event, String eventType, Long cameraId, String plateKeyword,
            LocalDateTime fromTime, LocalDateTime toTime) {
        BooleanBuilder builder = new BooleanBuilder();
        builder.and(event.active.isTrue());

        if (eventType != null && !eventType.isBlank()) {
            builder.and(event.eventType.eq(eventType));
        }
        if (cameraId != null) {
            builder.and(event.cameraId.eq(cameraId));
        }
        if (plateKeyword != null && !plateKeyword.isBlank()) {
            // Biển số nằm trong payload_json (key "plateNumber") — LIKE case-insensitive
            String kw = plateKeyword.trim().toLowerCase();
            builder.and(
                event.payloadJson.containsIgnoreCase("\"plateNumber\":\"" + kw)
                    .or(event.payloadJson.containsIgnoreCase("\"plateNumber\": \"" + kw))
            );
        }
        if (fromTime != null) {
            builder.and(event.created_at.goe(fromTime));
        }
        if (toTime != null) {
            builder.and(event.created_at.lt(toTime));
        }
        return builder;
    }

    @Override
    public Page<SystemEvent> searchAlerts(
            EventSeverity severity,
            Boolean acknowledged,
            LocalDateTime fromTime,
            LocalDateTime toTime,
            Pageable pageable
    ) {
        QSystemEvent event = QSystemEvent.systemEvent;
        BooleanBuilder builder = new BooleanBuilder();

        builder.and(event.active.isTrue());
        builder.and(event.severity.in(EventSeverity.WARNING, EventSeverity.CRITICAL));

        if (severity != null) {
            builder.and(event.severity.eq(severity));
        }

        if (acknowledged != null) {
            builder.and(event.acknowledged.eq(acknowledged));
        }

        if (fromTime != null) {
            builder.and(event.created_at.goe(fromTime));
        }

        if (toTime != null) {
            builder.and(event.created_at.lt(toTime));
        }

        JPAQuery<SystemEvent> query = queryFactory
                .selectFrom(event)
                .where(builder)
                .orderBy(event.created_at.desc());

        if (pageable.isPaged()) {
            query.offset(pageable.getOffset()).limit(pageable.getPageSize());
        }

        List<SystemEvent> content = query.fetch();

        Long totalCount = queryFactory
                .select(event.count())
                .from(event)
                .where(builder)
                .fetchOne();

        long total = totalCount != null ? totalCount : 0L;

        return new PageImpl<>(content, pageable, total);
    }
}
