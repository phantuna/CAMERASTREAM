package org.example.camerastream.modules.backup.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BackupConfigDto {
    private String cronExpression;
    private Integer intervalMinutes;
    private Integer maxRetainBackups;
    private Integer retentionDays;
    private Boolean enabled;
    private String storagePath;
    private Boolean autoCleanup;
}
