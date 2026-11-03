# Camera & AI Engine

Tầng trung tâm của hệ thống giám sát AI: sở hữu danh tính camera, vòng đời quan sát AI, và bản ghi sự kiện. Đây là nơi quyết định "điều gì đang xảy ra" — giao diện vận hành chỉ trình bày lại những quyết định đó.

## Language

### Thiết bị quan sát

**Camera**:
Một thiết bị thu hình đặt tại một vị trí vật lý, có thể chạy nhiều Detector cùng lúc.
_Avoid_: Thiết bị, camera IP, thiết bị giám sát

**Stream**:
Luồng hình ảnh trực tiếp của một Camera, phát tới người xem.
_Avoid_: Luồng video, kênh, feed

**Sub-stream**:
Luồng chất lượng thấp của một Camera, **do chính camera tự xuất** (encoder phía thiết bị), dùng để AI suy luận. Tách khỏi Stream chính để AI không tiêu tốn băng thông phát hình.
_Avoid_: Luồng phụ, luồng nhẹ, Transcoded Source

**Media Source**:
Tầng trung tâm (MediaMTX) nhận luồng RTSP từ Camera và phát lại dưới dạng WebRTC cho người xem. Mọi viewer chỉ đọc từ Media Source, không đọc thẳng camera.
_Avoid_: Media server, relay, server media

**Transcoded Source**:
Luồng đã được **server tự mã hóa lại** (ffmpeg, phía hệ thống) trước khi Media Source nhận — dùng để hạ bitrate/băng thông nguồn khi không chỉnh được encoder camera. Khác Sub-stream ở chỗ: Sub-stream sinh ra tại camera, Transcoded Source sinh ra tại server.
_Avoid_: Sub-stream, transcode client-side

**Health Probe**:
Việc kiểm tra định kỳ xem một Camera có online không, dựa trên Media Source stream-ready rồi TCP probe (RTSP/ONVIF). Kết quả của Health Probe là trạng thái ONLINE/OFFLINE đáng tin.
_Avoid_: Ping, ICMP, kiểm tra mạng

**Offline Placeholder**:
Trạng thái hiển thị của một Camera đang rớt kết nối nhưng hệ thống đang tự nối lại — thể hiện trung thực thay vì giữ khung hình chết.
_Avoid_: Frame cũ, khung đen, ô đen

**Site**:
Một địa điểm vật lý gom nhiều Camera, dùng để gom nhóm và phân quyền xem.
_Avoid_: Chi nhánh, công ty, khu vực

### Vòng đời quan sát AI

**Detector**:
Khả năng nhận biết một loại đối tượng hoặc hiện tượng trong khung hình — nhận diện khuôn mặt, đọc biển số, phát hiện khói, phát hiện mũ bảo hộ. Detector trả lời "có gì ở đây", không trả lời "có đáng báo không".
_Avoid_: Module AI, AI module, model

**Observation**:
Một lần Detector nhận biết được đối tượng trong một khung hình cụ thể, kèm độ tin cậy và vị trí.
_Avoid_: Detection, kết quả AI

**Track**:
Chuỗi Observation của cùng một đối tượng vật lý đi qua các khung hình liên tiếp, được gắn bởi một định danh theo dõi. Tồn tại ngắn (vài giây), chỉ trong bộ nhớ.
_Avoid_: Đối tượng, mục tiêu, object

**Rule**:
Điều kiện kết luận từ Track hoặc chuỗi Track rằng một tình huống đáng chú ý — vượt hàng rào, đứng lâu quá ngưỡng, tụ tập vượt ngưỡng. Rule quyết định "đáng báo", không quyết định "làm gì".
_Avoid_: Cảnh báo, policy, cấu hình

**Policy**:
Quyết định vận hành khi một Rule được kích hoạt trên một Camera cụ thể: có chụp ảnh không, có ghi video không, gửi qua kênh nào, bật còi đèn không, chạy bao nhiêu FPS, ngưỡng tin cậy bao nhiêu.
_Avoid_: Cấu hình AI, thiết lập, quy tắc

**ROI**:
Vùng trong khung hình mà Detector được phép chạy. Tọa độ chuẩn hóa 0–1, gắn với từng Camera.
_Avoid_: Vùng quan tâm, vùng nhận diện, khung ảo

**Tripwire**:
Đường phẳng ảo trong khung hình; một Track vượt qua đường này thì kích hoạt Rule xâm nhập.
_Avoid_: Hàng rào, đường phanh, vạch

**Capture**:
Khoảnh khắc được chốt của một Track, tạo ra ảnh toàn cảnh và ảnh crop của đối tượng. Mỗi Track chỉ sinh Capture một lần.
_Avoid_: Chụp ảnh, snapshot, ảnh chụp

**Snapshot**:
Ảnh toàn cảnh của Camera tại một thời điểm. Được lưu thành **file** trên đĩa và
tham chiếu bằng **URL** — không mang nội dung base64 trong DB.
_Avoid_: Ảnh chụp, frame

**Clip**:
Đoạn video ngắn quanh một Capture, được trích từ luồng ghi.
_Avoid_: Video, đoạn hát

### Sự kiện và cảnh báo

**Event**:
Một sự kiện đã xảy ra, được ghi vĩnh viễn. Event là dữ kiện thuần túy, không yêu cầu ai hành động.
_Avoid_: Cảnh báo, thông báo, alert

**Alert**:
Một Event mà hệ thống đánh giá là cần người vận hành xử lý. Alert có thể bị tạt, bị gộp, hoặc bị bỏ qua theo Policy.
_Avoid_: Event, sự kiện, thông báo

**Notification**:
Một lần gửi một Alert ra khỏi hệ thống qua một kênh cụ thể — Telegram, Zalo, email, còi, đèn. Một Alert có thể sinh nhiều Notification, và một Notification có thể thất bại.
_Avoid_: Cảnh báo, alert, tin nhắn

**Severity**:
Mức nghiêm trọng của một Event: thông tin, cảnh báo, nghiêm trọng.
_Avoid_: Mức cảnh báo, priority

**Acknowledgement**:
Hành động xác nhận một Alert đã được người vận hành xem và xử lý. Việc xác nhận không làm Alert biến mất khỏi lịch sử.
_Avoid_: Đóng, xóa, đánh dấu đã xem

**Deduplication Window**:
Khoảng thời gian mà các Event cùng loại trên cùng Camera được gộp thành một Alert, để một đối tượng đi qua camera trong nhiều khung hình không tạo ra nhiều cảnh báo.
_Avoid_: Debounce, chống trùng

### Danh tính

**Person**:
Một con người mà hệ thống có thể nhận diện — nhân sự đã đăng ký hoặc người lạ. Person là chủ thể của AI, không phải người dùng hệ thống.
_Avoid_: Người dùng, user, nhân viên

**Face Profile**:
Tập ảnh khuôn mặt tham chiếu của một Person, dùng để so khớp.
_Avoid_: Chân dung, ảnh đại diện, avatar

**Known Person**:
Person đã có Face Profile và được nhận diện thành công.
_Avoid_: Người quen, nhân viên, staff

**Stranger**:
Person không có Face Profile khớp, hoặc khớp dưới ngưỡng.
_Avoid_: Người lạ, khách, guest

**Plate**:
Chuỗi ký tự đọc được từ biển số xe, ví dụ `30F-999.99`.
_Avoid_: Biển số xe, license plate

**Vehicle Class**:
Phân loại phương tiện mà Detector nhận diện được — ô tô, xe máy, xe tải, người.
_Avoid_: Loại xe, phương tiện

### Vận hành

**Operator**:
Tài khoản người dùng hệ thống — vận hành viên, quản trị viên, người giám sát. Có quyền xem camera và xử lý Alert.
_Avoid_: Person, người dùng, user

**Role**:
Tập quyền của Operator: xem, xuất dữ liệu, cấu hình camera, quản lý người dùng, sao lưu hệ thống.
_Avoid_: Chức vụ, job title

**Audit Log**:
Bản ghi ai đã làm gì với hệ thống — đăng nhập, cấu hình, xuất dữ liệu, xác nhận Alert.
_Avoid_: Nhật ký, log, lịch sử

**Retention**:
Thời gian dữ liệu được giữ trước khi bị xóa hoặc chuyển sang lưu trữ lạnh.
_Avoid_: Bảo quản, thời hạn lưu

**Partition**:
Cách chia bảng sự kiện theo thời gian để truy vấn và xóa dữ liệu cũ không làm chậm toàn hệ thống.
_Avoid_: Sharding, phân vùng dữ liệu

**Backup**:
Bản sao lưu của cơ sở dữ liệu và cấu hình, dùng để khôi phục hệ thống sau sự cố.
_Avoid_: Sao lưu, dự phòng

**HttpOnly Cookie Session**:
Cơ chế bảo mật phiên làm việc của Operator bằng cách lưu trữ Access Token và Refresh Token trong cookie với cờ `HttpOnly` và `SameSite=Strict`, ngăn chặn hoàn toàn nguy cơ rò rỉ mã thông báo qua tấn công XSS.
_Avoid_: LocalStorage token, bearer storage

**Service API Key**:
Khóa bí mật dùng cho xác thực máy-với-máy (M2M) giữa container AI Service và Backend Spring Boot, truyền qua HTTP Header `X-Internal-Service-Key` mà không phụ thuộc vào chu kỳ phiên Cookie của người dùng.
_Avoid_: User token bypass, hardcoded bypass

**Chunked CSV Export**:
Kỹ thuật xuất dữ liệu báo cáo khối lượng lớn bằng cách phân đoạn truy vấn thành các khối nhỏ (keyset pagination), giải phóng bộ nhớ ngay sau khi serialize ra text CSV có tiền tố UTF-8 BOM, chống sập bộ nhớ JVM Heap.
_Avoid_: In-memory monolithic export, massive xlsx build
