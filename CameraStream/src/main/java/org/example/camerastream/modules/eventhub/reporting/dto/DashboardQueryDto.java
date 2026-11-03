package org.example.camerastream.modules.eventhub.reporting.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/** Bộ lọc cho KPI dashboard (tham số query của /api/v1/events/dashboard). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardQueryDto {
    private String granularity;   // HOUR | DAY (default HOUR)
    private LocalDate fromDate;
    private LocalDate toDate;
}
