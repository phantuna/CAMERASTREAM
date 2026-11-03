package org.example.camerastream.modules.camera.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CameraAiConfigDto {
    private Long id;
    private Long cameraId;
    private String cameraName;
    private String streamPath;
    private String rtspSubStreamUrl;
    private String aiType;
    private Boolean enabled;
    private Integer inferenceFps;
    private Float confidenceThreshold;
    private String roiCoordinates;
    private String notes;
}
