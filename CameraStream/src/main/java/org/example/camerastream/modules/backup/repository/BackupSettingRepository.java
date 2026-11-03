package org.example.camerastream.modules.backup.repository;

import org.example.camerastream.modules.backup.entity.BackupSetting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface BackupSettingRepository extends JpaRepository<BackupSetting, Long> {
    Optional<BackupSetting> findFirstByOrderByIdAsc();
}
