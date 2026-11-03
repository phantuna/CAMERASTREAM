package org.example.camerastream.modules.eventhub.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.example.camerastream.modules.eventhub.entity.EventSeverity;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SystemEventDto {
    private Long id;
    private String eventType;
    private String moduleSource;
    private Long cameraId;
    private String cameraName;
    private String snapshotUrl;
    private Float confidence;
    private EventSeverity severity;
    private Object payload;
    private Boolean acknowledged;
    private LocalDateTime createdAt;
}
