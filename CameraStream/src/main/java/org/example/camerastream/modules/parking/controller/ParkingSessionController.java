package org.example.camerastream.modules.parking.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.modules.parking.dto.ParkingSessionDto;
import org.example.camerastream.modules.parking.dto.ParkingSessionFilterQuery;
import org.example.camerastream.modules.parking.dto.VehicleCheckRequest;
import org.example.camerastream.modules.parking.service.IParkingSessionService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

/**
 * REST Controller cho Lịch sử vào ra / Phiên gửi xe (Parking Sessions).
 */
@RestController
@RequestMapping("/api/v1/parking-sessions")
@RequiredArgsConstructor
@Slf4j
public class ParkingSessionController {

    private final IParkingSessionService parkingSessionService;

    /**
     * Tìm kiếm và phân trang phiên gửi xe với QueryDSL.
     * Hỗ trợ tìm theo biển số, khoảng thời gian vào/ra, trạng thái, làn vào/ra, loại xe.
     */
    @GetMapping
    public ApiResponse<Page<ParkingSessionDto>> search(
            @RequestParam(required = false) String plateNumber,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String vehicleType,
            @RequestParam(required = false) Long inLaneId,
            @RequestParam(required = false) Long outLaneId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromTime,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toTime,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        int cappedSize = Math.max(1, Math.min(size, 100)); // Capped max 100 to prevent OOM
        ParkingSessionFilterQuery filter = ParkingSessionFilterQuery.builder()
                .plateNumber(plateNumber)
                .status(status)
                .vehicleType(vehicleType)
                .inLaneId(inLaneId)
                .outLaneId(outLaneId)
                .fromDate(fromTime)
                .toDate(toTime)
                .build();

        Page<ParkingSessionDto> result = parkingSessionService.searchSessions(filter, PageRequest.of(page, cappedSize));
        return ApiResponse.success(result);
    }

    /**
     * Chi tiết 1 phiên gửi xe theo ID.
     */
    @GetMapping("/{id}")
    public ApiResponse<ParkingSessionDto> getById(@PathVariable Long id) {
        ParkingSessionDto dto = parkingSessionService.getSessionById(id);
        if (dto != null) {
            return ApiResponse.success(dto);
        }
        return ApiResponse.error(404, "Không tìm thấy phiên gửi xe với ID: " + id);
    }

    /**
     * Ghi nhận lượt xe vào hoặc ra (tự động ghép phiên theo biển số).
     */
    @PostMapping("/check")
    public ApiResponse<ParkingSessionDto> recordCheck(@RequestBody VehicleCheckRequest request) {
        ParkingSessionDto dto = parkingSessionService.recordVehicleCheck(
                request.getPlateNumber(),
                request.getLaneCode(),
                request.getDirection(),
                request.getPlateImage(),
                request.getOverviewImage()
        );
        return ApiResponse.success("Ghi nhận lượt xe thành công", dto);
    }

    /**
     * Xuất danh sách phiên gửi xe ra file Excel.
     */
    @GetMapping("/export-excel")
    public ResponseEntity<byte[]> exportExcel(
            @RequestParam(required = false) String plateNumber,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String vehicleType,
            @RequestParam(required = false) Long inLaneId,
            @RequestParam(required = false) Long outLaneId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromTime,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toTime) {

        ParkingSessionFilterQuery filter = ParkingSessionFilterQuery.builder()
                .plateNumber(plateNumber)
                .status(status)
                .vehicleType(vehicleType)
                .inLaneId(inLaneId)
                .outLaneId(outLaneId)
                .fromDate(fromTime)
                .toDate(toTime)
                .build();

        byte[] excelBytes = parkingSessionService.exportSessionsToExcel(filter);
        String fileName = "lich_su_xe_ra_vao_" + System.currentTimeMillis() + ".xlsx";
        String encodedFileName = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + fileName + "; filename*=UTF-8''" + encodedFileName)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(excelBytes);
    }
}
