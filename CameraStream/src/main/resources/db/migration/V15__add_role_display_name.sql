-- ============================================================================
-- V15: Bổ sung cột display_name cho bảng roles
--   - FE phân biệt "Mã Nhóm Quyền" (code -> roles.name) và "Tên Nhóm Quyền" (display_name)
--   - Idempotent; backfill display_name từ description với các vai đã có
-- ============================================================================

ALTER TABLE roles ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

UPDATE roles
SET display_name = description
WHERE display_name IS NULL AND description IS NOT NULL AND description <> '';
