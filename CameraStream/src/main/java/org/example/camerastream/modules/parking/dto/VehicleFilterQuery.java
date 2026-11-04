package org.example.camerastream.modules.parking.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VehicleFilterQuery {
    private String search;
    private String keyword;
    private String vehicleType;
    private Long companyId;
    private Long departmentId;
    private Boolean active;
    private Boolean whitelist;

    @Builder.Default
    private int page = 0;
    @Builder.Default
    private int size = 20;
    @Builder.Default
    private String sortBy = "id";
    @Builder.Default
    private String sortOrder = "desc";
}
