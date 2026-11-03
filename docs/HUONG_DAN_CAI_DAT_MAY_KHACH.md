# Hướng Dẫn Cài Đặt & Triển Khai Hệ Thống CameraStream Trọn Gói

Hệ thống CameraStream được đóng gói trọn gói full-stack qua Docker Compose gồm:
- **Frontend**: Giao diện Web React hiện đại phục vụ qua Nginx (cổng `80`).
- **Backend**: Máy chủ Spring Boot 3 & Flyway Migration tự động (cổng `8080`).
- **AI Service**: Bộ xử lý thị giác máy tính nhận diện biển số thời gian thực (cổng `5000`).
- **MediaMTX**: Máy chủ streaming RTSP / WebRTC WHEP siêu tốc (cổng `8554`, `8889`).
- **PostgreSQL 15**: Cơ sở dữ liệu quan hệ lưu trữ thông tin camera và lịch sử nhận diện (cổng `5432`).

---

## 1. Yêu Cầu Hệ Thống
1. **Máy tính chạy hệ điều hành**: Windows 10/11 64-bit, hoặc Linux (Ubuntu 20.04/22.04/24.04), hoặc macOS.
2. **Cấu hình tối thiểu**:
   - CPU: 4 Cores (khuyên dùng Intel Core i5/i7 thế hệ 8 trở lên hoặc AMD Ryzen 5).
   - RAM: 8GB trở lên (khuyên dùng 16GB).
   - Ổ cứng: Trống tối thiểu 15GB (SSD).
3. **Phần mềm cần cài trước**:
   - **Docker Desktop** (trên Windows/Mac) hoặc **Docker Engine & Docker Compose v2** (trên Linux).

---

## 2. Các Bước Cài Đặt & Khởi Động (Chỉ 1 Lệnh Duy Nhất)

### Bước 1: Tải / Copy thư mục dự án
Copy toàn bộ thư mục `CAMERA_WEB_STREAM` sang máy khách hoặc máy tính triển khai.

### Bước 2: Tùy chỉnh IP mạng LAN (Nếu cần xem từ máy khác)
Mở file `.env` bằng Notepad hoặc Text Editor:
```env
# Nếu chỉ dùng trên chính máy này:
HOST_IP=localhost

# Nếu muốn các máy tính, điện thoại khác trong cùng mạng WiFi / mạng LAN xem được:
# Hãy đổi thành IP mạng LAN thật của máy này (xem bằng lệnh ipconfig):
HOST_IP=192.168.1.100

# Cổng truy cập Web (Mặc định 80)
FRONTEND_PORT=80
```

### Bước 3: Khởi động hệ thống
Mở Terminal (hoặc PowerShell / CMD) tại thư mục `CAMERA_WEB_STREAM` và chạy lệnh:
```bash
docker compose up -d --build
```

Docker sẽ tự động:
- Tải các image chuẩn (PostgreSQL, MediaMTX, Nginx, Python, OpenJDK).
- Tự động biên dịch mã nguồn Backend và Frontend.
- Tự động tạo bảng dữ liệu và cấu hình tài khoản mặc định qua Flyway.
- Kích hoạt toàn bộ hệ thống chạy ngầm ổn định.

---

## 3. Truy Cập Hệ Thống
Khi các container đã bật, mở trình duyệt (Google Chrome, Microsoft Edge, Cốc Cốc):
- **Truy cập tại chỗ**: `http://localhost` (hoặc `http://localhost:3000` nếu bạn đổi `FRONTEND_PORT=3000`).
- **Truy cập từ máy khác trong mạng LAN**: `http://<IP_MÁY_CHỦ>` (Ví dụ: `http://192.168.1.100`).

### Tài khoản đăng nhập mặc định:
- **Tên đăng nhập**: `admin`
- **Mật khẩu**: `admin123` (hoặc `Admin@123`)

---

## 4. Các Lệnh Quản Trị Thường Dùng

- **Xem trạng thái các dịch vụ**:
  ```bash
  docker compose ps
  ```
- **Xem nhật ký hoạt động (Logs)**:
  ```bash
  docker compose logs -f backend       # Xem log máy chủ Backend
  docker compose logs -f ai-service    # Xem log phân tích AI biển số
  docker compose logs -f mediamtx      # Xem log truyền video
  ```
- **Tạm dừng hệ thống**:
  ```bash
  docker compose stop
  ```
- **Khởi động lại hệ thống**:
  ```bash
  docker compose start
  ```
- **Tắt và dọn dẹp hệ thống**:
  ```bash
  docker compose down
  ```
*(Lưu ý: Dữ liệu CSDL và ảnh chụp snapshot nằm trong thư mục `data/` trên máy nên hoàn toàn không bị mất khi tắt Docker).*
