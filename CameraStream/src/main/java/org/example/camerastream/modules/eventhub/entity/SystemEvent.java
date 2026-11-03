package org.example.camerastream.modules.eventhub.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "system_events", indexes = {
    @Index(name = "idx_system_events_type_created", columnList = "event_type, created_at DESC"),
    @Index(name = "idx_system_events_camera_created", columnList = "camera_id, created_at DESC")
})
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SystemEvent extends base {

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "module_source")
    private String moduleSource;

    @Column(name = "camera_id")
    private Long cameraId;

    @Column(name = "camera_name")
    private String cameraName;

    @Column(name = "snapshot_url", columnDefinition = "TEXT")
    private String snapshotUrl;

    @Column(name = "confidence")
    private Float confidence;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(name = "severity")
    private EventSeverity severity = EventSeverity.INFO;

    @Column(name = "payload_json", columnDefinition = "TEXT")
    private String payloadJson;

    @Builder.Default
    @Column(name = "acknowledged")
    private Boolean acknowledged = false;
}
