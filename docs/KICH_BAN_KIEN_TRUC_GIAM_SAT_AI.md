# KỊCH BẢN KIẾN TRÚC & HƯỚNG DẪN QUẢN LÝ HỆ THỐNG GIÁM SÁT AI TẬP TRUNG (BẢN CHUẨN HÓA V2.0)
> **Tài liệu chiến lược kỹ thuật:** Giải quyết bài toán quản lý hàng trăm camera đa điểm, tách biệt luồng Video và luồng Tọa độ (Client-Side HTML5 Canvas Overlay), hiển thị khung bám mục tiêu thời gian thực và tự động cắt/chụp đối tượng (Biển số, FaceID, An toàn) theo từng module được gán.

---

## MỤC LỤC
1. [Nguyên Lý Cốt Lõi: Tách Biệt Video & Tọa Độ AI (Client-Side Canvas Overlay)](#1-nguyên-lý-cốt-lõi-tách-biệt-video--tọa-độ-ai)
2. [Kiến Trúc Tổng Thể Hệ Thống](#2-kiến-trúc-tổng-thể-hệ-thống)
3. [Cơ Chế Hiển Thị Theo Từng Module Được Gán Trên Camera (Dynamic UI)](#3-cơ-chế-hiển-thị-theo-từng-module-được-gán-trên-camera)
4. [Chuẩn Hóa 2 Giao Thức Truyền Dữ Liệu (Realtime BBox & Snapshot Event)](#4-chuẩn-hóa-2-giao-thức-truyền-dữ-liệu)
   - [Gói tin 1: Luồng tọa độ bám đuổi (Realtime Tracking Stream)](#41-gói-tin-1-luồng-tọa-độ-bám-đuổi-mỗi-100ms)
   - [Gói tin 2: Sự kiện chốt & chụp đối tượng (Snapshot Event)](#42-gói-tin-2-sự-kiện-chốt--chụp-đối-tượng)
5. [Kịch Bản Hoạt Động Chi Tiết Từ A Đến Z](#5-kịch-bản-hoạt-động-chi-tiết-từ-a-đến-z)
6. [Giải Pháp Vận Hành Hàng Trăm Camera Không Bị Treo Web](#6-giải-pháp-vận-hành-hàng-trăm-camera-không-bị-treo-web)
7. [Lộ Trình Triển Khai Thực Tế](#7-lộ-trình-triển-khai-thực-tế)

---

## 1. NGUYÊN LÝ CỐT LÕI: TÁCH BIỆT VIDEO & TỌA ĐỘ AI

> [!CAUTION]
> **Sai lầm thường gặp gây sập máy chủ:** Dùng Python (OpenCV) vẽ khung chữ nhật đè lên từng khung hình rồi nén lại (Re-encode H.264) đẩy lên Web $\rightarrow$ Chạy đến camera thứ 10 là CPU/GPU đạt 100%, video bị delay 3–5 giây.

### Cách làm chuẩn công nghiệp:
* **Luồng video gốc:** Đi thẳng từ Camera qua MediaMTX lên thẻ `<video>` của trình duyệt qua WebRTC (Zero Re-encoding, CPU máy chủ tốn ~ 0%).
* **Luồng AI ngầm:** AI Worker xử lý luồng phụ (Sub-stream), chỉ trích xuất **tọa độ hộp bao Bounding Box (JSON vài byte)** và đẩy qua WebSocket. Trình duyệt dùng thẻ `<canvas>` trong suốt đặt đè lên trên `<video>` để tự vẽ khung bám theo đối tượng!

```
[ CAMERA IP ] 
   │
   ├── 1. LUỒNG VIDEO (RTSP Passthrough) ──> [ MediaMTX ] ──(WebRTC)──> [ Thẻ <video> trên Web ]
   │      (Không giải mã lại, CPU ~ 2%)
   │
   └── 2. LUỒNG AI (Sub-stream vào RAM) ───> [ AI Worker (YOLOX / InsightFace / VietOCR) ]
                                                    │
                    ┌───────────────────────────────┴───────────────────────────────┐
                    ▼ (Mỗi 100ms - 10 FPS)                                          ▼ (Chỉ khi chốt được đối tượng)
         2A. LUỒNG TỌA ĐỘ BÁM ĐUỔI (Tracking Stream)                     2B. LUỒNG SỰ KIỆN & ẢNH CHỤP (Snapshot Event)
         - Chỉ gửi JSON tọa độ (x, y, w, h) + Text                       - Cắt ảnh biển số (Crop) + Ảnh toàn cảnh
         - Qua WebSocket đẩy thẳng lên trình duyệt                       - Gửi về POST /api/ai/events lưu Database
         - Trình duyệt vẽ lên <canvas> đè trên <video>                   - Hiển thị vào danh sách lịch sử bên cạnh Cam
```

### Tại sao kiến trúc này chịu tải được hàng trăm Camera?
1. **Không Re-encode Video:** AI Worker chỉ đọc luồng phụ để lấy tọa độ, không nén lại video. MediaMTX chỉ làm nhiệm vụ chuyển tiếp (Passthrough) gói tin H.264 từ camera lên trình duyệt.
2. **Phân trang luồng xem (Smart Viewport & Pagination):** Dù quản lý 500 camera, một màn hình người dùng chỉ xem tối đa 16 hoặc 25 ô cùng lúc (dùng luồng phụ 360p/480p). Khi nhấp đúp phóng to 1 camera mới tự động chuyển sang luồng chính (Full HD 1080p).
3. **Bám đuổi mượt mà nhờ `track_id`:** Nhờ thuật toán ByteTrack, khi xe di chuyển, khung vuông bám chặt theo biển số trên màn hình. Chỉ khi xe đi vào vùng nét nhất, hệ thống mới chụp 1 tấm duy nhất đẩy ra khay sự kiện (tránh chụp trùng lặp 20 tấm của cùng 1 chiếc xe).

---

## 2. KIẾN TRÚC TỔNG THỂ HỆ THỐNG

```
[ TẦNG THIẾT BỊ & XỬ LÝ AI (EDGE / WORKER) ]             [ TẦNG TRUNG TÂM (SPRING BOOT & MEDIAMTX) ]
+-----------------------------------------------+        +-----------------------------------------+
| 1. MediaMTX Agent / Relay                     |        | 1. MediaMTX Central Server              |
|    - Kéo RTSP từ Camera nội bộ                | =====> |    - Phát WebRTC/HLS lên trình duyệt    |
|    - Chỉ đẩy luồng lên Cloud khi có người xem |        |                                         |
|                                               |        | 2. Spring Boot Backend                  |
| 2. Multi-Pipeline AI Engine                   |        |    - Quản lý bảng `camera_ai_configs`   |
|    - Đọc Sub-stream 1 lần duy nhất vào RAM    |        |    - WebSocket Hub (Bắn tọa độ & Event) |
|    - Chạy ByteTrack gán `track_id`            | =====> |    - Lưu DB PostgreSQL + Ảnh (MinIO)    |
|    - Chạy Module theo cấu hình từng Cam:      |        +--------------------+--------------------+
|      + Cam 1: ALPR (Biển số)                  |                             |
|      + Cam 2: FaceID (Khuôn mặt)              |                             | (WebSocket + WebRTC)
|      + Cam 3: ALPR + FaceID + Mũ bảo hộ       |                             ▼
+-----------------------------------------------+        +-----------------------------------------+
                                                         | 3. GIAO DIỆN WEB QUẢN TRỊ (REACT/TSX)   |
                                                         | +-------------------------------------+ |
                                                         | | Ô VIDEO CAMERA      | KHAY SỰ KIỆN  | |
                                                         | | [Video gốc WebRTC]  | [Ảnh crop BS] | |
                                                         | | + [Lớp Canvas vẽ    | 29A-888.88    | |
                                                         | |   khung bám biển số | [Ảnh FaceID]  | |
                                                         | |   & tên nhân viên]  | Nguyễn Văn A  | |
                                                         | +-------------------------------------+ |
                                                         +-----------------------------------------+
```

---

## 3. CƠ CHẾ HIỂN THỊ THEO TỪNG MODULE ĐƯỢC GÁN TRÊN CAMERA (DYNAMIC UI)

Khi bạn gán module nào cho Camera trên Web, giao diện của Camera đó sẽ tự động biến hình để hiển thị đúng đặc thù dữ liệu của module đó:

| Module được gán | Hiển thị bám đuổi trực tiếp trên Video (`<canvas>`) | Dữ liệu chụp & lưu hiển thị bên cạnh (Live Sidebar) |
| :--- | :--- | :--- |
| **1. Nhận diện biển số (ALPR)** | - Khung xanh lá bám quanh chiếc xe (`track_id: #12`).<br>- Khung vàng nhỏ bám đúng vị trí biển số.<br>- Nhãn nổi trên khung: **`29A-888.88 (96%)`**. | - Ảnh chụp cắt riêng biển số (Crop) siêu nét.<br>- Ảnh toàn cảnh đầu xe.<br>- Biển số dạng Text, Thời gian, Phân loại xe (Ô tô/Xe máy). |
| **2. Nhận diện khuôn mặt (FaceID)** | - Khung xanh dương (Người quen) hoặc Đỏ (Người lạ) bám theo khuôn mặt.<br>- Nhãn nổi đi theo mặt: **`NV015 - Nguyễn Văn A`** hoặc **`Khách lạ`**. | - Ảnh chụp khuôn mặt vừa bắt được đặt cạnh Ảnh gốc trong hồ sơ để đối chiếu.<br>- Mã nhân viên, Họ tên, Phòng ban, Giờ chấm công. |
| **3. An toàn / Bảo hộ (Mũ, Áo, Lửa)** | - Khung đỏ nhấp nháy quanh vùng vi phạm (đầu không đội mũ / đám khói).<br>- Nhãn cảnh báo: **`KHÔNG MŨ BẢO HỘ`** / **`PHÁT HIỆN LỬA`**. | - Ảnh chụp khoảnh khắc vi phạm (có đánh dấu vùng đỏ).<br>- Nút bấm: *"Xác nhận vi phạm"* hoặc *"Báo động giả"*. |

---

## 4. CHUẨN HÓA 2 GIAO THỨC TRUYỀN DỮ LIỆU

Để đạt hiệu năng cao nhất (vừa bám khung mượt 10–15 FPS vừa không tràn Database), AI Worker giao tiếp với Backend qua 2 kênh dữ liệu tách biệt:

### 4.1 Gói tin 1: Luồng tọa độ bám đuổi (Mỗi 100ms)
* **Đặc điểm:** Không lưu vào Database. Chỉ đẩy qua WebSocket thẳng lên trình duyệt đang xem camera đó để vẽ thẻ `<canvas>`.
* **Topic WebSocket:** `/topic/camera/{cameraId}/tracking`
* **Cấu trúc JSON:**
```json
{
  "cameraId": 12,
  "frameWidth": 1280,
  "frameHeight": 720,
  "timestamp": 1761013381450,
  "objects": [
    {
      "trackId": 104,
      "module": "ALPR",
      "type": "VEHICLE_PLATE",
      "bbox": [420, 310, 140, 45],
      "label": "30F-999.99",
      "color": "#00FF00"
    },
    {
      "trackId": 105,
      "module": "FACE_ID",
      "type": "KNOWN_PERSON",
      "bbox": [610, 150, 85, 95],
      "label": "Phan Đức Tuấn (98%)",
      "color": "#00BFFF"
    }
  ]
}
```

### 4.2 Gói tin 2: Sự kiện Chốt & Chụp đối tượng (Chỉ gửi 1 lần khi đối tượng nét nhất)
* **Đặc điểm:** Khi `trackId: 104` đạt độ tin cậy tối ưu, AI Worker cắt ảnh biển số + ảnh toàn cảnh, đẩy lên lưu trữ (MinIO/Local) rồi gọi `POST /api/ai/events` để lưu vĩnh viễn vào Database và đẩy vào khay lịch sử sự kiện.
* **Cấu trúc JSON:**
```json
{
  "eventId": "EVT_20261021_093012_104",
  "cameraId": 12,
  "cameraName": "Cam Cổng Chính - Nhà Máy A",
  "trackId": 104,
  "moduleType": "ALPR",
  "severity": "INFO",
  "timestamp": "2026-10-21T09:30:12.100Z",
  "fullImageUrl": "https://storage.domain.com/full/cam12_104.jpg",
  "cropImageUrl": "https://storage.domain.com/crop/cam12_plate_104.jpg",
  "metadata": {
    "plateNumber": "30F-999.99",
    "vehicleType": "CAR",
    "confidence": 0.96,
    "direction": "IN"
  }
}
```
*(Nếu là module `FACE_ID`, trường `cropImageUrl` sẽ là ảnh cắt khuôn mặt, và `metadata` sẽ chứa `{"employeeId": "NV01", "fullName": "Phan Đức Tuấn", "matchScore": 0.98}').*

---

## 5. KỊCH BẢN HOẠT ĐỘNG CHI TIẾT TỪ A ĐẾN Z

```
[ Quản trị viên ]  ──(Gán Module trên Web)──>  [ Backend DB: camera_ai_configs ]
                                                              │
                                                              ▼ (AI Worker lấy cấu hình)
[ Xe chạy vào cổng ]
      │
      ├──> [ 1. ByteTrack cấp mã track_id = 104 ]
      │
      ├──> [ 2. Mỗi 100ms: Bắn JSON tọa độ -> Web Canvas vẽ khung xanh bám theo xe ]
      │
      ├──> [ 3. Khung hình nét nhất (96%): AI chốt nhận diện 30F-999.99 ]
      │
      └──> [ 4. Cắt ảnh Crop + Chụp Full -> POST /api/ai/events -> Khay thẻ bên phải nhảy ảnh xe ]
```

### Bước 1: Cấu hình gán Module cho Camera trên Web
1. Quản trị viên vào danh sách thiết bị, chọn Camera Cổng Bảo Vệ (`ID: 12`).
2. Tích chọn các module: `[x] Nhận diện Biển Số (ALPR)` và `[x] Nhận diện Khuôn Mặt (FaceID)`.
3. Vẽ vùng nhận diện (ROI Polygon) trực tiếp trên khung hình camera (chỉ nhận biển số trong làn đường quy định để tiết kiệm GPU).
4. Bấm **Lưu cấu hình AI** $\rightarrow$ AI Worker tự động nạp nhiệm vụ cho Camera số 12.

### Bước 2: Xử lý thông minh ở tầng AI Worker (Chống chụp trùng lặp)
1. Xe tiến vào vùng ROI $\rightarrow$ YOLOX phát hiện xe và biển số $\rightarrow$ ByteTrack gán mã `trackId = 104`.
2. Trong 2 giây xe di chuyển qua cổng (khoảng 20 khung hình):
   * Ở mỗi khung hình, AI đẩy tọa độ `bbox` qua WebSocket $\rightarrow$ Người xem trên Web thấy khung xanh bám trượt mượt mà theo biển số xe.
   * Đồng thời, AI chấm điểm độ nét của biển số. Ở khung hình thứ 12, biển số đạt độ tin cậy cao nhất (96% - đọc rõ `30F-999.99`).
   * Ngay lập tức, AI cắt ảnh biển số (`cropImageUrl`), chụp ảnh toàn cảnh (`fullImageUrl`) và gửi **1 gói sự kiện duy nhất** về `POST /api/ai/events`, sau đó đánh dấu `trackId = 104` là *"Đã chụp"* (không bao giờ chụp lại ở các khung hình sau nữa).

### Bước 3: Hiển thị trực quan trên giao diện Web (React)
Khi người vận hành mở xem Camera Cổng Bảo Vệ, màn hình chia làm 2 phần:
* **Bên trái (70% diện tích - Khung Video Live):**
  * Lớp dưới: `<video>` phát luồng WebRTC từ MediaMTX.
  * Lớp trên: `<canvas>` nhận tọa độ từ `/topic/camera/12/tracking`, vẽ khung vuông bám theo biển số và khuôn mặt tài xế kèm chữ nổi ngay trên đầu đối tượng.
* **Bên phải (30% diện tích - Luồng Ảnh Chụp Thực Tế):**
  * Tự động chia thành các thẻ (Card) nhảy mới liên tục từ trên xuống thông qua WebSocket:
    * **Thẻ Biển Số:** Hiện ảnh cắt cận cảnh biển số `30F-999.99` + giờ vào `09:30:12`. Bấm vào thẻ sẽ phóng to ảnh toàn cảnh.
    * **Thẻ FaceID:** Hiện ảnh chụp mặt tài xế vừa đi qua + Tên nhân viên/Khách.

---

## 6. GIẢI PHÁP VẬN HÀNH HÀNG TRĂM CAMERA KHÔNG BỊ TREO WEB

Khi số lượng camera lên tới 100 – 500 chiếc, hệ thống áp dụng 3 quy tắc sau:

1. **Chế độ Grid thông minh (Smart Viewport Streaming):**
   * Danh sách bên trái hiển thị cây thư mục 500 camera (nhóm theo Chi nhánh $\rightarrow$ Khu vực).
   * Lưới Video (Live Grid) chỉ cho phép chọn bố cục xem 1x1, 2x2 (4 cam), 3x3 (9 cam), hoặc 4x4 (16 cam) trên 1 trang.
   * Khi người dùng chuyển sang Trang 2 (Cam 17 đến 32), React **tự động ngắt kết nối WebRTC và hủy đăng ký (Unsubscribe) WebSocket tọa độ** của Cam 1–16 $\rightarrow$ Trình duyệt không bao giờ bị tràn RAM hay crash tab.
2. **Xem sự kiện toàn hệ thống không cần mở Video:**
   * Ngay cả khi không ai mở xem video của Camera số 99, AI Worker ở dưới vẫn âm thầm đọc luồng RTSP, bắt biển số/FaceID và gửi ảnh chụp về Server.
   * Trên Web có tab **"Trung Tâm Sự Kiện Trực Tuyến"**: Hiển thị ảnh chụp biển số, khuôn mặt đổ về liên tục từ cả 100 camera trên một màn hình duy nhất (vì chỉ tải ảnh tĩnh 30KB nên siêu nhẹ).
3. **Database phân vùng theo thời gian (TimescaleDB / Partitioning):**
   * 100 camera chạy liên tục một ngày có thể sinh ra hàng trăm nghìn lượt xe/người.
   * Bảng `ai_events` trong PostgreSQL được chia Partition theo từng tuần/tháng để khi tìm kiếm lại biển số luôn đạt tốc độ **dưới 0.1 giây**.

---

## 7. LỘ TRÌNH TRIỂN KHAI THỰC TẾ

```
[ Giai đoạn 1 ] ──> [ Giai đoạn 2 ] ──> [ Giai đoạn 3 ] ──> [ Giai đoạn 4 ]
 Canvas Overlay       Sidebar Thẻ Ảnh      Đa Module An Toàn    Quản Lý Đa Điểm
 WebRTC + WebSocket   Crop Biển Số/Mặt     Cháy, Ngã, Mũ B/H    Multi-Site 500 Cam
```

* **Giai đoạn 1 (Đang hoàn thiện):** Tách lớp `<video>` WebRTC và thẻ `<canvas>` trong suốt vẽ khung bám tọa độ qua WebSocket.
* **Giai đoạn 2:** Cột bên phải (Sidebar 30%) hiển thị danh sách thẻ ảnh chụp (Crop biển số, Crop mặt) nhảy theo thời gian thực.
* **Giai đoạn 3:** Mở rộng các module an toàn (Cháy khói, Mũ bảo hộ, Ngã/Đột quỵ) với cơ chế còi hú và cảnh báo Telegram/Zalo.
* **Giai đoạn 4:** Phân trang thông minh cho lưới hàng trăm camera (Smart Viewport Grid) và phân vùng bảng CSDL `ai_events`.

---
*Tài liệu kiến trúc V2.0 được lưu trữ trực tiếp tại: `d:/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/KICH_BAN_KIEN_TRUC_GIAM_SAT_AI.md`*
