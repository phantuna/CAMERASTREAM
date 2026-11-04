# Hướng Dẫn Chi Tiết: Đóng Gói (Build) & Cài Đặt CameraStream Trên Máy Khách
## Quy Chuẩn Viết File `application.properties` An Toàn (Không Lộ Thông Tin)

---

## MỤC LỤC
1. [TỔNG QUAN KIẾN TRÚC BẢN GIAO NATIVE WINDOWS](#1-tổng-quan-kiến-trúc-bản-giao-native-windows)
2. [HƯỚNG DẪN BUILD ĐÓNG GÓI (DÀNH CHO LẬP TRÌNH VIÊN)](#2-hướng-dẫn-build-đóng-gói-dành-cho-lập-trình-viên)
3. [HƯỚNG DẪN CÀI ĐẶT TRÊN MÁY KHÁCH HÀNG (CLIENT INSTALLATION)](#3-hướng-dẫn-cài-đặt-trên-máy-khách-hàng-client-installation)
4. [QUY CHUẨN VIẾT `application.properties` AN TOÀN (KHÔNG LỘ THÔNG TIN MẬT)](#4-quy-chuẩn-viết-applicationproperties-an-toàn-không-lộ-thông-tin-mật)
5. [HƯỚNG DẪN CẤU HÌNH XEM QUA MẠNG LAN & TÊN MIỀN DOMAIN](#5-hướng-dẫn-cấu-hình-xem-qua-mạng-lan--tên-miền-domain)

---

## 1. TỔNG QUAN KIẾN TRÚC BẢN GIAO NATIVE WINDOWS

Khác với môi trường phát triển (dùng Docker Desktop), bản cài đặt giao cho khách hàng là **ứng dụng Windows độc lập (Native Windows Application)**:
- **AI Service (ALPR)**: Toàn bộ mã nguồn Python được biên dịch bằng **Nuitka** thành file nhị phân mã máy `main.exe`. Các file mô hình AI (`.onnx`) được mã hóa AES-256 thành file `.enc`. Máy khách **hoàn toàn không cần cài Python hay thư viện AI**.
- **MediaMTX**: Nhúng sẵn binary `mediamtx.exe` native siêu nhẹ (~20MB), phục vụ streaming WebRTC (WHEP) sub-second latency.
- **Backend & Web**: Giao diện React SPA đã được nén tối ưu (Minified Web Bundle) và nhúng trọn gói vào file `CameraStream.jar`.
- **Trình cài đặt (Setup Wizard)**: Toàn bộ được đóng gói thành **1 file cài đặt duy nhất: `CameraStream-Setup.exe`**. Có giao diện chấp thuận bản quyền (License Agreement), tự động kiểm tra Java 17 & PostgreSQL, tự tạo biểu tượng Desktop.

---

## 2. HƯỚNG DẪN BUILD ĐÓNG GÓI (DÀNH CHO LẬP TRÌNH VIÊN)

### 2.1. Yêu cầu trên máy lập trình (Build Machine)
1. Hệ điều hành: Windows 10 / Windows 11 (64-bit).
2. **Python 3.10+**: Đã cài đặt thư viện đóng gói:
   ```powershell
   pip install nuitka cryptography
   ```
3. **Java JDK 17**: Đã cài đặt (khuyên dùng Microsoft OpenJDK 17 hoặc Oracle JDK 17).
4. **Visual Studio C++ Build Tools (MSVC)**: Cần thiết để Nuitka biên dịch code Python thành file `.exe`.

### 2.2. Lệnh đóng gói 1-Click (Duy nhất 1 câu lệnh)
Mở cửa sổ **PowerShell** và chạy lệnh:

```powershell
cd D:\HOANGPHAT-PROJECT\CAMERA_WEB_STREAM
powershell -ExecutionPolicy Bypass -File release_tools\build_release.ps1
```

### 2.3. Quy trình tự động diễn ra:
- **Bước 0**: Tạo cặp khóa bảo mật bản quyền Ed25519 (`license_private.key` & public key).
- **Bước 1 (Frontend)**: Tự động chạy `vite build` nén sạch code React, nhúng logo thương hiệu chuẩn, xuất ra thư mục Web tĩnh.
- **Bước 2 (Backend)**: Maven biên dịch toàn bộ Java Spring Boot thành file thực thi `CameraStream.jar`. Tự động sinh file `application.properties` an toàn, sạch sẽ.
- **Bước 3 (AI Service)**: Nuitka biên dịch toàn bộ mã Python thành `main.exe` (loại bỏ toàn bộ thư mục tests/training/benchmarks).
- **Bước 4 (Bảo mật model)**: Mã hóa toàn bộ trọng số mạng nơ-ron AI sang định dạng bảo mật `.enc`.
- **Bước 5 (Đóng gói Installer)**: Tự động biên dịch WinForms Wizard và nén toàn bộ thành:
  👉 **`D:\HOANGPHAT-PROJECT\CameraStream-Setup.exe`**

> **Ghi chú**: Bạn chỉ cần lấy duy nhất 1 file `CameraStream-Setup.exe` này (qua Google Drive, USB, Zalo, Fshare...) để gửi cho khách hàng.

---

## 3. HƯỚNG DẪN CÀI ĐẶT TRÊN MÁY KHÁCH HÀNG (CLIENT INSTALLATION)

### 3.1. Yêu cầu môi trường trên máy khách:
- Windows 10 / Windows 11 / Windows Server (64-bit).
- **Không cần cài đặt**: Python, Docker, Git, Node.js.
- **Phần mềm nền tảng cần có**:
  1. **Java 17 (JRE 17)**: Dùng để chạy máy chủ Backend Spring Boot.
  2. **PostgreSQL 15**: Dùng để lưu dữ liệu camera và kết quả nhận diện biển số (cổng mặc định `5432`).
  *(Lưu ý: Bộ cài đặt sẽ tự động quét kiểm tra, nếu thiếu sẽ hiện thông báo và mở link tải chính thức).*

### 3.2. Các bước cài đặt:
1. Copy file `CameraStream-Setup.exe` vào máy khách và nhấp đúp để mở.
2. **Màn hình 1 — Thỏa thuận bản quyền (License Agreement)**:
   - Hiển thị văn bản giấy phép và quyền sở hữu trí tuệ của Hoàng Phát Technology Era.
   - Khách hàng chọn:
     - ⭕ *Tôi đồng ý với các điều khoản trên (I accept the agreement)*
   - Nút **"Tiếp tục > (Next)"** sẽ sáng lên để bấm tiếp.
3. **Màn hình 2 — Chọn thư mục cài đặt**:
   - Đường dẫn mặc định: `C:\CameraStream`.
   - Bấm nút **"Cài đặt ngay (Install)"**.
4. **Kiểm tra môi trường tự động**:
   - Trình cài đặt tự động kiểm tra Java 17 và PostgreSQL:
     - Nếu máy chưa có Java 17: Hiện thông báo và hỏi khách có muốn mở link tải Microsoft OpenJDK 17 MSI không.
     - Nếu máy chưa có PostgreSQL: Hiện thông báo nhắc nhở và mở link tải PostgreSQL.
5. **Biểu tượng Desktop được tạo tự động**:
   - 🚀 **`CameraStream Enterprise`**: Biểu tượng khởi động toàn bộ hệ thống (MediaMTX + Backend + AI Engine).
   - 🔑 **`Kích Hoạt CameraStream`**: Biểu tượng tạo mã phần cứng để cấp bản quyền.
   - Tự động xuất file yêu cầu bản quyền: **`activation-request.json`** ngay trên Desktop của khách.

### 3.3. Quy trình kích hoạt bản quyền (Licensing):
1. Khách gửi file `Desktop\activation-request.json` về cho kỹ sư Hoàng Phát.
2. Tại máy công ty, chạy lệnh cấp bản quyền:
   ```powershell
   python release_tools\license_issuer.py issue --customer "TEN_KHACH_HANG" --request activation-request.json --days 365 --max-cameras 16 --out license.lic
   ```
3. Gửi file `license.lic` cho khách chép vào thư mục:
   `C:\CameraStream\ai\license\license.lic`
4. Khách nhấp đúp biểu tượng 🚀 **`CameraStream Enterprise`** ngoài Desktop:
   - Hệ thống tự động kích hoạt 3 phân hệ ngầm.
   - Sau 4 giây, trình duyệt tự mở **`http://localhost:8080`** để sử dụng.

### 3.4. Hướng dẫn gỡ cài đặt (Uninstallation)
Nếu khách hàng muốn chuyển sang máy khác hoặc gỡ bỏ phần mềm:
- **Cách 1 (Từ Windows Settings / Control Panel)**:
  - Vào **Windows Settings** -> **Apps** -> **Installed apps** (hoặc **Control Panel -> Programs and Features**).
  - Tìm phần mềm **CameraStream Enterprise (Hoàng Phát ALPR)** và bấm **Uninstall**.
- **Cách 2 (Trực tiếp)**:
  - Mở thư mục cài đặt `C:\CameraStream\` và nhấp đúp file **`Uninstall-CameraStream.bat`**.

**Trình gỡ cài đặt tự động:**
1. Dừng triệt để toàn bộ các tiến trình ngầm (Backend, AI, MediaMTX).
2. Xóa sạch các biểu tượng ngoài màn hình Desktop.
3. Xóa thông tin đăng ký trong Registry Windows.
4. **Hỏi người dùng có muốn giữ lại dữ liệu ảnh (data/snapshots) và bản quyền (license) không**:
   - Nếu chọn **Y**: Giữ lại nguyên vẹn file bản quyền và lịch sử ảnh, chỉ xóa mã chương trình (giúp cài lại sau này không bị mất dữ liệu).
   - Nếu chọn **N**: Xóa sạch 100% toàn bộ thư mục cài đặt khỏi máy tính.

---

## 4. QUY CHUẨN VIẾT `application.properties` AN TOÀN (KHÔNG LỘ THÔNG TIN MẬT)

### 4.1. Cơ chế bảo mật cấu hình của Spring Boot (Property Merging)
Khi chạy lệnh `java -jar CameraStream.jar`, Spring Boot hoạt động theo cơ chế nạp cấu hình phân tầng:
1. **Lớp lõi (Bảo mật tuyệt đối)**: Nằm bên trong file `.jar`. Mọi cấu hình thuật toán, JWT Secret Key, cấu hình Flyway database migration, connection pool tối ưu (HikariCP), các cron schedule ngầm... đều được **niêm phong 100% trong ruột file `.jar`**. Khách hàng không thể đọc hay can thiệp.
2. **Lớp bên ngoài (External Override)**: Nếu tồn tại file `backend\application.properties` nằm cùng thư mục với file `.jar`, Spring Boot chỉ lấy **các dòng có mặt trong file ngoài này để ghi đè (override)** lên cấu hình nội bộ.
3. **Nguyên tắc an toàn**: Bất kỳ thông số nào **không xuất hiện** trong file `application.properties` bên ngoài sẽ tự động nhận giá trị mặc định được bảo vệ trong lõi `.jar`.

---

### 4.2. Mẫu file `backend\application.properties` chuẩn an toàn (Bàn giao khách hàng)
File này chỉ chứa đúng các tham số vận hành cần thiết của máy khách, không chứa bất kỳ đường dẫn máy dev hay thông tin nhạy cảm nào:

```properties
# ==============================================================================
# HOÀNG PHÁT - CAMERA STREAM ENTERPRISE CONFIGURATION
# File cấu hình triển khai hệ thống (Dành cho Quản trị viên / Triển khai)
# Các tham số kỹ thuật nội bộ đã được niêm phong an toàn trong core.
# ==============================================================================

# 1. CỔNG MÁY CHỦ WEB & REST API (Mặc định: 8080. Đổi thành 80 nếu muốn vào thẳng)
server.port=8080

# 2. KẾT NỐI CƠ SỞ DỮ LIỆU POSTGRESQL (Mặc định: localhost:5432)
# Đổi IP / Cổng / Mật khẩu nếu khách hàng dùng máy chủ CSDL riêng
spring.datasource.url=jdbc:postgresql://localhost:5432/camerastream_db
spring.datasource.username=postgres
spring.datasource.password=postgres

# 3. ĐỊA CHỈ TRUYỀN HÌNH ẢNH WEBRTC & RTSP (MediaMTX)
# Mở comment (bỏ dấu #) khi muốn xem camera từ máy khác trong mạng LAN hoặc Internet
# mediamtx.webrtc-base-url=http://192.168.1.100:8889
# mediamtx.rtsp-base-url=rtsp://192.168.1.100:8554

# 4. LƯU TRỮ DỮ LIỆU CỤC BỘ (Sử dụng đường dẫn tương đối an toàn)
snapshot.storage.path=./data/snapshots
backup.storage.path=./data/backup
license.path=./license/license.lic
```

---

### 4.3. Quy tắc "4 KHÔNG" để không bị lộ thông tin:

| Điều cấm | ❌ Cách viết sai (Lộ thông tin / Dễ lỗi) | ✅ Cách viết chuẩn an toàn | Giải thích lý do |
| :--- | :--- | :--- | :--- |
| **1. Đường dẫn máy Dev** | `D:/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/data/snapshots` | `./data/snapshots` | Không làm lộ tên dự án, tên ổ đĩa máy lập trình. Chạy đúng trên mọi máy khách (dù cài ổ C, D, E). |
| **2. Khóa bảo mật (Secret Keys)** | `jwt.secret=hp_secret_key_alpr_2026...` | **XÓA BỎ DÒNG NÀY** | Khóa JWT / Internal token phải để ngầm trong `.jar`. Khách hàng không cần biết và không được biết. |
| **3. Cấu hình CSDL nhạy cảm** | `spring.jpa.show-sql=true`<br>`spring.flyway.*` | **XÓA BỎ CÁC DÒNG NÀY** | Không show câu lệnh SQL ra màn hình log, không để lộ cấu trúc bảng hay kịch bản migration CSDL. |
| **4. Thông số thuật toán AI** | `ai.confidence.threshold=0.85`<br>`ai.tracker.iou=0.45` | **XÓA BỎ CÁC DÒNG NÀY** | Các ngưỡng nhận diện thuật toán AI đã được cấu hình tối ưu sẵn bên trong, không đưa ra file ngoài tránh bị chỉnh sai lệch. |

---

### 4.4. Phương án bảo mật cấp cao: Không ghi mật khẩu CSDL ra file Text
Nếu khách hàng yêu cầu bảo mật cao (không muốn lưu mật khẩu database dạng text trong file `application.properties`), có 2 phương án:

#### Cách 1: Sử dụng Biến Môi Trường Windows (System Environment Variables)
Spring Boot tự động ánh xạ biến môi trường sang thuộc tính properties. 
- Mở **System Properties** -> **Environment Variables** trên Windows của máy khách.
- Thêm biến hệ thống:
  - Tên biến: `SPRING_DATASOURCE_PASSWORD`
  - Giá trị: `MatKhauBaoMatCuaKhach123`
- Trong file `application.properties`, xóa hoàn toàn dòng `spring.datasource.password`. Hệ thống sẽ tự động đọc từ biến môi trường Windows!

#### Cách 2: Truyền tham số trực tiếp lúc chạy trong `Start-CameraStream.bat`
Trong file `Start-CameraStream.bat`:
```cmd
"%JAVA_CMD%" -jar CameraStream.jar --spring.datasource.password=%DB_PASS%
```

---

## 5. HƯỚNG DẪN CẤU HÌNH XEM QUA MẠNG LAN & TÊN MIỀN DOMAIN

### Trường hợp 1: Xem trên cùng máy tính (Localhost)
- Không cần sửa cấu hình.
- Mở trình duyệt gõ: **`http://localhost:8080`**

### Trường hợp 2: Xem từ máy khác trong cùng mạng nội bộ (LAN)
1. Mở CMD trên máy chủ cài đặt, gõ lệnh `ipconfig` để lấy địa chỉ IPv4 (Ví dụ: `192.168.1.100`).
2. Mở file `C:\CameraStream\backend\application.properties`, bỏ dấu `#` và điền IP máy chủ:
   ```properties
   mediamtx.webrtc-base-url=http://192.168.1.100:8889
   mediamtx.rtsp-base-url=rtsp://192.168.1.100:8554
   ```
3. Lưu file và chạy lại `Start-CameraStream.bat`.
4. Mọi máy tính, điện thoại, máy tính bảng trong mạng LAN chỉ cần mở trình duyệt gõ:
   👉 **`http://192.168.1.100:8080`**

### Trường hợp 3: Triển khai với Tên Miền riêng (Ví dụ: `camera.hoangphat.vn`)
1. **Cấu hình `backend\application.properties`**:
   ```properties
   server.port=80
   mediamtx.webrtc-base-url=http://camera.hoangphat.vn:8889
   mediamtx.rtsp-base-url=rtsp://camera.hoangphat.vn:8554
   ```
   *(Đổi `server.port=80` để người dùng vào thẳng tên miền không cần gõ cổng :8080)*.

2. **Cấu hình `C:\CameraStream\mediamtx\mediamtx.yml`**:
   Tìm dòng `webrtcAdditionalHosts`, thêm domain vào danh sách:
   ```yaml
   webrtcAdditionalHosts: [ "camera.hoangphat.vn" ]
   ```

3. **Mở cổng trên Router / Modem mạng (Port Forwarding)** trỏ về IP máy chủ:
   - Cổng **`80`** (TCP) : Web Frontend & Backend API.
   - Cổng **`8889`** (TCP) : MediaMTX WebRTC WHEP signaling.
   - Cổng **`8189`** (UDP) : Luồng video WebRTC trực tiếp (đảm bảo độ trễ siêu thấp < 0.3s).
