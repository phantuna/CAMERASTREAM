# Hãm trạng thái camera: MediaMTX stream-ready + TCP probe, bỏ ICMP

`CameraHealthScheduler` chạy trong container Docker trên Windows; lệnh `isReachable` (ICMP echo) không hoạt động được trong môi trường đó (không có quyền gửi ICMP), nên nhiều camera thật vẫn online nhưng bị hệ thống báo OFFLINE, và UI giữ frame cũ thay vì hiện trạng thái thật.

Quyết định: mỗi vòng health-check chỉ dùng hai nguồn thật — (1) `isStreamReady` từ MediaMTX (stream đang được chuyển tiếp mượt là đủ), (2) TCP connect tới cổng RTSP (554) rồi ONVIF (80). Bỏ hẳn nhánh ICMP. Các camera được probe **song song** trên `cameraHealthCheckExecutor` (10–30 thread, đã có sẵn) thay vì vòng lặp serial — 50 camera một cycle chỉ mất vài giây, không vượt `fixedDelay` 30 s.

Hệ quả: trạng thái OFFLINE trên UI đáng tin — camera thật offline mới báo offline. Khi một camera rớt, `LatestFrameReader` (tầng ai_service, đã có sẵn) tự reconnect RTSP↔MediaMTX, còn UI hiển thị **Offline Placeholder** ("OFFLINE – đang nối lại") thay vì giữ frame chết. Nếu sau này thêm camera không có cổng TCP RTSP/ONVIF mở (firewall), cần thêm nguồn probe thứ ba — đừng quay lại ICMP.
