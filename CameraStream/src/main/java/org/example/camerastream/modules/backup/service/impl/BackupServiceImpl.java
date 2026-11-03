package org.example.camerastream.modules.backup.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.backup.dto.BackupConfigDto;
import org.example.camerastream.modules.backup.dto.BackupResponse;
import org.example.camerastream.modules.backup.entity.BackupJob;
import org.example.camerastream.modules.backup.entity.BackupSetting;
import org.example.camerastream.modules.backup.enums.BackupStatus;
import org.example.camerastream.modules.backup.enums.BackupType;
import org.example.camerastream.modules.backup.repository.BackupJobRepository;
import org.example.camerastream.modules.backup.repository.BackupSettingRepository;
import org.example.camerastream.modules.backup.service.IBackupService;
import org.example.camerastream.modules.backup.service.IBackupStorageService;
import org.example.camerastream.modules.backup.worker.BackupJobWorker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class BackupServiceImpl implements IBackupService {

    private final BackupJobRepository backupJobRepository;
    private final BackupSettingRepository backupSettingRepository;
    private final IBackupStorageService backupStorageService;
    private final BackupJobWorker backupJobWorker;

    @Value("${backup.storage.path:D:/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/data/backup}")
    private String defaultStoragePath;

    @Value("${backup.retention.max-backups:10}")
    private int defaultMaxRetainBackups;

    @Value("${backup.retention.days:7}")
    private int defaultRetentionDays;

    @Value("${backup.schedule.cron:0 0 2 * * *}")
    private String defaultCron;

    @Value("${backup.schedule.enabled:true}")
    private boolean defaultScheduleEnabled;

    @Override
    @Transactional
    public BackupResponse triggerBackup() {
        if (backupJobRepository.existsByStatus(BackupStatus.RUNNING)) {
            throw new IllegalStateException("Một tiến trình sao lưu khác đang chạy trong hệ thống. Vui lòng đợi hoàn tất.");
        }

        String backupId = ZonedDateTime.now(ZoneId.of("Asia/Bangkok"))
                .format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));

        BackupJob job = BackupJob.builder()
                .backupId(backupId)
                .type(BackupType.FULL)
                .status(BackupStatus.PENDING)
                .createdBy("MANUAL")
                .notes("Sao lưu CSDL toàn diện thủ công")
                .build();

        backupJobRepository.saveAndFlush(job);
        log.info("[BackupService] Đã tạo tiến trình sao lưu thủ công '{}'. Bắt đầu giao việc cho worker...", backupId);

        backupJobWorker.submitBackupJob(job);
        return mapToDto(job);
    }

    @Override
    @Transactional
    public boolean triggerScheduledBackup() {
        return triggerScheduledBackup("Sao lưu CSDL định kỳ tự động");
    }

    @Override
    @Transactional
    public boolean triggerScheduledBackup(String notes) {
        if (backupJobRepository.existsByStatus(BackupStatus.RUNNING)) {
            log.warn("[BackupService] Bỏ qua lịch sao lưu tự động vì đang có tiến trình sao lưu khác hoạt động.");
            return false;
        }

        String backupId = ZonedDateTime.now(ZoneId.of("Asia/Bangkok"))
                .format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));

        BackupJob job = BackupJob.builder()
                .backupId(backupId)
                .type(BackupType.SCHEDULED)
                .status(BackupStatus.PENDING)
                .createdBy("SCHEDULER")
                .notes(notes != null ? notes : "Sao lưu CSDL định kỳ tự động")
                .build();

        backupJobRepository.saveAndFlush(job);
        log.info("[BackupService] Đã tạo tiến trình sao lưu tự động '{}' ({}). Giao việc cho worker...", backupId, job.getNotes());

        backupJobWorker.submitBackupJob(job);
        return true;
    }

    @Override
    public List<BackupResponse> getAllBackups() {
        return backupJobRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::mapToDto)
                .toList();
    }

    @Override
    public BackupResponse getBackupDetails(String backupId) {
        BackupJob job = backupJobRepository.findByBackupId(backupId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy bản sao lưu với mã: " + backupId));
        return mapToDto(job);
    }

    @Override
    public BackupResponse getLatestCompletedBackup() {
        return backupJobRepository.findFirstByStatusOrderByCompletedAtDesc(BackupStatus.COMPLETED)
                .map(this::mapToDto)
                .orElse(null);
    }

    @Override
    @Transactional
    public void cancelBackup(String backupId) {
        BackupJob job = backupJobRepository.findByBackupId(backupId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy bản sao lưu: " + backupId));

        if (job.getStatus() == BackupStatus.PENDING || job.getStatus() == BackupStatus.RUNNING) {
            job.setStatus(BackupStatus.CANCELLED);
            job.setErrorMessage("Tiến trình đã bị người quản trị hủy bỏ.");
            backupJobRepository.saveAndFlush(job);
            backupStorageService.deleteTmpFile(backupId);
            log.info("[BackupService] Đã hủy tiến trình sao lưu '{}'", backupId);
        }
    }

    @Override
    @Transactional
    public void deleteBackup(String backupId) {
        BackupJob job = backupJobRepository.findByBackupId(backupId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy bản sao lưu: " + backupId));

        backupStorageService.deleteBackupDirectory(backupId);
        backupJobRepository.delete(job);
        log.info("[BackupService] Đã xóa hoàn toàn bản sao lưu '{}' khỏi CSDL và ổ đĩa.", backupId);
    }

    @Override
    public BackupConfigDto getBackupConfig() {
        BackupSetting setting = backupSettingRepository.findFirstByOrderByIdAsc().orElse(null);
        if (setting == null) {
            return BackupConfigDto.builder()
                    .cronExpression(defaultCron)
                    .intervalMinutes(1440)
                    .maxRetainBackups(defaultMaxRetainBackups)
                    .retentionDays(defaultRetentionDays)
                    .enabled(defaultScheduleEnabled)
                    .storagePath(defaultStoragePath)
                    .autoCleanup(true)
                    .build();
        }

        return BackupConfigDto.builder()
                .cronExpression(setting.getCronExpression() != null ? setting.getCronExpression() : defaultCron)
                .intervalMinutes(setting.getIntervalMinutes() != null ? setting.getIntervalMinutes() : 1440)
                .maxRetainBackups(setting.getMaxRetainBackups() != null ? setting.getMaxRetainBackups() : defaultMaxRetainBackups)
                .retentionDays(setting.getRetentionDays() != null ? setting.getRetentionDays() : defaultRetentionDays)
                .enabled(setting.getEnabled() != null ? setting.getEnabled() : defaultScheduleEnabled)
                .storagePath(setting.getStoragePath() != null ? setting.getStoragePath() : defaultStoragePath)
                .autoCleanup(setting.getAutoCleanup() != null ? setting.getAutoCleanup() : true)
                .build();
    }

    @Override
    @Transactional
    public void updateBackupConfig(BackupConfigDto configDto) {
        BackupSetting setting = backupSettingRepository.findFirstByOrderByIdAsc().orElseGet(BackupSetting::new);

        if (configDto.getIntervalMinutes() != null) {
            setting.setIntervalMinutes(configDto.getIntervalMinutes());
            if (configDto.getCronExpression() == null || configDto.getCronExpression().isBlank()) {
                setting.setCronExpression(deriveCronFromMinutes(configDto.getIntervalMinutes()));
            }
        }
        if (configDto.getCronExpression() != null && !configDto.getCronExpression().isBlank()) {
            setting.setCronExpression(configDto.getCronExpression());
        }
        if (configDto.getMaxRetainBackups() != null) setting.setMaxRetainBackups(configDto.getMaxRetainBackups());
        if (configDto.getRetentionDays() != null) setting.setRetentionDays(configDto.getRetentionDays());
        if (configDto.getEnabled() != null) setting.setEnabled(configDto.getEnabled());
        if (configDto.getStoragePath() != null) setting.setStoragePath(configDto.getStoragePath());
        if (configDto.getAutoCleanup() != null) setting.setAutoCleanup(configDto.getAutoCleanup());

        backupSettingRepository.save(setting);
        log.info("[BackupService] Cập nhật cấu hình sao lưu CSDL thành công: intervalMinutes={}, cron={}, retainBackups={}",
                setting.getIntervalMinutes(), setting.getCronExpression(), setting.getMaxRetainBackups());
    }

    private String deriveCronFromMinutes(int minutes) {
        if (minutes <= 0) return "0 0 2 * * *";
        if (minutes == 1440) return "0 0 2 * * *"; // 02:00 sáng hàng ngày
        if (minutes < 60) {
            return String.format("0 */%d * * * *", minutes);
        }
        if (minutes % 60 == 0) {
            int hours = minutes / 60;
            if (hours < 24) {
                return String.format("0 0 */%d * * *", hours);
            }
        }
        return "0 0 2 * * *";
    }

    private BackupResponse mapToDto(BackupJob job) {
        String formattedSize = null;
        if (job.getTotalSize() != null && job.getTotalSize() > 0) {
            long size = job.getTotalSize();
            if (size < 1024) {
                formattedSize = size + " B";
            } else if (size < 1024 * 1024) {
                formattedSize = String.format("%.2f KB", size / 1024.0);
            } else if (size < 1024 * 1024 * 1024) {
                formattedSize = String.format("%.2f MB", size / (1024.0 * 1024.0));
            } else {
                formattedSize = String.format("%.2f GB", size / (1024.0 * 1024.0 * 1024.0));
            }
        }

        return BackupResponse.builder()
                .backupId(job.getBackupId())
                .type(job.getType())
                .status(job.getStatus())
                .totalSize(job.getTotalSize())
                .fileName(job.getFileName())
                .formattedSize(formattedSize)
                .checksumSha256(job.getChecksumSha256())
                .startedAt(job.getStartedAt())
                .completedAt(job.getCompletedAt())
                .createdAt(job.getCreatedAt())
                .durationMs(job.getDurationMs())
                .createdBy(job.getCreatedBy())
                .build();
    }
}