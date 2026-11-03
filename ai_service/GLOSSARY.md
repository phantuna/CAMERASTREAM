# AI ALPR Pipeline

Kiến trúc nhận diện biển số xe (ALPR) thời gian thực chuẩn SdkInfer và điều phối đa luồng cho 50 camera đồng thời.

## Language

**Vehicle Object Detector (Tầng 1)**:
Mô hình phát hiện thân xe và người bằng `object_det.onnx` chuẩn SdkInfer (COCO: car, motorcycle, truck, bus, person).
_Avoid_: Car heuristic, vehicle box rule

**Plate Detector (Tầng 2)**:
Mô hình YOLOX định vị chính xác tọa độ hộp bao biển số xe trên toàn khung hình bằng `plate_det.onnx`.
_Avoid_: License plate localizer, sliding tile detector

**Plate Line Detector (Tầng 3)**:
Mô hình phân loại biển 1 dòng (biển dài ô tô) hay 2 dòng (biển vuông) bằng `plate_line.onnx`.
_Avoid_: Line splitter heuristic, aspect ratio rule

**Plate Character Recognizer (Tầng 4)**:
Bộ giải mã CTC nhận diện chuỗi ký tự biển số xe Việt Nam bằng `plate_rec.onnx` và từ điển `plate_rec.yml`.
_Avoid_: Tesseract, VietOCR PyTorch model

**Decoupled Camera Pipeline**:
Kiến trúc tách rời luồng đọc RTSP (`LatestFrameReader`) và luồng suy luận AI, triệt tiêu độ trễ trôi dạt (zero latency drift).
_Avoid_: In-thread sequential capture, blocking capture loop

**OCR Worker Pool**:
Nhóm worker thread xử lý thuần tính toán (deskew + enhance + CTC inference) bất đồng bộ, dùng chung một `OnnxLprEngine` duy nhất.
_Avoid_: Dedicated per-camera engine, multi-engine replication

**Fine Tier / Coarse Tier**:
Cơ chế phân loại ưu tiên nhận diện: Fine Tier (biển số gần $\ge 160\text{px}$ hoặc cắt tripwire) ưu tiên thread trước; Coarse Tier (biển xa) chờ frame sau.
_Avoid_: FIFO queue, random drop

**Tripwire**:
Đoạn vạch ảo tại cổng vào/ra dùng để kích hoạt sự kiện xe qua cổng ngay khi tâm biển số cắt qua vạch từ ngoài vào trong ROI.
_Avoid_: Cross line, barrier trigger line

**Event Spool**:
Hàng đợi đệm sự kiện xe tại local, tự động thử lại (retry) để bảo đảm không thất thoát sự kiện khi Backend Spring Boot tạm thời ngắt kết nối.
_Avoid_: Fire-and-forget webhook

**Vehicle Track**:
Track chính, mô phỏng chuyển động của XE (Tầng 1) bằng mô hình dự đoán (constant-velocity), tồn tại kể cả khi biển chưa đọc được. Danh tính track là (camera, track_id).
_Avoid_: Ad-hoc IoU association, track biển số duy nhất

**Shadow Track**:
Vehicle Track được sinh từ hộp biển số khi không có detection xe nào chứa biển (Tầng 1 tắt hoặc biển lộ trước xe). Cho phép hành vi hệ thống không thay đổi khi detector xe bất khả dụng.
_Avoid_: Track ghost, fallback track

**Two-Stage Gate (ByteTrack)**:
Cơ chế gán detection → track làm 2 giai đoạn: (1) detection điểm CAO gán cho mọi track; (2) detection điểm THẤP chỉ gán cho track đang MẤT (short-term lost) — cứu track bị che khuất mà không tạo ID mới.
_Avoid_: Single-threshold matching, greedy-only association

**Lost / Recovered Track**:
Track mất detection trong cửa sổ thời gian ngắn (lost_window) giữ ID và trạng thái; detection rơi vào vùng dự đoán (gate) thì phục hồi ID cũ (recovered) thay vì tạo track mới.
_Avoid_: Track respawn, ID switch

**Re-ID by Plate**:
Phục hồi danh tính track (cùng chiếc xe) dựa trên số biển đã đọc, dùng sổ cooldown có sẵn (key `lane:clean_plate`), không cần module embedding ReID riêng.
_Avoid_: Appearance ReID embedding, global vehicle database

**Shared ONNX Session**:
Một `InferenceSession` duy nhất dùng chung cho nhiều camera ở cùng một tầng, thay vì mỗi camera sinh một session riêng (nhân RAM/VRAM). OCR Pool đã áp dụng cho Tầng 3–4; quyết định này mở rộng cho Tầng 1/2.
_Avoid_: Per-camera engine, multi-engine replication

**Inference Tier**:
Mô-đun tính toán nhận diện chạy trong ai_service, tách biệt khỏi tầng media (Media Source). Có thể chạy trên CPU hoặc GPU (flag `AI_ONNX_GPU`), không ảnh hưởng trực tiếp đến độ trễ phát hình.
_Avoid_: AI tier, tầng nhận diện phía server

**Early Track**:
Track đối tượng được AI khởi tạo và theo vết từ xa ngoài ranh giới ROI để tích lũy độ tin cậy và giải mã OCR đón đầu xe phóng nhanh. Tồn tại ngầm trong lõi AI, không xuất hiện trên UI.
_Avoid_: Ghost box, unverified track

**UI Overlay Filter**:
Bộ lọc hình học tại ranh giới phát tán (broadcast), loại bỏ 100% các đối tượng chưa cắt vào vùng ROI hợp lệ trước khi gửi sang WebSocket/SSE cho tầng giao diện người dùng.
_Avoid_: Visual clutter, raw stream broadcast
