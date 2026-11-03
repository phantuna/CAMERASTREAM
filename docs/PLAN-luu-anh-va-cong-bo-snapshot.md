# Kế hoạch: Lưu ảnh snapshot ra file và công bố URL

## Bối cảnh đã xác minh

Điều tra trên dữ liệu thật (PostgreSQL `camerastream_db`, bảng `system_events`):

| Kiểm tra | Kết quả |
|---|---|
| Tổng số event | 98 |
| `payload_json` chứa cờ `hasPlateCrop` | 98 / 98 |
| `payload_json` chứa `plateCropUrl` | **0 / 98** |
| `snapshot_url` NULL | **98 / 98** |

Trong [CameraServiceImpl.java:274-277](../../HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/CameraStream/src/main/java/org/example/camerastream/modules/camera/service/CameraServiceImpl.java#L274-L277), `hasPlateCrop` và `plateCropUrl` nằm **cùng một khối `if`** — không thể có 98/98 cờ bật mà 0/98 giá trị. Kết luận: **ảnh đang bị mất hoàn toàn**, chỉ còn metadata (`plateNumber`, `vehicleType`, `confidence`).

Hai nguyên nhân phối hợp:
1. `CameraServiceImpl.java:290` có `catch (Exception ex) { log.warn(...) }` — nuốt lỗi im lặng, không ai thấy ảnh hỏng.
2. `SystemEvent.snapshotUrl` khai báo `columnDefinition = "TEXT"`, nhưng cột thật trong DB là `varchar(1000)` (Hibernate `ddl-auto=update` **không** đổi kiểu cột cũ). Base64 ảnh ~30KB vượt giới hạn → insert lỗi → transaction rollback.

Hệ quả: [AlprCardItem.tsx:70](../../HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/CameraStream-FE/src/features/alpr-logs/components/AlprCardItem.tsx#L70) fallback `heroImg = snapshotUrl || plateCropUrl` → **mọi thẻ đều không có ảnh**, chỉ hiện placeholder.

## Quyết định đã chốt

- **Lựa chọn A** (Incremental polling + ETag) — đã được chốt trước.
- **A2**: ảnh lưu ra **file**, DB giữ **URL**. Không nhét base64 vào Postgres.

Lưu ý phát hiện thêm trong lúc điều tra: polling 6 giây **đã bị loại bỏ** — [AlprLogsModule.tsx:156](../../HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/CameraStream-FE/src/features/alpr-logs/AlprLogsModule.tsx#L156) giờ dùng WebSocket `useEventStream()`. Nên phần `/incremental` của Lựa chọn A chỉ còn ý nghĩa với 2 chỗ polling còn lại (xem mục 5).

## Nguyên tắc thực hiện

### Quyết định đã chốt (vòng hỏi thứ 2)

| Câu hỏi | Chốt |
|---|---|
| Ảnh lưu ở đâu, ai phục vụ? | **Shared thư mục** — Python ghi file vào `data/snapshots/`, Spring Boot đọc chính thư mục đó và phục vụ `GET /snapshots/{name}`. Một nguồn file duy nhất. |
| Giữ ảnh bao lâu? | **30 ngày**, job dọn chạy hằng ngày. |

Hệ quả của "shared thư mục": khi tách 2 service ra 2 máy, thư mục này phải là **shared volume** (NFS / bind-mount chung). Cần ghi rõ vào tài liệu vận hành. Backend là nơi **kiểm soát retention** — Python không tự xóa file.

### Pattern tham chiếu

Làm theo đúng pattern `face_service` đã có sẵn và đang chạy ổn định:
- Lưu file vào thư mục `snapshots/`
- Phục vụ qua HTTP route `/snapshots/<file>`
- FE dùng URL thay vì chuỗi base64

Nhờ vậy ảnh còn sống sau khi AI service restart, và DB giữ được hình dạng dữ liệu sạch (URL thay vì blob).

---

## 1. Python `ai_service` — lưu ảnh ra file

**File:** `ai_service/core/camera_stream_bridge.py`

1. Thêm hằng số thư mục lưu ảnh, cạnh `DETECTIONS_CACHE_FILE`:
   ```python
   SNAPSHOT_DIR = BASE_DIR / "events" / "snapshots"
   ```
   Dùng biến môi trường `SNAPSHOT_STORAGE_PATH` để trỏ về cùng shared volume với Spring Boot:
   ```python
   SNAPSHOT_DIR = Path(os.getenv("SNAPSHOT_STORAGE_PATH", str(BASE_DIR / "events" / "snapshots")))
   ```
2. Thêm hàm lưu ảnh, trả về tên file (không trả base64):
   ```python
   def save_snapshot(b64_data: str, prefix: str = "anpr") -> Optional[str]:
       """Giải mã base64 -> ghi file JPEG -> trả tên file. Trả None nếu lỗi."""
   ```
   Dùng `cv2.imdecode` / `cv2.imwrite` (đã import sẵn `cv2`) với `IMWRITE_JPEG_QUALITY 88`, khớp `face_service/worker.py:202`.
3. Tại nơi dựng record detection (khoảng dòng 1163-1185), thay vì nhét `full_b64` / `crop_b64` vào dict, gọi `save_snapshot` và lưu **tên file**:
   - `snapshotFile` → tên file ảnh toàn cảnh
   - `plateCropFile` → tên file ảnh crop biển số
4. Gửi sang Spring Boot: thay `plate_crop_b64` / `full_image_b64` bằng `plate_crop_file` / `full_image_file` (tên file).
   - **Quan trọng:** giữ nguyên việc gửi base64 nếu server chưa sẵn sàng — xem mục 2 để quyết định cách chuyển tiếp an toàn (backward compatible).
5. Route mới phục vụ ảnh trong `SSEStreamHandler.do_GET`:
   ```python
   elif self.path.startswith("/snapshots/"):
       # phục vụ file JPEG, mirror face_service/server.py:119-131
   ```
   Route này là **dự phòng** — nguồn chính là `:8080/snapshots/{name}`. Giữ lại để Python vẫn tự phục vụ được ảnh của nó (hữu ích khi debug, và khi chưa cấu hình shared volume).
6. `record_detection_event` giữ `snapshotUrl`/`plateCropUrl` trong cache JSON dưới dạng **URL tương đối** (`/snapshots/<file>`) thay vì base64 → cache file `recent_detections.json` giảm từ ~5.9MB xuống vài chục KB.
7. **Không** cho Python xóa file (retention do backend sở hữu) — tránh 2 bên cùng quản lý một thư mục.

## 2. Spring Boot — nhận tên file, công bố URL, phục vụ ảnh

**File:** `CameraStream/src/main/java/org/example/camerastream/modules/camera/dto/PlateDetectionRequest.java`
- Thêm `plateCropFile`, `fullImageFile` (String). Giữ nguyên `plateCropBase64`/`fullImageBase64` để tương thích ngược.

**File:** `CameraStream/src/main/java/org/example/camerastream/modules/camera/service/CameraServiceImpl.java`
- Trong `processPlateDetection`:
  - Nếu có `plateCropFile`/`fullImageFile` → dựng URL công bố: `{snapshotBaseUrl}/snapshots/{file}`.
  - `snapshotUrl` = URL ảnh toàn cảnh; `payloadMap.put("plateCropUrl", ...)` = URL ảnh crop.
  - **Không** đưa base64 vào `payloadMap` nữa (giữ `hasPlateCrop` cờ boolean).
  - Nếu server vẫn nhận base64 (client cũ) → vẫn ghi được, nhưng phải **không** làm vỡ transaction: bọc phần ghi ảnh vào try/catch riêng, log rõ ràng, không nuốt im lặng.
- Sửa `catch (Exception ex) { log.warn("Could not forward...") }` — thêm `log.error` với stack trace để lỗi không còn bị giấu.

**File:** `CameraStream/src/main/java/org/example/camerastream/modules/eventhub/entity/SystemEvent.java`
- `snapshotUrl` giữ `TEXT` (đã đúng ý) — nhưng cần **migration** đổi cột `varchar(1000)` → `text`:
  ```sql
  ALTER TABLE system_events ALTER COLUMN snapshot_url TYPE TEXT;
  ```
  Không có Flyway/Liquibase trong project → chạy SQL thủ công 1 lần, và ghi vào `application.properties` không cần (ddl-auto không xử lý được).

**Cấu hình mới** (`application.properties`):
```properties
# Ảnh snapshot: thư mục lưu dùng chung với AI service + URL công bố
snapshot.storage.path=${SNAPSHOT_STORAGE_PATH:D:/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/data/snapshots}
snapshot.base-url=${SNAPSHOT_BASE_URL:http://localhost:8080/snapshots}
snapshot.retention-days=${SNAPSHOT_RETENTION_DAYS:30}
```

**Service mới:** `modules/snapshot/service/SnapshotStorageService.java` (+Impl)
- `save(byte[] jpegBytes, String prefix)` → tên file
- `resolve(name)` → Path, chống path traversal (`Path.get(name).getFileName()`)
- `deleteExpired()` → xóa file cũ hơn `snapshot.retention-days` (**30 ngày**), chạy job hằng ngày

**Controller mới:** `modules/snapshot/controller/SnapshotController.java`
- `GET /snapshots/{name}` → trả file JPEG, `Content-Type: image/jpeg`
- **Không** dùng `WebMvcConfigurer.addResourceHandlers` vì cần kiểm soát retention và chống traversal; dùng controller đọc file trực tiếp, mirror `face_service/server.py:119-131`.
- Trả 404 (không phải 500) khi file không còn tồn tại — trường hợp này **sẽ xảy ra** với ảnh >30 ngày mà DB vẫn giữ URL. FE cần xử lý `onError` → hiện placeholder thay vì ảnh vỡ.

**CORS:** `CorsConfig` đã có `allowedOriginPatterns("*")` + `allowedHeaders("*")` → ảnh từ `:8080` sẽ load được từ FE ở `:5173`. Không cần sửa.

## 3. Frontend — dùng URL thay vì base64

**File:** `CameraStream-FE/src/features/alpr-logs/AlprLogsModule.tsx`
- Bỏ nhánh gọi `http://localhost:5000/api/detections` làm nguồn chính; chuyển sang đọc từ Spring Boot (`apiBaseUrl`) làm nguồn sự thật, đúng ranh giới tầng đã chốt trong design doc (mục 1).
- `snapshotUrl` / `plateCropUrl` nhận URL tuyệt đối từ backend — không cần sửa logic render.
- Fallback sang AI service giữ lại **chỉ khi** Spring Boot không có dữ liệu.

**File:** `CameraStream-FE/src/components/VehicleAccessPanel.tsx`
- `fetch('http://localhost:5000/api/detections')` → đổi sang `apiBaseUrl` + endpoint sự kiện.

**File:** `CameraStream-FE/src/features/video-wall/VideoWallView.tsx`
- `fetch(\`${effectiveAiApiBaseUrl}/api/detections\`)` + `setInterval` 5s → dùng WebSocket `useEventStream` (đã có sẵn ở module khác), bỏ interval.

**Kiểm tra tương thích:** `handleDownloadImage` ở [SurveillanceSystem.tsx:922](../../HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/CameraStream-FE/src/components/SurveillanceSystem.tsx#L922) đặt `link.href = dataUrl` — với URL http thay vì data URL thì `download` attribute bị browser bỏ qua (cross-origin). Cần sửa: dùng `fetch(url)` → `blob` → `URL.createObjectURL` → `link.href = blobUrl`. **Đây là bẫy thật, phải sửa.**

**Xử lý ảnh đã bị xóa (>30 ngày):**
- [AlprCardItem.tsx](../../HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/CameraStream-FE/src/features/alpr-logs/components/AlprCardItem.tsx) và các nơi render `<img>` cần `onError` → set state ẩn ảnh, hiện placeholder.
- Đây là trạng thái **bình thường**, không phải lỗi — không nên spam console.

## 4. Migration bắt buộc

```sql
ALTER TABLE system_events ALTER COLUMN snapshot_url TYPE TEXT;
```
Bắt buộc — nếu không, mọi insert có ảnh vẫn fail âm thầm.

## 5. Endpoint incremental (phần còn lại của Lựa chọn A)

**File:** `CameraStream/src/main/java/org/example/camerastream/modules/eventhub/controller/EventWebhookController.java`
- `GET /api/v1/events/incremental?since=<ISO-8601>&size=<n>` → trả event mới hơn `since`.
- Thêm query vào `SystemEventRepository`:
  ```java
  @Query("SELECT e FROM SystemEvent e WHERE e.created_at > :since ORDER BY e.created_at ASC")
  List<SystemEvent> findEventsSince(@Param("since") LocalDateTime since, Pageable pageable);
  ```
- Trả kèm header `ETag` = hash của `max(created_at) + count`; FE gửi `If-None-Match` → server trả `304` nếu không có gì mới.

## 6. Kiểm thử

| # | Việc | Điều kiện đạt |
|---|---|---|
| 0 | Cấu hình `SNAPSHOT_STORAGE_PATH` giống nhau cho Python và Spring Boot (env var) | Cả 2 cùng trỏ 1 thư mục |
| 1 | Migration SQL | `snapshot_url` là `text` (kiểm `\d system_events`) |
| 2 | Chạy AI service, chụp 1 xe qua camera 39 | File xuất hiện trong `data/snapshots/` |
| 3 | `GET :8080/snapshots/<file>` | Trả 200, `Content-Type: image/jpeg`, bytes khớp file |
| 3b | `GET :5000/snapshots/<file>` | Trả 200 (route dự phòng) |
| 4 | Query DB | `snapshot_url` có giá trị URL, `payload_json` có `plateCropUrl` |
| 5 | `curl localhost:5000/api/detections` | `snapshotUrl` là URL, **không** phải `data:image/...` |
| 6 | Mở tab Lịch Sử Biển Số | Thẻ **có ảnh thật**, không phải placeholder |
| 7 | Click "Tải ảnh" | File tải về đúng `.jpg`, không mở tab mới |
| 8 | `/api/v1/events/incremental?since=...` | Trả đúng số event mới, `ETag` ổn định |
| 9 | FE không còn gọi `:5000/api/detections` | DevTools Network không thấy request đó từ tab lịch sử |
| 10 | Restart AI service | Ảnh cũ vẫn xem được qua `:8080/snapshots/...` |
| 11 | Retention | Xoá file cũ hơn 30 ngày; thẻ lịch sử tương ứng hiện placeholder, **không** ảnh vỡ |
| 12 | Log backend | Không còn `Could not forward plate detection` khi có detection thật |

## 7. Domain model cần cập nhật

- `CameraStream/GLOSSARY.md`: thêm **Snapshot** (ảnh toàn cảnh) — đã có; sửa mô tả để nói rõ snapshot được *lưu thành file* và *tham chiếu bằng URL*, không mang nội dung base64.
- `CameraStream-FE/GLOSSARY.md`: sửa **Snapshot Preview** — nguồn ảnh là URL từ backend, không phải chuỗi base64.
- `CameraStream/docs/adr/0007-luu-anh-snapshot-ra-file-thay-vi-base64-trong-db.md` — ADR mới:
  - **Hard to reverse**: đổi từ file sang MinIO/S3 sau này là migration lớn; cột DB đã có dữ liệu URL trỏ file.
  - **Surprising without context**: đọc code sẽ thấy `snapshot_url` chứa URL chứ không phải ảnh — tự nhiên với người mới, gây ngạc nhiên với người cũ.
  - **Real trade-off**: file tự chứa (đơn giản, khớp `face_service`) vs MinIO (bền vững, cần hạ tầng) vs base64 trong DB (đơn giản nhất nhưng phá khi scale).
  - Ghi rõ trong ADR: **shared thư mục** giữa 2 service → khi tách máy phải là shared volume; và **retention 30 ngày do backend sở hữu**, Python không tự xóa.

## 8. Ngoài phạm vi

- MinIO/S3 — để sau; A2 dùng filesystem đã đủ cho 100–500 camera.
- Xuất Excel server-side cho tập dữ liệu lớn (mục 3.4 của design doc) — việc riêng.
- Xác thực & RBAC (ADR 0004) — việc riêng.

## 9. Vận hành

- **Env var bắt buộc cho cả 2 service** (phải trỏ cùng một thư mục):
  - `SNAPSHOT_STORAGE_PATH` — Python (`ai_service`) và Spring Boot
  - `SNAPSHOT_BASE_URL` — Spring Boot, ví dụ `http://localhost:8080/snapshots`
- **Khi tách 2 service ra 2 máy**: `SNAPSHOT_STORAGE_PATH` phải là shared volume (NFS / bind-mount chung). Không tách được nếu chỉ copy code.
- **Môi trường production**: đặt `SNAPSHOT_BASE_URL` = domain public thật (không phải `localhost`), nếu không FE ở máy khác sẽ không tải được ảnh.

## 10. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Ảnh không tới DB nếu quên migration | Bước kiểm thử #1 chạy **trước** khi test còn lại |
| FE gọi nhầm URL tương đối `/snapshots/x.jpg` | Backend luôn trả URL **tuyệt đối**; test #4 |
| Tải ảnh bị browser chặn do cross-origin `download` | Sửa `handleDownloadImage` sang blob (mục 3) |
| Ảnh tích tụ trên đĩa | `snapshot.retention-days=30` + job dọn theo lịch |
| Ảnh >30 ngày bị xóa nhưng DB vẫn giữ URL | FE có `onError` → placeholder (mục 3) |
| 2 service lệch `SNAPSHOT_STORAGE_PATH` | Cùng env var; test #0 kiểm tra trước |
| Python gửi base64 nhưng server mong tên file (lệch phiên bản) | Backend nhận **cả hai**; ưu tiên tên file, fallback base64 |
