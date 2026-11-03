package org.example.camerastream.modules.backup.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.backup.service.IBackupDownloadService;
import org.example.camerastream.modules.backup.service.IBackupStorageService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Path;

@Service
@Slf4j
@RequiredArgsConstructor
public class BackupDownloadServiceImpl implements IBackupDownloadService {

    private final IBackupStorageService backupStorageService;

    @Override
    public ResponseEntity<Resource> downloadSqlFile(String backupId) {
        Path sqlPath = backupStorageService.getSqlFilePath(backupId);
        File file = sqlPath != null ? sqlPath.toFile() : null;

        if (file == null || !file.exists()) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(file);
        String downloadFileName = "backup_" + backupId + ".sql.gz";

        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + downloadFileName + "\"");
        headers.add(HttpHeaders.ACCEPT_RANGES, "bytes");
        headers.add(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate");
        headers.add(HttpHeaders.PRAGMA, "no-cache");

        return ResponseEntity.ok()
                .headers(headers)
                .contentLength(file.length())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }
}
