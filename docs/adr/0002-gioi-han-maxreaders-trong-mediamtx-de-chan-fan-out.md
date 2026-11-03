# Giới hạn `maxReaders` trong MediaMTX để chặn fan-out

Hệ thống 1 camera + N operator. MediaMTX trước đây để `maxReaders: 0` (không giới hạn) — mỗi operator mở 1 kết nối WHEP WebRTC nên băng thông và CPU MediaMTX **nhân theo số người xem**: 1 camera, 10 operator = băng thông ×10, reader ×10. Với nhiều operator, MediaMTX có thể CPU 100% (giải mã H.264 + re-mux cho từng reader) và sập.

Quyết định: đặt trần `maxReaders` theo mô hình vận hành thật (1–5 operator, 1 phòng điều khiển) thay vì để `0`. Khi vượt trần, reader mới bị **từ chối kèm message** (không sập server, không OOM). Phía giao diện chỉ **nối WHEP cho camera đang nằm trong viewport** (tile off-screen không mở kết nối), giảm reader đồng thời.

Đây là chọn "1 media source duy nhất, N reader subscribe chung" chứ **không nhân bản stream theo từng người xem** — đúng mục tiêu giảm băng thông của trục tối ưu.

Lý do không chọn: để `0` (tiếp tục vô hạn) — rẻ nhưng rủi ro sập MediaMTX khi số người xem tăng; hoặc mở thêm instance MediaMTX — quá cho 5 operator.

Hệ quả: phải đo lại tổng outbound sau bước này để xác nhận băng thông không còn tăng tuyến tính theo số người xem. Nếu sau này mở rộng nhiều phòng operator, xét lại trần `maxReaders` (có thể tăng từng bước hoặc cân nhắc scale-out).
