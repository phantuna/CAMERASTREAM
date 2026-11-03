package org.example.camerastream.modules.eventhub.audit.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.example.camerastream.modules.eventhub.audit.entity.AuditLog;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogDto {
    private Long id;
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
    private LocalDateTime createdAt;

    public static AuditLogDto from(AuditLog e) {
        if (e == null) return null;
        return AuditLogDto.builder()
                .id(e.getId())
                .actorId(e.getActorId())
                .actorUsername(e.getActorUsername())
                .actorRole(e.getActorRole())
                .source(e.getSource())
                .actionType(e.getActionType())
                .targetEntity(e.getTargetEntity())
                .targetId(e.getTargetId())
                .targetDisplay(e.getTargetDisplay())
                .reason(e.getReason())
                .success(e.getSuccess())
                .errorMessage(e.getErrorMessage())
                .createdAt(e.getCreated_at())
                .build();
    }
}
