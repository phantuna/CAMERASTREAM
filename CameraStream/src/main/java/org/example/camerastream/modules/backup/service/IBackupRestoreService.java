package org.example.camerastream.modules.backup.service;

import org.springframework.web.multipart.MultipartFile;

public interface IBackupRestoreService {
    void restoreBackup(String backupId);
    void restoreFromUpload(MultipartFile file);
}
