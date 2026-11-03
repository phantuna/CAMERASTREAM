package org.example.camerastream.modules.backup.service;

import org.example.camerastream.modules.backup.dto.BackupConfigDto;
import org.example.camerastream.modules.backup.dto.BackupResponse;

import java.util.List;

public interface IBackupService {

    /**
     * Kích hoạt sao lưu thủ công (Manual Backup).
     * Tạo bản ghi PENDING và kích hoạt worker chạy ngầm.
     */
    BackupResponse triggerBackup();

    /**
     * Kích hoạt sao lưu tự động định kỳ (Scheduled Backup).
     */
    boolean triggerScheduledBackup();

    /**
     * Kích hoạt sao lưu tự động với ghi chú tùy biến (ví dụ: Sao lưu bù sau sự cố sập nguồn).
     */
    boolean triggerScheduledBackup(String notes);

    /**
     * Lấy toàn bộ danh sách bản sao lưu trong hệ thống.
     */
    List<BackupResponse> getAllBackups();

    /**
     * Lấy chi tiết bản sao lưu theo ID.
     */
    BackupResponse getBackupDetails(String backupId);

    /**
     * Lấy bản sao lưu hoàn tất mới nhất.
     */
    BackupResponse getLatestCompletedBackup();

    /**
     * Hủy bản sao lưu đang trong tiến trình (PENDING / RUNNING).
     */
    void cancelBackup(String backupId);

    /**
     * Xóa vĩnh viễn một bản sao lưu khỏi hệ thống & ổ đĩa.
     */
    void deleteBackup(String backupId);

    /**
     * Lấy cấu hình sao lưu hiện tại.
     */
    BackupConfigDto getBackupConfig();

    /**
     * Cập nhật cấu hình sao lưu & thời gian lưu trữ.
     */
    void updateBackupConfig(BackupConfigDto configDto);
}
