package org.example.camerastream.modules.backup.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.backup.dto.ManifestDTO;
import org.example.camerastream.modules.backup.service.IBackupStorageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.Optional;
import java.util.stream.Stream;

@Service
@Slf4j
@RequiredArgsConstructor
public class BackupStorageServiceImpl implements IBackupStorageService {

    private static final String SQL_FILE_NAME = "backup.sql.gz";
    private static final String TMP_FILE_NAME = "backup.sql.gz.tmp";

    @Value("${backup.storage.path:D:/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/data/backup}")
    private String backupStoragePath;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    public void init() {
        try {
            Path fullDir = Paths.get(backupStoragePath, "full");
            Files.createDirectories(fullDir);
            log.info("[BackupStorage] Khởi tạo thư mục lưu trữ backup: {}", fullDir.toAbsolutePath());
            cleanupAllOrphanTmpFiles(fullDir);
        } catch (IOException e) {
            log.error("[BackupStorage] Không thể khởi tạo thư mục backup", e);
        }
    }

    private void cleanupAllOrphanTmpFiles(Path baseDir) {
        try {
            if (Files.exists(baseDir)) {
                try (Stream<Path> stream = Files.walk(baseDir)) {
                    stream.filter(Files::isRegularFile)
                            .filter(p -> p.getFileName().toString().endsWith(".tmp"))
                            .forEach(tmpFile -> {
                                try {
                                    Files.deleteIfExists(tmpFile);
                                    log.info("[BackupStorage] Đã dọn dẹp file tạm mồ côi: {}", tmpFile);
                                } catch (IOException ex) {
                                    log.warn("[BackupStorage] Không thể xóa file tạm {}: {}", tmpFile, ex.getMessage());
                                }
                            });
                }
            }
        } catch (Exception ex) {
            log.warn("[BackupStorage] Lỗi khi quét file tạm mồ côi: {}", ex.getMessage());
        }
    }

    @Override
    public String getBackupDirectoryPath(String backupId) {
        return Paths.get(backupStoragePath, "full", backupId).toString();
    }

    @Override
    public Path getSqlFilePath(String backupId) {
        return Paths.get(getBackupDirectoryPath(backupId), SQL_FILE_NAME);
    }

    @Override
    public Path getTmpFilePath(String backupId) {
        return Paths.get(getBackupDirectoryPath(backupId), TMP_FILE_NAME);
    }

    @Override
    public void promoteTmpToFinal(String backupId) throws IOException {
        Path tmp = getTmpFilePath(backupId);
        Path finalFile = getSqlFilePath(backupId);
        try {
            Files.move(tmp, finalFile, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(tmp, finalFile, StandardCopyOption.REPLACE_EXISTING);
        }
        log.info("[BackupStorage] Atomic rename thành công: {} -> {}", TMP_FILE_NAME, SQL_FILE_NAME);
    }

    @Override
    public void deleteTmpFile(String backupId) {
        Path tmp = getTmpFilePath(backupId);
        try {
            boolean deleted = Files.deleteIfExists(tmp);
            if (deleted) {
                log.info("[BackupStorage] Đã xóa file tạm: {}", tmp.getFileName());
            }
        } catch (IOException e) {
            log.warn("[BackupStorage] Không thể xóa file tạm '{}': {}", tmp.getFileName(), e.getMessage());
        }
    }

    @Override
    public void createBackupDirectory(String backupId) {
        try {
            Files.createDirectories(Paths.get(getBackupDirectoryPath(backupId)));
        } catch (IOException e) {
            log.error("[BackupStorage] Không thể tạo thư mục cho backup '{}'", backupId, e);
            throw new RuntimeException("Không thể tạo thư mục sao lưu: " + backupId);
        }
    }

    @Override
    public void writeManifest(String backupId, ManifestDTO manifestDTO) {
        File manifestFile = Paths.get(getBackupDirectoryPath(backupId), "manifest.json").toFile();
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(manifestFile, manifestDTO);
            log.info("[BackupStorage] Đã ghi file manifest.json cho backup '{}'", backupId);
        } catch (IOException e) {
            log.error("[BackupStorage] Ghi file manifest.json thất bại cho backup '{}'", backupId, e);
        }
    }

    @Override
    public Optional<ManifestDTO> readManifest(String backupId) {
        File manifestFile = Paths.get(getBackupDirectoryPath(backupId), "manifest.json").toFile();
        if (!manifestFile.exists()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(manifestFile, ManifestDTO.class));
        } catch (IOException e) {
            log.warn("[BackupStorage] Không thể đọc manifest.json cho backup '{}'", backupId, e);
            return Optional.empty();
        }
    }

    @Override
    public String calculateChecksum(File file) {
        if (file == null || !file.exists()) return null;
        try (FileInputStream fis = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = fis.read(buffer)) != -1) {
                digest.update(buffer, 0, bytesRead);
            }
            byte[] hashBytes = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            log.warn("[BackupStorage] Không thể tính SHA-256 checksum cho file {}: {}", file.getName(), e.getMessage());
            return null;
        }
    }

    @Override
    public void deleteBackupDirectory(String backupId) {
        Path path = Paths.get(getBackupDirectoryPath(backupId));
        if (!Files.exists(path)) return;
        try (Stream<Path> stream = Files.walk(path)) {
            stream.sorted(Comparator.reverseOrder())
                    .map(Path::toFile)
                    .forEach(File::delete);
            log.info("[BackupStorage] Đã xóa toàn bộ thư mục sao lưu: {}", backupId);
        } catch (IOException e) {
            log.error("[BackupStorage] Lỗi khi xóa thư mục backup '{}'", backupId, e);
        }
    }

    @Override
    public long getAvailableStorageSpace() {
        try {
            File dir = new File(backupStoragePath);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            return dir.getUsableSpace();
        } catch (Exception e) {
            return 0;
        }
    }
}
