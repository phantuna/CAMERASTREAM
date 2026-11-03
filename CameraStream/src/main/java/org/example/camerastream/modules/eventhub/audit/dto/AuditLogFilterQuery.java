package org.example.camerastream.modules.eventhub.audit.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/** Bộ lọc tìm kiếm bản ghi audit (tham số query của /api/v1/audit-logs). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogFilterQuery {
    private String actionType;
    private String targetEntity;
    private String actorUsername;
    private LocalDate fromDate;
    private LocalDate toDate;
}
