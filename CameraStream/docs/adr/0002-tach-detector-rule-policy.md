# Tách ba tầng Detector / Rule / Policy cho danh mục AI

Danh mục AI cần mở rộng từ 5 mã `CameraAiType` hiện tại lên 25+ tính năng (nhận diện khuôn mặt, biển số, đếm người/xe, hàng rào ảo, xâm nhập khu vực cấm, đứng lâu/tụ tập, phát hiện cháy/khói, phát hiện ngã, không đội mũ bảo hộ, giám sát ban đêm, ghi video theo sự kiện...). Vì vậy tách thành ba tầng: **Detector** (khả năng nhận biết — mặt, biển số, khói, mũ, ngã), **Rule** (điều kiện kết luận — vượt hàng rào, đứng lâu quá ngưỡng, tụ tập quá ngưỡng), **Policy** (quyết định vận hành — có chụp ảnh không, có ghi video không, gửi kênh nào, bật còi đèn, FPS, ngưỡng tin cậy).

Lý do tách: phần lớn các tính năng mới là *rule* mới trên *detector* đã có, không phải *detector* mới. Với enum phẳng, mỗi tính năng mới sẽ trở thành một mã riêng không tái sử dụng được — ví dụ "phát hiện ngã" và "phát hiện đứng lâu" đều cần detector người, nhưng là hai rule khác nhau. Với cách tách ba tầng, thêm "đứng lâu" chỉ là thêm một Rule dùng lại detector người sẵn có, không phải sửa schema.

Hệ quả: `CameraAiType` hiện tại chỉ nên giữ lại phần vai trò *Detector*; cấu hình `camera_ai_configs` hiện đang gộp detector + policy (fps, ngưỡng, ROI) sẽ cần tách theo ranh giới này.
