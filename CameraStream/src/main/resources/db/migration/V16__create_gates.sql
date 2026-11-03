-- ============================================================================
-- V16: Bảng "Lan Cong Gate" (gates) — danh mục cổng/khu vực được khai báo
--   Mỗi gate = một "địa điểm" (name) với một mã (code) dùng để gán cho camera.
--   Camera sẽ chọn code/mã từ bảng này trong form (bước sau).
-- Idempotent: có thể chạy lại an toàn.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gates (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code           VARCHAR(64)  NOT NULL,
    name           VARCHAR(255) NOT NULL,
    location       VARCHAR(255),
    description    VARCHAR(500),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP,
    updated_at     TIMESTAMP,
    created_by     VARCHAR(100),
    updated_by     VARCHAR(100),
    deleted_at     TIMESTAMP,
    CONSTRAINT uk_gates_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_gates_code ON gates (code);
CREATE INDEX IF NOT EXISTS idx_gates_deleted_at ON gates (deleted_at);

-- Seed các cổng mẫu (idempotent, chỉ chèn nếu chưa có)
INSERT INTO gates (code, name, location, description, is_active, created_at, updated_at)
VALUES
    ('IN_GATE',    'Cổng Vào',  'Làn xe vào cổng chính',    'Cổng điều khiển xe vào trong hệ thống', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('OUT_GATE',   'Cổng Ra',   'Làn xe ra cổng chính',     'Cổng điều khiển xe ra ngoài hệ thống',  TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('OVERVIEW',   'Bãi Xe',    'Bãi đỗ xe trung tâm',     'Vùng quan sát tổng thể bãi đỗ xe',     TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Thêm quyền "Quản lý Làn Cổng Gate" (GATE_MANAGE)
-- Gán cho các role quản trị để admin khai báo/sửa/xóa gate
-- ============================================================================
INSERT INTO permissions (code, name, group_name, description)
VALUES
    ('GATE_MANAGE', 'Quản lý Làn Cổng & Địa Điểm', 'Thiết Bị & Hệ Thống',
     'Khai báo, sửa và xóa danh mục cổng/khu vực (gate) để gán camera')
ON CONFLICT (code) DO NOTHING;

-- Gán GATE_MANAGE cho role admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('ROLE_ADMIN','ADMIN','ROLE_SUPER_ADMIN','SUPER_ADMIN')
  AND p.code = 'GATE_MANAGE'
ON CONFLICT (role_id, permission_id) DO NOTHING;
