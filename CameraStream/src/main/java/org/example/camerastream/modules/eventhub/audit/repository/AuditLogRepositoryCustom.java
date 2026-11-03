package org.example.camerastream.modules.eventhub.audit.repository;

import org.example.camerastream.modules.eventhub.audit.dto.AuditLogFilterQuery;
import org.example.camerastream.modules.eventhub.audit.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Map;

/** QueryDSL fragment cho audit (merged vào {@link AuditLogRepository}). */
public interface AuditLogRepositoryCustom {

    Page<AuditLog> searchAudits(AuditLogFilterQuery query, Pageable pageable);

    /** Đếm bản ghi audit theo từng action_type (cho tab "thống kê hành động"). */
    Map<String, Long> getAuditStats();
}
