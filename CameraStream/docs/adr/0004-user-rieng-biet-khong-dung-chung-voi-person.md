# Tách Operator (tài khoản hệ thống) khỏi Person (chủ thể AI nhận diện)

Hệ thống giám sát cần phân quyền người dùng, nhưng đã có sẵn khái niệm `Person` cho nhân sự được AI nhận diện. Vì vậy tạo khái niệm **Operator** riêng biệt cho tài khoản hệ thống, kèm **Role** và **Audit Log**, thay vì dùng lại `Person`.

Lý do: đây là hai quan hệ nghiệp vụ khác nhau, chỉ trùng ở chỗ cùng là "con người". `Person` là chủ thể mà AI nhận diện qua Face Profile; `Operator` là tài khoản đăng nhập vào hệ thống với tập quyền. Dùng chung một bảng sẽ trộn vai trò công việc với quyền hệ thống, và tệ hơn là làm lộ dữ liệu nhân sự (PII) qua màn hình đăng nhập hoặc khi xuất báo cáo. Ví dụ cụ thể: một nhân viên làm việc tại nhà máy không nhất thiết có quyền xuất báo cáo lưu lượng của toàn hệ thống.

Lưu ý hiện trạng: hệ thống hiện **không có** `spring-boot-starter-security`, không có đăng nhập, và `PersonController` không có bất kỳ cơ chế phân quyền nào. Quyết định này là nền tảng để bổ sung sau, không phải mô tả trạng thái hiện tại.

Hệ quả: cần bảng `operators`, `roles`, và cơ chế xác thực riêng; cần cân nhắc khi xuất dữ liệu Excel để không kéo theo PII không cần thiết.
