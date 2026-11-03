package org.example.camerastream.modules.eventhub.audit.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.example.camerastream.common.entity.base;

/**
 * Nhật ký hành động quản trị (denormalized, port pattern từ HPParking).
 *
 * <p>Ghi actor + action + target-entity/id + success flag. KHÔNG dùng FK tới target
 * để một bản ghi audit sống độc lập khi target bị xóa — giữ {@code targetDisplay}
 * làm nhãn dễ đọc cho UI.
 */
@Entity
@Table(name = "audit_logs", indexes = {
    @Index(name = "idx_audit_logs_action_created", columnList = "action_type, created_at DESC"),
    @Index(name = "idx_audit_logs_target_created", columnList = "target_entity, target_id, created_at DESC")
})
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog extends base {

    @Column(name = "actor_id")
    private Long actorId;

    @Column(name = "actor_username")
    private String actorUsername;

    @Column(name = "actor_role")
    private String actorRole;

    /** Kênh phát hành (WEBADMIN, API, SYSTEM...). String thường (không enum) để thêm kênh mới không cần đổi code. */
    @Builder.Default
    @Column(name = "source")
    private String source = "WEBADMIN";

    /** Loại hành động (CREATE|UPDATE|DELETE|EXPORT|ACK|...). */
    @Column(name = "action_type", nullable = false)
    private String actionType;

    @Column(name = "target_entity")
    private String targetEntity;

    @Column(name = "target_id")
    private Long targetId;

    @Column(name = "target_display", length = 500)
    private String targetDisplay;

    @Column(name = "reason", columnDefinition = "TEXT")
    private String reason;

    @Builder.Default
    @Column(name = "is_success")
    private Boolean success = true;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
}
