# ADR 0008 — Kiến trúc Xác thực Hybrid: HttpOnly Cookie cho Web và Service Key cho M2M

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-10-30
- **Quyết định**: Sử dụng kiến trúc xác thực kép: Phiên làm việc trên Trình duyệt xác thực qua cặp token JWT lưu trong **HttpOnly Cookie**; Giao tiếp nội bộ giữa các microservice (AI Service → Spring Boot) xác thực qua **Service API Key**.

## Bối cảnh

Trước đây, hệ thống lưu JWT token trong `localStorage` của trình duyệt và gửi qua header `Authorization: Bearer <token>`. Cách tiếp cận này bộc lộ 2 điểm yếu chí tử:
1. **Lỗ hổng bảo mật XSS**: Mã độc JS trên trình duyệt có thể đọc trộm token trong `localStorage`.
2. **Lỗi 401 phân tán ở Frontend**: Khi siết chặt bảo mật bằng `@RequirePermission`, bất kỳ component React nào vô tình gọi `fetch()` nguyên bản mà quên truyền header `Authorization` đều bị từ chối 401, làm vỡ hiển thị danh sách camera và biểu đồ.
3. **Xác thực máy với máy (M2M)**: AI Service chạy trong container Docker gọi Webhook sang Spring Boot phải mượn tạm cơ chế kiểm tra `User-Agent: ALPR-Bridge` rất lỏng lẻo và dễ bị giả mạo trên mạng LAN.

## Quyết định

1. **Phiên Trình duyệt (Human User Sessions)**:
   - **Cặp Token (Access + Refresh Token)**:
     - `access_token` (Thời hạn 15–30 phút): Lưu trong Cookie `HttpOnly; Secure; SameSite=Strict; Path=/`.
     - `refresh_token` (Thời hạn 7 ngày): Lưu trong Cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh`.
   - **Tự động gửi Cookie**: Trình duyệt tự động đính kèm cookie trong mọi request HTTP và cả phiên bắt tay WebSocket (`/ws-camera`). Frontend JavaScript không cần can thiệp đọc/ghi token.
   - **Cơ chế Refresh ngầm**: Khi nhận mã 401 do hết hạn `access_token`, client gọi `/api/auth/refresh` để nhận `access_token` mới trong suốt với trải nghiệm người dùng.

2. **Giao tiếp Nội bộ Microservices (Machine-to-Machine)**:
   - AI Service gửi Webhook và metadata qua Header `X-Internal-Service-Key: <SECRET_KEY>`.
   - Spring Boot `PermissionInterceptor` kiểm tra Service Key này trực tiếp đối chiếu với biến môi trường `SERVICE_INTERNAL_KEY`. Nếu khớp, cấp quyền toàn phần cho tác vụ ingestion của AI mà không cần sinh cookie session.

3. **Phân quyền RBAC Phân cấp**:
   - `PermissionInterceptor` ánh xạ `@RequirePermission("CODE")` với danh sách quyền hạn thực tế trong bảng `permissions` và `roles` (Flyway V10, V13).
   - Tài khoản vai trò `SUPER_ADMIN` và `ADMIN` mặc định sở hữu toàn quyền 100%.

## Lý do không chọn

- **Không dùng localStorage thuần túy**: Vì rủi ro XSS và phụ thuộc vào việc lập trình viên phải nhớ gắn header thủ công ở từng request.
- **Không dùng Cookie cho AI Service**: Vì các tiến trình nền Python (gửi hàng chục webhook mỗi giây) duy trì cookie session rất phức tạp và không cần thiết so với mô hình Service Key chuẩn công nghiệp.

## Hệ quả

- **Bảo mật tuyệt đối**: Token không thể bị đọc bởi JavaScript độc hại.
- **Phát triển Frontend dễ dàng**: Không cần viết mã quản lý gắn token trong từng file component.
- **Dev vs Prod Environment**: Khi phát triển local với 2 port khác nhau (`localhost:5173` và `localhost:8080`), Cookie yêu cầu cấu hình Nginx reverse proxy hoặc cấu hình `SameSite=Lax`.

