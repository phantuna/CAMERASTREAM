package org.example.camerastream.modules.auth.service;

import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.modules.auth.dto.AuthDtos.RoleDto;

import java.util.List;

/**
 * IRoleService: CRUD vai trò (role) + đồng bộ quyền (permission). (KỊCH BẢN §4 Block B1)
 *
 * Quy ước (KỊCH BẢN §3/E1-E3):
 *  - RoleDto.code  = mã định danh (DB roles.name, unique, in hoa)
 *  - RoleDto.name  = tên hiển thị (DB roles.display_name)
 *  - PUT: danh sách quyền THAY TOÀN BỘ (replace, không merge)
 *  - Xoá = soft-delete (gán deleted_at), không xoá row vật lý
 *  - Vai gốc SUPER_ADMIN / ROLE_SUPER_ADMIN được bảo vệ (không xoá / đổi mã / rút sạch quyền)
 */
public interface IRoleService {

    /** Danh sách vai trò active (đã loại soft-deleted), kèm mã quyền. */
    List<RoleDto> getAllRoles();

    /** Tạo vai trò mới (E1). */
    ApiResponse<RoleDto> createRole(RoleDto req);

    /** Sửa vai trò + thay toàn bộ danh sách quyền (E2). */
    ApiResponse<RoleDto> updateRole(Long id, RoleDto req);

    /** Soft-delete vai trò (E3). Chặn vai gốc SUPER_ADMIN. */
    ApiResponse<Void> deleteRole(Long id);
}
