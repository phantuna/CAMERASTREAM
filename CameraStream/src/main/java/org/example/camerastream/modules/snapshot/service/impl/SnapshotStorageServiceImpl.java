package org.example.camerastream.modules.snapshot.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.snapshot.config.SnapshotProperties;
import org.example.camerastream.modules.snapshot.service.ISnapshotStorageService;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.stream.Stream;

@Service
@Slf4j
@RequiredArgsConstructor
public class SnapshotStorageServiceImpl implements ISnapshotStorageService {

    private final SnapshotProperties properties;

    private Path storageDir;

    @PostConstruct
    public void init() {
        this.storageDir = Paths.get(properties.getStoragePath()).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.storageDir);
            log.info("[SnapshotStorage] Thư mục lưu ảnh: {}", storageDir);
        } catch (IOException e) {
            log.error("[SnapshotStorage] Không thể tạo thư mục lưu ảnh: {}", storageDir, e);
        }
    }

    @Override
    public String buildPublicUrl(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return null;
        }
        String base = properties.getBaseUrl();
        if (base == null || base.isBlank()) {
            return null;
        }
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        String safe = sanitize(fileName);
        if (safe == null) {
            return null;
        }
        return base + "/" + safe;
    }

    @Override
    public Path resolve(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return null;
        }
        String safe = sanitize(fileName);
        if (safe == null) {
            return null;
        }
        Path candidate = storageDir.resolve(safe).normalize();
        // Chặn path traversal: file phải nằm trực tiếp trong thư mục snapshot
        if (!candidate.getParent().equals(storageDir)) {
            log.warn("[SnapshotStorage] Từ chối tên file ngoài thư mục snapshot: {}", fileName);
            return null;
        }
        return candidate;
    }

    @Override
    public int deleteExpired() {
        if (storageDir == null || !Files.isDirectory(storageDir)) {
            return 0;
        }
        int retentionDays = properties.getRetentionDays();
        if (retentionDays <= 0) {
            return 0;
        }
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        int deleted = 0;
        try (Stream<Path> files = Files.list(storageDir)) {
            for (Path file : files.filter(Files::isRegularFile).toList()) {
                try {
                    if (Files.getLastModifiedTime(file).toInstant().isBefore(cutoff)) {
                        if (Files.deleteIfExists(file)) {
                            deleted++;
                        }
                    }
                } catch (IOException e) {
                    log.warn("[SnapshotStorage] Không xóa được file {}: {}", file.getFileName(), e.getMessage());
                }
            }
        } catch (IOException e) {
            log.error("[SnapshotStorage] Không liệt kê được thư mục ảnh để dọn dẹp", e);
            return deleted;
        }
        if (deleted > 0) {
            log.info("[SnapshotStorage] Đã xóa {} ảnh cũ hơn {} ngày", deleted, retentionDays);
        }
        return deleted;
    }

    /**
     * Chỉ giữ lại tên file đơn giản, loại bỏ mọi dấu gạch chéo và dấu chấm.
     */
    private String sanitize(String fileName) {
        String name = Path.of(fileName).getFileName().toString();
        if (name.isBlank() || name.contains("..")) {
            return null;
        }
        return name;
    }
}
