# MODULE AI NHẬN DIỆN BIỂN SỐ XE & KIỂM SOÁT THÔNG MINH (ALPR & SMART AI SERVICE)
> **Kiến trúc hoàn chỉnh**: SdkInfer ONNX Pipeline (plate_det + plate_line + plate_rec CTC) + Video Multi-Camera Auto Bridge + Universal Event Hub. 100% thuần ONNX Runtime (VietOCR đã bị loại bỏ).

---

## 📂 1. Cấu Trúc Thư Mục Đóng Gói Đồng Bộ

```text
ai_service/
├── Dockerfile                  # Đóng gói Docker Container (Hỗ trợ cả CPU mặc định & NVIDIA GPU)
├── requirements.txt            # Thư viện phụ thuộc cho CPU (onnxruntime, thuần ONNX)
├── requirements-gpu.txt        # Thư viện phụ thuộc cho GPU (onnxruntime-gpu, thuần ONNX)
├── main.py                     # Điểm khởi chạy chính (Entrypoint)
│
├── core/                       # Module Xử lý Video Thời gian thực & Cầu nối Web
│   ├── camera_stream_bridge.py # Tự động kết nối camera Spring Boot, mở SSE và REST API
│   ├── video_alpr_processor.py # Virtual ROI, Multi-lane, Tripwire, Tracking, Cooldown, Outdoor Mode
│   ├── onnx_lpr_engine.py      # SdkInfer Thuần ONNX (PP-OCR CTC + Line Detector, ~15-25ms)
│   └── plate_detector_deskew.py# ONNX Plate Detector + Deskew nắn thẳng góc nghiêng
│
├── training/                   # Module Huấn Luyện (Training Pipeline)
│   ├── train_yolox_detector.py # Huấn luyện YOLOX phát hiện vị trí biển số từ ảnh chụp xe
│   └── train_vietocr_text.py   # (Legacy) Tool tách dòng chữ biển - dùng helper image_utils
│
├── utils/                      # Thư viện Tiện ích
│   ├── image_utils.py          # Tiền xử lý ảnh (CLAHE, cân bằng sáng, unsharp mask, tách dòng 2-line)
│   ├── plate_validator.py      # Kiểm định 100% quy chuẩn biển số Việt Nam (85-B2, 29A,...)
│   └── plate_grammar.py        # Bảng chống nhầm lẫn quang học ký tự (3/8, 0/8, B/8,...)
│
├── models/                     # Trọng số AI đã huấn luyện sẵn (Thuần ONNX Công Nghiệp)
│   ├── plate_det.onnx          # Phát hiện vị trí biển số xe (19.1 MB)
│   ├── plate_line.onnx         # Tách dòng chữ biển 1 dòng / 2 dòng (38.0 MB)
│   ├── plate_rec.onnx          # Nhận diện chữ PP-OCRv6 CTC (76.5 MB)
│   ├── plate_rec.yml           # Bảng từ điển ký tự 18.000+ mục (169 KB)
│   └── object_det.onnx         # Phát hiện xe / vật thể (38.2 MB)
│
└── yolox/                      # Source package YOLOX Engine
```

---

## ⚡ 2. Cấu Hình Phần Cứng (CPU Mặc Định vs NVIDIA GPU)

Hệ thống được thiết kế theo cơ chế **Fallback an toàn**: Nếu không có card NVIDIA, hệ thống tự động chạy 100% bằng CPU mà không bị crash.

### A. Chế độ CPU (Mặc định - Nhẹ ~700MB, không cần card rời):
Không cần thay đổi gì. Khi build, Dockerfile sẽ cài bản PyTorch CPU và `requirements.txt`:
```bash
docker compose up -d --build ai-service
```
* Có thể điều chỉnh số luồng CPU bằng biến môi trường `AI_CPU_THREADS` (mặc định là `2` để tránh chiếm 100% CPU máy tính).

### B. Chế độ NVIDIA GPU (CUDA Acceleration):
Khi máy chủ có card đồ họa NVIDIA (GeForce, RTX, Tesla, Quadro...) và đã cài `NVIDIA Container Toolkit`:
1. Mở file `CAMERA_WEB_STREAM/docker-compose.yml`:
   - Đổi `USE_GPU: 1` trong phần `args`.
   - Bỏ comment khối `deploy`:
     ```yaml
     deploy:
       resources:
         reservations:
           devices:
             - driver: nvidia
               count: 1
               capabilities: [gpu]
     ```
2. Build lại container:
   ```bash
   docker compose up -d --build ai-service
   ```
3. Khi khởi động, AI sẽ in log xác nhận thiết bị hoạt động:
   ```text
   ✅ Nạp mô hình thành công! Sẵn sàng xử lý các luồng RTSP camera.
      👉 YOLOX Plate Detector Provider: CUDAExecutionProvider
      👉 VietOCR Device:               cuda:0
   ```

---

## 🛣️ 3. Chế Độ Đa Làn Độc Lập (Multi-Lane Mode)

Cấu hình nhiều làn đón xe độc lập (ví dụ Làn Ô tô, Làn Xe máy) trên cùng một khung hình camera.

### Cấu trúc trong `config/roi_config.json`:
```json
{
  "default": [[0.15, 0.45], [0.85, 0.45], [0.95, 0.95], [0.05, 0.95]],
  "cameras": {
    "1": [[0.15, 0.45], [0.85, 0.45], [0.95, 0.95], [0.05, 0.95]]
  },
  "lanes": {
    "1": [
      {
        "id": "lane-1",
        "name": "Làn 1 (Ô tô)",
        "roi": [[0.05, 0.40], [0.48, 0.40], [0.48, 0.95], [0.05, 0.95]]
      },
      {
        "id": "lane-2",
        "name": "Làn 2 (Xe máy)",
        "roi": [[0.52, 0.40], [0.95, 0.40], [0.95, 0.95], [0.52, 0.95]]
      }
    ]
  }
}
```
* **Cơ chế Cooldown riêng theo làn:** Xe đi làn 1 sẽ không bị ảnh hưởng bởi thời gian khóa cooldown của làn 2.
* **Webhook gửi kèm `laneId`:** Khi có sự kiện xe, backend Spring Boot sẽ nhận được chính xác xe đang ở làn nào.

---

## 🏎️ 4. Chế Độ Đường Ngoài Trời Tốc Độ Cao (Outdoor Mode: 30–60 km/h)

Dành cho các camera lắp ngoài đường phố, cổng mở không dừng hoặc trạm kiểm soát xe chạy tốc độ 30–60 km/h.

### Kích hoạt:
Thêm biến môi trường vào container (trong `docker-compose.yml` hoặc file `.env`):
```yaml
environment:
  - AI_OUTDOOR_MODE=1
```

### Đặc tính khi bật Outdoor Mode:
1. **Tần suất suy luận cao:** `inference_interval` giảm xuống **0.05s** (~20 FPS), `frame_skip = 1` (quét liên tục mọi frame).
2. **Nâng giới hạn bám mục tiêu:** Theo dõi đồng thời tối đa **12 xe** (thay vì 6).
3. **Rút ngắn Cooldown:** Giảm thời gian khóa biển trùng lặp xuống **5.0s** (thay vì 15s).
4. **Kích hoạt ngay khi chạm Tripwire:** Khi xe vừa cắt vạch ảo và đã nhận diện được biển số hợp lệ, hệ thống chốt gửi Webhook ngay mà không cần chờ tích lũy nhiều vòng vote.
5. **Cơ chế Best-Shot:** Dù xe lướt qua nhanh, ảnh gửi về hệ thống luôn là khung hình lúc biển số nét nhất và to nhất.
> ⚠️ **Khuyến nghị**: Chế độ này xử lý 20 FPS nên tiêu thụ tài nguyên lớn, khuyến khích chạy kèm card đồ họa GPU NVIDIA.

---

## 🔌 5. Chuẩn Kết Nối Cho Bên Thứ 3 (API Contract Đẩy Module AI Vào)

Hệ thống Spring Boot tích hợp sẵn **Universal Event Hub**, sẵn sàng tiếp nhận dữ liệu từ các module AI khác đẩy về:

### A. Module Phương Tiện (Ô tô & Xe máy):
* **Method:** `POST`
* **URL:** `http://<SERVER_IP>:8080/api/cameras/{cameraId}/detections`
* **Body JSON:**
```json
{
  "plateNumber": "29H1-888.88",
  "confidence": 0.94,
  "vehicleType": "MOTO",           // "CAR" (Ô tô) hoặc "MOTO" (Xe máy)
  "laneId": "lane-1",              // Tùy chọn (Làn 1, Làn 2...)
  "plateCropBase64": "data:image/jpeg;base64,...", // Ảnh crop cận cảnh biển số
  "fullImageBase64": "data:image/jpeg;base64,...", // Ảnh toàn cảnh
  "detectedAt": "2026-10-22T08:40:00+07:00"
}
```

### B. Module Kiểm Soát Người & Khuôn Mặt (FaceID / Đếm Người):
* **Method:** `POST`
* **URL:** `http://<SERVER_IP>:8080/api/v1/events/webhook` (hoặc `/api/v1/events/async` cho hiệu năng cao)
* **Body JSON:**
```json
{
  "eventType": "FACE_RECOGNITION", // "FACE_RECOGNITION" hoặc "PERSON_COUNT"
  "moduleSource": "FACE_AI_ENGINE",
  "cameraId": 1,
  "cameraName": "Camera Cổng Nhân Sự",
  "confidence": 0.92,
  "severity": "INFO",             // "INFO" hoặc "WARNING" (nếu là người lạ)
  "payload": {
    "personName": "Nguyễn Văn A",
    "personId": "NV-0089",
    "department": "Ban Quản Lý",
    "accessStatus": "ALLOWED",     // "ALLOWED" (Hợp lệ) hoặc "STRANGER" (Người lạ)
    "faceCropBase64": "data:image/jpeg;base64,...",
    "fullImageBase64": "data:image/jpeg;base64,..."
  }
}
```
* Dữ liệu gửi về sẽ **tự động lưu Database PostgreSQL** và **phát sóng thời gian thực qua WebSocket** hiển thị trực tiếp lên giao diện Web React mà không cần tải lại trang.

---

## 💻 6. Chạy Trực Tiếp Bằng Python (Development / Debug)

Từ thư mục `CAMERA_WEB_STREAM/ai_service`:
```bash
# Tự động kết nối toàn bộ camera từ Spring Boot (Bulk Mode):
py main.py

# Chạy với Webcam máy tính:
py main.py --source 0

# Chạy với camera IP RTSP:
py main.py --source rtsp://admin:pass@192.168.1.61:554/stream
```
