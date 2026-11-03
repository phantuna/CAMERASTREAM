package org.example.camerastream.modules.camera.service;

import org.example.camerastream.modules.camera.dto.CameraAiConfigDto;

import java.util.List;

public interface ICameraAiService {
    List<CameraAiConfigDto> getAiConfigsByCamera(Long cameraId);
    List<CameraAiConfigDto> saveCameraAiConfigs(Long cameraId, List<CameraAiConfigDto> configs);
    List<CameraAiConfigDto> getActiveTasksByAiType(String aiType);
}
