package org.example.camerastream.modules.camera.hardware.streaming;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.net.HttpURLConnection;
import java.net.URL;

@Component
@Slf4j
public class MediaMtxProcessManager {

    @Value("${mediamtx.api-url:http://localhost:9997}")
    private String mediaMtxApiUrl;

    private Process process;

    @PostConstruct
    public void startMediaMtxIfNeeded() {
        if (isMediaMtxRunning()) {
            log.info("MediaMTX is already running at {}", mediaMtxApiUrl);
            return;
        }

        // Search for local mediamtx binary if not running via Docker
        File[] searchLocations = new File[]{
                new File("mediamtx.exe"),
                new File("mediamtx/mediamtx.exe"),
                new File("../mediamtx/mediamtx.exe"),
                new File("../mediamtx.exe"),
                new File("src/main/resources/mediamtx.exe")
        };

        File targetExe = null;
        for (File loc : searchLocations) {
            if (loc.exists() && loc.isFile()) {
                targetExe = loc;
                break;
            }
        }

        if (targetExe != null) {
            try {
                log.info("Starting local MediaMTX executable from: {}", targetExe.getAbsolutePath());
                ProcessBuilder pb = new ProcessBuilder(targetExe.getAbsolutePath());
                pb.redirectErrorStream(true);
                this.process = pb.start();
                log.info("MediaMTX started automatically (PID: {})", process.pid());
            } catch (Exception e) {
                log.warn("Failed to auto-launch local MediaMTX: {}", e.getMessage());
            }
        } else {
            log.info("No local mediamtx.exe found. Assuming MediaMTX is managed via Docker Compose on port 8889/8554/9997.");
        }
    }

    private boolean isMediaMtxRunning() {
        try {
            URL url = new URL(mediaMtxApiUrl + "/v3/paths/list");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(1500);
            connection.setReadTimeout(1500);
            int code = connection.getResponseCode();
            return (code >= 200 && code < 400);
        } catch (Exception e) {
            return false;
        }
    }

    @PreDestroy
    public void stopMediaMtx() {
        if (process != null && process.isAlive()) {
            log.info("Shutting down local MediaMTX process...");
            process.destroy();
        }
    }
}
