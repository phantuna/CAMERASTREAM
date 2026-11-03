package org.example.camerastream.modules.camera.repository;

import org.example.camerastream.modules.camera.entity.Camera;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface CameraRepositoryCustom {

    List<Camera> searchActive(String keyword);

    Page<Camera> searchActivePaginated(String keyword, Pageable pageable);
}
