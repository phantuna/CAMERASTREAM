# ADR 0009 — Xuất Báo cáo Dữ liệu lớn bằng Phân đoạn CSV (Chunked CSV) và Ghép nối Client

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-10-30
- **Quyết định**: Xử lý bài toán xuất dữ liệu lịch sử cực lớn (từ 50,000 đến 500,000 dòng) bằng kiến trúc **Phân đoạn CSV tuần tự (Chunked CSV)** phía Backend kết hợp **Ghép nối Blob luồng nhẹ phía Client** với tiền tố UTF-8 BOM.

## Bối cảnh

Hệ thống giám sát 50 camera sản sinh hàng trăm nghìn lượt phương tiện mỗi tháng. Khi người dùng chọn khoảng thời gian rộng (theo quý hoặc theo năm) để xuất báo cáo:
1. **Rào cản định dạng `.xlsx`**: File Excel thực chất là file nén ZIP chứa cây XML phức tạp. Việc gom 500,000 dòng vào một workbook Excel duy nhất phía Server dễ làm tràn bộ nhớ JVM Heap (OutOfMemory), còn nếu chuyển toàn bộ JSON về cho trình duyệt tự tạo file Excel thì tab Chrome sẽ lập tức bị sập (vượt ngưỡng 1.4GB RAM của V8 engine).
2. **Nghẽn kết nối Database**: Câu lệnh `SELECT` nửa triệu bản ghi cùng lúc sẽ khóa tài nguyên bộ nhớ đệm (buffer cache) của PostgreSQL và gây nghẽn đường truyền HTTP.

## Quyết định

1. **Phân đoạn dữ liệu phía Backend (Keyset Pagination)**:
   - Backend cung cấp endpoint: `GET /api/v1/events/export/csv-chunk?size=10000&lastSeenId=...`.
   - Mỗi lượt truy vấn đọc đúng 1 chunk (mặc định 10,000 dòng) theo chỉ mục `id` hoặc `created_at`, giải phóng bộ nhớ ngay sau khi serialize ra text CSV.
   - Trả về header báo hiệu: `X-Total-Chunks`, `X-Has-More: true/false`, `X-Last-Id`.

2. **Ghép nối phân đoạn nhẹ nhàng phía Client (Client-side Blob Concatenation)**:
   - Frontend hiển thị thanh tiến trình trực quan (`Đang tải phần 3/10 (30,000 / 100,000 dòng)...`).
   - Khởi tạo Blob với mã định danh **UTF-8 BOM (`\uFEFF`)** để đảm bảo khi người dùng click mở file bằng Microsoft Excel, tiếng Việt có dấu luôn hiển thị chuẩn 100% không bị vỡ font.
   - Chunk đầu tiên chứa dòng Tiêu đề (Header). Các chunk tiếp theo chỉ chứa dòng dữ liệu, được nối tuần tự vào mảng `Blob` trong RAM (chỉ chiếm vài chục MB).
   - Khi `X-Has-More == false`, trình duyệt tự động kích hoạt tải xuống một file `.csv` duy nhất hoàn chỉnh.

3. **Tương thích ngược**:
   - Các bộ lọc ngắn hạn dưới 10,000 dòng vẫn hỗ trợ xuất trực tiếp định dạng `.xlsx` qua Apache POI SXSSF.

## Lý do không chọn

- **Không chọn Xuất file ZIP chứa nhiều file Excel con**: Vì trải nghiệm người dùng bất tiện (phải giải nén và xem rời rạc từng phần).
- **Không chọn Gom toàn bộ dữ liệu trên Server thành 1 file Excel khổng lồ**: Vì tiềm ẩn rủi ro sập container Backend khi có nhiều người dùng cùng bấm nút xuất báo cáo.

## Hệ quả

- **Dung lượng tiêu thụ tối thiểu**: RAM Backend duy trì ổn định dưới 50MB cho tác vụ xuất file; RAM trình duyệt dưới 60MB cho 500,000 dòng.
- **Tiến trình minh bạch**: Người dùng thấy rõ % tiến độ tải từng đoạn thay vì phải nhìn màn hình quay vô tận mà không biết khi nào xong.
- **Mở được trên mọi phần mềm**: File CSV chuẩn hóa mở được trực tiếp trên Excel, Google Sheets, Python Pandas và hệ thống BI doanh nghiệp.

