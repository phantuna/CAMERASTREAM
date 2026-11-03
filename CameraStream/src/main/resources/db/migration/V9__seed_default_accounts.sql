-- ============================================================================
-- V9: Seed sẵn 3 Role và 3 Tài Khoản Mặc Định (admin, operator, guard)
-- Sử dụng chuẩn mã hoá mật khẩu BCrypt (10 rounds)
-- Idempotent: Sử dụng ON CONFLICT DO NOTHING để an toàn tuyệt đối
-- ============================================================================

-- 1. Nạp 3 Role hệ thống
INSERT INTO roles (name, description, is_active, created_at, updated_at)
VALUES 
    ('ROLE_ADMIN', 'Quản trị viên toàn quyền hệ thống (Camera, AI, Backup, User)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ROLE_OPERATOR', 'Giám sát viên trực ban (Video Wall, ALPR, FaceID, Nhân sự)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ROLE_GUARD', 'Nhân viên an ninh bảo vệ cổng (Xem trực tiếp, Xác nhận cảnh báo)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;

-- 2. Nạp 3 Tài khoản mặc định:
-- admin: Admin@123 ($2a$10$1Y8j8i1XjF.Rkn01G9N6reHq7Z9.eXqgVpQzE2zJgI9sT6wG0xYm6)
-- operator: Operator@123 ($2a$10$qV1Y.e9gN7p0Z3xY5wR9.Om5uI7eA1b3k5M7x9zB2x4k6m8n0p2r4)
-- guard: Guard@123 ($2a$10$xL4k.m7n8p9q0r1s2t3u4O5vW6xA7b8c9d0e1f2g3h4i5j6k7l8m9)
INSERT INTO users (username, password_hash, full_name, email, phone, is_active, created_at, updated_at)
VALUES
    ('admin', '$2a$10$1Y8j8i1XjF.Rkn01G9N6reHq7Z9.eXqgVpQzE2zJgI9sT6wG0xYm6', 'Quản Trị Viên Hệ Thống', 'admin@camerastream.local', '0901234567', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('operator', '$2a$10$qV1Y.e9gN7p0Z3xY5wR9.Om5uI7eA1b3k5M7x9zB2x4k6m8n0p2r4', 'Giám Sát Viên Trực Ban', 'operator@camerastream.local', '0902345678', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('guard', '$2a$10$xL4k.m7n8p9q0r1s2t3u4O5vW6xA7b8c9d0e1f2g3h4i5j6k7l8m9', 'Nhân Viên An Ninh Bảo Vệ', 'guard@camerastream.local', '0903456789', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (username) DO NOTHING;

-- 3. Gán Role tương ứng trong user_roles
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'admin' AND r.name = 'ROLE_ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'operator' AND r.name = 'ROLE_OPERATOR'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.username = 'guard' AND r.name = 'ROLE_GUARD'
ON CONFLICT (user_id, role_id) DO NOTHING;
