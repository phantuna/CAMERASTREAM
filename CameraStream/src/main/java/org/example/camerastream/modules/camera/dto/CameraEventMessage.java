package org.example.camerastream.modules.camera.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CameraEventMessage {
    private String eventType;
    private Long cameraId;
    private String cameraName;
    private String streamPath;
    private Object payload;
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();
}
