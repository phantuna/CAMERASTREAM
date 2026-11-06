-- ============================================================================
-- V18: Loại bỏ toàn bộ dữ liệu mẫu / mock data ban đầu
-- Giúp người dùng kết nối và sử dụng dữ liệu sạch 100% từ cơ sở dữ liệu thực tế
-- ============================================================================

DELETE FROM vehicles WHERE plate_number IN ('30A12345', '29C88899', '99H08802', '30B32192');
DELETE FROM lanes WHERE code IN ('LANE_IN_1', 'LANE_OUT_1');
DELETE FROM contractors WHERE code IN ('NT_VANTAI', 'NT_XAYDUNG');
DELETE FROM departments WHERE code IN ('IT_DEPT', 'SECURITY', 'LOGISTIC');
DELETE FROM companies WHERE code IN ('HOANGPHAT', 'PHUXUAN');

