package org.example.camerastream.modules.backup.recovery;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.backup.entity.BackupJob;
import org.example.camerastream.modules.backup.entity.BackupSetting;
import org.example.camerastream.modules.backup.enums.BackupStatus;
import org.example.camerastream.modules.backup.repository.BackupJobRepository;
import org.example.camerastream.modules.backup.repository.BackupSettingRepository;
import org.example.camerastream.modules.backup.service.IBackupService;
import org.example.camerastream.modules.backup.service.IBackupStorageService;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Cơ chế tự động phục hồi và sao lưu bù (Catch-up Backup) sau khi hệ thống khởi động lại.
 * Kế thừa kiến trúc từ HPticket:
 * 1. Dọn dẹp và giải phóng các job bị kẹt RUNNING/PENDING do sập nguồn, mất điện hoặc tắt máy đột ngột.
 * 2. Tự động kiểm tra xem có lịch sao lưu nào bị bỏ lỡ trong thời gian hệ thống offline hay không.
 * 3. Nếu bị lỡ lịch, tự động kích hoạt tiến trình SAO LƯU BÙ (Catch-up Backup) ngay lập tức trong background thread pool.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class BackupRecoveryChecker {

    private final IBackupService backupService;
    private final BackupJobRepository backupJobRepository;
    private final BackupSettingRepository backupSettingRepository;
    private final IBackupStorageService backupStorageService;

    private static final ZoneId ZONE = ZoneId.of("Asia/Bangkok");
    private static final String DEFAULT_CRON = "0 0 2 * * *"; // Mặc định 02:00 sáng hàng ngày

    @Async("backupRecoveryExecutor")
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        try {
            // Chờ 5 giây sau khi ứng dụng khởi động sẵn sàng để các kết nối DB và HTTP API đi vào ổn định
            Thread.sleep(5000);
            log.info("[BackupRecovery] Bắt đầu kiểm tra phục hồi hệ thống sao lưu sau khởi động...");

            // 1. Quét dọn các tiến trình RUNNING hoặc PENDING bị kẹt do tắt máy/sập nguồn
            cleanupOrphanedJobs();

            // 2. Kiểm tra lịch sao lưu bị bỏ lỡ và thực hiện sao lưu bù (Catch-up Backup)
            checkAndCatchUpMissedBackup();

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[BackupRecovery] Tiến trình kiểm tra recovery bị ngắt.");
        } catch (Exception e) {
            log.error("[BackupRecovery] Lỗi khi kiểm tra backup recovery: {}", e.getMessage(), e);
        }
    }

    /**
     * Giải phóng và đánh dấu FAILED các job RUNNING/PENDING bị gián đoạn do sập nguồn/tắt máy đột ngột,
     * đồng thời xóa các file rác .tmp chưa hoàn tất.
     */
    private void cleanupOrphanedJobs() {
        List<BackupJob> orphanedJobs = new ArrayList<>();
        orphanedJobs.addAll(backupJobRepository.findAllByStatus(BackupStatus.RUNNING));
        orphanedJobs.addAll(backupJobRepository.findAllByStatus(BackupStatus.PENDING));

        if (orphanedJobs.isEmpty()) {
            return;
        }

        log.warn("[BackupRecovery] Phát hiện {} job sao lưu bị treo/kẹt ở trạng thái RUNNING/PENDING do tắt server đột ngột. Đang xử lý dọn dẹp...", orphanedJobs.size());

        for (BackupJob job : orphanedJobs) {
            job.setStatus(BackupStatus.FAILED);
            job.setErrorMessage("Gián đoạn do server bị tắt máy/sập nguồn hoặc khởi động lại đột ngột.");
            job.setCompletedAt(LocalDateTime.now());
            backupJobRepository.save(job);

            try {
                backupStorageService.deleteTmpFile(job.getBackupId());
                backupStorageService.deleteBackupDirectory(job.getBackupId());
            } catch (Exception ex) {
                log.warn("[BackupRecovery] Không thể xóa file tạm cho job '{}': {}", job.getBackupId(), ex.getMessage());
            }
        }
        log.info("[BackupRecovery] Đã dọn dẹp xong {} job bị kẹt.", orphanedJobs.size());
    }

    /**
     * Kiểm tra xem trong thời gian server bị tắt máy, có bản sao lưu nào bị lỡ hẹn không:
     * - Nếu tính năng sao lưu đang bật (enabled = true):
     *   + Nếu theo chu kỳ phút (intervalMinutes) và thời gian trôi qua từ lần sao lưu thành công gần nhất >= interval.
     *   + Hoặc theo cron (ví dụ 02:00 sáng) mà thời điểm hẹn gần nhất trong quá khứ chưa có bản sao lưu thành công nào.
     * -> Kích hoạt sao lưu bù ngay lập tức trong background.
     */
    private void checkAndCatchUpMissedBackup() {
        Optional<BackupSetting> settingOpt = backupSettingRepository.findFirstByOrderByIdAsc();
        if (settingOpt.isEmpty()) {
            log.info("[BackupRecovery] Chưa có cấu hình sao lưu nào. Bỏ qua kiểm tra bù.");
            return;
        }

        BackupSetting setting = settingOpt.get();
        if (!Boolean.TRUE.equals(setting.getEnabled())) {
            log.info("[BackupRecovery] Tính năng tự động sao lưu đang TẮT. Bỏ qua kiểm tra bù.");
            return;
        }

        Optional<BackupJob> latestCompletedOpt = backupJobRepository
                .findFirstByStatusOrderByCompletedAtDesc(BackupStatus.COMPLETED);

        boolean needsCatchUp = false;
        String reason = "";

        Integer intervalMinutes = setting.getIntervalMinutes();
        String cron = (setting.getCronExpression() != null && !setting.getCronExpression().isBlank())
                ? setting.getCronExpression()
                : DEFAULT_CRON;

        if (latestCompletedOpt.isEmpty()) {
            // Chưa từng có bản sao lưu thành công nào trong hệ thống
            needsCatchUp = true;
            reason = "Chưa có bản sao lưu hoàn chỉnh nào trong hệ thống";
        } else {
            LocalDateTime lastCompletedTime = latestCompletedOpt.get().getCompletedAt();
            LocalDateTime now = LocalDateTime.now();

            // 1. Kiểm tra theo intervalMinutes (nếu có cấu hình và khác 1440 - hàng ngày)
            if (intervalMinutes != null && intervalMinutes > 0 && intervalMinutes < 1440) {
                long elapsedMinutes = Duration.between(lastCompletedTime, now).toMinutes();
                if (elapsedMinutes >= intervalMinutes) {
                    needsCatchUp = true;
                    reason = String.format("Chu kỳ sao lưu %d phút đã trôi qua %d phút trong thời gian tắt máy", intervalMinutes, elapsedMinutes);
                }
            } else {
                // 2. Kiểm tra theo biểu thức Cron (ví dụ 02:00 sáng hàng ngày)
                ZonedDateTime lastScheduled = getLastScheduledTime(cron, ZonedDateTime.now(ZONE));
                if (lastScheduled != null) {
                    LocalDateTime scheduledLocal = lastScheduled.toLocalDateTime();
                    if (lastCompletedTime.isBefore(scheduledLocal)) {
                        needsCatchUp = true;
                        reason = String.format("Đã bỏ lỡ mốc sao lưu định kỳ lúc %s trong thời gian tắt máy/sập nguồn", scheduledLocal);
                    }
                }
            }
        }

        if (needsCatchUp) {
            log.warn("[BackupRecovery] PHÁT HIỆN BỎ LỠ SAO LƯU (Lý do: {}). Đang kích hoạt tiến trình SAO LƯU BÙ (Catch-up Backup) ngay lập tức...", reason);
            backupService.triggerScheduledBackup("Sao lưu BÙ tự động sau sự cố sập nguồn / tắt máy (" + reason + ")");
        } else {
            log.info("[BackupRecovery] Hệ thống sao lưu hoàn toàn cập nhật. Không cần sao lưu bù.");
        }
    }

    /**
     * Tìm mốc thời gian gần nhất trong quá khứ mà cron lẽ ra phải chạy (<= now).
     */
    private ZonedDateTime getLastScheduledTime(String cronExpr, ZonedDateTime now) {
        if (cronExpr == null || cronExpr.isBlank() || now == null) {
            return null;
        }

        try {
            String normalizedCron = cronExpr.trim().replace('?', '*');
            CronExpression ce = CronExpression.parse(normalizedCron);

            // Quét từ 7 ngày trước đến hiện tại để tìm mốc cuối cùng <= now
            ZonedDateTime scanPointer = now.withZoneSameInstant(ZONE).minusDays(7);
            ZonedDateTime lastScheduled = null;

            while (true) {
                ZonedDateTime next = ce.next(scanPointer);
                if (next == null || next.isAfter(now)) {
                    break;
                }
                lastScheduled = next;
                scanPointer = next;
            }

            return lastScheduled;
        } catch (Exception e) {
            log.warn("[BackupRecovery] Không thể phân tích biểu thức cron '{}': {}", cronExpr, e.getMessage());
            return null;
        }
    }
}
