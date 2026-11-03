package org.example.camerastream.modules.camera.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "camera_ai_configs")
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CameraAiConfig extends base {

    @Column(name = "camera_id", nullable = false)
    private Long cameraId;

    @Column(name = "ai_type", nullable = false)
    private String aiType;

    @Builder.Default
    @Column(name = "is_enabled")
    private Boolean enabled = true;

    @Builder.Default
    @Column(name = "inference_fps")
    private Integer inferenceFps = 6;

    @Builder.Default
    @Column(name = "confidence_threshold")
    private Float confidenceThreshold = 0.80f;

    @Column(name = "roi_coordinates", columnDefinition = "TEXT")
    private String roiCoordinates;

    @Column(name = "notes")
    private String notes;
}
