package org.example.camerastream.modules.parking.dto;

import lombok.*;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DepartmentDto {
    private Long id;
    private Long companyId;
    private String companyName;
    private String code;
    private String name;
    private String description;
    private Boolean active;
    private LocalDateTime createdAt;
}

