-- ============================================================================
-- V14: Bảo vệ các vai gốc (SUPER_ADMIN / ROLE_SUPER_ADMIN)
--   - Không bị soft-delete (deleted_at luôn NULL)
--   - Luôn ở trạng thái active
-- Logic guard "xoá admin cuối cùng / xoá chính mình" nằm ở phía service (Java),
-- migration này chỉ giữ data tĩnh đúng chuẩn.
-- Idempotent.
-- ============================================================================

UPDATE roles
SET deleted_at = NULL,
    is_active  = TRUE
WHERE name IN ('SUPER_ADMIN', 'ROLE_SUPER_ADMIN');

-- Đảm bảo các vai gốc vẫn còn tồn tại (idempotent)
INSERT INTO roles (name, description, is_active, created_at, updated_at)
VALUES
    ('SUPER_ADMIN',      'Quản trị viên tối cao (Toàn quyền 100% mọi phân hệ, bảo vệ hệ thống)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ROLE_SUPER_ADMIN', 'Quản trị viên tối cao (Toàn quyền 100% mọi phân hệ, bảo vệ hệ thống)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;

-- Vai gốc phải luôn giữ toàn bộ permissions (gắn lại role_permissions nếu bị mất)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('SUPER_ADMIN', 'ROLE_SUPER_ADMIN')
ON CONFLICT DO NOTHING;
