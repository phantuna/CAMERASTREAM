# Site trở thành Entity và Viewport phân trang theo Site

Với mục tiêu 100–500 camera thuộc nhiều địa điểm, quyết định **phân trang Viewport theo Site** (thay vì phẳng theo thứ tự), đồng thời nâng **Site** lên thành entity thật thay vì chuỗi tự do.

Lý do Site phải là entity: hiện `Camera.location` là cột `String` tự do, và `VideoWallView.tsx` suy ra danh sách Site bằng cách quét `distinct` trên giá trị đó. Điều này không cho phép gán quyền theo Site (ADR 0004 yêu cầu Operator chỉ xem camera thuộc Site được gán), cũng không cho phép biết camera nào thuộc Site nào khi Site bị đổi tên. Một cột String không thể là khóa ngoại.

Lý do phân trang theo Site: phân trang phẳng (trang 1 = camera 1–16) đơn giản hơn nhưng với 500 camera người vận hành phải lướt hàng chục trang để tìm một camera ở khu sản xuất cụ thể. Chia theo Site cho phép nhảy thẳng tới một địa điểm, và giữ mỗi trang có ý nghĩa vật lý (cùng một khu vực) thay vì một lát cắt ngẫu nhiên của danh sách tổng hợp.

Hệ quả: cần bảng `sites` và khóa ngoại `cameras.site_id`. Việc gán Operator quyền theo Site cũng dựa trên khóa này. Camera không thuộc Site nào phải được xử lý tường minh — hoặc bắt buộc có Site, hoặc thuộc một Site "chưa phân loại".
