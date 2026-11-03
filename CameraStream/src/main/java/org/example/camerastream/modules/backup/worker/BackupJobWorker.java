package org.example.camerastream.modules.backup.worker;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.backup.dto.ManifestDTO;
import org.example.camerastream.modules.backup.entity.BackupJob;
import org.example.camerastream.modules.backup.enums.BackupStatus;
import org.example.camerastream.modules.backup.repository.BackupJobRepository;
import org.example.camerastream.modules.backup.service.IBackupRetentionService;
import org.example.camerastream.modules.backup.service.IBackupStorageService;
import org.example.camerastream.modules.eventhub.dto.SystemEventDto;
import org.example.camerastream.modules.eventhub.entity.EventSeverity;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.zip.Deflater;
import java.util.zip.GZIPOutputStream;

@Component
@Slf4j
public class BackupJobWorker {

    private final BackupJobRepository backupJobRepository;
    private final IBackupStorageService backupStorageService;
    private final IBackupRetentionService backupRetentionService;
    private final DataSource dataSource;
    private final Executor backupExecutor;
    private final SimpMessagingTemplate messagingTemplate;

    public BackupJobWorker(
            BackupJobRepository backupJobRepository,
            IBackupStorageService backupStorageService,
            IBackupRetentionService backupRetentionService,
            DataSource dataSource,
            @Qualifier("backupRecoveryExecutor") Executor backupExecutor,
            SimpMessagingTemplate messagingTemplate) {
        this.backupJobRepository = backupJobRepository;
        this.backupStorageService = backupStorageService;
        this.backupRetentionService = backupRetentionService;
        this.dataSource = dataSource;
        this.backupExecutor = backupExecutor;
        this.messagingTemplate = messagingTemplate;
    }

    @Value("${backup.postgres.container-name:camerastream-postgres}")
    private String pgContainerName;

    @Value("${backup.postgres.db-name:camerastream_db}")
    private String dbName;

    @Value("${backup.postgres.username:postgres}")
    private String pgUser;

    @Value("${backup.postgres.password:postgres}")
    private String pgPassword;

    @Value("${backup.stream.lock-wait-timeout-ms:30000}")
    private long lockWaitTimeoutMs;

    public void submitBackupJob(BackupJob job) {
        backupExecutor.execute(() -> executeBackup(job));
    }

    public void executeBackup(BackupJob job) {
        job.setStatus(BackupStatus.RUNNING);
        job.setStartedAt(LocalDateTime.now());
        backupJobRepository.saveAndFlush(job);

        final String backupId = job.getBackupId();
        final long startEpoch = System.currentTimeMillis();
        log.info("[BackupWorker:{}] Bắt đầu tiến trình sao lưu CSDL...", backupId);

        try {
            // E8/B3: Kiểm tra cờ hủy trước khi bắt đầu dump (cancel đặt cờ giữa các bước)
            if (isCancelled(backupId)) {
                log.info("[BackupWorker:{}] Đã nhận cờ HỦY, bỏ qua tiến trình sao lưu.", backupId);
                return;
            }

            backupStorageService.createBackupDirectory(backupId);
            Path tmpFilePath = backupStorageService.getTmpFilePath(backupId);

            boolean dumpedViaCli = tryDumpViaCli(backupId, tmpFilePath);
            List<String> dumpedTables = new ArrayList<>();
            long totalRowsCount = 0;

            if (!dumpedViaCli) {
                if (isCancelled(backupId)) {
                    log.info("[BackupWorker:{}] Đã nhận cờ HỦY (trước khi fallback JDBC), dừng tiến trình.", backupId);
                    backupStorageService.deleteTmpFile(backupId);
                    return;
                }
                try {
                    Files.deleteIfExists(tmpFilePath);
                } catch (Exception ignored) {}
                log.info("[BackupWorker:{}] Sử dụng JDBC Streaming Fallback Dumper...", backupId);
                dumpedTables = dumpViaJdbc(tmpFilePath);
            }

            // Kiểm tra cờ HỦY trước khi ghi kết quả (tránh ghi COMPLETED sau khi đã hủy)
            if (isCancelled(backupId)) {
                log.info("[BackupWorker:{}] Đã nhận cờ HỦY (sau khi dump), không ghi COMPLETED. Dọn file tạm.", backupId);
                backupStorageService.deleteTmpFile(backupId);
                return;
            }

            File tmpFile = tmpFilePath.toFile();
            if (!tmpFile.exists() || tmpFile.length() == 0) {
                throw new RuntimeException("File sao lưu rỗng (0 bytes), tiến trình thất bại.");
            }

            // Atomic rename: backup.sql.gz.tmp -> backup.sql.gz
            backupStorageService.promoteTmpToFinal(backupId);
            Path finalSqlPath = backupStorageService.getSqlFilePath(backupId);
            File finalFile = finalSqlPath.toFile();

            String checksum = backupStorageService.calculateChecksum(finalFile);
            long durationMs = System.currentTimeMillis() - startEpoch;

            // Ghi file manifest.json
            ManifestDTO manifest = ManifestDTO.builder()
                    .backupId(backupId)
                    .databaseName(dbName)
                    .version("1.0")
                    .fileSizeBytes(finalFile.length())
                    .checksumSha256(checksum)
                    .createdAt(LocalDateTime.now().toString())
                    .compression("GZIP")
                    .includedTables(dumpedTables.isEmpty() ? List.of("ALL_TABLES") : dumpedTables)
                    .totalRows(totalRowsCount)
                    .build();
            backupStorageService.writeManifest(backupId, manifest);

            job.setStatus(BackupStatus.COMPLETED);
            job.setCompletedAt(LocalDateTime.now());
            job.setTotalSize(finalFile.length());
            job.setFileName(finalFile.getName());
            job.setChecksumSha256(checksum);
            job.setDurationMs(durationMs);
            job.setErrorMessage(null);
            backupJobRepository.saveAndFlush(job);

            log.info("[BackupWorker:{}] Sao lưu HOÀN TẤT thành công: {} bytes, SHA-256: {}, thời gian: {}ms",
                    backupId, finalFile.length(), checksum, durationMs);

            // Gửi thông báo WebSocket tới FE
            if (messagingTemplate != null) {
                try {
                    Map<String, Object> event = Map.of(
                            "eventType", "BACKUP_COMPLETED",
                            "backupId", backupId,
                            "fileSizeBytes", finalFile.length(),
                            "timestamp", LocalDateTime.now().toString()
                    );
                    messagingTemplate.convertAndSend("/topic/events", (Object) event);
                } catch (Exception ex) {
                    log.warn("[BackupWorker:{}] Gửi WebSocket event thất bại: {}", backupId, ex.getMessage());
                }
            }

            // Tự động dọn dẹp các bản backup quá hạn
            backupRetentionService.purgeOldBackups();

        } catch (Exception e) {
            log.error("[BackupWorker:{}] Sao lưu THẤT BẠI: {}", backupId, e.getMessage(), e);
            backupStorageService.deleteTmpFile(backupId);

            job.setStatus(BackupStatus.FAILED);
            job.setCompletedAt(LocalDateTime.now());
            job.setDurationMs(System.currentTimeMillis() - startEpoch);
            job.setErrorMessage(e.getMessage());
            backupJobRepository.saveAndFlush(job);

            if (messagingTemplate != null) {
                try {
                    java.util.Map<String, Object> event = java.util.Map.of(
                            "eventType", "BACKUP_FAILED",
                            "backupId", backupId,
                            "error", e.getMessage() != null ? e.getMessage() : "Unknown error",
                            "timestamp", LocalDateTime.now().toString()
                    );
                    messagingTemplate.convertAndSend("/topic/events", (Object) event);
                } catch (Exception ex) {
                    log.warn("[BackupWorker:{}] Gửi WebSocket event thất bại: {}", backupId, ex.getMessage());
                }
            }
        }
    }

    /**
     * E8/B3: Đọc lại status từ DB để kiểm tra cờ HỦY giữa các bước.
     * cancelBackup() đặt CANCELLED + saveAndFlush, nên đọc mới sẽ thấy cờ.
     */
    private boolean isCancelled(String backupId) {
        try {
            return backupJobRepository.findByBackupId(backupId)
                    .map(j -> j.getStatus() == BackupStatus.CANCELLED)
                    .orElse(false);
        } catch (Exception ex) {
            log.warn("[BackupWorker:{}] Không thể đọc cờ hủy ({}), coi như chưa hủy.", backupId, ex.getMessage());
            return false;
        }
    }

    /**
     * Thử dump bằng CLI pg_dump (thông qua docker exec hoặc pg_dump trực tiếp).
     */
    private boolean tryDumpViaCli(String backupId, Path tmpFilePath) {
        ProcessBuilder pb = null;
        try {
            // Cách 1: Thử gọi docker exec camerastream-postgres pg_dump
            pb = new ProcessBuilder(
                    "docker", "exec",
                    "-e", "PGPASSWORD=" + pgPassword,
                    "-e", "PGCLIENTENCODING=UTF8",
                    pgContainerName,
                    "pg_dump",
                    "-U", pgUser,
                    "--clean", "--if-exists",
                    "--encoding=UTF8",
                    "--lock-wait-timeout=" + lockWaitTimeoutMs,
                    "-d", dbName
            );

            Process process = pb.start();
            try {
                process.getOutputStream().close();
            } catch (IOException ignored) {}

            try (InputStream pgOut = new BufferedInputStream(process.getInputStream(), 1024 * 1024);
                 GZIPOutputStream gzipOut = new GZIPOutputStream(Files.newOutputStream(tmpFilePath)) {{
                     def.setLevel(Deflater.BEST_SPEED);
                 }};
                 OutputStream fileOut = new BufferedOutputStream(gzipOut, 2 * 1024 * 1024)) {

                byte[] buffer = new byte[64 * 1024];
                int bytesRead;
                long total = 0;
                while ((bytesRead = pgOut.read(buffer)) != -1) {
                    fileOut.write(buffer, 0, bytesRead);
                    total += bytesRead;
                }
                fileOut.flush();

                boolean finished = process.waitFor(3, TimeUnit.SECONDS);
                if (finished && process.exitValue() == 0 && total > 0) {
                    log.info("[BackupWorker:{}] pg_dump qua Docker thành công, tổng dữ liệu raw: {} bytes", backupId, total);
                    return true;
                }
                if (!finished) {
                    process.destroyForcibly();
                }
            }
        } catch (Exception ex) {
            log.warn("[BackupWorker:{}] Docker pg_dump không khả dụng ({}). Thử CLI cục bộ...", backupId, ex.getMessage());
        }

        // Cách 2: Thử gọi pg_dump CLI cài trực tiếp trên máy chủ
        try {
            pb = new ProcessBuilder(
                    "pg_dump",
                    "-h", "localhost",
                    "-p", "5432",
                    "-U", pgUser,
                    "-d", dbName,
                    "--clean", "--if-exists",
                    "--encoding=UTF8"
            );
            pb.environment().put("PGPASSWORD", pgPassword);

            Process process = pb.start();
            try {
                process.getOutputStream().close();
            } catch (IOException ignored) {}

            try (InputStream pgOut = new BufferedInputStream(process.getInputStream(), 1024 * 1024);
                 GZIPOutputStream gzipOut = new GZIPOutputStream(Files.newOutputStream(tmpFilePath)) {{
                     def.setLevel(Deflater.BEST_SPEED);
                 }};
                 OutputStream fileOut = new BufferedOutputStream(gzipOut, 2 * 1024 * 1024)) {

                byte[] buffer = new byte[64 * 1024];
                int bytesRead;
                long total = 0;
                while ((bytesRead = pgOut.read(buffer)) != -1) {
                    fileOut.write(buffer, 0, bytesRead);
                    total += bytesRead;
                }
                fileOut.flush();

                boolean finished = process.waitFor(3, TimeUnit.SECONDS);
                if (finished && process.exitValue() == 0 && total > 0) {
                    log.info("[BackupWorker:{}] Local pg_dump thành công: {} bytes", backupId, total);
                    return true;
                }
                if (!finished) {
                    process.destroyForcibly();
                }
            }
        } catch (Exception ex) {
            log.warn("[BackupWorker:{}] Local pg_dump không khả dụng ({})", backupId, ex.getMessage());
        }

        return false;
    }

    /**
     * Dumper thuần JDBC: Đọc schema DDL và toàn bộ rows của các bảng trong CSDL
     * Nén trực tiếp vào stream GZIP. Đảm bảo hoạt động 100% trong mọi môi trường Windows/Docker/Linux.
     */
    private List<String> dumpViaJdbc(Path tmpFilePath) throws Exception {
        List<String> dumpedTables = new ArrayList<>();

        try (GZIPOutputStream gzipOut = new GZIPOutputStream(Files.newOutputStream(tmpFilePath)) {{
            def.setLevel(Deflater.BEST_SPEED);
        }};
             BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(gzipOut, StandardCharsets.UTF_8), 1024 * 1024);
             Connection conn = dataSource.getConnection()) {

            writer.write("-- =========================================================\n");
            writer.write("-- CameraStream PostgreSQL Database Dump (HPticket Architecture)\n");
            writer.write("-- Generated: " + LocalDateTime.now() + "\n");
            writer.write("-- =========================================================\n\n");
            writer.write("SET statement_timeout = 0;\n");
            writer.write("SET client_encoding = 'UTF8';\n\n");

            DatabaseMetaData meta = conn.getMetaData();
            List<String> tables = new ArrayList<>();

            try (ResultSet rs = meta.getTables(null, "public", "%", new String[]{"TABLE"})) {
                while (rs.next()) {
                    String tableName = rs.getString("TABLE_NAME");
                    // Bỏ qua flyway history nếu có
                    if (!tableName.equalsIgnoreCase("flyway_schema_history")) {
                        tables.add(tableName);
                    }
                }
            }

            for (String table : tables) {
                dumpedTables.add(table);
                writer.write("--\n-- Table structure and data for: " + table + "\n--\n");
                writer.write("DROP TABLE IF EXISTS \"" + table + "\" CASCADE;\n");

                // Tạo DDL cơ bản từ metadata
                StringBuilder ddl = new StringBuilder("CREATE TABLE \"" + table + "\" (\n");
                List<String> colNames = new ArrayList<>();

                try (ResultSet cols = meta.getColumns(null, "public", table, "%")) {
                    boolean firstCol = true;
                    while (cols.next()) {
                        if (!firstCol) ddl.append(",\n");
                        firstCol = false;
                        String colName = cols.getString("COLUMN_NAME");
                        String typeName = cols.getString("TYPE_NAME");
                        int colSize = cols.getInt("COLUMN_SIZE");
                        int nullable = cols.getInt("NULLABLE");

                        colNames.add(colName);
                        ddl.append("    \"").append(colName).append("\" ").append(typeName);
                        if (typeName.equalsIgnoreCase("varchar") || typeName.equalsIgnoreCase("char")) {
                            ddl.append("(").append(colSize).append(")");
                        }
                        if (nullable == DatabaseMetaData.columnNoNulls) {
                            ddl.append(" NOT NULL");
                        }
                    }
                }
                ddl.append("\n);\n\n");
                writer.write(ddl.toString());

                // Đổ dữ liệu table
                if (!colNames.isEmpty()) {
                    try (Statement stmt = conn.createStatement(ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY)) {
                        stmt.setFetchSize(1000);
                        try (ResultSet rs = stmt.executeQuery("SELECT * FROM \"" + table + "\"")) {

                        int rowBatch = 0;
                        while (rs.next()) {
                            StringBuilder insert = new StringBuilder("INSERT INTO \"" + table + "\" (");
                            for (int i = 0; i < colNames.size(); i++) {
                                if (i > 0) insert.append(", ");
                                insert.append("\"").append(colNames.get(i)).append("\"");
                            }
                            insert.append(") VALUES (");

                            for (int i = 1; i <= colNames.size(); i++) {
                                if (i > 1) insert.append(", ");
                                Object val = rs.getObject(i);
                                if (val == null) {
                                    insert.append("NULL");
                                } else if (val instanceof Number || val instanceof Boolean) {
                                    insert.append(val);
                                } else {
                                    String str = val.toString().replace("'", "''");
                                    insert.append("'").append(str).append("'");
                                }
                            }
                            insert.append(");\n");
                            writer.write(insert.toString());

                            rowBatch++;
                            if (rowBatch % 500 == 0) {
                                writer.flush();
                            }
                        }
                    }
                }
                }
                writer.write("\n");
                writer.flush();
            }

            writer.write("-- Backup finished successfully.\n");
            writer.flush();
        }

        return dumpedTables;
    }
}
