package org.example.camerastream.modules.parking.dto;

import lombok.*;
import org.example.camerastream.modules.parking.entity.ParkingSessionStatus;
import org.example.camerastream.modules.parking.entity.VehicleType;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ParkingSessionDto {
    private Long id;
    private String sessionCode;
    private String plateNumber;
    private VehicleType vehicleType;
    private ParkingSessionStatus status;
    private Long personId;
    private String personName;
    private String companyName;
    private String departmentName;
    private String cardCode;

    // Lượt vào
    private LocalDateTime inTime;
    private Long inLaneId;
    private String inLaneName;
    private String inPlateImage;
    private String inOverviewImage;

    // Lượt ra
    private LocalDateTime outTime;
    private Long outLaneId;
    private String outLaneName;
    private String outPlateImage;
    private String outOverviewImage;

    // Thời lượng
    private Double durationMinutes;
    private String durationFormatted;
    private String note;
    private LocalDateTime createdAt;
}

