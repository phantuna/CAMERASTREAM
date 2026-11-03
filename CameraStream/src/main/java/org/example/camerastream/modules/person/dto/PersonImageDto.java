package org.example.camerastream.modules.person.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PersonImageDto {
    private Long id;
    private String imageUrl;
    private String angle;
    private Boolean isPrimary;
}
