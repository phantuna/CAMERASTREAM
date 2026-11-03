package org.example.camerastream.modules.backup.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.backup.dto.BackupConfigDto;
import org.example.camerastream.modules.backup.dto.BackupResponse;
import org.example.camerastream.modules.backup.service.IBackupDownloadService;
import org.example.camerastream.modules.backup.service.IBackupRestoreService;
import org.example.camerastream.modules.backup.service.IBackupService;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.example.camerastream.modules.eventhub.audit.service.IAuditLogService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/backups")
@RequiredArgsConstructor
@Slf4j
@RequirePermission("BACKUP_MANAGE")
public class BackupController {

    private final IBackupService backupService;
    private final IBackupDownloadService backupDownloadService;
    private final IBackupRestoreService backupRestoreService;
    private final IAuditLogService auditLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping
    public ApiResponse<Void> triggerManualBackup() {
        log.info("[BackupAPI] Nhận yêu cầu backup thủ công.");
        backupService.triggerBackup();
        auditLogService.record(AuditRecord.builder()
                .actionType("BACKUP")
                .targetEntity("BackupJob")
                .targetDisplay("Sao lưu CSDL thủ công")
                .reason("Kích hoạt tiến trình sao lưu CSDL thủ công")
                .success(true)
                .build());
        return ApiResponse.success("Đã kích hoạt tiến trình sao lưu. Hệ thống đang xử lý trong nền.", null);
    }

    @GetMapping
    public ApiResponse<List<BackupResponse>> getAllBackups() {
        return ApiResponse.success("Lấy danh sách bản sao lưu thành công", backupService.getAllBackups());
    }

    @GetMapping("/latest")
    public ApiResponse<BackupResponse> getLatestBackup() {
        return ApiResponse.success("Lấy bản sao lưu mới nhất thành công", backupService.getLatestCompletedBackup());
    }

    @GetMapping("/{backupId}")
    public ApiResponse<BackupResponse> getBackupDetails(@PathVariable String backupId) {
        return ApiResponse.success("Lấy chi tiết bản sao lưu thành công", backupService.getBackupDetails(backupId));
    }

    @GetMapping({"/{backupId}/download", "/download/{backupId}"})
    public ResponseEntity<Resource> downloadBackup(@PathVariable String backupId) {
        log.info("[BackupAPI] Yêu cầu tải về file backup '{}'", backupId);
        auditLogService.record(AuditRecord.builder()
                .actionType("EXPORT")
                .targetEntity("BackupJob")
                .targetDisplay(backupId)
                .reason("Tải xuống tệp sao lưu CSDL " + backupId)
                .success(true)
                .build());
        return backupDownloadService.downloadSqlFile(backupId);
    }

    /**
     * E8 (KỊCH BẢN §4 Block B3): Hủy tiến trình sao lưu đang PENDING / RUNNING.
     * Đặt cờ CANCELLED; worker kiểm tra cờ giữa các bước và dừng, không ghi COMPLETED.
     */
    @PostMapping("/{backupId}/cancel")
    public ApiResponse<Void> cancelBackup(@PathVariable String backupId) {
        log.info("[BackupAPI] Yêu cầu hủy tiến trình sao lưu '{}'", backupId);
        backupService.cancelBackup(backupId);
        auditLogService.record(AuditRecord.builder()
                .actionType("STATUS")
                .targetEntity("BackupJob")
                .targetDisplay(backupId)
                .reason("Hủy tiến trình sao lưu đang chạy " + backupId)
                .success(true)
                .build());
        return ApiResponse.success("Đã gửi lệnh hủy tiến trình sao lưu. Tiến trình sẽ dừng ở bước tiếp theo.", null);
    }

    @PostMapping("/restore")
    public ApiResponse<Void> restoreBackup(@RequestBody java.util.Map<String, String> body) {
        String backupId = body != null ? body.get("backupId") : null;
        if (backupId == null || backupId.trim().isEmpty()) {
            return ApiResponse.error(400, "Thiếu mã bản sao lưu (backupId)");
        }
        log.info("[BackupAPI] Nhận yêu cầu khôi phục từ backup '{}'", backupId);
        backupRestoreService.restoreBackup(backupId);
        auditLogService.record(AuditRecord.builder()
                .actionType("RESTORE")
                .targetEntity("BackupJob")
                .targetDisplay(backupId)
                .reason("Khôi phục CSDL từ bản sao lưu " + backupId)
                .success(true)
                .build());
        return ApiResponse.success("Đã khởi chạy tiến trình khôi phục CSDL. Theo dõi log hệ thống để biết kết quả.", null);
    }

    @PostMapping("/restore/upload")
    public ApiResponse<Void> restoreFromUpload(@RequestParam("file") MultipartFile file) {
        log.info("[BackupAPI] Nhận file upload để restore: '{}' ({} bytes)", file.getOriginalFilename(), file.getSize());
        backupRestoreService.restoreFromUpload(file);
        auditLogService.record(AuditRecord.builder()
                .actionType("RESTORE")
                .targetEntity("BackupJob")
                .targetDisplay(file.getOriginalFilename())
                .reason("Khôi phục CSDL từ tệp tải lên: " + file.getOriginalFilename() + " (" + file.getSize() + " bytes)")
                .success(true)
                .build());
        return ApiResponse.success("Đã nhận file SQL và khởi chạy tiến trình khôi phục trong nền. Theo dõi log để biết kết quả.", null);
    }

    @RequestMapping(value = {"/{backupId}", "/{backupId}/delete", "/delete/{backupId}"}, method = {RequestMethod.DELETE, RequestMethod.POST})
    public ApiResponse<Void> deleteBackup(@PathVariable String backupId) {
        log.info("[BackupAPI] Yêu cầu xóa backup '{}'", backupId);
        backupService.deleteBackup(backupId);
        auditLogService.record(AuditRecord.builder()
                .actionType("DELETE")
                .targetEntity("BackupJob")
                .targetDisplay(backupId)
                .reason("Xóa bản sao lưu CSDL " + backupId)
                .success(true)
                .build());
        return ApiResponse.success("Xóa bản sao lưu thành công", null);
    }

    @GetMapping("/config")
    public ApiResponse<BackupConfigDto> getBackupConfig() {
        return ApiResponse.success("Lấy cấu hình sao lưu thành công", backupService.getBackupConfig());
    }

    @PostMapping("/config")
    public ApiResponse<Void> updateBackupConfig(@RequestBody BackupConfigDto configDto) {
        BackupConfigDto oldCfg = null;
        try {
            oldCfg = backupService.getBackupConfig();
        } catch (Exception ignored) {
        }
        backupService.updateBackupConfig(configDto);

        try {
            Map<String, Object> oldData = new LinkedHashMap<>();
            if (oldCfg != null) {
                oldData.put("cronExpression", oldCfg.getCronExpression());
                oldData.put("intervalMinutes", oldCfg.getIntervalMinutes());
                oldData.put("maxRetainBackups", oldCfg.getMaxRetainBackups());
                oldData.put("retentionDays", oldCfg.getRetentionDays());
                oldData.put("storagePath", oldCfg.getStoragePath());
            }
            Map<String, Object> newData = new LinkedHashMap<>();
            if (configDto != null) {
                newData.put("cronExpression", configDto.getCronExpression());
                newData.put("intervalMinutes", configDto.getIntervalMinutes());
                newData.put("maxRetainBackups", configDto.getMaxRetainBackups());
                newData.put("retentionDays", configDto.getRetentionDays());
                newData.put("storagePath", configDto.getStoragePath());
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("note", "Cập nhật cấu hình lịch sao lưu tự động");
            if (!oldData.isEmpty()) payload.put("oldData", oldData);
            if (!newData.isEmpty()) payload.put("newData", newData);
            auditLogService.record(AuditRecord.builder()
                    .actionType("UPDATE")
                    .targetEntity("BackupSetting")
                    .targetDisplay("Cấu hình Sao lưu tự động")
                    .reason(objectMapper.writeValueAsString(payload))
                    .success(true)
                    .build());
        } catch (Exception ignored) {
        }

        return ApiResponse.success("Cập nhật cấu hình sao lưu thành công", null);
    }
}
