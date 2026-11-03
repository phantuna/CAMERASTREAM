# ROI và Tripwire thuộc về từng Camera

ROI và Tripwire được lưu **riêng cho từng Camera**, thay vì một cấu hình global áp cho mọi camera. ROI global chỉ còn là bộ preset để sao chép.

Lý do: tài liệu kiến trúc V2.0 (`KICH_BAN_KIEN_TRUC_GIAM_SAT_AI.md`) đặt mục tiêu vận hành 100–500 camera, và nêu rõ lý do tiết kiệm GPU là chỉ quét vùng quan tâm thay vì toàn khung hình. Với ROI global, mọi camera phải quét toàn khung hình — chi phí GPU tăng tuyến tính với số camera, đúng thứ cần tránh. Tài liệu cũng mô tả nghiệp vụ vẽ ROI trực tiếp trên khung hình của *camera cụ thể* ("chỉ nhận biển số trong làn đường quy định").

Điểm mâu thuẫn cần lưu ý: `RoiConfigModal.tsx` hiện lưu ROI/tripwire global qua endpoint `/api/roi-config` của AI service và thông báo *"Đã lưu và áp dụng khung ảo ROI chung cho TẤT CẢ Camera"*. Điều này trái với tài liệu kiến trúc và là nơi cần thay đổi khi triển khai quyết định này.

Hệ quả: cấu trúc lưu trữ chuyển từ ROI toàn cục sang `camera_ai_configs.roi_coordinates` theo từng camera; giao diện vẽ ROI phải nhận `cameraId` làm tham số bắt buộc.
