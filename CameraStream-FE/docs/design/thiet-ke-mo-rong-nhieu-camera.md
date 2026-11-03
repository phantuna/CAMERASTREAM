# Thiết kế web chịu tải nhiều camera

Tài liệu này trả lời câu hỏi: *với 25+ tính năng AI và mục tiêu 100–500 camera, web cần được thiết kế thế nào?*

Nguồn: `GLOSSARY-MAP.md`, các ADR trong `CameraStream/docs/adr/`, và hiện trạng code đã đọc.

---

## 1. Ranh giới trách nhiệm

Nguyên tắc nền: **web chỉ trình bày, không quyết định.**

| Tầng | Sở hữu | Quyết định gì |
|---|---|---|
| AI Worker (Python) | Nhận biết | Detector nào chạy, trên ROI nào, tạo Track, chốt Capture |
| Spring Boot | Quyết định nghiệp vụ | Rule nào kích hoạt, sinh Alert, điều phối Notification, lưu trữ |
| React (web) | Trình bày | Hiển thị gì, lọc gì, xuất gì |

Hệ quả cụ thể cho web:

- Web **không** tự tính "đây là xâm nhập" — nó đọc `severity` và `eventType` do backend gửi.
- Web **không** quyết định ai nhận cảnh báo — backend quyết định theo Policy rồi đẩy Notification qua WebSocket.
- Web **không** giữ kết nối SSE riêng cho từng camera. Một kết nối cho toàn hệ thống, chia theo `cameraId`.

---

## 2. Bố cục xem — vấn đề hiện tại

### 2.1. Viewport chưa thực sự tồn tại

`VideoWallView.tsx:167`:
```ts
const gridSlots = useMemo(() => {
  return filteredCameras.slice(0, gridCols * gridRows);
}, [filteredCameras, gridCols, gridRows]);
```

Lấy 6 camera đầu tiên (mặc định 3×2) và **bỏ rơi phần còn lại**. Không có phân trang, không có nút "trang tiếp". Với 500 camera, 494 camera không bao giờ hiển thị được.

Trong tài liệu kiến trúc V2.0 mục 6, yêu cầu này đã được nêu rõ: *"Lưới Video (Live Grid) chỉ cho phép chọn bố cục xem 1x1, 2x2 (4 cam), 3x3 (9 cam), hoặc 4x4 (16 cam) trên 1 trang. Khi người dùng chuyển sang Trang 2 (Cam 17 đến 32), React tự động ngắt kết nối WebRTC…"*

**Cần bổ sung:** trạng thái `viewportPage`, điều hướng trang, và bảng camera chia nhóm theo Site để nhảy tới một nhóm cụ thể thay vì lướt tuần tự.

### 2.2. Cờ `isVisibleInViewport` là cái vỏ rỗng

`CameraTile.tsx:51`:
```ts
const [isVisibleInViewport, setIsVisibleInViewport] = useState(true);
```

State này được khởi tạo `true` và **không bao giờ được cập nhật**. Nó không nhận giá trị từ cha. Dòng 78 (`if (!isVisibleInViewport || !camera.webrtcUrl)`) vì vậy luôn cho phép mở WebRTC.

Hệ quả: cơ chế "ngắt WebRTC của camera ngoài viewport" — cơ chế tiết kiệm tài nguyên quan trọng nhất — **chưa bao giờ hoạt động**. Đây là nguyên nhân có khả năng lớn nhất khiến web treo với nhiều camera.

Cách sửa: `CameraTile` phải nhận `isVisibleInViewport` làm prop từ `VideoWallView`, và `VideoWallView` phải truyền xuống chỉ cho các camera trong viewport hiện tại.

### 2.3. Hai đường SSE song song — nguy cơ nhân đôi tải

- `VideoWallView.tsx:207` — mở `EventSource(effectiveSseUrl)` **cho toàn hệ thống**
- `useAiTracking.ts` (`AiTrackingHub`) — mở `EventSource` **theo từng baseUrl**, có cơ chế chia sẻ

Khi `moduleMode === 'FACE'`, `effectiveAiApiBaseUrl` = `:5001`; module này vừa dùng `VideoWallView`'s SSE vừa dùng `AiTrackingHub` cho cùng baseUrl đó. Hai `EventSource` tới cùng endpoint, mỗi cái nhận toàn bộ payload của mọi camera.

`AiTrackingHub` đã giải quyết đúng vấn đề giới hạn ~6 kết nối/origin của trình duyệt — nhưng `VideoWallView` đang tự mở thêm một kết nối ngoài hub đó, phá vỡ chính sách mà hub thiết kế ra.

**Cần:** `VideoWallView` phải dùng `useAiTracking` thay vì tự mở SSE. Một hub, một kết nối, một nguồn sự thật.

### 2.4. Polling toàn hệ thống

`VideoWallView.tsx:288` và `AlprLogsModule.tsx:93`:
```ts
const interval = setInterval(fetchDetections, 5000);
```

Mỗi 5 giây, mọi người dùng đang mở module đều bắn một request lấy tối đa 100 bản ghi, rồi lọc ở client. Với N người dùng × M module đang mở, đây là N×M request/5 giây — dù server có xử lý được thì connection pool cũng cạn.

Thêm vào đó, `AlprLogsModule.tsx:53` gọi AI service Python trực tiếp (`http://localhost:5000/api/detections`) **và** fallback sang Spring Boot — bypass hoàn toàn tầng backend. Điều này phá vỡ ranh giới tầng ở mục 1, và cũng nghĩa là dữ liệu lịch sử đến từ hai nguồn khác nhau có thể lệch nhau.

**Cần:** lịch sử luôn đọc từ backend qua phân trang server-side (`GET /api/v1/events?page=&size=`). Backend đã có `searchEvents` với `Pageable` sẵn (`EventWebhookController.java:60`) — chỉ cần FE dùng nó thay vì tải 100 rồi lọc tay.

---

## 3. Thiết kế đề xuất

### 3.1. Phân tầng Viewport

```
Video Wall
├── Camera Tree (200-500 camera, nhóm theo Site, tìm kiếm)
│   └── chọn Site → nhảy tới trang chứa các camera của Site đó
└── Live Grid (tối đa 16 Tile)
    └── CameraTile nhận isVisibleInViewport từ cha
```

Quy tắc: **một trình duyệt không bao giờ mở quá 16 WebRTC.** Camera ngoài viewport không có `<video>`, không nhận SSE, không render canvas overlay.

### 3.2. Một kết nối SSE toàn hệ thống

```
                    ┌─────────────────────────┐
   AI Worker ──────▶│  Spring Boot            │
   (nhiều)          │  EventHub               │──▶ WebSocket /topic/events
                    │  (phân fan-out theo      │      (Alert + Notification)
                    │   cameraId)              │
                    └─────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────────┐
                    │  React                  │
                    │  ├─ SSE /tracking-events │  ← 1 kết nối / AI service
                    │  │   (AiTrackingHub)     │
                    │  └─ WS /topic/events     │  ← 1 kết nối
                    └─────────────────────────┘
```

`AiTrackingHub` giữ vai trò bộ đệm: giữ trạng thái Track cho mọi camera, nhưng chỉ phát cho camera nào có listener. Khi một Tile rời viewport → unsubscribe → hub drop state → không tốn RAM, không vẽ canvas.

### 3.3. Lọc và truy vấn — server-side

Hiện tại: tải 100 bản ghi → lọc ở client → phân trang ở client. Với 1 triệu bản ghi thì không khả thi.

Mô hình mới:

| Mức | Ai xử lý | Ví dụ |
|---|---|---|
| Lọc thời gian | Server | `fromDate`, `toDate` |
| Lọc phân loại | Server | `eventType`, `severity` |
| Từ khóa | Server | `search` (index trên plate, personName) |
| Phân trang | Server | `page`, `size` |
| Sắp xếp | Server | `sort` |
| Chọn cột hiển thị | Client | không ảnh hưởng query |

`HistoryFilterBar` đã có debounce 300ms cho search — giữ nguyên. Nhưng `useEffect` ở `HistoryFilterBar.tsx:135` gọi `onFilterChange` **mỗi khi** đổi ngày/giờ (chỉ search mới debounce). Với server-side pagination, mỗi lần đổi ngày là một query mới — cần debounce chung hoặc nút "Áp dụng" tường minh.

### 3.4. Xuất dữ liệu — tách khỏi query

Không nên xuất bằng cách "tải hết rồi lọc ở client" (như `exportDataToExcel` hiện tại đang làm fallback). Với 90 ngày × 500 camera, dữ liệu có thể hàng triệu dòng.

Mô hình hai tầng:
- **Báo cáo tức thời** (dưới ~50k dòng): xuất server-side, trả file, `Content-Disposition` để FE đặt tên động — đã có sẵn `downloadExcelFromApi`.
- **Báo cáo lớn**: tạo job, chạy nền, thông báo khi xong qua Notification channel.

`validateDateRange` đã giới hạn 90 ngày — giữ nguyên, nhưng cần giới hạn thêm theo *số dòng ước tính* chứ không chỉ theo ngày, vì mật độ sự kiện khác nhau nhiều giữa các camera.

### 3.5. Module AI — tái dùng thay vì nhân bản

25+ tính năng AI × 25+ module UI = bùng nổ tổ hợp. Nguyên tắc:

```
Module UI = { chọn Detector + Rule + Policy } → render generic
```

Một module "Lịch sử sự kiện AI" dùng chung cho mọi detector, chỉ khác bộ lọc. Một module "Cấu hình AI" dùng chung cho mọi camera.

Điều này đòi hỏi `eventType` phải là **mã ổn định do backend định nghĩa** (`CameraAiType` + rule code), không phải chuỗi tự do. Hiện `SystemEvent.eventType` là `String` tự do và FE đang đoán ngữ nghĩa bằng `payload.personName` — dấu hiệu của model chưa chốt.

### 3.6. Cảnh báo và thông báo

Theo ADR 0001, web nhận 3 loại thông điệp:

| Thông điệp | Web hiển thị ở đâu | Cần thao tác |
|---|---|---|
| Event | Event Feed, lịch sử | Không |
| Alert | Trung tâm cảnh báo, đếm badge | Có Acknowledgement |
| Notification | Toast / panel thông báo | Xem trạng thái gửi |

Toast hiện tại (`GlobalEventToast.tsx`, `shared/utils/toast.ts`) phù hợp cho Notification, nhưng **không phù hợp cho Alert** — Alert cần một màn hình có hàng đợi, có bộ lọc, có trạng thái ack, cần tồn tại qua nhiều phiên. Đây là một module mới, không phải mở rộng toast.

### 3.7. Phân quyền

Theo ADR 0004, web cần trạng thái Operator hiện tại và phân quyền ở mức route/UI:
- Operator chỉ xem được camera thuộc Site được gán.
- Xuất dữ liệu là hành động cần quyền riêng (vì nó đọc dữ liệu hàng loạt).
- Audit log ghi lại ai xuất gì, bao nhiêu dòng, khoảng thời gian nào.

Cần quyết định: phân quyền theo Site hay toàn hệ thống? Với 500 camera nhiều Site, phân quyền theo Site là tự nhiên hơn.

---

## 4. Bảng ưu tiên

| # | Việc | Vì sao | Ước lượng |
|---|---|---|---|
| 1 | Sửa `isVisibleInViewport` thành prop thật | Đang làm cơ chế tiết kiệm tài nguyên không hoạt động | S |
| 2 | Bỏ SSE trùng trong `VideoWallView`, dùng `useAiTracking` | Nhân đôi tải SSE, phá giới hạn kết nối trình duyệt | S |
| 3 | Thêm phân trang Viewport cho Video Wall | 494/500 camera hiện không xem được | M |
| 4 | Lịch sử chuyển sang phân trang server-side | Tải 100 rồi lọc client không scale | M |
| 5 | Bỏ polling 5s, chuyển sang push cho danh sách sự kiện | N×M request/5s | M |
| 6 | Luồng lịch sử luôn đọc từ Spring Boot, bỏ gọi thẳng AI service | Phá ranh giới tầng, nguồn dữ liệu lệch nhau | S |
| 7 | Module "Trung tâm cảnh báo" riêng có hàng đợi + ack | Alert cần tồn tại qua phiên, toast không đủ | L |
| 8 | Bảng Alert/Notification + Rule/Policy theo ADR | Nền cho 25+ tính năng | L |
| 9 | Endpoint `/export` server-side cho xuất lớn | Tránh tải hàng triệu dòng về client | M |
| 10 | Đăng nhập + RBAC theo Site | Điều kiện tiên quyết cho vận hành nhiều người | L |

---

## 5. Điểm cần quyết định

1. **Phân trang Viewport theo Site hay phẳng?** Phẳng (trang 1 = camera 1–16) đơn giản nhưng với 500 camera thì phải lướt hàng chục trang. Chia theo Site giúp nhảy trực tiếp.=> chia theo site cho toi đi
2. **Đồng bộ giữa các thiết bị không?** Operator mở Event Feed trên máy tính và điện thoại — có cần thấy cùng danh sách và cùng trạng thái ack không? Nếu có thì Acknowledgement phải qua server chứ không chỉ state client =>Đồng bộ
3. **Alert có cần bộ đếm/thời hạn SLA không?** "Alert chưa xử lý trong 5 phút thì nhắc lại" là yêu cầu khác hác với thông báo tức thời — ảnh hưởng tới việc có cần bảng hàng đợi riêng. => alert co thoi han trong 1 ngay, qua 1 ngay se tu nhay sang thong bao hang ngay
4. **Cảnh báo qua Zalo ở mức nào?** Zalo OA có giới hạn và khác Telegram; cần biết có bao nhiêu kênh để thiết kế bảng Notification. =>Telegram bot và trên web
