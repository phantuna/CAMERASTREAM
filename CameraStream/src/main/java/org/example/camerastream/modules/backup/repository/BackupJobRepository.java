package org.example.camerastream.modules.backup.repository;

import org.example.camerastream.modules.backup.entity.BackupJob;
import org.example.camerastream.modules.backup.enums.BackupStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface BackupJobRepository extends JpaRepository<BackupJob, Long> {
    Optional<BackupJob> findByBackupId(String backupId);
    List<BackupJob> findByStatus(BackupStatus status);
    Optional<BackupJob> findFirstByStatusOrderByCompletedAtDesc(BackupStatus status);
    List<BackupJob> findByStatusOrderByCompletedAtDesc(BackupStatus status);
    List<BackupJob> findAllByOrderByCreatedAtDesc();
    long countByStatus(BackupStatus status);
    long countByStatusIn(Collection<BackupStatus> statuses);
    Optional<BackupJob> findByPeriodKey(String periodKey);
    boolean existsByStatus(BackupStatus status);
    List<BackupJob> findAllByStatus(BackupStatus status);
    boolean existsByPeriodKeyAndStatus(String periodKey, BackupStatus status);
    boolean existsByPeriodKeyAndStatusIn(String periodKey, Collection<BackupStatus> statuses);
}
