package org.example.camerastream.modules.backup.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.example.camerastream.modules.backup.enums.BackupStatus;
import org.example.camerastream.modules.backup.enums.BackupType;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BackupResponse {
    private String backupId;
    private BackupType type;
    private BackupStatus status;
    private Long totalSize;
    private String fileName;
    private String formattedSize;
    private String checksumSha256;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime startedAt;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime completedAt;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;
    private Long durationMs;
    private String createdBy;
    private String errorMessage;
    private String notes;
    private String downloadUrl;
}
