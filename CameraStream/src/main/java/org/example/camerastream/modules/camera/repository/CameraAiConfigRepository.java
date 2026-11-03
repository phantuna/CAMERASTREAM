package org.example.camerastream.modules.camera.repository;

import org.example.camerastream.modules.camera.entity.CameraAiConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CameraAiConfigRepository extends JpaRepository<CameraAiConfig, Long> {

    @Query("SELECT c FROM CameraAiConfig c WHERE c.cameraId = :cameraId AND c.active = true")
    List<CameraAiConfig> findByCameraIdActive(@Param("cameraId") Long cameraId);

    @Query("SELECT c FROM CameraAiConfig c WHERE c.cameraId = :cameraId AND c.aiType = :aiType AND c.active = true")
    Optional<CameraAiConfig> findByCameraIdAndAiTypeActive(@Param("cameraId") Long cameraId, @Param("aiType") String aiType);

    @Query("SELECT c FROM CameraAiConfig c WHERE c.aiType = :aiType AND c.enabled = true AND c.active = true")
    List<CameraAiConfig> findEnabledByAiTypeActive(@Param("aiType") String aiType);

    @Query("SELECT c FROM CameraAiConfig c WHERE c.enabled = true AND c.active = true")
    List<CameraAiConfig> findAllEnabledActive();
}
