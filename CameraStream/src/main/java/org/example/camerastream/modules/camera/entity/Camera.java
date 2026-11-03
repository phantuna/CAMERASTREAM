package org.example.camerastream.modules.camera.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "cameras")
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Camera extends base {

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "ip_address", nullable = false)
    private String ipAddress;

    @Builder.Default
    @Column(name = "onvif_port")
    private Integer onvifPort = 80;

    @Builder.Default
    @Column(name = "rtsp_port")
    private Integer rtspPort = 554;

    @Column(name = "username")
    private String username;

    @Column(name = "password")
    private String password;

    @Column(name = "stream_path", nullable = false, unique = true)
    private String streamPath;

    @Column(name = "rtsp_source_url", length = 1000)
    private String rtspSourceUrl;

    @Column(name = "rtsp_sub_stream_url", length = 1000)
    private String rtspSubStreamUrl;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(name = "type")
    private CameraType type = CameraType.IN_GATE;

    @Column(name = "location")
    private String location;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(name = "status")
    private CameraStatus status = CameraStatus.CONNECTING;

    @Column(name = "last_error")
    private String lastError;
}
