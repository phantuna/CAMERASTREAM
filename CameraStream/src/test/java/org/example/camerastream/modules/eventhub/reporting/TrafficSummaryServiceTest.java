package org.example.camerastream.modules.eventhub.reporting;

import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.entity.CameraType;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.eventhub.entity.SystemEvent;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryFilterQuery;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryItemDto;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryResult;
import org.example.camerastream.modules.eventhub.reporting.service.TrafficSummaryService;
import org.example.camerastream.modules.eventhub.repository.SystemEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TrafficSummaryServiceTest {

    private SystemEventRepository eventRepository;
    private CameraRepository cameraRepository;
    private TrafficSummaryService service;

    private final LocalDateTime t1 = LocalDateTime.of(2026, 10, 30, 8, 0);
    private final LocalDateTime t2 = LocalDateTime.of(2026, 10, 30, 9, 30);

    @BeforeEach
    void setUp() {
        eventRepository = mock(SystemEventRepository.class);
        cameraRepository = mock(CameraRepository.class);
        service = new TrafficSummaryService(eventRepository, cameraRepository);

        Camera inGate = Camera.builder()
                .name("Cong A").type(CameraType.IN_GATE).streamPath("cam-in").build();
        inGate.setId(1L);
        Camera outGate = Camera.builder()
                .name("Cong B").type(CameraType.OUT_GATE).streamPath("cam-out").build();
        outGate.setId(2L);
        when(cameraRepository.findAllActive()).thenReturn(List.of(inGate, outGate));
    }

    private SystemEvent event(Long id, Long cameraId, String payloadJson, Float conf, LocalDateTime at) {
        SystemEvent e = new SystemEvent();
        e.setId(id);
        e.setCameraId(cameraId);
        e.setPayloadJson(payloadJson);
        e.setConfidence(conf);
        e.setCreated_at(at);
        e.setEventType("VEHICLE_ANPR");
        return e;
    }

    @Test
    void groupsByPlateAndCamera_withDirectionCounts_andConfidenceAvg() {
        List<SystemEvent> events = List.of(
                event(1L, 1L, "{\"plateNumber\":\"5X-123\",\"vehicleType\":\"CAR\"}", 0.9f, t1),
                event(2L, 1L, "{\"plateNumber\":\"5X-123\",\"vehicleType\":\"CAR\",\"laneId\":\"LANE-1\"}", 0.7f, t2),
                event(3L, 2L, "{\"plateNumber\":\"5X-123\",\"vehicleType\":\"CAR\"}", null, t2)
        );
        when(eventRepository.findTrafficSummaryEvents(anyString(), isNull(), isNull(), any(), any(), eq(TrafficSummaryService.MAX_EXPORT_LIMIT)))
                .thenReturn(events);
        when(eventRepository.countTrafficSummaryEvents(anyString(), isNull(), isNull(), any(), any())).thenReturn(3L);

        TrafficSummaryResult result = service.getTrafficSummary(
                TrafficSummaryFilterQuery.builder().fromDate(t1.toLocalDate()).toDate(t2.toLocalDate()).build());

        assertEquals(2, result.getItems().size());
        assertFalse(result.isTruncated());
        assertEquals(3, result.getTotalRows());

        TrafficSummaryItemDto inItem = result.getItems().stream()
                .filter(i -> i.getCameraId() == 1L).findFirst().orElseThrow();
        assertEquals("5X-123", inItem.getPlateNumber());
        assertEquals("Cong A", inItem.getCameraName());
        assertEquals(2, inItem.getInCount());
        assertEquals(0, inItem.getOutCount());
        assertEquals(2, inItem.getTotalEvents());
        assertEquals(0.8, inItem.getConfidenceAvg(), 1e-6);
        assertEquals(t2, inItem.getLastSeenAt());
        assertEquals("LANE-1", inItem.getLastLane());

        TrafficSummaryItemDto outItem = result.getItems().stream()
                .filter(i -> i.getCameraId() == 2L).findFirst().orElseThrow();
        assertEquals(1, outItem.getOutCount());
        assertEquals(0, outItem.getInCount());
        assertNull(outItem.getConfidenceAvg());
    }

    @Test
    void reportsTruncated_whenTotalExceedsMaxExportLimit() {
        when(eventRepository.countTrafficSummaryEvents(anyString(), any(), any(), any(), any()))
                .thenReturn((long) TrafficSummaryService.MAX_EXPORT_LIMIT + 1);
        when(eventRepository.findTrafficSummaryEvents(anyString(), any(), any(), any(), any(), anyInt()))
                .thenReturn(List.of());

        TrafficSummaryResult result = service.getTrafficSummary(
                TrafficSummaryFilterQuery.builder().fromDate(LocalDate.now()).build());

        assertTrue(result.isTruncated());
        assertEquals(TrafficSummaryService.MAX_EXPORT_LIMIT + 1, result.getTotalRows());
        assertTrue(result.getItems().isEmpty());
    }

    @Test
    void unknownCamera_fallsBackToCameraHashName() {
        when(cameraRepository.findAllActive()).thenReturn(List.of());
        List<SystemEvent> events = List.of(
                event(1L, 99L, "{\"plateNumber\":\"29A-999\"}", 0.5f, t1));
        when(eventRepository.findTrafficSummaryEvents(anyString(), isNull(), isNull(), any(), any(), anyInt()))
                .thenReturn(events);
        when(eventRepository.countTrafficSummaryEvents(anyString(), isNull(), isNull(), any(), any())).thenReturn(1L);

        TrafficSummaryResult result = service.getTrafficSummary(
                TrafficSummaryFilterQuery.builder().build());

        TrafficSummaryItemDto item = result.getItems().get(0);
        assertEquals("Camera #99", item.getCameraName());
        // Camera không thuộc danh sách active -> không phân loại được hướng
        assertEquals(0, item.getInCount());
        assertEquals(0, item.getOutCount());
        assertEquals(1, item.getTotalEvents());
    }

    @Test
    void badPayloadJson_isHandledGracefully() {
        List<SystemEvent> events = List.of(
                event(1L, 1L, "not-json{{{", 0.5f, t1),
                event(2L, 1L, null, 0.5f, t2));
        when(eventRepository.findTrafficSummaryEvents(anyString(), isNull(), isNull(), any(), any(), anyInt()))
                .thenReturn(events);
        when(eventRepository.countTrafficSummaryEvents(anyString(), isNull(), isNull(), any(), any())).thenReturn(2L);

        TrafficSummaryResult result = service.getTrafficSummary(
                TrafficSummaryFilterQuery.builder().build());

        // 2 event cùng camera nhưng payload rởm -> plate UNKNOWN, cùng group
        assertEquals(1, result.getItems().size());
        assertEquals("UNKNOWN", result.getItems().get(0).getPlateNumber());
        assertEquals(2, result.getItems().get(0).getTotalEvents());
    }
}
