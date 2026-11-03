-- ============================================================================
-- V10: Khởi tạo bảng Permissions, Role_Permissions và Phân tầng vai trò (Super Admin / Manager)
-- Idempotent: Sử dụng IF NOT EXISTS và ON CONFLICT DO NOTHING
-- Tự chứa (Self-contained): Đảm bảo các bảng cơ sở roles, users, user_roles luôn sẵn sàng
-- ============================================================================

-- 0. Đảm bảo bảng Roles, Users, User_Roles đã tồn tại
CREATE TABLE IF NOT EXISTS roles (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    last_login_at TIMESTAMP WITHOUT TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

-- 1. Bảng Permissions (Danh mục quyền hạn)
CREATE TABLE IF NOT EXISTS permissions (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    group_name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
CREATE INDEX IF NOT EXISTS idx_permissions_group ON permissions(group_name);

-- 2. Bảng liên kết Role_Permissions (N-N)
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);

-- 3. Nạp 13 Permissions chuẩn nghiệp vụ CameraStream
INSERT INTO permissions (code, name, group_name, description)
VALUES
    -- Nhóm Kiểm Soát Phương Tiện (ALPR)
    ('SURVEILLANCE_VIEW', 'Xem ma trận camera trực tiếp', 'Kiểm Soát Phương Tiện', 'Xem trực tiếp đa kênh RTSP/WebRTC'),
    ('ALPR_VIEW', 'Tra cứu lịch sử biển số xe', 'Kiểm Soát Phương Tiện', 'Xem danh sách xe vào/ra nhận diện bằng AI'),
    ('ALPR_EXPORT', 'Xuất báo cáo & file Excel ALPR', 'Kiểm Soát Phương Tiện', 'Tải file Excel/CSV lịch sử phương tiện'),
    ('BARRIER_CONTROL', 'Điều khiển Barrier / Cổng', 'Kiểm Soát Phương Tiện', 'Kích hoạt mở/đóng barrier thủ công'),

    -- Nhóm Kiểm Soát Người (FaceID)
    ('FACE_VIEW', 'Giám sát FaceID trực tiếp', 'Kiểm Soát Người (FaceID)', 'Xem ma trận nhận diện khuôn mặt realtime'),
    ('FACE_LOGS', 'Lịch sử người vào/ra & điểm danh', 'Kiểm Soát Người (FaceID)', 'Tra cứu nhật ký điểm danh và nhận dạng người'),
    ('FACE_MANAGE', 'Quản lý danh sách nhân sự & khuôn mặt', 'Kiểm Soát Người (FaceID)', 'Thêm, sửa, xóa hồ sơ nhân viên và ảnh mẫu'),

    -- Nhóm Trung Tâm Cảnh Báo
    ('ALERTS_VIEW', 'Xem danh sách cảnh báo', 'Trung Tâm Cảnh Báo', 'Xem danh sách cảnh báo vi phạm, xe lạ, SOS'),
    ('ALERTS_ACK', 'Xác nhận & xử lý cảnh báo', 'Trung Tâm Cảnh Báo', 'Ghi chú và đóng cảnh báo sự cố'),

    -- Nhóm Thiết Bị & Hệ Thống
    ('DEVICE_VIEW', 'Xem danh sách Camera & Hub AI', 'Thiết Bị & Hệ Thống', 'Xem thông số kết nối và trạng thái hoạt động'),
    ('DEVICE_MANAGE', 'Cấu hình thiết bị & Model AI', 'Thiết Bị & Hệ Thống', 'Thêm mới camera, chỉnh sửa RTSP, đổi model AI'),
    ('BACKUP_MANAGE', 'Sao lưu & Phục hồi CSDL', 'Thiết Bị & Hệ Thống', 'Tạo bản sao lưu và khôi phục CSDL hệ thống'),

    -- Nhóm Quản Trị Phân Quyền (IAM)
    ('IAM_VIEW', 'Xem danh sách tài khoản & nhóm quyền', 'Quản Trị Người Dùng (IAM)', 'Xem danh sách tài khoản và vai trò trong hệ thống'),
    ('IAM_MANAGE', 'Toàn quyền cấu hình tài khoản & phân quyền', 'Quản Trị Người Dùng (IAM)', 'Tạo mới, sửa, xóa tài khoản và phân quyền vai trò tối cao')
ON CONFLICT (code) DO NOTHING;

-- 4. Tạo 2 Nhóm quyền nòng cốt: ROLE_SUPER_ADMIN và ROLE_MANAGER
INSERT INTO roles (name, description, is_active, created_at, updated_at)
VALUES
    ('ROLE_SUPER_ADMIN', 'Quản trị viên tối cao (Toàn quyền 100% mọi phân hệ, bảo vệ hệ thống)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('ROLE_MANAGER', 'Quản lý vận hành (Giám sát camera, ALPR, FaceID, cảnh báo, quản lý nhân sự)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET 
    description = EXCLUDED.description,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Cập nhật hoặc chèn thêm tên không có prefix nếu FE sử dụng SUPER_ADMIN và MANAGER
INSERT INTO roles (name, description, is_active, created_at, updated_at)
VALUES
    ('SUPER_ADMIN', 'Quản trị viên tối cao (Toàn quyền 100% mọi phân hệ, bảo vệ hệ thống)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('MANAGER', 'Quản lý vận hành (Giám sát camera, ALPR, FaceID, cảnh báo, quản lý nhân sự)', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET 
    description = EXCLUDED.description,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- 5. Gán toàn bộ Permissions cho SUPER_ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('ROLE_SUPER_ADMIN', 'SUPER_ADMIN')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 6. Gán các quyền vận hành cho MANAGER (Không có IAM_MANAGE và BACKUP_MANAGE)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('ROLE_MANAGER', 'MANAGER')
  AND p.code IN (
    'SURVEILLANCE_VIEW',
    'ALPR_VIEW',
    'ALPR_EXPORT',
    'BARRIER_CONTROL',
    'FACE_VIEW',
    'FACE_LOGS',
    'FACE_MANAGE',
    'ALERTS_VIEW',
    'ALERTS_ACK',
    'DEVICE_VIEW',
    'IAM_VIEW'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 7. Dọn sạch các tài khoản demo cũ (operator, guard) nếu có
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE username IN ('operator', 'guard'));
DELETE FROM users WHERE username IN ('operator', 'guard');

-- 8. Tạo duy nhất 1 tài khoản ban đầu: admin (Super Admin)
-- Password mặc định: admin123 (BCrypt hash 10 rounds: $2a$10$1Y8j8i1XjF.Rkn01G9N6reHq7Z9.eXqgVpQzE2zJgI9sT6wG0xYm6)
INSERT INTO users (username, password_hash, full_name, email, phone, is_active, created_at, updated_at)
VALUES
    ('admin', '$2a$10$1Y8j8i1XjF.Rkn01G9N6reHq7Z9.eXqgVpQzE2zJgI9sT6wG0xYm6', 'Quản Trị Viên Tối Cao (Super Admin)', 'admin@hoangphat.vn', '0988.123.456', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (username) DO UPDATE SET
    full_name = 'Quản Trị Viên Tối Cao (Super Admin)',
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- 9. Gán tài khoản admin vào nhóm SUPER_ADMIN
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id 
FROM users u, roles r
WHERE u.username = 'admin' AND r.name IN ('ROLE_SUPER_ADMIN', 'SUPER_ADMIN')
ON CONFLICT (user_id, role_id) DO NOTHING;
