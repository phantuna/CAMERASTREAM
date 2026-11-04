package org.example.camerastream.modules.parking.dto;

import lombok.*;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LaneDto {
    private Long id;
    private Long gateId;
    private String code;
    private String name;
    private String direction;
    private Long overviewCameraId;
    private Long plateCameraId;
    private String barrierDeviceId;
    private String cardReaderId;
    private String description;
    private Boolean active;
    private LocalDateTime createdAt;
}

