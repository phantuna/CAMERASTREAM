package org.example.camerastream.modules.parking.dto;

import lombok.*;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContractorDto {
    private Long id;
    private String code;
    private String name;
    private String taxCode;
    private String contactPerson;
    private String phone;
    private String email;
    private String fieldOfWork;
    private Boolean active;
    private LocalDateTime createdAt;
}

