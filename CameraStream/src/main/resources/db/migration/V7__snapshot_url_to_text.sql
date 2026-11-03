-- Migration: đổi cột snapshot_url từ varchar(1000) sang TEXT.
--
-- BẮT BUỘC chạy trước khi test luồng ảnh. Hibernate `ddl-auto=update` KHÔNG
-- đổi kiểu cột cũ, nên phải chạy thủ công 1 lần.
--
-- Bối cảnh: trước đây ảnh base64 (~30KB) được nhét vào snapshot_url, vượt giới
-- hạn varchar(1000) -> insert lỗi -> transaction rollback -> ảnh mất hoàn toàn.
-- Nay ảnh lưu ra file, cột chỉ giữ URL nên TEXT là đủ.
--
-- Kiểm tra sau khi chạy:  \d system_events  -> snapshot_url | text

ALTER TABLE system_events ALTER COLUMN snapshot_url TYPE TEXT;
