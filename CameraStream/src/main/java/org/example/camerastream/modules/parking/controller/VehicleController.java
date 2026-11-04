package org.example.camerastream.modules.parking.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.modules.parking.dto.VehicleDto;
import org.example.camerastream.modules.parking.dto.VehicleFilterQuery;
import org.example.camerastream.modules.parking.service.IVehicleService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * REST Controller quản lý Danh bạ phương tiện (Vehicles Master Data).
 */
@RestController
@RequestMapping("/api/v1/vehicles")
@RequiredArgsConstructor
@Slf4j
public class VehicleController {

    private final IVehicleService vehicleService;

    /**
     * Tìm kiếm & phân trang phương tiện với QueryDSL và fetchJoin().
     */
    @GetMapping
    public ApiResponse<Page<VehicleDto>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String vehicleType,
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Boolean active,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        int cappedSize = Math.max(1, Math.min(size, 100));
        VehicleFilterQuery filter = VehicleFilterQuery.builder()
                .keyword(keyword)
                .vehicleType(vehicleType)
                .companyId(companyId)
                .departmentId(departmentId)
                .active(active)
                .build();

        Page<VehicleDto> result = vehicleService.searchVehicles(filter, PageRequest.of(page, cappedSize));
        return ApiResponse.success(result);
    }

    /**
     * Xem thông tin phương tiện theo ID.
     */
    @GetMapping("/{id}")
    public ApiResponse<VehicleDto> getById(@PathVariable Long id) {
        VehicleDto dto = vehicleService.getVehicleById(id);
        if (dto != null) {
            return ApiResponse.success(dto);
        }
        return ApiResponse.error(404, "Không tìm thấy phương tiện với ID: " + id);
    }

    /**
     * Thêm mới phương tiện.
     */
    @PostMapping
    public ApiResponse<VehicleDto> create(@RequestBody VehicleDto dto) {
        VehicleDto created = vehicleService.createVehicle(dto);
        return ApiResponse.success("Thêm mới phương tiện thành công", created);
    }

    /**
     * Cập nhật thông tin phương tiện.
     */
    @PutMapping("/{id}")
    public ApiResponse<VehicleDto> update(@PathVariable Long id, @RequestBody VehicleDto dto) {
        VehicleDto updated = vehicleService.updateVehicle(id, dto);
        return ApiResponse.success("Cập nhật thông tin phương tiện thành công", updated);
    }

    /**
     * Xóa phương tiện (soft delete hoặc hard delete).
     */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        vehicleService.deleteVehicle(id);
        return ApiResponse.success("Xóa phương tiện thành công", null);
    }

    /**
     * Xuất danh sách phương tiện ra Excel.
     */
    @GetMapping("/export-excel")
    public ResponseEntity<byte[]> exportExcel(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String vehicleType,
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Boolean active) {

        VehicleFilterQuery filter = VehicleFilterQuery.builder()
                .keyword(keyword)
                .vehicleType(vehicleType)
                .companyId(companyId)
                .departmentId(departmentId)
                .active(active)
                .build();

        byte[] excelBytes = vehicleService.exportVehiclesToExcel(filter);
        String fileName = "danh_sach_phuong_tien_" + System.currentTimeMillis() + ".xlsx";
        String encodedFileName = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + fileName + "; filename*=UTF-8''" + encodedFileName)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(excelBytes);
    }
}
