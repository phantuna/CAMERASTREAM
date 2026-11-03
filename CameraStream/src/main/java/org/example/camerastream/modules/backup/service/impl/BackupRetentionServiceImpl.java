package org.example.camerastream.modules.backup.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.backup.entity.BackupJob;
import org.example.camerastream.modules.backup.repository.BackupJobRepository;
import org.example.camerastream.modules.backup.repository.BackupSettingRepository;
import org.example.camerastream.modules.backup.service.IBackupRetentionService;
import org.example.camerastream.modules.backup.service.IBackupStorageService;
import org.example.camerastream.modules.backup.enums.BackupStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@Slf4j
@RequiredArgsConstructor
public class BackupRetentionServiceImpl implements IBackupRetentionService {

    private final BackupJobRepository backupJobRepository;
    private final IBackupStorageService backupStorageService;
    private final BackupSettingRepository backupSettingRepository;

    @Value("${backup.retention.days:7}")
    private int defaultRetentionDays;

    @Value("${backup.retention.max-backups:10}")
    private int defaultMaxRetainBackups;

    @Override
    public void purgeOldBackups() {
        cleanupOldBackups();
    }

    @Override
    public void cleanupOldBackups() {
        int maxFiles = backupSettingRepository.findFirstByOrderByIdAsc()
                .map(s -> s.getMaxRetainBackups() != null && s.getMaxRetainBackups() > 0 ? s.getMaxRetainBackups() : defaultMaxRetainBackups)
                .orElse(defaultMaxRetainBackups);

        int retentionDays = backupSettingRepository.findFirstByOrderByIdAsc()
                .map(s -> s.getRetentionDays() != null && s.getRetentionDays() > 0 ? s.getRetentionDays() : defaultRetentionDays)
                .orElse(defaultRetentionDays);

        log.info("[BackupRetention] Bắt đầu dọn dẹp bản sao lưu cũ (maxFiles={}, retentionDays={})...", maxFiles, retentionDays);

        LocalDateTime cutoffDate = LocalDateTime.now().minusDays(retentionDays);
        List<BackupJob> completedJobs = backupJobRepository.findByStatusOrderByCompletedAtDesc(BackupStatus.COMPLETED);

        Set<BackupJob> jobsToDelete = new HashSet<>();

        if (completedJobs.size() > maxFiles) {
            List<BackupJob> excessJobs = completedJobs.subList(maxFiles, completedJobs.size());
            jobsToDelete.addAll(excessJobs);
            log.info("[BackupRetention] Phát hiện {} bản sao lưu vượt quá giới hạn {} file.", excessJobs.size(), maxFiles);
        }

        for (BackupJob job : completedJobs) {
            if (job.getCompletedAt() != null && job.getCompletedAt().isBefore(cutoffDate)) {
                jobsToDelete.add(job);
            }
        }

        List<BackupJob> failedJobs = backupJobRepository.findByStatus(BackupStatus.FAILED);
        LocalDateTime failedCutoff = LocalDateTime.now().minusDays(3);
        for (BackupJob failedJob : failedJobs) {
            if (failedJob.getStartedAt() != null && failedJob.getStartedAt().isBefore(failedCutoff)) {
                jobsToDelete.add(failedJob);
            }
        }

        for (BackupJob job : jobsToDelete) {
            try {
                log.info("[BackupRetention] Xóa bản sao lưu ID: {} (status={}, size={})",
                        job.getBackupId(), job.getStatus(), job.getTotalSize());
                backupStorageService.deleteBackupDirectory(job.getBackupId());
                backupJobRepository.delete(job);
            } catch (Exception ex) {
                log.error("[BackupRetention] Lỗi khi xóa bản sao lưu {}: {}", job.getBackupId(), ex.getMessage());
            }
        }

        log.info("[BackupRetention] Hoàn thành dọn dẹp. Đã xóa tổng cộng {} bản sao lưu cũ.", jobsToDelete.size());
    }
}
