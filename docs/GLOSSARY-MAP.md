# Glossary Map

Hệ thống Giám sát AI Tập trung gồm hai codebase tách biệt, mỗi codebase sở hữu một context nghiệp vụ riêng. Các thuật ngữ dùng chung giữa hai context (Event, Alert, Person, Camera) được định nghĩa ở context sở hữu chúng và được tham chiếu từ context kia.

## Contexts

- [Camera & AI Engine](./CameraStream/GLOSSARY.md): Sở hữu Camera, cấu hình AI, vòng đời quan sát (Detector → Observation → Track → Rule → Policy), danh tính Person, và bản ghi Event/Alert.
- [AI ALPR Pipeline](./ai_service/GLOSSARY.md): Sở hữu luồng suy luận 4 tầng (Object, Plate, Line, CTC Rec), Worker Pool và mô hình đa luồng 50 camera.
- [Operator Interface](./CameraStream-FE/GLOSSARY.md): Sở hữu các khái niệm chỉ tồn tại trong giao diện vận hành — Video Wall, Tile, Viewport, Overlay, khối lọc lịch sử.

## Relationships

- **Camera & AI Engine → Operator Interface**: Engine phát **Event** qua WebSocket; giao diện nhận và đổi tên hiển thị thành **Event Feed** và **Tile**. Giao diện không tự quyết định ý nghĩa của Event — nó đọc `eventType`, `severity`, `payload` do Engine định nghĩa.
- **Camera & AI Engine ↔ Operator Interface**: **ROI** và **Tripwire** do giao diện vẽ (tọa độ chuẩn hóa 0–1), Engine áp dụng. Giao diện chỉ là công cụ vẽ; nguồn sự thật là cấu hình lưu trong Engine.
- **Camera & AI Engine → Operator Interface**: **Alert** do Engine sinh; giao diện chỉ hiển thị và cho phép **Acknowledgement**.

## Language Rules

- **Detector** là khả năng nhận biết ("nhìn thấy được"). **Rule** là điều kiện kết luận ("đáng chú ý"). **Policy** là quyết định vận hành ("làm gì với nó"). Ba tầng này không được gộp.
- **Event** là sự kiện đã xảy ra. **Alert** là sự kiện cần người xử lý. **Notification** là lần gửi Alert ra ngoài hệ thống. Ba tầng này không được gộp.
- **Person** là chủ thể AI nhận diện. **Operator** là tài khoản người dùng hệ thống. Hai khái niệm không trùng nhau dù cả hai đều là "con người".
- **Sub-stream** và **Transcoded Source** đều để hạ bitrate, nhưng khác hẳn nguồn sinh: **Sub-stream do camera tự xuất** (encoder phía thiết bị, có thể chỉnh được nếu tiếp cận camera); **Transcoded Source do server tự mã hóa lại** (ffmpeg phía hệ thống, dùng khi không chạm được camera). Gọi nhầm sẽ dẫn đến sửa sai chỗ (đi chỉnh camera thay vì chèn bước transcode phía server, hay ngược lại).
- **Media Source** (MediaMTX) là tầng phát hình duy nhất cho viewer; **Inference Tier** (ai_service) là tầng tính toán riêng. Giảm băng thông fan-out tác động ở Media Source (giới hạn số reader), không phải ở Inference Tier.
