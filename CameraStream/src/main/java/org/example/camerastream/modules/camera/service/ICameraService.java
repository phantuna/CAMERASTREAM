package org.example.camerastream.modules.camera.service;

import org.example.camerastream.modules.camera.dto.CameraCreateRequest;
import org.example.camerastream.modules.camera.dto.CameraDto;
import org.example.camerastream.modules.camera.dto.CameraUpdateRequest;
import org.example.camerastream.modules.camera.dto.PlateDetectionRequest;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.Optional;

public interface ICameraService {
    List<CameraDto> getAllCameras();
    Page<CameraDto> getCamerasPaginated(String keyword, org.springframework.data.domain.Pageable pageable);
    List<CameraDto> searchCameras(String keyword);
    Optional<CameraDto> getCameraById(Long id);
    CameraDto createCamera(CameraCreateRequest request);
    CameraDto updateCamera(Long id, CameraUpdateRequest request);
    void deleteCamera(Long id);
    byte[] getCameraSnapshot(Long id);
    void processPlateDetection(Long cameraId, PlateDetectionRequest request);
    boolean ptzControl(Long id, String action);
    void broadcastCameraEvent(String eventType, Long cameraId, String cameraName, String streamPath, Object payload);
}
