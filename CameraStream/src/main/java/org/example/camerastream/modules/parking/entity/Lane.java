package org.example.camerastream.modules.parking.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "lanes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Lane extends base {

    @Column(name = "gate_id")
    private Long gateId;

    @Column(name = "code", nullable = false, unique = true, length = 64)
    private String code;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "direction", nullable = false, length = 16)
    private String direction; // "IN" hoặc "OUT"

    @Column(name = "overview_camera_id")
    private Long overviewCameraId;

    @Column(name = "plate_camera_id")
    private Long plateCameraId;

    @Column(name = "barrier_device_id", length = 64)
    private String barrierDeviceId;

    @Column(name = "card_reader_id", length = 64)
    private String cardReaderId;

    @Column(name = "description", length = 500)
    private String description;
}

