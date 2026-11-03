package org.example.camerastream.modules.backup.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.backup.service.IBackupRestoreService;
import org.example.camerastream.modules.backup.service.IBackupStorageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.sql.DataSource;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.zip.GZIPInputStream;

@Service
@Slf4j
@RequiredArgsConstructor
public class BackupRestoreServiceImpl implements IBackupRestoreService {

    private final IBackupStorageService backupStorageService;
    private final DataSource dataSource;
    private final SimpMessagingTemplate messagingTemplate;

    @Value("${backup.postgres.container-name:camerastream-postgres}")
    private String pgContainerName;

    @Value("${backup.postgres.db-name:camerastream_db}")
    private String dbName;

    @Value("${backup.postgres.username:postgres}")
    private String pgUser;

    @Value("${backup.postgres.password:postgres}")
    private String pgPassword;

    @Override
    public void restoreBackup(String backupId) {
        log.info("[Restore] Nhận yêu cầu khôi phục từ bản backup '{}'", backupId);

        Path sqlFilePath = backupStorageService.getSqlFilePath(backupId);
        if (sqlFilePath == null || !sqlFilePath.toFile().exists()) {
            throw new RuntimeException("Không tìm thấy file SQL cho bản backup: " + backupId);
        }
        if (sqlFilePath.toFile().length() == 0) {
            throw new RuntimeException("File SQL sao lưu rỗng (0 bytes) cho bản backup: " + backupId);
        }

        new Thread(() -> {
            try {
                log.info("[Restore] Bắt đầu giải nén và nạp SQL từ file: {}", sqlFilePath);

                try (InputStream rawStream = new BufferedInputStream(
                             new FileInputStream(sqlFilePath.toFile()), 8 * 1024 * 1024);
                     InputStream sqlStream = new GZIPInputStream(rawStream, 8 * 1024 * 1024)) {
                    executeRestoreWithFallbacks(sqlStream, "server-backup[" + backupId + "]");
                }

                log.info("[Restore] KHÔI PHỤC THÀNH CÔNG từ bản backup '{}'", backupId);
                sendRestoreEvent("RESTORE_COMPLETED", backupId, null);
            } catch (Exception e) {
                log.error("[Restore] Lỗi khôi phục backup '{}': {}", backupId, e.getMessage(), e);
                sendRestoreEvent("RESTORE_FAILED", backupId, e.getMessage());
            }
        }, "pg-restore-worker").start();
    }

    @Override
    public void restoreFromUpload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new RuntimeException("File SQL upload không được để trống.");
        }
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload.sql";
        log.info("[Restore-Upload] Nhận file: '{}' ({} bytes)", originalName, file.getSize());

        final byte[] sqlBytes;
        try {
            sqlBytes = file.getBytes();
        } catch (IOException e) {
            throw new RuntimeException("Không thể đọc file upload: " + e.getMessage());
        }

        if (sqlBytes.length == 0) {
            throw new RuntimeException("File upload rỗng (0 bytes).");
        }

        new Thread(() -> {
            try {
                String containerName = pgContainerName;
                log.info("[Restore-Upload] Container: '{}' | DB: '{}' | File: '{}' ({} MB)",
                        containerName, dbName, originalName, sqlBytes.length / (1024 * 1024));

                try (InputStream rawStream = new ByteArrayInputStream(sqlBytes);
                     InputStream sqlStream = isGzipStream(sqlBytes)
                             ? new GZIPInputStream(rawStream, 8 * 1024 * 1024)
                             : rawStream) {
                    executeRestoreWithFallbacks(sqlStream, "upload[" + originalName + "]");
                }

                log.info("[Restore-Upload] KHÔI PHỤC THÀNH CÔNG từ file upload '{}'", originalName);
                sendRestoreEvent("RESTORE_COMPLETED", originalName, null);
            } catch (Exception e) {
                log.error("[Restore-Upload] Lỗi khôi phục từ upload '{}': {}", originalName, e.getMessage(), e);
                sendRestoreEvent("RESTORE_FAILED", originalName, e.getMessage());
            }
        }, "pg-restore-upload-worker").start();
    }

    private boolean isGzipStream(byte[] bytes) {
        return bytes.length >= 2
                && (bytes[0] & 0xff) == 0x1f
                && (bytes[1] & 0xff) == 0x8b;
    }

    private void executeRestoreWithFallbacks(InputStream sqlStream, String label) throws Exception {
        // Lưu tạm file SQL giải nén để có thể retry qua các tier nếu cần
        File tempSql = File.createTempFile("restore_", ".sql");
        tempSql.deleteOnExit();

        try {
            try (OutputStream out = new BufferedOutputStream(new FileOutputStream(tempSql), 8 * 1024 * 1024)) {
                byte[] buf = new byte[64 * 1024];
                int r;
                while ((r = sqlStream.read(buf)) != -1) {
                    out.write(buf, 0, r);
                }
                out.flush();
            }

            // Tier 1: Thử qua Docker exec psql
            boolean dockerOk = false;
            try {
                dockerOk = tryDockerPsql(tempSql, label);
            } catch (Exception ex) {
                log.warn("[Restore:{}] Docker psql không khả dụng: {}", label, ex.getMessage());
            }
            if (dockerOk) return;

            // Tier 2: Thử qua Local psql CLI
            boolean localCliOk = false;
            try {
                localCliOk = tryLocalPsql(tempSql, label);
            } catch (Exception ex) {
                log.warn("[Restore:{}] Local psql CLI không khả dụng: {}", label, ex.getMessage());
            }
            if (localCliOk) return;

            // Tier 3: Fallback thuần JDBC ScriptUtils (Hoạt động 100% trong mọi môi trường)
            log.info("[Restore:{}] Sử dụng JDBC Script Runner fallback...", label);
            executeViaJdbc(tempSql, label);

        } finally {
            try {
                tempSql.delete();
            } catch (Exception ignored) {}
        }
    }

    private boolean tryDockerPsql(File sqlFile, String label) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(
                "docker", "exec",
                "-e", "PGPASSWORD=" + pgPassword,
                "-i", pgContainerName,
                "psql",
                "-U", pgUser,
                "-d", dbName,
                "--single-transaction",
                "-v", "ON_ERROR_STOP=1"
        );
        pb.redirectInput(sqlFile);

        Process process = pb.start();
        CompletableFuture<String> stderrFuture = CompletableFuture.supplyAsync(() -> {
            try (InputStream es = process.getErrorStream()) {
                return new String(es.readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException ex) {
                return "";
            }
        });

        int exitCode = process.waitFor();
        String stderr = stderrFuture.join();
        if (exitCode == 0) {
            log.info("[Restore:{}] Docker psql khôi phục thành công.", label);
            return true;
        } else {
            log.warn("[Restore:{}] Docker psql thoát với mã {}: {}", label, exitCode, stderr.substring(0, Math.min(200, stderr.length())));
            return false;
        }
    }

    private boolean tryLocalPsql(File sqlFile, String label) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(
                "psql",
                "-h", "localhost",
                "-p", "5432",
                "-U", pgUser,
                "-d", dbName,
                "--single-transaction",
                "-v", "ON_ERROR_STOP=1"
        );
        pb.environment().put("PGPASSWORD", pgPassword);
        pb.redirectInput(sqlFile);

        Process process = pb.start();
        CompletableFuture<String> stderrFuture = CompletableFuture.supplyAsync(() -> {
            try (InputStream es = process.getErrorStream()) {
                return new String(es.readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException ex) {
                return "";
            }
        });

        int exitCode = process.waitFor();
        String stderr = stderrFuture.join();
        if (exitCode == 0) {
            log.info("[Restore:{}] Local psql CLI khôi phục thành công.", label);
            return true;
        } else {
            log.warn("[Restore:{}] Local psql CLI thoát với mã {}: {}", label, exitCode, stderr.substring(0, Math.min(200, stderr.length())));
            return false;
        }
    }

    private void executeViaJdbc(File sqlFile, String label) throws Exception {
        try (Connection conn = dataSource.getConnection();
             InputStream fis = new FileInputStream(sqlFile)) {
            conn.setAutoCommit(false);
            try {
                ScriptUtils.executeSqlScript(
                        conn,
                        new EncodedResource(new InputStreamResource(fis), StandardCharsets.UTF_8),
                        false, // continueOnError
                        false, // ignoreFailedDrops
                        ScriptUtils.DEFAULT_COMMENT_PREFIX,
                        ScriptUtils.DEFAULT_STATEMENT_SEPARATOR,
                        ScriptUtils.DEFAULT_BLOCK_COMMENT_START_DELIMITER,
                        ScriptUtils.DEFAULT_BLOCK_COMMENT_END_DELIMITER
                );
                conn.commit();
                log.info("[Restore:{}] JDBC Script Runner đã nạp SQL thành công.", label);
            } catch (Exception ex) {
                conn.rollback();
                log.error("[Restore:{}] Lỗi khi chạy SQL qua JDBC, đã Rollback: {}", label, ex.getMessage());
                throw ex;
            }
        }
    }

    private void sendRestoreEvent(String eventType, String backupId, String error) {
        if (messagingTemplate != null) {
            try {
                Map<String, Object> event = new java.util.HashMap<>();
                event.put("eventType", eventType);
                event.put("backupId", backupId);
                event.put("timestamp", LocalDateTime.now().toString());
                if (error != null) {
                    event.put("error", error);
                }
                messagingTemplate.convertAndSend("/topic/events", (Object) event);
            } catch (Exception ex) {
                log.warn("[Restore] Lỗi gửi WebSocket event: {}", ex.getMessage());
            }
        }
    }
}
