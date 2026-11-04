package org.example.camerastream.modules.parking.dto;

import lombok.*;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CompanyDto {
    private Long id;
    private String code;
    private String name;
    private String taxCode;
    private String address;
    private String phone;
    private String email;
    private String representative;
    private Boolean active;
    private LocalDateTime createdAt;
}

