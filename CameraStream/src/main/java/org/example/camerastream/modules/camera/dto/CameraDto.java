package org.example.camerastream.modules.camera.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.example.camerastream.modules.camera.entity.CameraStatus;
import org.example.camerastream.modules.camera.entity.CameraType;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CameraDto {
    private Long id;
    private String name;
    private String ipAddress;
    private Integer onvifPort;
    private Integer rtspPort;
    private String username;
    private String streamPath;
    private CameraType type;
    private String location;
    private CameraStatus status;
    private String lastError;
    private String rtspSourceUrl;
    private String rtspSubStreamUrl;

    // Streaming URLs for Frontend & AI
    private String webrtcUrl;
    private String hlsUrl;
    private String rtspRelayUrl;
    private String snapshotApiUrl;

    // Active AI Pipelines assigned to this camera (VEHICLE_ANPR, FACE_RECOGNITION, etc.)
    private java.util.List<String> activeAiModules;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
