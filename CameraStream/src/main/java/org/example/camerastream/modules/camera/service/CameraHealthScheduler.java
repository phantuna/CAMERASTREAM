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
        // Song song hóa: 50 cam x timeout 1s serial = 50s/cycle (vượt fixedDelay 30s -> overlap).
        // Dùng dedicated pool (core 10 / max 30) => ~2-3s/cycle.
        CompletableFuture.allOf(
                cameras.stream()
                        .map(c -> CompletableFuture.runAsync(() -> probeCamera(c), cameraHealthCheckExecutor))
                        .toArray(CompletableFuture[]::new)
        ).join();
    }

    private void probeCamera(Camera camera) {
        try {
            boolean isOnline = false;

            // 1. Trạng thái thật từ MediaMTX (chuẩn nhất: stream đang được chuyển tiếp mượt -> ONLINE)
            if (camera.getStreamPath() != null && !camera.getStreamPath().isBlank()) {
                isOnline = hardwareConnector.isStreamReady(camera.getStreamPath());
            }

            // 2. Nếu MediaMTX chưa có stream, probe TCP RTSP (554) rồi ONVIF (80).
            //    Bỏ hẳn ICMP (InetAddress.isReachable): ICMP echo không hoạt động trong Docker/Windows
            //    -> camera thật vẫn up nhưng bị báo OFFLINE giả.
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

