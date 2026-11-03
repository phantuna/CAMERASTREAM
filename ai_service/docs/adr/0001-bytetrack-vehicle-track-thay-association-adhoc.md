# Dùng tracker 2 tầng (Vehicle Track + ByteTrack 2-stage) thay association IoU ad-hoc

Khi 50 camera vận hành 24/7 với nhiều xe song song, association ad-hoc hiện tại (IoU ≥ 0.15 với bbox cũ, không dự đoán chuyển động) gây 3 hậu quả đo được: (1) xe trượt qua cửa sổ 30px giữa 2 detector-frame → track chết → **ID mới** (ID switch, mất `plate_votes`), (2) hai biển gần nhau (IoU > 0.12, tâm < 65px) bị spatial suppression giết nhầm track thật, (3) xe bị che vài frame không có cơ chế cứu → re-detection tạo track lạ.

Quyết định:

- **Track XE (Vehicle Track) là đơn vị chính**, biển số là thuộc tính gán vào xe (tầng 1 vehicle-detection feed). Không track riêng rẽ "biển" làm đơn vị danh tính.
- **ByteTrack 2-stage gate (Two-Stage Gate)**: detection điểm cao match mọi track; detection điểm thấp chỉ match track LOST trong `lost_window` (~3s). Motion model: constant-velocity 8-D Kalman, gate bằng IoU với bbox DỰ ĐOÁN.
- **Shadow Track**: không có vehicle-box chứa biển → sinh track từ box biển (fallback khi tầng 1 tắt).
- **Re-ID by Plate**: track LOST hay track mới đọc được biển trùng (theo cooldown registry có sẵn, key `lane:clean_plate`) → phục hồi/suppress ID, không gửi webhook trùng.
- **ID scope**: track_id per-camera (client composite key = camera_id + track_id), không theo dõi xuyên camera.
- **Rollout**: env `AI_TRACKER=legacy|bytetrack`, chạy song song, A/B qua `[BENCH]`; đảo default sau khi xác nhận ID-switch giảm và FPS không lùi.

Lý do không chọn: (a) thư viện bytetrack/ultralytics — phụ thuộc mới, khó tinh chỉnh threshold cho cam cổng cố định, không kiểm soát được; (b) ReID embedding (appearance) — biển số đã đọc là ReID tốt hơn và miễn phí; (c) thay hẳn code cũ ngay — regression risk cho webhook, vì vậy song song trước.

Hệ quả: thêm module `core/bytetrack_tracker.py` (numpy, ~250 dòng, không phụ thuộc ngoài hệ). Queue OCR async phải validate track_id thay vì tham chiếu object khi track merge/respawn. `TrackedPlate` giữ nguyên vai trò giữ state biển/event; chỉ nguồn ID + prediction chuyển sang tracker.
