package org.example.camerastream.modules.camera.repository;

import org.example.camerastream.modules.camera.entity.Camera;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CameraRepository extends JpaRepository<Camera, Long>, CameraRepositoryCustom {

    @Query("SELECT c FROM Camera c WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC")
    List<Camera> findAllActive();

    @Query("SELECT c FROM Camera c WHERE c.id = :id AND c.deleted_at IS NULL")
    Optional<Camera> findActiveById(Long id);

    @Query("SELECT c FROM Camera c WHERE c.streamPath = :streamPath AND c.deleted_at IS NULL")
    Optional<Camera> findActiveByStreamPath(String streamPath);

    Optional<Camera> findByStreamPath(String streamPath);

    @Query("SELECT COUNT(c) > 0 FROM Camera c WHERE c.streamPath = :streamPath AND c.deleted_at IS NULL")
    boolean existsActiveByStreamPath(String streamPath);
}
