package org.example.camerastream.modules.backup.scheduler;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.backup.repository.BackupSettingRepository;
import org.example.camerastream.modules.backup.service.IBackupService;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Component;

import java.util.concurrent.ScheduledFuture;

@Component
@Slf4j
@RequiredArgsConstructor
public class BackupScheduler {

    private final IBackupService backupService;
    private final BackupSettingRepository backupSettingRepository;
    private final TaskScheduler taskScheduler;

    private static final String DEFAULT_CRON = "0 0 2 * * *";
    private ScheduledFuture<?> scheduledTask;

    @PostConstruct
    public void init() {
        reloadSchedule();
    }

    public void reloadSchedule() {
        if (scheduledTask != null) {
            scheduledTask.cancel(false);
        }

        String cron = backupSettingRepository.findFirstByOrderByIdAsc()
                .map(s -> s.getCronExpression())
                .filter(c -> c != null && !c.isBlank())
                .orElse(DEFAULT_CRON);

        log.info("[BackupScheduler] Lên lịch backup với cron: '{}'", cron);

        try {
            scheduledTask = taskScheduler.schedule(
                    () -> {
                        log.info("[BackupScheduler] Cron kích hoạt. Thực thi backup theo lịch...");
                        try {
                            backupService.triggerScheduledBackup("Sao lưu định kỳ tự động");
                        } catch (Exception e) {
                            log.error("[BackupScheduler] Lỗi khi thực hiện backup theo lịch: {}", e.getMessage(), e);
                        }
                    },
                    new CronTrigger(cron)
            );
        } catch (Exception e) {
            log.error("[BackupScheduler] Cron expression không hợp lệ '{}': {}", cron, e.getMessage());
        }
    }
}
