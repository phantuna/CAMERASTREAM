package org.example.camerastream.modules.backup.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.modules.backup.enums.BackupStatus;
import org.example.camerastream.modules.backup.enums.BackupType;

import java.time.LocalDateTime;

@Entity
@Table(name = "backup_jobs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BackupJob {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "backup_id", nullable = false, unique = true, length = 50)
    private String backupId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BackupType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BackupStatus status;

    @Column(name = "total_size")
    private Long totalSize;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "checksum_sha256")
    private String checksumSha256;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "created_at")
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "period_key", length = 64)
    private String periodKey;
}
