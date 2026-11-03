-- ============================================================================
-- V12: BẢNG AUDIT_LOGS (Nhật ký hành động quản trị)
-- Port pattern từ HPParking (C#/.NET + MongoDB): trail denormalized ghi
-- actor + action + target-entity/id + success flag, sống độc lập với việc
-- target bị xóa (không có FK -> không bị ràng buộc, giữ target_display làm label).
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT,
    actor_username VARCHAR(255),
    actor_role VARCHAR(255),
    source VARCHAR(255) DEFAULT 'WEBADMIN',
    action_type VARCHAR(64) NOT NULL,
    target_entity VARCHAR(128),
    target_id BIGINT,
    target_display VARCHAR(255),
    reason VARCHAR(512),
    is_success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE
);

-- Tìm kiếm & phân trang theo loại hành động + thời gian (feed audit)
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
ON audit_logs (action_type, created_at DESC);

-- Tra cứu lịch sử của một target cụ thể (vd: các lần export / ack một event)
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created
ON audit_logs (target_entity, target_id, created_at DESC);
