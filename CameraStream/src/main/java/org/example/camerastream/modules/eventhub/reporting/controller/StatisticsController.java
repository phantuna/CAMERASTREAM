package org.example.camerastream.modules.eventhub.reporting.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.eventhub.reporting.dto.DashboardQueryDto;
import org.example.camerastream.modules.eventhub.reporting.dto.DashboardStatsDto;
import org.example.camerastream.modules.eventhub.reporting.service.StatisticsService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** KPI + series cho dashboard (mới, song song /stats hiện có). */
@RestController
@RequestMapping("/api/v1/events/dashboard")
@RequiredArgsConstructor
@Slf4j
@RequirePermission("ALPR_VIEW")
public class StatisticsController {

    private final StatisticsService statisticsService;

    @GetMapping
    public ApiResponse<DashboardStatsDto> getDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(defaultValue = "HOUR") String granularity) {

        DashboardQueryDto query = DashboardQueryDto.builder()
                .fromDate(fromDate)
                .toDate(toDate)
                .granularity(granularity)
                .build();

        DashboardStatsDto stats = statisticsService.getDashboardStats(query);
        return ApiResponse.success(stats);
    }
}
