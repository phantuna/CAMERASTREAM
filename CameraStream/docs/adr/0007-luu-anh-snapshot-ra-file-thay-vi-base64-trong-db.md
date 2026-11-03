# ADR 0007 — Lưu ảnh snapshot ra file thay vì base64 trong DB

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-08-19
- **Quyết định**: Ảnh snapshot lưu ra **file** trên đĩa; DB chỉ giữ **URL**.

## Bối cảnh

Trước đây ảnh toàn cảnh và ảnh crop biển số được nhúng dạng base64 vào cột
`system_events.snapshot_url` và `payload_json`. Hai hệ quả:

1. Cột thật trong DB là `varchar(1000)`, còn entity khai báo `TEXT`.
   Hibernate `ddl-auto=update` **không** đổi kiểu cột cũ, nên base64 ~30KB vượt
   giới hạn → insert lỗi → transaction rollback.
2. `CameraServiceImpl` nuốt lỗi bằng `catch (Exception ex) { log.warn(...) }`,
   khiến ảnh hỏng không ai thấy.

Kết quả: mọi thẻ lịch sử biển số hiện placeholder, dù cờ `hasPlateCrop` bật.

## Quyết định

- AI service (Python) ghi JPEG ra thư mục `data/snapshots/`, gửi **tên file** lên webhook.
- Spring Boot nhận tên file, ghép thành URL tuyệt đối
  (`{snapshot.base-url}/{file}`), lưu URL vào DB, và phục vụ ảnh qua
  `GET /snapshots/{name}`.
- `snapshot_url` chuyển sang `TEXT` (migration `V7__snapshot_url_to_text.sql`).
- Base64 vẫn được chấp nhận ở đường vào để tương thích ngược với AI service cũ,
  nhưng được đánh dấu `@Deprecated` và sẽ bị loại bỏ.

## Hệ quả

### Phải biết để không phá hệ thống

- **Shared thư mục giữa 2 service.** Python và Spring Boot phải trỏ cùng một
  `SNAPSHOT_STORAGE_PATH`. Khi tách 2 service ra 2 máy, thư mục này **bắt buộc**
  là shared volume (NFS / bind-mount chung) — copy code sang máy mới là không đủ.
- **Retention 30 ngày do backend sở hữu.** Job `SnapshotRetentionJob` chạy 03:17
  mỗi ngày và xóa file cũ hơn 30 ngày. Python **không** tự xóa file, để tránh
  2 bên cùng quản lý một thư mục.
- **DB giữ URL của file có thể đã biến mất.** Ảnh >30 ngày bị xóa nhưng row vẫn
  còn. Frontend phải bắt `onError` của `<img>` và hiện placeholder — đây là
  trạng thái bình thường, không phải lỗi, nên không log ra console.

### Ảnh hưởng tới hệ thống khác

- **`SNAPSHOT_BASE_URL` phải là domain public thật trong production.**
  Nếu để `http://localhost:8080`, frontend ở máy khác không tải được ảnh.
- **Cột `snapshot_url` cần migration tay.** `ddl-auto=update` không xử lý được
  việc đổi kiểu cột. Chạy SQL một lần trước khi test.

## Trade-off

| Phương án | Ưu | Nhược |
|---|---|---|
| **File trên đĩa** (chọn) | Tự chứa, đơn giản, khớp pattern `face_service`, ảnh sống sót restart AI service | Cần shared volume khi tách máy; retention phải quản lý bằng tay |
| MinIO / S3 | Bền vững, không cần shared volume | Cần hạ tầng mới, chậm triển khai, vượt ngoài phạm vi hiện tại |
| base64 trong DB | Đơn giản nhất về hạ tầng | Phá khi scale: row nặng, insert lỗi, poll toàn bảng chậm |

## Trạng thái xem lại

Sau khi lưu lượng camera vượt ~500 camera, hoặc khi phải tách 2 service ra 2
máy thật, cân nhắc lại MinIO/S3. Đổi từ file sang object store là migration lớn
và cột DB đã có dữ liệu URL trỏ file.
