package org.example.camerastream.modules.camera.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OnvifDiscoveryDevice {
    private String ipAddress;
    private Integer port;
    private String xAddrs;
    private String endpointReference;
    private String hardware;
    private String name;
}
