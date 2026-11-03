# Acknowledgement lưu trên server để đồng bộ nhiều thiết bị

Quyết định **đồng bộ trạng thái giữa các thiết bị**: Operator mở Event Feed trên máy tính và trên điện thoại phải thấy cùng danh sách Alert và cùng trạng thái đã xác nhận. Vì vậy Acknowledgement phải là trạng thái trên server, không phải state cục bộ của React.

Lý do: nếu Acknowledgement chỉ nằm trong state client, mỗi thiết bị sẽ có một danh sách riêng và có thể mâu thuẫn — máy tính hiện "đã xử lý" trong khi điện thoại vẫn hiện "chưa xử lý", và người vận hành có thể xử lý lại một Alert đã xong. Với hệ thống có hàng trăm Alert, đây là nguồn lỗi vận hành thật sự, không phải lỗi hình thức.

Hệ quả: Acknowledgement phải đi qua một endpoint ghi (hiện backend đã có sẵn `PUT /api/v1/events/{id}/ack` tại `EventWebhookController.java`, nhưng theo ADR 0001 thao tác này thuộc về Alert chứ không thuộc Event). WebSocket phải phát lại thay đổi trạng thái ack tới các client khác, nếu không client cũ vẫn giữ trạng thái cũ cho tới lần tải trang kế tiếp.

Lưu ý: điều này cũng bắt buộc có định danh Operator (ADR 0004) — một Alert phải biết ai đã xác nhận, không chỉ biết đã xác nhận hay chưa.
