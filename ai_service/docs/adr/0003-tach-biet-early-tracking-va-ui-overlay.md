# ADR 0003 — Tách biệt Early Tracking nội bộ và UI Overlay Filtering

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-10-30
- **Quyết định**: AI Service duy trì theo vết từ xa (Early Tracking) ngoài vùng ROI để đón đầu xe tốc độ cao, nhưng tuyệt đối không phát tán (broadcast) tọa độ ra ngoài UI Canvas nếu đối tượng chưa tiến vào trong vùng ROI.

## Bối cảnh

Tại các làn xe cổng vào/ra, phương tiện thường di chuyển với tốc độ $30 - 50\text{ km/h}$. Nếu chỉ kích hoạt phát hiện khi xe đã lọt hẳn vào trong vùng ROI (vùng nét đứt), xe chỉ lưu lại trong khung hình 3–4 frame (tương đương 300–400ms), không đủ thời gian gom frame và bình bầu OCR trước khi đuôi xe khuất tầm.

Tuy nhiên, khi kích hoạt `AI_TRACK_OUTSIDE_ROI=1` để đón đầu từ xa, hệ thống trước đây đã gửi toàn bộ bounding box của các phương tiện ngoài ROI lên WebSocket/SSE. Hậu quả: các xe máy đỗ trên vỉa hè, xe ô tô lưu thông ở ngã tư xa xa ngoài tầm kiểm soát đều bị vẽ khung xanh/xanh dương đè lên nhau, gây rối mắt và làm xấu giao diện giám sát của vận hành viên.

## Quyết định

1. **Tách biệt 2 tầng xử lý**:
   - **Tầng suy luận & Theo vết (Internal Tracker)**: Giữ `AI_TRACK_OUTSIDE_ROI=1` trong lõi AI. Tracker liên tục bám vết các xe từ ngoài vùng ROI để xây dựng lịch sử chuyển động, tích lũy độ tin cậy và đọc thử biển số từ sớm.
   - **Tầng hiển thị (UI Overlay Broadcast Filter)**: Tại hàm `get_active_tracks_for_broadcast` và trên React Canvas, áp dụng bộ lọc hình học nghiêm ngặt: nếu camera có cấu hình đa giác ROI (`roi_pts.length >= 3`), **chỉ các track có `in_roi == True` mới được đưa vào danh sách phát tán**. Mọi xe còn ở ngoài ROI đều bị ẩn hoàn toàn khỏi màn hình.
2. **Kích hoạt sự kiện**: Sự kiện qua cổng và lưu lịch sử chỉ được chốt (committed) khi xe chính thức giao cắt với vùng ROI hoặc vạch Tripwire.

## Lý do không chọn

- **Không chọn Cắt cúp ROI cứng trước khi suy luận (Pre-crop Inference)**: Vì làm mất hoàn toàn khả năng phát hiện xe tốc độ cao từ xa; xe lao nhanh qua cổng sẽ bị lọt lưới (missed detection).
- **Không chọn Vẽ toàn bộ khung xe ra màn hình**: Vì làm ô nhiễm thị giác của kiểm soát viên và không phản ánh đúng ý nghĩa nghiệp vụ của vùng rào ảo ROI.

## Hệ quả

- **Độ chính xác cao cho xe phóng nhanh**: Xe chạm mép ROI là có kết quả nhận diện ngay lập tức (độ trễ 0ms vì biển số đã được giải mã từ các frame trước đó).
- **Giao diện sạch sẽ**: Người vận hành chỉ thấy khung bám trên những phương tiện thực sự đi vào làn kiểm soát.
- **Quy tắc cho Developer**: Khi bổ sung thêm module hiển thị (như FaceID hay Phân tích hành vi), bắt buộc phải tuân thủ việc lọc `inRoi` trước khi render SVG/Canvas.

