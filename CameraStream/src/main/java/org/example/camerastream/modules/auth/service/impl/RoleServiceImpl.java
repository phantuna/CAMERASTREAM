package org.example.camerastream.modules.auth.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.modules.auth.dto.AuthDtos.RoleDto;
import org.example.camerastream.modules.auth.entity.Permission;
import org.example.camerastream.modules.auth.entity.Role;
import org.example.camerastream.modules.auth.repository.PermissionRepository;
import org.example.camerastream.modules.auth.repository.RoleRepository;
import org.example.camerastream.modules.auth.service.IRoleService;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.example.camerastream.modules.eventhub.audit.service.IAuditLogService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class RoleServiceImpl implements IRoleService {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final IAuditLogService auditLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final Set<String> PROTECTED_ROLE_NAMES =
            Set.of("SUPER_ADMIN", "ROLE_SUPER_ADMIN");

    @Override
    public List<RoleDto> getAllRoles() {
        List<Role> list = roleRepository.findAll().stream()
                .filter(r -> r.getDeleted_at() == null)
                .collect(Collectors.toList());
        Map<String, Role> deduplicated = new LinkedHashMap<>();
        for (Role r : list) {
            String cleanCode = (r.getName() != null ? r.getName() : "").replace("ROLE_", "").trim().toUpperCase();
            Role existing = deduplicated.get(cleanCode);
            if (existing == null || (r.getName() != null && !r.getName().startsWith("ROLE_"))) {
                deduplicated.put(cleanCode, r);
            }
        }
        return deduplicated.values().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Override
    @Transactional
    public ApiResponse<RoleDto> createRole(RoleDto req) {
        if (req.getCode() == null || req.getCode().isBlank()) {
            return ApiResponse.error(400, "Mã vai trò (code) không được để trống.");
        }
        String cleanCode = req.getCode().trim().toUpperCase().replace("ROLE_", "");
        String dbRoleName = cleanCode;
        String prefixedName = "ROLE_" + cleanCode;
        String displayName = (req.getName() != null && !req.getName().isBlank())
                ? req.getName().trim()
                : dbRoleName;

        Optional<Role> existingPlain = roleRepository.findByName(dbRoleName);
        Optional<Role> existingPrefixed = roleRepository.findByName(prefixedName);

        if ((existingPlain.isPresent() && existingPlain.get().getDeleted_at() == null)
                || (existingPrefixed.isPresent() && existingPrefixed.get().getDeleted_at() == null)) {
            return ApiResponse.error(409, "Vai trò với mã '" + cleanCode + "' đã tồn tại.");
        }

        // Nếu từng bị xoá mềm (deleted_at != null), khôi phục lại bản ghi đó thay vì lỗi unique DB
        Role role = existingPlain.orElseGet(() -> existingPrefixed.orElseGet(() ->
                Role.builder().name(dbRoleName).build()
        ));
        role.setName(dbRoleName);
        role.setDisplayName(displayName);
        role.setDescription(req.getDescription());
        role.setDeleted_at(null);
        role.setActive(req.getActive() == null || req.getActive());
        syncPermissions(role, req.getPermissions());

        try {
            Role saved = roleRepository.save(role);
            log.info("[RoleService] Tạo vai trò mới: {} (id={}), {} quyền",
                    saved.getName(), saved.getId(), saved.getPermissions().size());

            RoleDto dto = toDto(saved);
            Map<String, Object> newData = new LinkedHashMap<>();
            newData.put("code", dto.getCode());
            newData.put("name", dto.getName());
            newData.put("description", dto.getDescription());
            newData.put("active", dto.getActive());
            newData.put("permissions", dto.getPermissions());

            auditLogService.record(AuditRecord.builder()
                    .actionType("CREATE")
                    .targetEntity("Role")
                    .targetId(saved.getId())
                    .targetDisplay(dto.getName() + " (" + dto.getCode() + ")")
                    .reason(toJsonReason("Tạo mới nhóm quyền " + dto.getCode(), null, newData, null))
                    .success(true)
                    .build());

            return ApiResponse.success("Tạo vai trò thành công", dto);
        } catch (DataIntegrityViolationException e) {
            return ApiResponse.error(409, "Vai trò '" + dbRoleName + "' đã tồn tại hoặc vi phạm ràng buộc dữ liệu.");
        }
    }

    @Override
    @Transactional
    public ApiResponse<RoleDto> updateRole(Long id, RoleDto req) {
        Optional<Role> opt = roleRepository.findById(id);
        if (opt.isEmpty() || opt.get().getDeleted_at() != null) {
            return ApiResponse.error(404, "Không tìm thấy vai trò cần cập nhật.");
        }
        Role role = opt.get();
        boolean protected_ = PROTECTED_ROLE_NAMES.contains(role.getName());

        RoleDto oldDto = toDto(role);
        Map<String, Object> oldData = new LinkedHashMap<>();
        oldData.put("code", oldDto.getCode());
        oldData.put("name", oldDto.getName());
        oldData.put("description", oldDto.getDescription());
        oldData.put("active", oldDto.getActive());
        oldData.put("permissions", oldDto.getPermissions());

        // Đổi mã (chỉ khi FE truyền code mới khác mã hiện tại)
        if (req.getCode() != null && !req.getCode().isBlank()
                && !req.getCode().trim().toUpperCase().replace("ROLE_", "").equals(role.getName().replace("ROLE_", ""))) {
            if (protected_) {
                return ApiResponse.error(400, "Không thể đổi mã của vai SUPER_ADMIN.");
            }
            String newDbName = req.getCode().trim().toUpperCase().replace("ROLE_", "");
            if (roleRepository.existsByName(newDbName) || roleRepository.existsByName("ROLE_" + newDbName)) {
                return ApiResponse.error(409, "Vai trò với mã '" + newDbName + "' đã tồn tại.");
            }
            role.setName(newDbName);
        }

        if (req.getName() != null) {
            role.setDisplayName(req.getName().isBlank() ? role.getName() : req.getName().trim());
        }
        if (req.getDescription() != null) {
            role.setDescription(req.getDescription());
        }

        // Vô hiệu hoá (chặn với vai gốc SUPER_ADMIN)
        if (Boolean.FALSE.equals(req.getActive()) && protected_) {
            return ApiResponse.error(400, "Không thể vô hiệu hoá vai SUPER_ADMIN.");
        }
        if (req.getActive() != null) {
            role.setActive(req.getActive());
        }

        // Cấm rút toàn bộ quyền của vai gốc
        if (protected_ && req.getPermissions() != null && req.getPermissions().isEmpty()) {
            return ApiResponse.error(400, "Không được phép rút toàn bộ quyền của vai SUPER_ADMIN.");
        }

        // Thay toàn bộ danh sách quyền (replace) — chỉ khi FE truyền danh sách
        if (req.getPermissions() != null) {
            syncPermissions(role, req.getPermissions());
        }

        Role saved;
        try {
            saved = roleRepository.save(role);
            // Đồng bộ bản ghi song sinh có/không có tiền tố ROLE_ nếu tồn tại trong DB
            String cleanCode = saved.getName().replace("ROLE_", "");
            String twinName = saved.getName().startsWith("ROLE_") ? cleanCode : "ROLE_" + cleanCode;
            roleRepository.findByName(twinName).ifPresent(twin -> {
                if (!twin.getId().equals(saved.getId())) {
                    twin.setDisplayName(saved.getDisplayName());
                    twin.setDescription(saved.getDescription());
                    twin.setActive(saved.getActive());
                    twin.setPermissions(new HashSet<>(saved.getPermissions()));
                    roleRepository.save(twin);
                }
            });
        } catch (DataIntegrityViolationException e) {
            return ApiResponse.error(409, "Cập nhật thất bại: mã vai trò trùng lặp hoặc vi phạm ràng buộc dữ liệu.");
        }
        log.info("[RoleService] Cập nhật vai trò {} (id={}): {} quyền",
                saved.getName(), id, saved.getPermissions().size());

        RoleDto newDto = toDto(saved);
        Map<String, Object> newData = new LinkedHashMap<>();
        newData.put("code", newDto.getCode());
        newData.put("name", newDto.getName());
        newData.put("description", newDto.getDescription());
        newData.put("active", newDto.getActive());
        newData.put("permissions", newDto.getPermissions());

        Map<String, Object> changes = computeDiff(oldData, newData);
        auditLogService.record(AuditRecord.builder()
                .actionType("UPDATE")
                .targetEntity("Role")
                .targetId(saved.getId())
                .targetDisplay(newDto.getName() + " (" + newDto.getCode() + ")")
                .reason(toJsonReason("Cập nhật nhóm quyền " + newDto.getCode(), oldData, newData, changes))
                .success(true)
                .build());

        return ApiResponse.success("Cập nhật vai trò thành công", newDto);
    }

    @Override
    @Transactional
    public ApiResponse<Void> deleteRole(Long id) {
        Role role = roleRepository.findById(id).orElse(null);
        if (role == null || role.getDeleted_at() != null) {
            return ApiResponse.error(404, "Không tìm thấy vai trò cần xoá.");
        }
        if (PROTECTED_ROLE_NAMES.contains(role.getName())) {
            return ApiResponse.error(400, "Không thể xoá vai gốc SUPER_ADMIN.");
        }
        RoleDto oldDto = toDto(role);
        Map<String, Object> oldData = new LinkedHashMap<>();
        oldData.put("code", oldDto.getCode());
        oldData.put("name", oldDto.getName());
        oldData.put("description", oldDto.getDescription());

        LocalDateTime now = LocalDateTime.now();
        role.setDeleted_at(now);
        roleRepository.save(role);

        // Xoá mềm luôn bản ghi song sinh có/không có tiền tố ROLE_ để không còn sót lại trên UI
        String cleanCode = role.getName().replace("ROLE_", "");
        String twinName = role.getName().startsWith("ROLE_") ? cleanCode : "ROLE_" + cleanCode;
        roleRepository.findByName(twinName).ifPresent(twin -> {
            if (twin.getDeleted_at() == null) {
                twin.setDeleted_at(now);
                roleRepository.save(twin);
            }
        });

        log.info("[RoleService] Soft-delete vai trò {} (id={})", role.getName(), id);

        auditLogService.record(AuditRecord.builder()
                .actionType("DELETE")
                .targetEntity("Role")
                .targetId(role.getId())
                .targetDisplay(oldDto.getName() + " (" + oldDto.getCode() + ")")
                .reason(toJsonReason("Xóa nhóm quyền " + oldDto.getCode(), oldData, null, null))
                .success(true)
                .build());

        return ApiResponse.success("Xoá vai trò thành công", null);
    }

    private Map<String, Object> computeDiff(Map<String, Object> oldData, Map<String, Object> newData) {
        Map<String, Object> changes = new LinkedHashMap<>();
        if (oldData == null || newData == null) return changes;
        for (String key : newData.keySet()) {
            Object oldVal = oldData.get(key);
            Object newVal = newData.get(key);
            if (!Objects.equals(oldVal, newVal)) {
                Map<String, Object> pair = new LinkedHashMap<>();
                pair.put("old", oldVal);
                pair.put("new", newVal);
                changes.put(key, pair);
            }
        }
        return changes;
    }

    private String toJsonReason(String note, Map<String, Object> oldData, Map<String, Object> newData, Map<String, Object> changes) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            if (note != null) payload.put("note", note);
            if (oldData != null && !oldData.isEmpty()) payload.put("oldData", oldData);
            if (newData != null && !newData.isEmpty()) payload.put("newData", newData);
            if (changes != null && !changes.isEmpty()) payload.put("changes", changes);
            return objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            return note;
        }
    }

    /** Thay toàn bộ danh sách quyền của role bằng tập mã code (bỏ qua code không tồn tại trong DB). */
    private void syncPermissions(Role role, List<String> codes) {
        Set<Permission> target = new HashSet<>();
        if (codes != null) {
            for (String c : codes) {
                if (c == null || c.isBlank()) continue;
                permissionRepository.findByCode(c.trim().toUpperCase()).ifPresent(target::add);
            }
        }
        role.setPermissions(target);
    }

    private RoleDto toDto(Role r) {
        List<String> perms = r.getPermissions() != null
                ? r.getPermissions().stream().map(Permission::getCode).collect(Collectors.toList())
                : List.of();
        String rawName = r.getName() != null ? r.getName() : "";
        return RoleDto.builder()
                .id(r.getId())
                .code(rawName.replace("ROLE_", ""))
                .name(r.getDisplayName() != null ? r.getDisplayName() : rawName)
                .description(r.getDescription())
                .permissions(perms)
                .active(r.getActive())
                .build();
    }
}
