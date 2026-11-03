package org.example.camerastream.modules.eventhub.audit.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.Tuple;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.example.camerastream.modules.eventhub.audit.dto.AuditLogFilterQuery;
import org.example.camerastream.modules.eventhub.audit.entity.AuditLog;
import org.example.camerastream.modules.eventhub.audit.entity.QAuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
@RequiredArgsConstructor
public class AuditLogRepositoryCustomImpl implements AuditLogRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<AuditLog> searchAudits(AuditLogFilterQuery query, Pageable pageable) {
        QAuditLog audit = QAuditLog.auditLog;
        BooleanBuilder builder = new BooleanBuilder();
        builder.and(audit.active.isTrue());

        if (query != null) {
            if (query.getActionType() != null && !query.getActionType().isBlank()) {
                builder.and(audit.actionType.eq(query.getActionType().trim().toUpperCase()));
            }
            if (query.getTargetEntity() != null && !query.getTargetEntity().isBlank()) {
                builder.and(audit.targetEntity.eq(query.getTargetEntity().trim()));
            }
            if (query.getActorUsername() != null && !query.getActorUsername().isBlank()) {
                builder.and(audit.actorUsername.containsIgnoreCase(query.getActorUsername().trim()));
            }
            LocalDateTime from = query.getFromDate() != null
                    ? query.getFromDate().atStartOfDay()
                    : LocalDateTime.of(2000, 1, 1, 0, 0);
            LocalDateTime to = query.getToDate() != null
                    ? query.getToDate().plusDays(1).atStartOfDay()
                    : LocalDateTime.of(2100, 1, 1, 0, 0);
            builder.and(audit.created_at.goe(from).and(audit.created_at.lt(to)));
        }

        JPAQuery<AuditLog> contentQuery = queryFactory
                .selectFrom(audit)
                .where(builder)
                .orderBy(audit.created_at.desc());
        if (pageable.isPaged()) {
            contentQuery.offset(pageable.getOffset()).limit(pageable.getPageSize());
        }
        List<AuditLog> content = contentQuery.fetch();

        Long total = queryFactory.select(audit.count()).from(audit).where(builder).fetchOne();
        long totalVal = total != null ? total : 0L;

        return new PageImpl<>(content, pageable, totalVal);
    }

    @Override
    public Map<String, Long> getAuditStats() {
        QAuditLog audit = QAuditLog.auditLog;
        BooleanBuilder builder = new BooleanBuilder();
        builder.and(audit.active.isTrue());

        List<Tuple> rows = queryFactory
                .select(audit.actionType, audit.count())
                .from(audit)
                .where(builder)
                .groupBy(audit.actionType)
                .fetch();

        Map<String, Long> stats = new HashMap<>();
        for (Tuple row : rows) {
            String actionType = row.get(0, String.class);
            long count = row.get(1, Long.class);
            stats.put(actionType, count);
        }
        return stats;
    }
}
