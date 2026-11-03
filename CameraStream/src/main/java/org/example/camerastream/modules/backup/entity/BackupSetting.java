package org.example.camerastream.modules.backup.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "backup_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BackupSetting {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cron_expression")
    private String cronExpression;

    @Column(name = "interval_minutes")
    private Integer intervalMinutes;

    @Column(name = "max_retain_backups")
    private Integer maxRetainBackups;

    @Column(name = "retention_days")
    private Integer retentionDays;

    @Column(name = "enabled")
    private Boolean enabled;

    @Column(name = "storage_path")
    private String storagePath;

    @Column(name = "auto_cleanup")
    private Boolean autoCleanup;
}
