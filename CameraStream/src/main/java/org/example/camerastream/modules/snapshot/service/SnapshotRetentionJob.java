package org.example.camerastream.modules.snapshot.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Job dọn ảnh snapshot cũ.
 *
 * <p>Chạy lúc 03:17 mỗi ngày (giờ lệch, tránh đúng đồng hồ nào cả hệ thống
 * đều bận). Backend là nơi sở hữu retention — AI service không tự xóa file.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SnapshotRetentionJob {

    private final ISnapshotStorageService snapshotStorageService;

    @Scheduled(cron = "0 17 3 * * *")
    public void cleanupExpiredSnapshots() {
        try {
            int deleted = snapshotStorageService.deleteExpired();
            if (deleted > 0) {
                log.info("[SnapshotRetention] Đã dọn {} ảnh cũ", deleted);
            }
        } catch (Exception e) {
            log.error("[SnapshotRetention] Lỗi khi dọn ảnh cũ", e);
        }
    }
}
