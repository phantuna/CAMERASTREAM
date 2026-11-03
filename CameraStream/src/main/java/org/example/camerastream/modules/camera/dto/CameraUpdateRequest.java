package org.example.camerastream.modules.camera.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.example.camerastream.modules.camera.entity.CameraType;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CameraUpdateRequest {
    private String name;
    private String ipAddress;
    private Integer onvifPort;
    private Integer rtspPort;
    private String username;
    private String password;
    private CameraType type;
    private String location;
    private String rtspSourceUrl;
    private String rtspSubStreamUrl;
}
