# Operator Interface

Giao diện vận hành của hệ thống giám sát AI. Sở hữu các khái niệm chỉ tồn tại trong góc nhìn người dùng — cách bố trí màn hình, cách lọc, cách xem. Mọi quyết định nghiệp vụ (Detector, Rule, Policy, Alert) thuộc về [Camera & AI Engine](../CameraStream/GLOSSARY.md).

## Language

### Bố cục xem

**Video Wall**:
Màn hình xem nhiều Camera cùng lúc, dùng cho giám sát trực tiếp.
_Avoid_: Tường video, màn hình tổng, dashboard

**Tile**:
Một ô video đơn lẻ trong Video Wall, hiển thị một Camera.
_Avoid_: Ô, khung hình, cửa sổ

**Grid Layout**:
Bố cục chia Tile thành hàng và cột — 1×1, 2×2, 3×3, 4×4.
_Avoid_: Bố cục, layout

**Viewport**:
Tập Camera đang được hiển thị đồng thời trên một trang, giới hạn bởi Grid Layout. Camera ngoài Viewport không mở kết nối video.
_Avoid_: Trang, màn hình

**Focus Mode**:
Trạng thái phóng to một Camera duy nhất, tự chuyển sang luồng chất lượng đầy đủ.
_Avoid_: Phóng to, fullscreen, xem chi tiết

**Spotlight**:
Camera được đưa lên đầu tiên trong Viewport, dùng để theo dõi một đối tượng đáng chú ý giữa nhiều camera.
_Avoid_: Đẩy lên, ưu tiên, ghim

**Overlay**:
Lớp trong suốt vẽ đè lên video — khung bám đối tượng, nhãn, vùng ROI, hàng rào.
_Avoid_: Lớp phủ, canvas, khung bám

**Track Label**:
Nhãn chữ đi kèm Overlay, hiển thị định danh của Track — biển số, họ tên nhân sự, hoặc cảnh báo.
_Avoid_: Nhãn, tooltip

**Event Feed**:
Danh sách sự kiện chạy liên tục bên cạnh Video Wall, hiển thị Capture mới nhất từ mọi camera.
_Avoid_: Thông báo, danh sách sự kiện, feed

**Snapshot Preview**:
Ảnh crop của đối tượng trong Event Feed, cho phép xem lớn bằng một cú nhấp.
Nguồn ảnh là **URL từ backend** (ảnh lưu ra file), không phải chuỗi base64.
_Avoid_: Ảnh xem trước, thumbnail, ảnh nhỏ

### Lọc và tra cứu

**History Filter Bar**:
Thanh điều khiển lọc lịch sử: khoảng ngày giờ, từ khóa, phân loại đối tượng, kèm các nút hành động.
_Avoid_: Thanh lọc, thanh tìm kiếm, filter bar

**Time Range**:
Khoảng thời gian bắt đầu và kết thúc, dùng để giới hạn truy vấn lịch sử.
_Avoid_: Khoảng ngày, date range

**Category Filter**:
Bộ lọc theo phân loại đối tượng — loại phương tiện, hoặc nhóm sự kiện.
_Avoid_: Bộ lọc loại, filter

**Search Query**:
Từ khóa tìm kiếm tự do trong lịch sử — biển số, họ tên, tên camera.
_Avoid_: Từ khóa, keyword

**Result Count**:
Số bản ghi khớp bộ lọc hiện tại, hiển thị cạnh thanh lọc.
_Avoid_: Tổng số, count

**View Mode**:
Cách trình bày danh sách — dạng lưới thẻ hoặc dạng bảng.
_Avoid_: Chế độ hiển thị, kiểu hiển thị

### Xuất dữ liệu

**Excel Export**:
Hành động tải danh sách đang lọc ra dưới dạng file bảng tính, theo bộ lọc đang áp dụng.
_Avoid_: Xuất file, download, xuất CSV

**Report**:
Một lần xuất dữ liệu kèm tiêu đề, khoảng thời gian và tổng số bản ghi.
_Avoid_: Báo cáo tổng hợp, file export

**Export Range Limit**:
Khoảng thời gian tối đa cho phép trong một lần xuất, để tránh xuất quá lớn gây timeout.
_Avoid_: Giới hạn ngày, max range

**Chunk Concatenator**:
Bộ xử lý ghép nối tuần tự các phần dữ liệu CSV dạng Blob nhẹ nhàng ngay trên RAM trình duyệt, cho phép gom hàng trăm nghìn dòng dữ liệu mà không làm tràn bộ nhớ Javascript V8.
_Avoid_: Monolithic memory buffer, array concat

**UTF-8 BOM Prefix**:
Chuỗi byte đặc biệt (`\uFEFF`) đặt ở đầu file CSV xuất ra, giúp Microsoft Excel tự động nhận diện bảng mã tiếng Việt Unicode chính xác 100% khi mở file mà không bị lỗi ký tự.
_Avoid_: Raw text export, unencoded CSV
