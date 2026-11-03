package org.example.camerastream.modules.eventhub.audit.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Yêu cầu ghi một bản ghi audit. Được các service nội bộ (export, ack...) gọi
 * thông qua {@code IAuditLogService.record(AuditRecord)} — không phải endpoint public.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditRecord {
    private Long actorId;
    private String actorUsername;
    private String actorRole;
    private String source;
    private String actionType;
    private String targetEntity;
    private Long targetId;
    private String targetDisplay;
    private String reason;
    private Boolean success;
    private String errorMessage;
}
