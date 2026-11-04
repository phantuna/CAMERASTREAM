package org.example.camerastream.modules.parking.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParkingSessionFilterQuery {
    private String search;
    private String plateNumber;
    private String vehicleType;
    private String status;
    private String laneName;
    private Long inLaneId;
    private Long outLaneId;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private LocalDateTime fromDate;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private LocalDateTime toDate;

    @Builder.Default
    private int page = 0;
    @Builder.Default
    private int size = 20;
    @Builder.Default
    private String sortBy = "id";
    @Builder.Default
    private String sortOrder = "desc";
}
