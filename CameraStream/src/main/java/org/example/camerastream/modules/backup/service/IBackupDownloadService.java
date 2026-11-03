package org.example.camerastream.modules.backup.service;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;

public interface IBackupDownloadService {
    ResponseEntity<Resource> downloadSqlFile(String backupId);
}
