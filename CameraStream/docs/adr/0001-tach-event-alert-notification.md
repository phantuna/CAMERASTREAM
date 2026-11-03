# Tách ba tầng Event / Alert / Notification

Khi bổ sung gửi cảnh báo qua Telegram/Zalo/Email và bật còi đèn, hệ thống cần phân biệt "AI đã phát hiện gì" với "cần người xử lý gì" với "đã gửi đi được chưa". Vì vậy ba khái niệm tách bạch: **Event** là dữ kiện đã xảy ra (ghi vĩnh viễn), **Alert** là Event cần người vận hành xử lý, **Notification** là một lần gửi Alert ra kênh cụ thể.

Lý do tách: một Alert có thể sinh nhiều Notification qua nhiều kênh, và một Notification có thể thất bại trong khi Alert vẫn cần xử lý. Nếu gộp tất cả vào một bảng `SystemEvent` với cờ boolean, sẽ không biểu diễn được "gửi Telegram thất bại nhưng Zalo đã thành công", cũng không gộp được Alert theo Deduplication Window, và sẽ phải thêm cột mới mỗi khi thêm một kênh thông báo.

Hệ quả: cần ba bảng thay vì một (`SystemEvent` sẽ được bổ sung khái niệm tương ứng). Acknowledgement thuộc về Alert, không thuộc Event — xác nhận một Alert không xóa nó khỏi lịch sử sự kiện.
