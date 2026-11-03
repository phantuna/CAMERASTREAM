-- ============================================================================
-- V11: Bổ sung Index tối ưu hóa truy vấn toàn diện cho Hệ thống CameraStream
-- Tối ưu: System Events, FaceID People, Cameras, AI Configs, Backups, Users
-- Idempotent: Sử dụng IF NOT EXISTS
-- ============================================================================

-- 1. BẢNG SYSTEM_EVENTS (Lịch sử Biển số, FaceID và Trung tâm Cảnh báo)
-- 1.1 Tìm kiếm và phân trang theo Loại sự kiện và Thời gian
CREATE INDEX IF NOT EXISTS idx_system_events_active_type_created 
ON system_events (is_active, event_type, created_at DESC);

-- 1.2 Lọc theo Camera và Thời gian
CREATE INDEX IF NOT EXISTS idx_system_events_active_cam_created 
ON system_events (is_active, camera_id, created_at DESC);

-- 1.3 Lọc cho Trung Tâm Cảnh Báo (Mức độ Warning/Critical & Trạng thái xác nhận)
CREATE INDEX IF NOT EXISTS idx_system_events_active_severity_ack 
ON system_events (is_active, severity, acknowledged, created_at DESC);

-- 2. BẢNG PEOPLE & PERSON_FACE_IMAGES (Quản lý Nhân sự & FaceID)
-- 2.1 Tìm kiếm theo Mã nhân viên và Trạng thái
CREATE INDEX IF NOT EXISTS idx_people_active_code 
ON people (is_active, employee_code);

-- 2.2 Lọc theo Phòng ban và Trạng thái hoạt động
CREATE INDEX IF NOT EXISTS idx_people_active_dept_status 
ON people (is_active, department, status);

-- 2.3 Sắp xếp và phân trang theo Thời gian tạo
CREATE INDEX IF NOT EXISTS idx_people_active_created 
ON people (is_active, created_at DESC);

-- 2.4 Tải nhanh ảnh khuôn mặt đại diện (Primary photo) theo nhân sự
CREATE INDEX IF NOT EXISTS idx_person_face_images_person_primary 
ON person_face_images (person_id, is_primary);

-- 3. BẢNG CAMERAS & CAMERA_AI_CONFIGS (Quản lý Thiết bị & Hub AI)
-- 3.1 Lọc Camera hoạt động (chưa bị xóa) theo thời gian
CREATE INDEX IF NOT EXISTS idx_cameras_active_created 
ON cameras (deleted_at, is_active, created_at DESC);

-- 3.2 Tra cứu Camera theo Stream Path và IP
CREATE INDEX IF NOT EXISTS idx_cameras_stream_path 
ON cameras (stream_path);

CREATE INDEX IF NOT EXISTS idx_cameras_ip_address 
ON cameras (ip_address);

-- 3.3 Tra cứu Module AI đã gán cho từng Camera
CREATE INDEX IF NOT EXISTS idx_camera_ai_configs_cam_type 
ON camera_ai_configs (camera_id, ai_type, is_enabled);

-- 4. BẢNG BACKUP_JOBS (Sao lưu & Lưu trữ)
-- 4.1 Lọc lịch sử Backup theo trạng thái và thời gian tạo
CREATE INDEX IF NOT EXISTS idx_backup_jobs_status_created 
ON backup_jobs (status, created_at DESC);

-- 5. BẢNG USERS & ROLES (Quản trị & Phân quyền IAM)
-- 5.1 Đăng nhập và xác thực User theo username và trạng thái kích hoạt
CREATE INDEX IF NOT EXISTS idx_users_username_active 
ON users (username, is_active);
