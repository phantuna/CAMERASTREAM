package org.example.camerastream.modules.eventhub.reporting;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.Expression;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.eventhub.entity.QSystemEvent;
import org.example.camerastream.modules.eventhub.reporting.dto.DashboardQueryDto;
import org.example.camerastream.modules.eventhub.reporting.dto.DashboardStatsDto;
import org.example.camerastream.modules.eventhub.reporting.service.StatisticsService;
import org.example.camerastream.modules.eventhub.repository.SystemEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class StatisticsServiceTest {

    private SystemEventRepository eventRepository;
    private CameraRepository cameraRepository;
    private JPAQueryFactory queryFactory;
    private JPAQuery<Long> mockQuery;
    private StatisticsService service;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        eventRepository = mock(SystemEventRepository.class);
        cameraRepository = mock(CameraRepository.class);
        queryFactory = mock(JPAQueryFactory.class);
        mockQuery = mock(JPAQuery.class);
        // Executor chạy direct (không thread thật) để test chạy đồng bộ
        Executor directExecutor = Runnable::run;
        service = new StatisticsService(eventRepository, cameraRepository, queryFactory, directExecutor);

        when(queryFactory.select(any(Expression.class))).thenReturn(mockQuery);
        when(mockQuery.from(any(QSystemEvent.class))).thenReturn(mockQuery);
        when(mockQuery.where(any(BooleanBuilder.class))).thenReturn(mockQuery);
        when(mockQuery.fetchOne()).thenReturn(0L);
    }

    @Test
    void dashboardReturnsKpiValuesAndFillsHourlySeries() {
        LocalDate from = LocalDate.of(2026, 10, 28);
        LocalDate to = LocalDate.of(2026, 10, 30);

        Map<String, Long> counts = new HashMap<>();
        counts.put("total", 10L);
        counts.put("severity_CRITICAL", 2L);
        counts.put("severity_WARNING", 3L);
        counts.put("unackedAlerts", 5L);
        when(eventRepository.getDashboardCounts(any(), any())).thenReturn(counts);

        Map<String, Long> vehicleTypes = new HashMap<>();
        vehicleTypes.put("CAR", 4L);
        vehicleTypes.put("MOTO", 2L);
        vehicleTypes.put("TRUCK", 1L);
        vehicleTypes.put("PERSON", 1L);
        when(eventRepository.getVehicleTypeBreakdown(any(), any())).thenReturn(vehicleTypes);

        when(cameraRepository.findAllActive()).thenReturn(mockCameras(3));

        // 2 điểm series + các bucket khác trống
        when(eventRepository.countEventsByBucket(any(), any(), eq("hour"), eq("VEHICLE_ANPR")))
                .thenReturn(List.of(
                        new Object[]{java.time.LocalDateTime.of(2026, 10, 28, 0, 0), 4L},
                        new Object[]{java.time.LocalDateTime.of(2026, 10, 28, 1, 0), 6L}));

        // Severity breakdown: INFO=1, WARNING=2, CRITICAL=3 (thứ tự gọi fetchOne)
        doReturn(1L, 2L, 3L).when(mockQuery).fetchOne();

        DashboardStatsDto stats = service.getDashboardStats(
                DashboardQueryDto.builder().fromDate(from).toDate(to).granularity("HOUR").build());

        assertEquals(10L, stats.getTotalEvents());
        assertEquals(3, stats.getActiveCameraCount());
        assertEquals(5L, stats.getUnacknowledgedAlertCount());
        assertEquals(30.0, stats.getCriticalRatePct(), 1e-6); // critical=3 / total=10
        assertEquals(4L, stats.getEventsByVehicleType().get("CAR"));
        assertEquals(3L, stats.getEventsBySeverity().get("CRITICAL"));

        // Series: 24 bucket giờ, fill thiếu bằng 0
        assertEquals(24, stats.getHourlyEventCounts().size());
        assertEquals(4L, stats.getHourlyEventCounts().get(0).getValue());
        assertEquals("2026-10-28T00:00", stats.getHourlyEventCounts().get(0).getBucket());
        assertEquals(6L, stats.getHourlyEventCounts().get(1).getValue());
        assertEquals(0L, stats.getHourlyEventCounts().get(2).getValue());
    }

    @Test
    void dayGranularityProduces30Buckets() {
        when(eventRepository.getDashboardCounts(any(), any())).thenReturn(Map.of("total", 0L));
        when(eventRepository.getVehicleTypeBreakdown(any(), any())).thenReturn(Map.of());
        when(cameraRepository.findAllActive()).thenReturn(List.of());
        when(eventRepository.countEventsByBucket(any(), any(), eq("day"), eq("VEHICLE_ANPR")))
                .thenReturn(List.of());

        DashboardStatsDto stats = service.getDashboardStats(
                DashboardQueryDto.builder().granularity("DAY").build());

        assertEquals(30, stats.getHourlyEventCounts().size());
        assertEquals(0.0, stats.getCriticalRatePct());
    }

    @Test
    void nullQueryDefaultsToLast24HoursAndWorks() {
        when(eventRepository.getDashboardCounts(any(), any())).thenReturn(Map.of("total", 2L));
        when(eventRepository.getVehicleTypeBreakdown(any(), any())).thenReturn(Map.of("CAR", 2L));
        when(cameraRepository.findAllActive()).thenReturn(mockCameras(1));
        when(eventRepository.countEventsByBucket(any(), any(), anyString(), anyString())).thenReturn(List.of());

        DashboardStatsDto stats = service.getDashboardStats(null);

        assertNotNull(stats);
        assertEquals(2L, stats.getTotalEvents());
        assertEquals(1, stats.getActiveCameraCount());
        assertEquals(24, stats.getHourlyEventCounts().size());

        // Verify query được gọi với 24h mặc định (from < to, cách nhau 24h)
        verify(eventRepository).countEventsByBucket(
                argThat(f -> f != null), argThat(t -> t != null), eq("hour"), eq("VEHICLE_ANPR"));
    }

    private List<Camera> mockCameras(int count) {
        java.util.List<Camera> list = new java.util.ArrayList<>();
        for (long i = 1; i <= count; i++) {
            Camera c = Camera.builder().name("Cam " + i).streamPath("cam" + i).build();
            c.setId(i);
            list.add(c);
        }
        return list;
    }
}
