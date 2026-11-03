package org.example.camerastream.modules.auth.controller;

import lombok.RequiredArgsConstructor;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.auth.dto.AuthDtos.RoleDto;
import org.example.camerastream.modules.auth.service.IRoleService;
import org.springframework.web.bind.annotation.*;

/**
 * RoleController: CRUD vai trò (E1–E3). (KỊCH BẢN §4 Block B1)
 *
 * - GET /api/roles & GET /api/permissions: đã có sẵn trong AuthController (E7, kèm mã quyền)
 * - POST /api/roles      (E1) — tạo role + đồng bộ role_permissions
 * - PUT  /api/roles/{id} (E2) — sửa + thay toàn bộ danh sách quyền
 * - DELETE /api/roles/{id} (E3) — soft-delete, chặn vai gốc SUPER_ADMIN
 *
 * Mọi endpoint yêu cầu quyền IAM_MANAGE (tạo/sửa/xoá) — GET do AuthController giữ IAM_VIEW.
 */
@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
public class RoleController {

    private final IRoleService roleService;

    @PostMapping
    @RequirePermission("IAM_MANAGE")
    public ApiResponse<RoleDto> createRole(@RequestBody RoleDto req) {
        return roleService.createRole(req);
    }

    @PutMapping("/{id}")
    @RequirePermission("IAM_MANAGE")
    public ApiResponse<RoleDto> updateRole(@PathVariable Long id, @RequestBody RoleDto req) {
        return roleService.updateRole(id, req);
    }

    @DeleteMapping("/{id}")
    @RequirePermission("IAM_MANAGE")
    public ApiResponse<Void> deleteRole(@PathVariable Long id) {
        return roleService.deleteRole(id);
    }
}
