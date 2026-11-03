package org.example.camerastream.modules.gate.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.gate.dto.GateDto;
import org.example.camerastream.modules.gate.dto.GateRequest;
import org.example.camerastream.modules.gate.service.IGateService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * API "Làn Cổng Gate" — danh mục cổng/khu vực để gán camera.
 * Xem cần DEVICE_VIEW; sửa/ xóa cần GATE_MANAGE.
 */
@RestController
@RequestMapping("/api/gates")
@RequiredArgsConstructor
@Slf4j
public class GateController {

    private final IGateService gateService;

    @RequirePermission("DEVICE_VIEW")
    @GetMapping
    public ApiResponse<List<GateDto>> getAllGates() {
        return ApiResponse.success(gateService.getAllGates());
    }

    @RequirePermission("DEVICE_VIEW")
    @GetMapping("/{id}")
    public ApiResponse<GateDto> getGateById(@PathVariable Long id) {
        return gateService.getGateById(id)
                .map(ApiResponse::success)
                .orElseGet(() -> ApiResponse.error(404, "Làn Cổng không tồn tại với ID: " + id));
    }

    @RequirePermission("GATE_MANAGE")
    @PostMapping
    public ApiResponse<GateDto> createGate(@RequestBody GateRequest request) {
        GateDto created = gateService.createGate(request);
        return ApiResponse.success("Tạo Làn Cổng thành công", created);
    }

    @RequirePermission("GATE_MANAGE")
    @PutMapping("/{id}")
    public ApiResponse<GateDto> updateGate(@PathVariable Long id, @RequestBody GateRequest request) {
        GateDto updated = gateService.updateGate(id, request);
        return ApiResponse.success("Cập nhật Làn Cổng thành công", updated);
    }

    @RequirePermission("GATE_MANAGE")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteGate(@PathVariable Long id) {
        gateService.deleteGate(id);
        return ApiResponse.success("Xóa Làn Cổng thành công", null);
    }
}
