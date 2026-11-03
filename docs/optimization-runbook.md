# KỊCH BẢN TỐI ƯU HỆ THỐNG CAMERA_WEB_STREAM (Runbook)

> **Trục:** Hiệu năng (độ trễ + băng thông) + độ ổn định. SLO: **độ trễ 1–3 s**.
> **Môi trường:** Production, 1 máy + docker-compose, deploy thủ công → **mọi bước bắt buộc có rollback + cửa sổ triển khai + metric xác minh**.
> **Ngoài phạm vi (ghi nhận, xử lý ở module riêng):** trục bảo mật (webhook không auth, credential RTSP/ONVIF plaintext, CORS `*`, `recent_detections.json` plaintext — tham khảo bản review) + monitor/auto-restart tiến trình MediaMTX/AI.
> **Định dạng mỗi bước:** Chẩn đoán (file:dòng) → Thay đổi → Metric xác minh (đo lại từ Bước 0) → Rollback → Cửa sổ triển khai.

---

## Bảng tổng quan thứ tự (đã chốt)

| # | Hạng mục | Rủi ro | Patch mẫu kèm? | Mục tiêu |
|---|---|---|---|---|
| 0 | Dựng **điểm đo baseline** | Rất thấp (chỉ đọc) | ✅ `bench/measure_baseline.sh` | Có chuẩn so "trước/sau" cho mọi bước |
| 1 | Camera **OFFLINE thật** + TCP probe + song song hóa health-check | Thấp | ✅ patch | Trả về đúng trạng thái (không OFFLINE giả), không block cycle |
| 2 | Chặn **fan-out**: giới hạn reader + chỉ mount cam đang thấy | Thấp | ✅ patch (maxReaders) | Không nhân băng thông theo số người xem |
| 3 | **Transcode nguồn** (RTSP → 720p/H.264 cap bitrate) trước khi fan-out | Trung bình | ◑ sketch (review trước khi áp) | Hạ bitrate gốc, triệt để phần "ăn băng thông do nguồn" |
| 4 | **Mượt khung vật thể** (tăng tốc detection + mượt render) | Trung bình–cao | ◑ sketch | Giảm "khung delay/không mượt" |

Thứ tự **bắt buộc**: 0 → 1 → 2 → 3 → 4. Mỗi bước **xác minh bằng metric (so Bước 0) rồi mới sang bước sau**. Bước 3 làm sau 2 để tách phần băng thông do *nguồn* (không phải fan-out). Bước 4 cuối để không trộn rủi ro CV vào media.

---

## BƯỚC 0 — Dựng điểm đo baseline (rất thấp, chỉ đọc)

**Vì sao trước:** Không đo baseline thì mọi "cải thiện" chỉ là cảm giác. Con số "50 cam / 500 FPS / đạt SLA" trong `benchmark_plan_50_cameras.md` là **giả định, chưa đo** (chưa có test suite tầng Python AI) → cần chuẩn thật.

**Metric đo (chạy khi 1–5 camera + 1–5 operator đang xem, trạng thái thật):**
- **CPU / RAM** mỗi container: `backend`, `ai-service`, `mediamtx`, `frontend` (qua `docker stats`).
- **Băng thông per-camera**: reader count + size stream trong MediaMTX; tổng outbound (đặc biệt khi mở nhiều tab/operator) để thấy phần *fan-out*.
- **Độ trễ end-to-end**: timestamp nhúng trên frame (hoặc `requestAnimationFrame` tại FE) − `Date.now()` tại camera; lấy p50/p95. Đích so với SLO 1–3 s.
- **Detection FPS & OCR p95**: đọc từ log `ai-service` (nó log detection) — là chuẩn để so Bước 4.
- **Trạng thái camera**: số camera báo OFFLINE sai (camera thật vẫn up) — chuẩn để so Bước 1.

**Thay đổi:** bật `metrics: true` trong `mediamtx.yml` (để scrape `:9998`), chạy `bench/measure_baseline.sh`, lưu kết quả vào `bench/baseline_<date>.txt`.

**Metric xác minh:** file baseline ghi được đủ 5 nhóm số ở trên.

**Rollback:** không có (chỉ đọc + bật metrics). Tắt `metrics: true` nếu muốn.

**Cửa sổ triển khai:** bất kỳ (không đổi luồng media).

---

## BƯỚC 1 — Camera OFFLINE thật + song song health-check (rủi ro thấp)

**Chẩn đoán** (`CameraStream/.../modules/camera/service/CameraHealthScheduler.java:25-65`):
- Vòng lặp `for (Camera camera : cameras)` **serial**; mỗi camera probe tới 3 lần (MediaMTX → RTSP:554 → ONVIF:80), mỗi lần timeout 1 s → với N camera, 1 cycle ≈ N×(vài s), có thể **kéo dài hơn fixedDelay 30 s** → overlap/missed cycle.
- Fallback cuối là `InetAddress.getByName(ip).isReachable(1000)` = **ICMP ping** (dòng 50). ICMP **không hoạt động trong Docker/Windows** → camera thật vẫn up nhưng bị báo **OFFLINE giả** (đây chính là lỗi "camera rớt không tự hồi / báo offline sai" bạn gặp, dạng 17c).
- *Lưu ý:* tầng đọc frame `LatestFrameReader` (ai_service) **đã có** auto-reconnect RTSP↔MediaMTX — nên phần "reconnect" không cần sửa; sửa ở tầng **health-check + UI**.

**Thay đổi:**
1. Bỏ nhánh ICMP, chỉ giữ **MediaMTX stream-ready → TCP RTSP/ONVIF**.
2. **Song song hóa** bằng `cameraHealthCheckExecutor` (đã có, core 10 / max 30, `AsyncConfig.java:56`).

**Patch mẫu (sẵn áp):**

```java
// CameraStream/src/main/java/org/example/camerastream/modules/camera/service/CameraHealthScheduler.java
package org.example.camerastream.modules.camera.service;

import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.entity.CameraStatus;
import org.example.camerastream.modules.camera.hardware.ICameraHardwareConnector;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

@Component
@Slf4j
public class CameraHealthScheduler {

    private final CameraRepository cameraRepository;
    private final ICameraHardwareConnector hardwareConnector;
    private final Executor cameraHealthCheckExecutor;

    public CameraHealthScheduler(CameraRepository cameraRepository,
                                 ICameraHardwareConnector hardwareConnector,
                                 @Qualifier("cameraHealthCheckExecutor") Executor cameraHealthCheckExecutor) {
        this.cameraRepository = cameraRepository;
        this.hardwareConnector = hardwareConnector;
        this.cameraHealthCheckExecutor = cameraHealthCheckExecutor;
    }

    @Scheduled(fixedDelay = 30000, initialDelay = 10000)
    public void checkCameraHealth() {
        List<Camera> cameras = cameraRepository.findAllActive();
        CompletableFuture.allOf(
                cameras.stream()
                        .map(c -> CompletableFuture.runAsync(() -> probeCamera(c), cameraHealthCheckExecutor))
                        .toArray(CompletableFuture[]::new)
        ).join();
    }

    private void probeCamera(Camera camera) {
        try {
            boolean isOnline = false;

            // 1. Trạng thái thật từ MediaMTX (chuẩn nhất)
            if (camera.getStreamPath() != null && !camera.getStreamPath().isBlank()) {
                isOnline = hardwareConnector.isStreamReady(camera.getStreamPath());
            }

            // 2. Nếu MediaMTX chưa có stream, probe TCP RTSP (554) rồi ONVIF (80).
            //    KHÔNG dùng ICMP (isReachable) — ICMP chết trong Docker/Windows.
            if (!isOnline && camera.getIpAddress() != null && !camera.getIpAddress().isBlank()) {
                int rtspPort = camera.getRtspPort() != null ? camera.getRtspPort() : 554;
                if (tcpOpen(camera.getIpAddress(), rtspPort, 1000)) {
                    isOnline = true;
                } else {
                    int onvifPort = camera.getOnvifPort() != null ? camera.getOnvifPort() : 80;
                    isOnline = tcpOpen(camera.getIpAddress(), onvifPort, 1000);
                }
            }

            CameraStatus newStatus = isOnline ? CameraStatus.ONLINE : CameraStatus.OFFLINE;
            if (camera.getStatus() != newStatus) {
                camera.setStatus(newStatus);
                cameraRepository.save(camera);
                log.info("Camera '{}' ({}) status changed to {}", camera.getName(), camera.getIpAddress(), newStatus);
            }
        } catch (Exception e) {
            log.debug("Health check error for camera '{}': {}", camera.getName(), e.getMessage());
        }
    }

    private static boolean tcpOpen(String host, int port, int timeoutMs) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
```

**Thay đổi UI (đi kèm, dạng 17b):** camera `OFFLINE` (từ `/api/cameras`) → tile hiện placeholder **"OFFLINE – đang nối lại…"** thay vì giữ frame cũ / ô đen. Điểm chạm: component tile (tham chiếu `CameraTile.tsx` / `CameraStreamView.tsx`, nơi đã dùng `CameraStatus`). *Đây là thay đổi FE, review trước khi merge.*

**Metric xác minh (so Bước 0):**
- Số camera "OFFLINE giả" (thật up nhưng báo OFFLINE) = **0**.
- 1 health cycle hoàn tất **< fixedDelay** (ví dụ 50 cam song song ≈ 2–3 s, thay vì 50 s).
- Log `checkCameraHealth` không còn overlap.

**Rollback:** git-restore `CameraHealthScheduler.java`; giữ nguyên FE nếu chưa merge UI.

**Cửa sổ triển khai:** giờ thấp điểm (health-check không ảnh hưởng luồng media đang chạy).

---

## BƯỚC 2 — Chặn fan-out (rủi ro thấp)

**Chẩn đoán:**
- `deploy/mediamtx.yml:517` `maxReaders: 0` = **không giới hạn reader** mỗi path. 1 camera + N operator = N WHEP reader; không cap → băng thông & CPU MediaMTX nhân theo người xem (đúng bug 6b).
- Tầng broadcast tracking (ai_service) có `subscribed_cam_ids` (chỉ gửi cam đang thấy) — tốt; nhưng FE cần **chỉ mount WHEP cho tile đang hiện** để không mở 50 kết nối WHEP khi user chỉ xem 5 cam.

**Thay đổi (patch mẫu, sẵn áp):**

```yaml
# deploy/mediamtx.yml (cũng kiểm tra mediamtx/mediamtx.yml nếu đang dùng copy này)
pathDefaults:
  # ...
  # Số reader tối đa mỗi path. 0 = không giới hạn. 10 = đủ cho ~5 operator xem cùng 1 cam.
  maxReaders: 10
```

> **Lưu ý:** `maxReaders` là per-path (per-camera). 5 operator × cùng 1 camera = 5 reader; `10` có buffer an toàn. Khi vượt, reader mới bị **từ chối** (kèm message), không sập server.

**Thay đổi FE (đi kèm, review trước khi merge):** chỉ `mount`/nối WHEP cho tile nằm trong viewport (IntersectionObserver → unmount khi off-screen). Nếu FE đã có thì xác nhận hoạt động; nếu chưa, đây là patch FE riêng.

**Metric xác minh (so Bước 0):**
- Mở N tab/operator cùng lúc → **tổng outbound không tăng ~N lần** (giới hạn bởi `maxReaders`), mà ổn định quanh mức 1 source.
- `docker stats mediamtx` CPU/RAM khi nhiều người xem **không tăng tuyến tính** theo số người xem.

**Rollback:** `maxReaders: 0` (trở lại không giới hạn). `git restore deploy/mediamtx.yml` + `docker compose restart mediamtx`.

**Cửa sổ triển khai:** giờ thấp điểm; `restart mediamtx` làm drop streaming ngắn (~vài s) → chọn lúc ít người xem.

---

## BƯỚC 3 — Transcode nguồn (rủi ro trung bình — review trước khi áp)

**Chẩn đoán:** MediaMTX pull trực tiếp RTSP camera (`source: rtsp://…@192.168.1.61:554/…`) và **zero re-encode** → bitrate = bitrate gốc của camera (có thể cao, e.g. 1080p 4–8 Mbps/cam). Vì **không sửa được encoder camera (Q13b)**, phải **chèn bước transcode phía server** trước khi MediaMTX fan-out.

**Cách làm (khung, chưa áp):**
- Chạy **ffmpeg** (hoặc MediaMTX `runOnDemand` gọi ffmpeg) per-camera: `RTSP → scale=1280:720 (hoặc 960:540) -c:v libx264 -preset veryfast -b:v <cap> → publish RTMP/RTSP vào MediaMTX path`.
- MediaMTX `source` đổi từ URL RTSP camera gốc sang **stream đã transcode**.
- Bitrate cap gợi ý: **720p ≈ 2–4 Mbps/cam** (giảm mạnh so với 1080p gốc). 960:540 ≈ 1.5–2.5 Mbps.
- **Chi phí:** +N tiến trình ffmpeg (giải mã + mã hóa) → **đo CPU ở Bước 0** trước; khi có GPU (đã có `docker-compose.gpu.yml`) → dùng **encode phần cứng (NVENC)** để gần như không tốn CPU.
- **Flag bật/tắt per-camera** (1 dòng config) để **rollback tức thì 1 camera**.

**Metric xác minh (so Bước 0):**
- Bitrate per-camera trước/sau (đo trên MediaMTX metrics / `mediatoolkit` ffprobe) giảm tới hạn cap.
- **Tổng outbound** (Bước 2 + Bước 3 cùng) đạt mức thiết kế.
- Độ trễ (SLO 1–3 s) **không tăng** (ffmpeg re-encode có thể +200–500 ms → kiểm tra).

**Rollback:** tắt flag transcode per-camera (MediaMTX quay về pull RTSP gốc).

**Cửa sổ triển khai:** triển khai từng camera (grayline), đo Bước 0 lại sau mỗi camera; tránh giờ cao điểm.

---

## BƯỚC 4 — Mượt khung vật thể (rủi ro trung bình–cao — review trước khi áp)

**Chẩn đoán (bug 7b, Q11 = cả detection lẫn render đều chậm):**
- **Tăng tốc detection (Track A):**
  - `plate_det.onnx` / `object_det.onnx` chạy **batch=1** per camera → không tận dụng được. (video_alpr_processor.py)
  - **ONNX session nhân 50×** (T1/T2 không share, chỉ T3+4 dùng pool chung — OCR pool đã làm đúng, cần làm tương tự cho T1/T2). (onnx_lpr_engine.py)
  - `AI_OCR_MAX_TOTAL=4` pool cho 50 cam → đầu queue lớn, p95 cao. (ocr_worker_pool.py)
- **Mượt render (Track B):**
  - Tracking broadcast **30 FPS** → 50 cam × 30 = 1500 msg/s WS; FE `useAiTracking` emit theo `requestAnimationFrame`. (camera_stream_bridge.py `_tracking_display_loop`, useAiTracking.ts)

**Thay đổi (khung, chưa áp):**
- **Track A (detection nhanh hơn):**
  - Share 1 `InferenceSession` cho T1/T2 (mô hình pool OCR đã làm được) → giảm RAM.
  - Gom crops từ N camera vào **1 batch tensor (4–8)** → tăng throughput.
  - `AI_OCR_MAX_TOTAL`: 4 → 16 (tỉ lệ với CPU/GPU); queue **bounded + drop-oldest**.
  - CPU (hiện tại): quantize/INT8. **GPU (Q16, đã có `docker-compose.gpu.yml`):** bật **CUDA/TensorRT** cho ONNX Runtime + batch 4–8. Flag `AI_ONNX_GPU=1` để bật khi có GPU.
- **Track B (render mượt):**
  - Hạ tracking broadcast **30 → 10–15 FPS** (vẫn bám), hoặc **gộp per-client**.
  - FE **interpolate** vị trí khung giữa 2 kết quả detection (dùng vận tốc Kalman của ByteTrack) → khung không "đuôi" theo vật thể, mượt giữa 2 frame detection.

**Metric xác minh (so Bước 0):**
- **Detection FPS / OCR p95** tăng (đo từ log ai-service).
- **Độ trễ khung** (thời gian từ vật thể vào khung tới khi khung bám đúng) giảm; "đuôi/không mượt" giảm (đánh giá tay + video quay màn hình).
- 50 cam × tracking msg/s **giảm** (throttle 30→10–15 FPS).

**Rollback:** từng flag (GPU off, batch off, broadcast 30 FPS) — thiết kế **flag bật/tắt** để revert 1 tính năng.

**Cửa sổ triển khai:** **cuối cùng**, grayline theo camera; đo Bước 0 trước–sau; tránh giờ cao điểm. Đây là bước nặng nhất, cần CPU/GPU dự phòng.

---

## Phát hiện — NG NGOẠI PHẠM VI NÀY (ghi nhận, module riêng sau)

Theo Q18 (chỉ hiệu năng + ổn định), các điểm dưới **không xử lý trong runbook này**, chỉ liệt kê để bạn cân nhắc sau:

**An toàn vận hành:**
- Không monitor/auto-restart tiến trình **MediaMTX** (spawn `mediamtx.exe` không `onExit`/restart) và **ai-service** → 1 tiến trình chết là cả hệ offline. (MediaMtxProcessManager.java)

**Bảo mật (nên làm, tách module):**
- Webhook `POST /api/cameras/{id}/detections` **không signature** → giả tạo detection được.
- RTSP/ONVIF credential lưu **plaintext** (DB + `mediamtx.yml` dòng 885 `rtsp://admin:…`).
- CORS/origin `*` trên WS `:8080` và AI `:5000`; MediaMTX API/reader **không auth**.
- `recent_detections.json` (biển số, PII) plaintext.

---

## Cách dùng runbook này (thủ tục)

1. **Bước 0:** bật `metrics: true` → chạy `bench/measure_baseline.sh` → lưu baseline. *(chưa đổi gì hoạt động)*
2. **Mỗi bước 1→4:** áp thay đổi → đo lại metric (so baseline) → **đạt mới tiếp tục**, chưa đạt thì rollback & ghi chú.
3. Giữ nguyên thứ tự; không trộn bước 4 (CV) với bước media.
4. Cửa sổ triển khai: chọn giờ thấp điểm; ghi lại trước/sau ở mỗi bước.
