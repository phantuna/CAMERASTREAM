package org.example.camerastream.modules.eventhub.reporting.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryFilterQuery;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryResult;
import org.example.camerastream.modules.eventhub.reporting.service.ReportExcelService;
import org.example.camerastream.modules.eventhub.reporting.service.TrafficSummaryService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

/**
 * Báo cáo tổng hợp lượt ra/vào và xuất Excel Server-Side:
 *  - /api/v1/events/reports/traffic-summary  (JSON)
 *  - /api/v1/events/export/traffic-summary   (XLSX binary)
 *  - /api/v1/alpr/logs/export               (XLSX binary ALPR logs theo bộ lọc CSDL)
 *  - /api/v1/events/export                  (XLSX binary Events/FaceID theo bộ lọc CSDL)
 */
@RestController
@RequestMapping
@RequiredArgsConstructor
@Slf4j
public class ReportsExcelController {

    private final TrafficSummaryService trafficSummaryService;
    private final ReportExcelService reportExcelService;

    @RequirePermission("ALPR_VIEW")
    @GetMapping("/api/v1/events/reports/traffic-summary")
    public ApiResponse<TrafficSummaryResult> getTrafficSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) Long cameraId,
            @RequestParam(required = false) String plateKeyword,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {

        TrafficSummaryFilterQuery query = TrafficSummaryFilterQuery.builder()
                .fromDate(fromDate)
                .toDate(toDate)
                .eventType(eventType)
                .cameraId(cameraId)
                .plateKeyword(plateKeyword)
                .page(page)
                .size(size)
                .build();

        TrafficSummaryResult result = trafficSummaryService.getTrafficSummary(query);
        return ApiResponse.success(result);
    }

    @RequirePermission("ALPR_EXPORT")
    @GetMapping("/api/v1/events/export/traffic-summary")
    public ResponseEntity<byte[]> exportTrafficSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) Long cameraId,
            @RequestParam(required = false) String plateKeyword,
            @RequestParam(required = false, defaultValue = "SYSTEM") String actor) {

        TrafficSummaryFilterQuery query = TrafficSummaryFilterQuery.builder()
                .fromDate(fromDate)
                .toDate(toDate)
                .eventType(eventType)
                .cameraId(cameraId)
                .plateKeyword(plateKeyword)
                .build();

        ReportExcelService.ExportResult result = reportExcelService.exportTrafficSummary(query, actor);
        return createExcelResponse(result);
    }

    /**
     * Xuất toàn bộ lịch sử biển số (ALPR) khớp 100% bộ lọc CSDL (không bị giới hạn bởi 1 trang)
     */
    @RequirePermission("ALPR_EXPORT")
    @GetMapping({"/api/v1/alpr/logs/export", "/api/v1/alpr/export"})
    public ResponseEntity<byte[]> exportAlprLogs(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long cameraId,
            @RequestParam(required = false, defaultValue = "SYSTEM") String actor) {

        ReportExcelService.ExportResult result = reportExcelService.exportAlprLogs(
                fromDate, toDate, category, search, cameraId, actor);
        return createExcelResponse(result);
    }

    /**
     * Xuất toàn bộ nhật ký FaceID hoặc sự kiện hệ thống khớp 100% bộ lọc CSDL
     */
    @RequirePermission("ALPR_EXPORT")
    @GetMapping("/api/v1/events/export")
    public ResponseEntity<byte[]> exportEvents(
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long cameraId,
            @RequestParam(required = false, defaultValue = "SYSTEM") String actor) {

        ReportExcelService.ExportResult result = reportExcelService.exportEvents(
                eventType, fromDate, toDate, category, search, cameraId, actor);
        return createExcelResponse(result);
    }

    /**
     * Xuất phân đoạn CSV (Chunked CSV) cho lịch sử biển số ALPR (ADR 0009)
     */
    @RequirePermission("ALPR_EXPORT")
    @GetMapping({"/api/v1/alpr/logs/export/csv-chunk", "/api/v1/alpr/export/csv-chunk"})
    public ResponseEntity<String> exportAlprLogsCsvChunk(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long cameraId,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "10000") int chunkSize) {

        ReportExcelService.CsvChunkResult result = reportExcelService.exportAlprLogsCsvChunk(
                fromDate, toDate, category, search, cameraId, page, chunkSize);

        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header("X-Has-More", String.valueOf(result.hasMore))
                .header("X-Current-Page", String.valueOf(result.page))
                .header("X-Chunk-Rows", String.valueOf(result.rowCount))
                .header("X-Total-Rows", String.valueOf(result.totalElements))
                .body(result.csvData);
    }

    /**
     * Xuất phân đoạn CSV (Chunked CSV) cho toàn bộ sự kiện hệ thống / FaceID (ADR 0009)
     */
    @RequirePermission("ALPR_EXPORT")
    @GetMapping("/api/v1/events/export/csv-chunk")
    public ResponseEntity<String> exportEventsCsvChunk(
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long cameraId,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "10000") int chunkSize) {

        ReportExcelService.CsvChunkResult result = reportExcelService.exportEventsCsvChunk(
                eventType, fromDate, toDate, category, search, cameraId, page, chunkSize);

        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header("X-Has-More", String.valueOf(result.hasMore))
                .header("X-Current-Page", String.valueOf(result.page))
                .header("X-Chunk-Rows", String.valueOf(result.rowCount))
                .header("X-Total-Rows", String.valueOf(result.totalElements))
                .body(result.csvData);
    }

    private ResponseEntity<byte[]> createExcelResponse(ReportExcelService.ExportResult result) {
        String encodedFileName = URLEncoder.encode(result.fileName, StandardCharsets.UTF_8)
                .replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=" + result.fileName + "; filename*=UTF-8''" + encodedFileName)
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header("X-Is-Truncated", String.valueOf(result.truncated))
                .header("X-Total-Rows", String.valueOf(result.totalRows))
                .body(result.bytes);
    }
}
