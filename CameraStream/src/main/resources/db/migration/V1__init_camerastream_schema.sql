-- ============================================================================
-- V1: Khởi tạo toàn bộ cấu trúc CSDL CameraStream (7 bảng cốt lõi)
-- Tương thích ngược hoàn toàn với dữ liệu hiện có (CREATE TABLE IF NOT EXISTS)
-- ============================================================================

-- 1. Bảng Cameras
CREATE TABLE IF NOT EXISTS cameras (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(255) NOT NULL,
    onvif_port INT DEFAULT 80,
    rtsp_port INT DEFAULT 554,
    username VARCHAR(255),
    password VARCHAR(255),
    stream_path VARCHAR(255) NOT NULL UNIQUE,
    rtsp_source_url VARCHAR(1000),
    rtsp_sub_stream_url VARCHAR(1000),
    type VARCHAR(50) DEFAULT 'IN_GATE',
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'CONNECTING',
    last_error VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_cameras_stream_path ON cameras(stream_path);
CREATE INDEX IF NOT EXISTS idx_cameras_deleted_at ON cameras(deleted_at);

-- 2. Bảng Camera AI Configs
CREATE TABLE IF NOT EXISTS camera_ai_configs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    camera_id BIGINT NOT NULL,
    ai_type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    confidence_threshold FLOAT DEFAULT 0.5,
    config_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_camera_ai_configs_cam_type ON camera_ai_configs(camera_id, ai_type);

-- 3. Bảng System Events (Universal Event Hub)
CREATE TABLE IF NOT EXISTS system_events (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    event_type VARCHAR(100) NOT NULL,
    module_source VARCHAR(100),
    camera_id BIGINT,
    camera_name VARCHAR(255),
    snapshot_url TEXT,
    confidence FLOAT,
    severity VARCHAR(50) DEFAULT 'INFO',
    payload_json TEXT,
    acknowledged BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_system_events_type_created ON system_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_camera_created ON system_events(camera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity);
CREATE INDEX IF NOT EXISTS idx_system_events_acknowledged ON system_events(acknowledged);

-- 4. Bảng People (Hồ sơ nhân sự)
CREATE TABLE IF NOT EXISTS people (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    full_name VARCHAR(255) NOT NULL,
    employee_code VARCHAR(100) NOT NULL UNIQUE,
    department VARCHAR(255),
    role VARCHAR(255),
    primary_photo_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'ACTIVE'
);

CREATE INDEX IF NOT EXISTS idx_people_employee_code ON people(employee_code);

-- 5. Bảng Person Face Images (Ảnh khuôn mặt mẫu)
CREATE TABLE IF NOT EXISTS person_face_images (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    person_id BIGINT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    angle VARCHAR(50) DEFAULT 'FRONT',
    is_primary BOOLEAN DEFAULT FALSE,
    feature_vector TEXT,
    CONSTRAINT fk_person_face_images_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_person_face_images_person ON person_face_images(person_id);

-- 6. Bảng Backup Settings
CREATE TABLE IF NOT EXISTS backup_settings (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    cron_expression VARCHAR(100),
    is_enabled BOOLEAN DEFAULT TRUE,
    retention_days INT DEFAULT 7,
    max_retained_backups INT DEFAULT 10,
    storage_path VARCHAR(500),
    last_run_at TIMESTAMP WITHOUT TIME ZONE,
    next_run_at TIMESTAMP WITHOUT TIME ZONE
);

-- 7. Bảng Backup Jobs
CREATE TABLE IF NOT EXISTS backup_jobs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    backup_id VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    file_path VARCHAR(500),
    file_size_bytes BIGINT,
    period_key VARCHAR(100),
    started_at TIMESTAMP WITHOUT TIME ZONE,
    completed_at TIMESTAMP WITHOUT TIME ZONE,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_status ON backup_jobs(status);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_period_key ON backup_jobs(period_key);
