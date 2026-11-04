package org.example.camerastream.modules.parking.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VehicleCheckRequest {
    private String plateNumber;
    private String laneCode;
    private String direction; // "IN" or "OUT"
    private String plateImage;
    private String overviewImage;
}

