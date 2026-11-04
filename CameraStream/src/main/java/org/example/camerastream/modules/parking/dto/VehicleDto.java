package org.example.camerastream.modules.parking.dto;

import lombok.*;
import org.example.camerastream.modules.parking.entity.VehicleType;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VehicleDto {
    private Long id;
    private String plateNumber;
    private VehicleType vehicleType;
    private String ownerName;
    private String phoneNumber;
    private String cardCode;
    private Long companyId;
    private String companyName;
    private Long departmentId;
    private String departmentName;
    private Long personId;
    private Boolean whitelist;
    private String note;
    private Boolean active;
    private LocalDateTime createdAt;
}

