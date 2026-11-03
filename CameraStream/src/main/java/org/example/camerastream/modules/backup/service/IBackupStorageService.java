package org.example.camerastream.modules.backup.service;

import org.example.camerastream.modules.backup.dto.ManifestDTO;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Optional;

public interface IBackupStorageService {

    /**
     * Đường dẫn thư mục chứa toàn bộ file của bản sao lưu.
     * Cấu trúc: {backup.storage.path}/full/{backupId}/
     */
    String getBackupDirectoryPath(String backupId);

    /**
     * Đường dẫn file backup cuối cùng (đã được verify và atomic rename).
     * Cấu trúc: {backupId}/backup.sql.gz
     * Chỉ tồn tại khi backup HOÀN TẤT thành công.
     */
    Path getSqlFilePath(String backupId);

    /**
     * Đường dẫn file tạm thời trong quá trình backup (Atomic Write Pattern).
     * Cấu trúc: {backupId}/backup.sql.gz.tmp
     */
    Path getTmpFilePath(String backupId);

    /**
     * Atomic rename: backup.sql.gz.tmp -> backup.sql.gz
     */
    void promoteTmpToFinal(String backupId) throws IOException;

    /**
     * Xóa file .tmp nếu tồn tại.
     */
    void deleteTmpFile(String backupId);

    /**
     * Tạo thư mục chứa backup nếu chưa tồn tại.
     */
    void createBackupDirectory(String backupId);

    void writeManifest(String backupId, ManifestDTO manifestDTO);

    Optional<ManifestDTO> readManifest(String backupId);

    String calculateChecksum(File file);

    /**
     * Xóa toàn bộ thư mục và các file của bản sao lưu.
     */
    void deleteBackupDirectory(String backupId);

    /**
     * Lấy dung lượng còn trống của ổ đĩa lưu trữ (bytes).
     */
    long getAvailableStorageSpace();
}
