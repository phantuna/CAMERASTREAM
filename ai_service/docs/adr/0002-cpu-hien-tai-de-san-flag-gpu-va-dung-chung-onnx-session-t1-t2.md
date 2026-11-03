# Chạy inference trên CPU hiện tại, để sẵn flag GPU (NVIDIA) và dùng chung ONNX session cho Tầng 1/2

50 camera chạy 4 tầng ONNX song song. Vấn đề đo được: Tầng 3–4 (OCR) **đã** dùng chung 1 `OnnxLprEngine` qua OCR Worker Pool (đúng), nhưng Tầng 1 (object) và Tầng 2 (plate) **tạo 1 ONNX session mỗi camera** — 50 camera = 50 session riêng, phình RAM/VRAM và nhân bộ thread ONNX Runtime. Đồng thời detector Tầng 2 chạy batch=1 (không gom crops), nên trên GPU (nếu có) sẽ để GPU idle giữa các camera.

Quyết định:
- **Chạy trên CPU ngay** (máy hiện tại không có GPU), nhưng mọi cấu hình inference để **sẵn flag `AI_ONNX_GPU` (mặc định tắt)** + `docker-compose.gpu.yml` (NVIDIA device, `Dockerfile.gpu`). Khi có GPU, chỉ bật flag → ONNX Runtime chạy CUDA/TensorRT, tăng throughput Tầng 2 bằng **batch 4–8** (gom crops từ nhiều camera thành 1 tensor).
- **Dùng chung 1 ONNX session** cho Tầng 1/2 (mô phỏng cách OCR Pool đã làm cho Tầng 3–4), không nhân session theo camera → giảm RAM đáng kể.

Lý do không chọn: mua GPU ngay (chi phí, và hệ đang CPU là đủ ở 50 cam nếu đã chặn fan-out + transcode nguồn); hoặc để nguyên per-camera session (giữ RAM phình).

Hệ quả: `InferenceSession` Tầng 1/2 chuyển thành singleton share (cần xử lý input buffer không trùng nếu nhiều camera gọi song song — kiểm tra kỹ khi implement). Đây là quyết định khó đảo giữa CPU/GPU: khi gắn GPU thật, phải đổi `providers` của ONNX Runtime + rebuild image (`Dockerfile.gpu`), không chỉ flip 1 config.
