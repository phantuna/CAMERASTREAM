package org.example.camerastream.modules.eventhub.reporting.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.xssf.usermodel.*;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.example.camerastream.modules.eventhub.audit.service.IAuditLogService;
import org.example.camerastream.modules.eventhub.entity.SystemEvent;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryFilterQuery;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryItemDto;
import org.example.camerastream.modules.eventhub.reporting.dto.TrafficSummaryResult;
import org.example.camerastream.modules.eventhub.repository.SystemEventRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Xuất báo cáo dạng XLSX (Apache POI) + ghi audit log theo chuẩn HPTicket.
 */
@Service
@Slf4j
public class ReportExcelService {

    private final TrafficSummaryService trafficSummaryService;
    private final IAuditLogService auditLogService;
    private final SystemEventRepository eventRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportExcelService(TrafficSummaryService trafficSummaryService,
                              IAuditLogService auditLogService,
                              SystemEventRepository eventRepository) {
        this.trafficSummaryService = trafficSummaryService;
        this.auditLogService = auditLogService;
        this.eventRepository = eventRepository;
    }

    /** Kết quả: bytes xlsx + tên file + flag truncated (để UI cảnh báo). */
    public static class ExportResult {
        public final byte[] bytes;
        public final String fileName;
        public final boolean truncated;
        public final long totalRows;

        public ExportResult(byte[] bytes, String fileName, boolean truncated, long totalRows) {
            this.bytes = bytes;
            this.fileName = fileName;
            this.truncated = truncated;
            this.totalRows = totalRows;
        }
    }

    /** Kết quả phân đoạn CSV (ADR 0009): dữ liệu text + cờ hasMore + tổng số dòng. */
    public static class CsvChunkResult {
        public final String csvData;
        public final boolean hasMore;
        public final int page;
        public final int chunkSize;
        public final int rowCount;
        public final long totalElements;

        public CsvChunkResult(String csvData, boolean hasMore, int page, int chunkSize, int rowCount, long totalElements) {
            this.csvData = csvData;
            this.hasMore = hasMore;
            this.page = page;
            this.chunkSize = chunkSize;
            this.rowCount = rowCount;
            this.totalElements = totalElements;
        }
    }

    @Transactional
    public ExportResult exportTrafficSummary(TrafficSummaryFilterQuery query, String actorUsername) {
        TrafficSummaryResult result = trafficSummaryService.getTrafficSummary(query);
        byte[] xlsx = buildTrafficSummaryXlsx(result.getItems());

        String timestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss").format(LocalDateTime.now());
        String fileName = "Bao_Cao_Luot_Xe_" + timestamp + ".xlsx";

        auditLogService.record(AuditRecord.builder()
                .actorUsername(actorUsername != null ? actorUsername : "SYSTEM")
                .source("WEBADMIN")
                .actionType("EXPORT")
                .targetEntity("TrafficSummary")
                .targetDisplay(fileName)
                .reason(queryToReason(query))
                .success(true)
                .build());

        log.info("Exported traffic summary: {} plates, {} bytes, file='{}', truncated={}",
                result.getItems().size(), xlsx.length, fileName, result.isTruncated());

        return new ExportResult(xlsx, fileName, result.isTruncated(), result.getTotalRows());
    }

    @Transactional
    public ExportResult exportAlprLogs(LocalDate fromDate, LocalDate toDate, String category,
                                       String search, Long cameraId, String actorUsername) {
        LocalDateTime fromTime = fromDate != null ? fromDate.atStartOfDay() : null;
        LocalDateTime toTime = toDate != null ? toDate.plusDays(1).atStartOfDay() : null;
        String vehicleType = (category != null && !category.equalsIgnoreCase("ALL")) ? category.trim() : null;
        String keyword = (search != null && !search.isBlank()) ? search.trim() : null;

        // Truy vấn tối đa 50,000 bản ghi theo bộ lọc CSDL
        Page<SystemEvent> eventPage = eventRepository.searchEvents(
                "VEHICLE_ANPR", cameraId, keyword, vehicleType, fromTime, toTime, PageRequest.of(0, 50000));

        List<SystemEvent> events = eventPage.getContent();
        boolean truncated = eventPage.getTotalElements() > 50000;

        byte[] xlsx = buildAlprLogsXlsx(events);
        String timestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss").format(LocalDateTime.now());
        String fileName = "Lich_Su_Bien_So_" + timestamp + ".xlsx";

        try {
            auditLogService.record(AuditRecord.builder()
                    .actorUsername(actorUsername != null ? actorUsername : "SYSTEM")
                    .source("WEBADMIN")
                    .actionType("EXPORT")
                    .targetEntity("AlprLogs")
                    .targetDisplay(fileName)
                    .reason("ALPR export from=" + fromDate + " to=" + toDate + " search=" + search)
                    .success(true)
                    .build());
        } catch (Exception e) {
            log.warn("[Audit] Không thể ghi audit log cho export ALPR: {}", e.getMessage());
        }

        return new ExportResult(xlsx, fileName, truncated, eventPage.getTotalElements());
    }

    @Transactional
    public ExportResult exportEvents(String eventType, LocalDate fromDate, LocalDate toDate,
                                     String category, String search, Long cameraId, String actorUsername) {
        LocalDateTime fromTime = fromDate != null ? fromDate.atStartOfDay() : null;
        LocalDateTime toTime = toDate != null ? toDate.plusDays(1).atStartOfDay() : null;
        String type = (eventType != null && !eventType.isBlank()) ? eventType : null;
        String vehicleType = (category != null && !category.equalsIgnoreCase("ALL")) ? category.trim() : null;
        String keyword = (search != null && !search.isBlank()) ? search.trim() : null;

        Page<SystemEvent> eventPage = eventRepository.searchEvents(
                type, cameraId, keyword, vehicleType, fromTime, toTime, PageRequest.of(0, 50000));

        List<SystemEvent> events = eventPage.getContent();
        boolean truncated = eventPage.getTotalElements() > 50000;

        byte[] xlsx = buildGeneralEventsXlsx(events, type);
        String timestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss").format(LocalDateTime.now());
        String fileName = (type != null ? type : "Su_Kien") + "_" + timestamp + ".xlsx";

        try {
            auditLogService.record(AuditRecord.builder()
                    .actorUsername(actorUsername != null ? actorUsername : "SYSTEM")
                    .source("WEBADMIN")
                    .actionType("EXPORT")
                    .targetEntity("Events")
                    .targetDisplay(fileName)
                    .reason("Events export type=" + type + " from=" + fromDate + " to=" + toDate)
                    .success(true)
                    .build());
        } catch (Exception e) {
            log.warn("[Audit] Không thể ghi audit log cho export Events: {}", e.getMessage());
        }

        return new ExportResult(xlsx, fileName, truncated, eventPage.getTotalElements());
    }

    /**
     * Xuất phân đoạn CSV theo Keyset Pagination (ADR 0009) - giải phóng bộ nhớ ngay sau khi xuất.
     */
    @Transactional(readOnly = true)
    public CsvChunkResult exportAlprLogsCsvChunk(LocalDate fromDate, LocalDate toDate, String category,
                                                 String search, Long cameraId, int page, int chunkSize) {
        LocalDateTime fromTime = fromDate != null ? fromDate.atStartOfDay() : null;
        LocalDateTime toTime = toDate != null ? toDate.plusDays(1).atStartOfDay() : null;
        String vehicleType = (category != null && !category.equalsIgnoreCase("ALL")) ? category.trim() : null;
        String keyword = (search != null && !search.isBlank()) ? search.trim() : null;

        int safeSize = Math.max(100, Math.min(chunkSize, 20000));
        Page<SystemEvent> eventPage = eventRepository.searchEvents(
                "VEHICLE_ANPR", cameraId, keyword, vehicleType, fromTime, toTime, PageRequest.of(page, safeSize));

        List<SystemEvent> events = eventPage.getContent();
        StringBuilder sb = new StringBuilder();

        if (page == 0) {
            sb.append("STT,Biển số xe,Loại xe,Camera / Cổng,Thời gian,Độ tin cậy (%),Mức cảnh báo,Ảnh Snapshot\n");
        }

        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        int stt = page * safeSize + 1;

        for (SystemEvent ev : events) {
            JsonNode payload = parsePayload(ev.getPayloadJson());
            String plate = textOr(payload, "plateNumber", textOr(payload, "plate", "UNKNOWN"));
            String vType = textOr(payload, "vehicleType", textOr(payload, "category", "CAR"));
            String timeStr = ev.getCreated_at() != null ? ev.getCreated_at().format(dtf) : "";
            String confStr = ev.getConfidence() != null ? String.format("%.1f%%", ev.getConfidence() * 100) : "-";
            String sevStr = ev.getSeverity() != null ? ev.getSeverity().name() : "INFO";

            sb.append(stt++).append(",")
              .append(escapeCsv(plate)).append(",")
              .append(escapeCsv(formatVehicleType(vType))).append(",")
              .append(escapeCsv(nz(ev.getCameraName()))).append(",")
              .append(escapeCsv(timeStr)).append(",")
              .append(escapeCsv(confStr)).append(",")
              .append(escapeCsv(sevStr)).append(",")
              .append(escapeCsv(nz(ev.getSnapshotUrl()))).append("\n");
        }

        boolean hasMore = (long) (page + 1) * safeSize < eventPage.getTotalElements();
        return new CsvChunkResult(sb.toString(), hasMore, page, safeSize, events.size(), eventPage.getTotalElements());
    }

    @Transactional(readOnly = true)
    public CsvChunkResult exportEventsCsvChunk(String eventType, LocalDate fromDate, LocalDate toDate,
                                              String category, String search, Long cameraId, int page, int chunkSize) {
        LocalDateTime fromTime = fromDate != null ? fromDate.atStartOfDay() : null;
        LocalDateTime toTime = toDate != null ? toDate.plusDays(1).atStartOfDay() : null;
        String type = (eventType != null && !eventType.isBlank()) ? eventType.trim() : null;
        String vehicleType = (category != null && !category.equalsIgnoreCase("ALL")) ? category.trim() : null;
        String keyword = (search != null && !search.isBlank()) ? search.trim() : null;

        int safeSize = Math.max(100, Math.min(chunkSize, 20000));
        Page<SystemEvent> eventPage = eventRepository.searchEvents(
                type, cameraId, keyword, vehicleType, fromTime, toTime, PageRequest.of(page, safeSize));

        List<SystemEvent> events = eventPage.getContent();
        StringBuilder sb = new StringBuilder();

        if (page == 0) {
            sb.append("STT,Mã sự kiện,Loại sự kiện,Camera / Vị trí,Thời gian,Độ tin cậy (%),Mức cảnh báo,Ảnh Snapshot\n");
        }

        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        int stt = page * safeSize + 1;

        for (SystemEvent ev : events) {
            String timeStr = ev.getCreated_at() != null ? ev.getCreated_at().format(dtf) : "";
            String confStr = ev.getConfidence() != null ? String.format("%.1f%%", ev.getConfidence() * 100) : "-";
            String sevStr = ev.getSeverity() != null ? ev.getSeverity().name() : "INFO";

            sb.append(stt++).append(",")
              .append(ev.getId() != null ? ev.getId() : "").append(",")
              .append(escapeCsv(nz(ev.getEventType()))).append(",")
              .append(escapeCsv(nz(ev.getCameraName()))).append(",")
              .append(escapeCsv(timeStr)).append(",")
              .append(escapeCsv(confStr)).append(",")
              .append(escapeCsv(sevStr)).append(",")
              .append(escapeCsv(nz(ev.getSnapshotUrl()))).append("\n");
        }

        boolean hasMore = (long) (page + 1) * safeSize < eventPage.getTotalElements();
        return new CsvChunkResult(sb.toString(), hasMore, page, safeSize, events.size(), eventPage.getTotalElements());
    }

    private String escapeCsv(String val) {
        if (val == null) return "\"\"";
        return "\"" + val.replace("\"", "\"\"") + "\"";
    }

    private byte[] buildAlprLogsXlsx(List<SystemEvent> events) {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            XSSFSheet sheet = wb.createSheet("Lich Su Bien So");

            String[] headers = {
                    "STT", "Biển số xe", "Loại xe", "Camera / Cổng", "Thời gian",
                    "Độ tin cậy (%)", "Mức cảnh báo", "Ảnh Snapshot"
            };

            XSSFRow headerRow = sheet.createRow(0);
            XSSFCellStyle headerStyle = wb.createCellStyle();
            headerStyle.setFillForegroundColor(IndexedColors.ROYAL_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            XSSFFont headerFont = wb.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerFont.setFontName("Segoe UI");
            headerStyle.setFont(headerFont);
            headerRow.setHeight((short) (28 * 20));

            for (int i = 0; i < headers.length; i++) {
                XSSFCell c = headerRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 20 * 256);
            }

            int rowIdx = 1;
            for (SystemEvent ev : events) {
                XSSFRow row = sheet.createRow(rowIdx);
                row.createCell(0).setCellValue(rowIdx);

                JsonNode payload = parsePayload(ev.getPayloadJson());
                String plate = textOr(payload, "plateNumber", textOr(payload, "plate", "UNKNOWN"));
                String vType = textOr(payload, "vehicleType", textOr(payload, "category", "CAR"));

                row.createCell(1).setCellValue(plate);
                row.createCell(2).setCellValue(formatVehicleType(vType));
                row.createCell(3).setCellValue(nz(ev.getCameraName()));
                row.createCell(4).setCellValue(ev.getCreated_at() != null
                        ? ev.getCreated_at().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : "");
                row.createCell(5).setCellValue(ev.getConfidence() != null ? String.format("%.1f%%", ev.getConfidence() * 100) : "-");
                row.createCell(6).setCellValue(ev.getSeverity() != null ? ev.getSeverity().name() : "INFO");
                row.createCell(7).setCellValue(nz(ev.getSnapshotUrl()));

                rowIdx++;
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to build ALPR XLSX: " + e.getMessage(), e);
        }
    }

    private byte[] buildGeneralEventsXlsx(List<SystemEvent> events, String eventType) {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            XSSFSheet sheet = wb.createSheet("Nhat Ky Su Kien");

            String[] headers = {
                    "STT", "Mã sự kiện", "Loại sự kiện", "Camera / Vị trí", "Thời gian",
                    "Độ tin cậy", "Cảnh báo", "Chi tiết / Đối tượng", "Ảnh chụp"
            };

            XSSFRow headerRow = sheet.createRow(0);
            XSSFCellStyle headerStyle = wb.createCellStyle();
            headerStyle.setFillForegroundColor(IndexedColors.DARK_TEAL.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            XSSFFont headerFont = wb.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerFont.setFontName("Segoe UI");
            headerStyle.setFont(headerFont);
            headerRow.setHeight((short) (28 * 20));

            for (int i = 0; i < headers.length; i++) {
                XSSFCell c = headerRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 20 * 256);
            }

            int rowIdx = 1;
            for (SystemEvent ev : events) {
                XSSFRow row = sheet.createRow(rowIdx);
                row.createCell(0).setCellValue(rowIdx);
                row.createCell(1).setCellValue(ev.getId() != null ? "#" + ev.getId() : "");
                row.createCell(2).setCellValue(nz(ev.getEventType()));
                row.createCell(3).setCellValue(nz(ev.getCameraName()));
                row.createCell(4).setCellValue(ev.getCreated_at() != null
                        ? ev.getCreated_at().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : "");
                row.createCell(5).setCellValue(ev.getConfidence() != null ? String.format("%.1f%%", ev.getConfidence() * 100) : "-");
                row.createCell(6).setCellValue(ev.getSeverity() != null ? ev.getSeverity().name() : "INFO");

                JsonNode payload = parsePayload(ev.getPayloadJson());
                String details = textOr(payload, "personName", textOr(payload, "plateNumber", textOr(payload, "name", "-")));
                row.createCell(7).setCellValue(details);
                row.createCell(8).setCellValue(nz(ev.getSnapshotUrl()));

                rowIdx++;
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to build Events XLSX: " + e.getMessage(), e);
        }
    }

    private String formatVehicleType(String type) {
        if (type == null) return "Không xác định";
        switch (type.toUpperCase()) {
            case "CAR": return "Ô tô";
            case "MOTO":
            case "MOTORCYCLE": return "Xe máy";
            case "TRUCK": return "Xe tải";
            case "BUS": return "Xe buýt";
            default: return type;
        }
    }

    private JsonNode parsePayload(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private String textOr(JsonNode node, String field, String fallback) {
        if (node == null || !node.has(field) || node.get(field).isNull()) return fallback;
        String val = node.get(field).asText();
        return val != null && !val.isBlank() ? val : fallback;
    }

    private String queryToReason(TrafficSummaryFilterQuery q) {
        if (q == null) return "export";
        StringBuilder sb = new StringBuilder("export");
        if (q.getFromDate() != null) sb.append(" from=").append(q.getFromDate());
        if (q.getToDate() != null) sb.append(" to=").append(q.getToDate());
        if (q.getCameraId() != null) sb.append(" camera=").append(q.getCameraId());
        if (q.getPlateKeyword() != null && !q.getPlateKeyword().isBlank()) {
            sb.append(" plate~'").append(q.getPlateKeyword()).append("'");
        }
        return sb.toString();
    }

    private byte[] buildTrafficSummaryXlsx(List<TrafficSummaryItemDto> items) {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            XSSFSheet sheet = wb.createSheet("Bao Cao Luot Xe");

            String[] headers = {
                    "Biển số", "Loại xe", "Camera", "Lượt vào", "Lượt ra",
                    "Tổng event", "Tin cậy TB", "Lần cuối thấy", "Làn/Cổng"
            };

            XSSFRow headerRow = sheet.createRow(0);
            XSSFCellStyle headerStyle = wb.createCellStyle();
            headerStyle.setFillForegroundColor(IndexedColors.SEA_GREEN.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            XSSFFont headerFont = wb.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerFont.setFontName("Segoe UI");
            headerStyle.setFont(headerFont);
            headerRow.setHeight((short) (28 * 20));

            for (int i = 0; i < headers.length; i++) {
                XSSFCell c = headerRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 18 * 256);
            }

            int rowIdx = 1;
            for (TrafficSummaryItemDto item : items) {
                XSSFRow row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(nz(item.getPlateNumber()));
                row.createCell(1).setCellValue(nz(item.getVehicleType()));
                row.createCell(2).setCellValue(nz(item.getCameraName()));
                row.createCell(3).setCellValue(item.getInCount());
                row.createCell(4).setCellValue(item.getOutCount());
                row.createCell(5).setCellValue(item.getTotalEvents());
                if (item.getConfidenceAvg() != null) {
                    row.createCell(6).setCellValue(item.getConfidenceAvg());
                } else {
                    row.createCell(6).setCellValue("-");
                }
                row.createCell(7).setCellValue(item.getLastSeenAt() != null
                        ? item.getLastSeenAt().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : "");
                row.createCell(8).setCellValue(nz(item.getLastLane()));
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to build XLSX workbook: " + e.getMessage(), e);
        }
    }

    private String nz(String s) {
        return s == null ? "" : s;
    }
}
