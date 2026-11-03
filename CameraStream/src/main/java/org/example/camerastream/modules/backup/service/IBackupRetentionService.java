package org.example.camerastream.modules.backup.service;

public interface IBackupRetentionService {
    void purgeOldBackups();
    void cleanupOldBackups();
}
