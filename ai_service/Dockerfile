# =============================================================================
# DOCKERFILE CHO MODULE AI NHẬN DIỆN BIỂN SỐ XE (ALPR SERVICE)
# Kiến trúc: YOLOX-S (plate_det.onnx) + Deskew + ONNX LPR (SdkInfer) + Video
# Multi-Camera Bridge. 100% thuần ONNX Runtime — VietOCR (torch) đã bị loại bỏ.
# =============================================================================

FROM python:3.10-slim

WORKDIR /app

# Cài đặt các thư viện C/C++ cần thiết cho OpenCV và FFMPEG giải mã luồng RTSP
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Build argument: USE_GPU=0 (mặc định CPU) hoặc USE_GPU=1 (NVIDIA GPU CUDA)
ARG USE_GPU=0

# Sao chép các file dependencies
COPY requirements.txt requirements-gpu.txt ./

# Cài đặt dependencies thuần ONNX (không còn torch — image nhẹ hơn ~2GB so với bản cũ)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    if [ "$USE_GPU" = "1" ]; then \
        echo ">>> Đang build ở chế độ NVIDIA GPU (CUDA)..." && \
        pip install --no-cache-dir -r requirements-gpu.txt ; \
    else \
        echo ">>> Đang build ở chế độ CPU (Mặc định)..." && \
        pip install --no-cache-dir -r requirements.txt ; \
    fi

# Sao chép toàn bộ mã nguồn, cấu hình và trọng số AI vào container
COPY . /app

# Loại bỏ source code thô của module bảo mật, chỉ giữ lại binary native C-extension (.so/.pyd)
RUN rm -f /app/core/_frame_sync.py /app/core/_frame_sync.c /app/native_modules/_frame_sync.py /app/core/*.disabled /app/native_modules/*.disabled

# =============================================================================
# THIẾT BỊ + MULTI-OCR POOL (CPU/GPU tự động + đa luồng nhận diện)
# =============================================================================
# Máy yếu (CPU-only, ~16 core):   AI_OCR_MAX_TOTAL=4  AI_FRAME_SKIP=2  (mặc định)
# Máy khỏe (GPU NVIDIA / nhiều cam): AI_OCR_MAX_TOTAL=16 (GPU) hoặc 8 (CPU mạnh)
# Chỉ cần đổi ENV này khi nâng cấp máy — không đụng code.

# --- THIẾT BỊ: AUTO (mặc định). Có GPU NVIDIA (onnxruntime-gpu + CUDA) thì chạy GPU,
# --- không có thì CPU. Muốn ÉP thì set: AI_FORCE_CPU=1 / AI_USE_GPU=0
ENV PYTHONUNBUFFERED=1 \
    BACKEND_URL=http://host.docker.internal:8080 \
    MEDIAMTX_RTSP_URL=rtsp://mediamtx:8554 \
    WEB_PORT=5000 \
    OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;0|framedrop;1" \
    AI_OCR_MAX_TOTAL=4 \
    AI_OCR_WORKERS=4 \
    AI_NEAR_PX=80 \
    AI_OCR_PER_FRAME=3 \
    AI_MAX_TRACKS=12 \
    AI_OUTDOOR_MODE=1 \
    AI_FRAME_SKIP=1 \
    AI_FRAME_MAX_WIDTH=1280 \
    AI_MIN_PLATE_WIDTH=14 \
    AI_DETECTOR_CONF=0.20 \
    AI_CPU_THREADS=2 \
    AI_BENCH=0 \
    # TỐI ƯU TIER-1 (Fix 2, on-demand): object_det.onnx (~136ms) chỉ dùng PHÂN LOẠI xe,
    # không đọc biển. Bật -> bỏ qua khi mọi track đã gán loại, tiết kiệm ~45% stack detector,
    # CPU dồn cho plate_det + OCR pool. Mặc định TẮT trong code; ở đây BẬT sẵn để tối ưu 0.5s.
    # Cam có 2+ dòng xe chạy song song / muốn object detection liên tục -> đặt =0 để tắt.
    AI_TIER1_ON_DEMAND=1

# =============================================================================
# TRACKER ENGINE (A/B - Component 3/4)
# =============================================================================
# AI_TRACKER: legacy (mặc định, 100% hành vi cũ) | bytetrack (2-stage + Kalman CV,
#   chống ID-switch khi che khuất/lia camera). Đổi thành bytetrack khi đã A/B xác
#   nhận qua Stage 3 / bằng chứng video — không cần sửa code, không cần build lại
#   (code mount volume; chỉ cần restart container nếu muốn override tại compose).
# Ngưỡng tinh chỉnh (tuỳ chọn, override trong docker-compose.yml khi cần):
#   AI_TRACKER_HIGH_CONF=0.50  AI_TRACKER_LOW_CONF=0.15
#   AI_TRACKER_GATE_HIGH=0.20  AI_TRACKER_GATE_LOW=0.10
ENV AI_TRACKER=bytetrack

# =============================================================================
# HƯỚNG DẪN TUNING CỬA SỔ NHẬN DIỆN 0.5s (CPU, camera cổng)
# =============================================================================
# Buộc tội theo ngân sách CPU (đo thật, xem benchmark_results_50_cameras.md):
#   detector ~300ms/detector-frame (t1+t2) + OCR pool 4 thread = CPU đã bão hòa.
# Bộ 3 đòn bẩy, tất cả override trong docker-compose.yml (KHÔNG cần build lại):
#   1) - AI_FRAME_SKIP=5      -> giảm detector 3.3fps thật xuống ~2.2, CPU rảnh ra
#      cho OCR pool. Kèm AI_TRACKER=bytetrack: Kalman CV nội suy bbox mượt 30fps
#      cho các frame bỏ qua -> overlay UI không giật. (Cam giám sát tổng quan,
#      xe ở xa -> 5; cam gần cổng <=8m -> giữ 2-3 vì xe đi nhanh hơn.)
#   2) - AI_TIER1_ON_DEMAND=1 (đã bật trong ENV) -> bỏ qua object_det ~136ms khi
#      mọi track đã gán loại xe. Kết hợp Frame Skip 5: detector-frame thật chỉ
#      còn plate_det 132ms + (chớp nhoáng) Tier-1.
#   3) - Vạch TRIPWIRE: thêm vào ai_service/config/roi_config.json khối
#      "tripwires": { "<camera_id>": [[x1,y1],[x2,y2]] } (tọa độ CHUẨN HÓA 0-1,
#      vẽ đúng vạch cổng vào/ra). Tác dụng kép: (a) gate confirm rớt xuống 1 VOTE
#      (OCR 65% là đủ, thay vì 2 votes) -> chốt sự kiện nhanh hơn ~50%; (b) chỉ
#      xe ĐÃ CẮT VẠCH mới được ưu tiên OCR + nhận biển to nhất (ngang vạch,
#      pixel nhiều nhất). Không có tripwire -> hệ thống phải đợi 2 votes.
# Kết quả dự kiến (CPU 16-core, 1-3 cam): xe vào ROI -> bám biển <0.5s,
# nhận biển tại vạch tripwire trong 1-2 lần OCR (0.3-0.7s), không sót xe ở tốc độ
# thường. Nhiều cam đồng thời / xe dồn: nâng AI_OCR_MAX_TOTAL=8 (CPU) hoặc GPU.


# Expose cổng Web Stream Metadata & REST API
EXPOSE 5000

# Khởi chạy AI Engine tự động bám biển toàn bộ camera
CMD ["python", "main.py"]
