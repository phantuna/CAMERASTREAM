package org.example.camerastream.modules.parking.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.modules.parking.dto.LaneDto;
import org.example.camerastream.modules.parking.service.ILaneService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST Controller quản lý Làn kiểm soát xe (Lanes Management).
 */
@RestController
@RequestMapping("/api/v1/parking-lanes")
@RequiredArgsConstructor
@Slf4j
public class LaneManagementController {

    private final ILaneService laneService;

    @GetMapping
    public ApiResponse<List<LaneDto>> getAll() {
        return ApiResponse.success(laneService.getAllActiveLanes());
    }

    @GetMapping("/{id}")
    public ApiResponse<LaneDto> getById(@PathVariable Long id) {
        LaneDto dto = laneService.getLaneById(id);
        if (dto != null) {
            return ApiResponse.success(dto);
        }
        return ApiResponse.error(404, "Không tìm thấy làn với ID: " + id);
    }

    @PostMapping
    public ApiResponse<LaneDto> create(@RequestBody LaneDto dto) {
        return ApiResponse.success("Thêm mới làn thành công", laneService.createLane(dto));
    }

    @PutMapping("/{id}")
    public ApiResponse<LaneDto> update(@PathVariable Long id, @RequestBody LaneDto dto) {
        return ApiResponse.success("Cập nhật làn thành công", laneService.updateLane(id, dto));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        laneService.deleteLane(id);
        return ApiResponse.success("Xóa làn thành công", null);
    }
}
