package org.example.camerastream.modules.eventhub.audit.service;

import org.example.camerastream.modules.eventhub.audit.dto.AuditLogDto;
import org.example.camerastream.modules.eventhub.audit.dto.AuditLogFilterQuery;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Map;

public interface IAuditLogService {

    /** Ghi 1 bản ghi audit (idempotent: mỗi lần gọi thêm 1 dòng). Thread-safe. */
    void record(AuditRecord request);

    Page<AuditLogDto> search(AuditLogFilterQuery query, Pageable pageable);

    Map<String, Long> getStats();
}
