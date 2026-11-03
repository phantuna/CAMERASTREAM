-- ============================================================================
-- V13: Đảm bảo toàn bộ quyền hạn (14 permissions) được gán cho các biến thể role ADMIN / ROLE_ADMIN
-- Đảm bảo tương thích ngược và phân quyền chuẩn cho tài khoản admin
-- ============================================================================

-- 1. Đảm bảo role ROLE_ADMIN và ADMIN tồn tại
INSERT INTO roles (name, description, is_active, created_at, updated_at)
VALUES
    ('ROLE_ADMIN', 'Quản trị viên hệ thống (Toàn quyền quản trị)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ADMIN', 'Quản trị viên hệ thống (Toàn quyền quản trị)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET 
    description = EXCLUDED.description,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- 2. Gán toàn bộ Permissions cho ROLE_ADMIN và ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('ROLE_ADMIN', 'ADMIN', 'ROLE_SUPER_ADMIN', 'SUPER_ADMIN')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Gán tài khoản admin vào các role quản trị tương ứng
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id 
FROM users u, roles r
WHERE u.username = 'admin' AND r.name IN ('ROLE_ADMIN', 'ADMIN', 'ROLE_SUPER_ADMIN', 'SUPER_ADMIN')
ON CONFLICT (user_id, role_id) DO NOTHING;

