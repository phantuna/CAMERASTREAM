-- ============================================================================
-- V17: Quản Trị Bãi Đỗ Xe Doanh Nghiệp (HPParking Management Schema)
-- Bổ sung các bảng: companies, departments, contractors, vehicles, lanes, parking_sessions
-- Idempotent: có thể chạy lại an toàn trên PostgreSQL (CREATE TABLE IF NOT EXISTS)
-- ============================================================================

-- 1. Bảng Công Ty & Doanh Nghiệp (companies)
CREATE TABLE IF NOT EXISTS companies (
    id             BIGSERIAL PRIMARY KEY,
    code           VARCHAR(64)  NOT NULL,
    name           VARCHAR(255) NOT NULL,
    tax_code       VARCHAR(64),
    address        VARCHAR(500),
    phone          VARCHAR(64),
    email          VARCHAR(128),
    representative VARCHAR(128),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(100),
    updated_by     VARCHAR(100),
    deleted_at     TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uk_companies_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_companies_code ON companies (code);
CREATE INDEX IF NOT EXISTS idx_companies_deleted_at ON companies (deleted_at);

-- 2. Bảng Phòng Ban (departments)
CREATE TABLE IF NOT EXISTS departments (
    id             BIGSERIAL PRIMARY KEY,
    company_id     BIGINT,
    code           VARCHAR(64)  NOT NULL,
    name           VARCHAR(255) NOT NULL,
    description    VARCHAR(500),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(100),
    updated_by     VARCHAR(100),
    deleted_at     TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uk_departments_code UNIQUE (code),
    CONSTRAINT fk_departments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_departments_company_id ON departments (company_id);
CREATE INDEX IF NOT EXISTS idx_departments_code ON departments (code);
CREATE INDEX IF NOT EXISTS idx_departments_deleted_at ON departments (deleted_at);

-- 3. Bảng Đối Tác & Nhà Thầu (contractors)
CREATE TABLE IF NOT EXISTS contractors (
    id             BIGSERIAL PRIMARY KEY,
    code           VARCHAR(64)  NOT NULL,
    name           VARCHAR(255) NOT NULL,
    tax_code       VARCHAR(64),
    contact_person VARCHAR(128),
    phone          VARCHAR(64),
    email          VARCHAR(128),
    field_of_work  VARCHAR(255),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(100),
    updated_by     VARCHAR(100),
    deleted_at     TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uk_contractors_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_contractors_code ON contractors (code);
CREATE INDEX IF NOT EXISTS idx_contractors_deleted_at ON contractors (deleted_at);

-- 4. Bảng Phương Tiện Đăng Ký (vehicles)
CREATE TABLE IF NOT EXISTS vehicles (
    id             BIGSERIAL PRIMARY KEY,
    plate_number   VARCHAR(64)  NOT NULL,
    vehicle_type   VARCHAR(32)  NOT NULL DEFAULT 'CAR',
    owner_name     VARCHAR(255),
    phone_number   VARCHAR(64),
    card_code      VARCHAR(64),
    company_id     BIGINT,
    department_id  BIGINT,
    person_id      BIGINT,
    is_whitelist   BOOLEAN      NOT NULL DEFAULT TRUE,
    note           VARCHAR(500),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by     VARCHAR(100),
    updated_by     VARCHAR(100),
    deleted_at     TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uk_vehicles_plate UNIQUE (plate_number),
    CONSTRAINT fk_vehicles_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL,
    CONSTRAINT fk_vehicles_department FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles (plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_card_code ON vehicles (card_code);
CREATE INDEX IF NOT EXISTS idx_vehicles_company_id ON vehicles (company_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON vehicles (deleted_at);

-- 5. Bảng Làn Kiểm Soát (lanes)
CREATE TABLE IF NOT EXISTS lanes (
    id                   BIGSERIAL PRIMARY KEY,
    gate_id              BIGINT,
    code                 VARCHAR(64)  NOT NULL,
    name                 VARCHAR(255) NOT NULL,
    direction            VARCHAR(16)  NOT NULL DEFAULT 'IN',
    overview_camera_id   BIGINT,
    plate_camera_id      BIGINT,
    barrier_device_id    VARCHAR(64),
    card_reader_id       VARCHAR(64),
    description          VARCHAR(500),
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by           VARCHAR(100),
    updated_by           VARCHAR(100),
    deleted_at           TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uk_lanes_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_lanes_code ON lanes (code);
CREATE INDEX IF NOT EXISTS idx_lanes_direction ON lanes (direction);
CREATE INDEX IF NOT EXISTS idx_lanes_deleted_at ON lanes (deleted_at);

-- 6. Bảng Phiên Đỗ Xe (parking_sessions - Lịch Sử Vào Ra)
CREATE TABLE IF NOT EXISTS parking_sessions (
    id                   BIGSERIAL PRIMARY KEY,
    session_code         VARCHAR(64),
    plate_number         VARCHAR(64)  NOT NULL,
    vehicle_type         VARCHAR(32)  DEFAULT 'CAR',
    status               VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
    person_id            BIGINT,
    person_name          VARCHAR(255),
    company_name         VARCHAR(255),
    department_name      VARCHAR(255),
    card_code            VARCHAR(64),
    -- Thông tin lượt vào
    in_time              TIMESTAMP WITHOUT TIME ZONE,
    in_lane_id           BIGINT,
    in_lane_name         VARCHAR(255),
    in_plate_image       TEXT,
    in_overview_image    TEXT,
    -- Thông tin lượt ra
    out_time             TIMESTAMP WITHOUT TIME ZONE,
    out_lane_id          BIGINT,
    out_lane_name        VARCHAR(255),
    out_plate_image      TEXT,
    out_overview_image   TEXT,
    -- Tính toán
    duration_minutes     DOUBLE PRECISION,
    duration_formatted   VARCHAR(64),
    note                 VARCHAR(500),
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by           VARCHAR(100),
    updated_by           VARCHAR(100),
    deleted_at           TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT fk_parking_sessions_in_lane FOREIGN KEY (in_lane_id) REFERENCES lanes (id) ON DELETE SET NULL,
    CONSTRAINT fk_parking_sessions_out_lane FOREIGN KEY (out_lane_id) REFERENCES lanes (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_parking_sessions_plate ON parking_sessions (plate_number);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_status ON parking_sessions (status);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_in_time ON parking_sessions (in_time DESC);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_out_time ON parking_sessions (out_time DESC);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_created_at ON parking_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_deleted_at ON parking_sessions (deleted_at);

-- 7. Seed dữ liệu mẫu ban đầu (Idempotent)
INSERT INTO companies (code, name, tax_code, address, phone, is_active)
VALUES
    ('HOANGPHAT', 'Công Ty Cổ Phần Công Nghệ Hoàng Phát', '0109876543', 'Tòa nhà Hoàng Phát, Hà Nội', '024.3388.9999', TRUE),
    ('PHUXUAN',   'Công Ty Hạ Tầng Phú Xuân',             '0101234567', 'Khu Công Nghiệp Phú Xuân',     '024.3777.8888', TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO departments (company_id, code, name, description, is_active)
VALUES
    (1, 'IT_DEPT',    'Phòng Công Nghệ Thông Tin', 'Quản trị hệ thống & Phần mềm', TRUE),
    (1, 'SECURITY',   'Phòng An Ninh & Bảo Vệ',    'Bảo vệ cổng & an ninh trật tự', TRUE),
    (2, 'LOGISTIC',   'Phòng Điều Vận & Kho Bãi',  'Điều phối phương tiện xe tải', TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO contractors (code, name, tax_code, contact_person, phone, field_of_work, is_active)
VALUES
    ('NT_VANTAI', 'Công Ty Vận Tải Hoàng Hà', '0105556667', 'Nguyễn Văn Nam', '0912.345.678', 'Vận tải hàng hóa', TRUE),
    ('NT_XAYDUNG','Nhà Thầu Cơ Điện ME',     '0108889991', 'Trần Đình Trọng', '0988.111.222', 'Bảo trì hệ thống', TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO lanes (code, name, direction, description, is_active)
VALUES
    ('LANE_IN_1',  'Làn vào số 1', 'IN',  'Làn kiểm soát xe vào cổng chính', TRUE),
    ('LANE_OUT_1', 'Làn ra số 1',  'OUT', 'Làn kiểm soát xe ra cổng chính', TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO vehicles (plate_number, vehicle_type, owner_name, phone_number, is_whitelist, note, is_active)
VALUES
    ('30A12345', 'CAR',   'Nguyễn Văn An',  '0912345678', TRUE, 'Xe Giám Đốc', TRUE),
    ('29C88899', 'TRUCK', 'Trần Văn Bình',  '0987654321', TRUE, 'Xe Tải Giao Hàng', TRUE),
    ('99H08802', 'TRUCK', 'Phú Xuân',       '0909090909', TRUE, 'Xe Nội Bộ Nhà Máy', TRUE),
    ('30B32192', 'CAR',   'Khách Vãng Lai', '',           FALSE, 'Khách Đến Liên Hệ', TRUE)
ON CONFLICT (plate_number) DO NOTHING;

