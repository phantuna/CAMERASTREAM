package org.example.camerastream.common.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.auth.entity.Permission;
import org.example.camerastream.modules.auth.entity.Role;
import org.example.camerastream.modules.auth.repository.PermissionRepository;
import org.example.camerastream.modules.auth.repository.RoleRepository;
import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.hardware.ICameraHardwareConnector;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.gate.entity.Gate;
import org.example.camerastream.modules.gate.repository.GateRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class DataInitializer {

    private final CameraRepository cameraRepository;
    private final ICameraHardwareConnector hardwareConnector;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final GateRepository gateRepository;
    private final TransactionTemplate transactionTemplate;

    @Bean
    public CommandLineRunner initDefaultData() {
        return args -> {
            // 1. Dọn dẹp các bản ghi Role bị trùng lặp giữa tiền tố ROLE_xxx và xxx trong CSDL
            transactionTemplate.executeWithoutResult(status -> {
                deduplicateRolesOnStartup();
                seedDefaultGatesAndPermissions();
            });

            // 2. Đồng bộ danh sách camera đang active sang MediaMTX khi khởi động
            List<Camera> cameras = cameraRepository.findAllActive();
            log.info("[Startup] Đồng bộ {} camera đang kích hoạt sang MediaMTX...", cameras.size());
            for (Camera cam : cameras) {
                if (cam.getRtspSourceUrl() != null && !cam.getRtspSourceUrl().isBlank()) {
                    hardwareConnector.registerStream(cam.getStreamPath(), cam.getRtspSourceUrl());
                }
            }
            log.info("[Startup] Hệ thống CameraStream sẵn sàng hoạt động.");
        };
    }

    private void seedDefaultGatesAndPermissions() {
        try {
            // Đảm bảo quyền GATE_MANAGE luôn tồn tại
            Permission gateManagePerm = permissionRepository.findByCode("GATE_MANAGE").orElseGet(() -> {
                Permission p = Permission.builder()
                        .code("GATE_MANAGE")
                        .name("Quản lý Làn Cổng & Địa Điểm")
                        .groupName("Thiết Bị & Hệ Thống")
                        .description("Khai báo, sửa và xóa danh mục cổng/khu vực (gate) để gán camera")
                        .build();
                return permissionRepository.save(p);
            });

            // Gán quyền GATE_MANAGE cho các role ADMIN / SUPER_ADMIN / MANAGER nếu chưa có
            List<Role> adminRoles = roleRepository.findAll().stream()
                    .filter(r -> r.getDeleted_at() == null && r.getName() != null)
                    .filter(r -> List.of("ADMIN", "ROLE_ADMIN", "SUPER_ADMIN", "ROLE_SUPER_ADMIN", "MANAGER", "ROLE_MANAGER").contains(r.getName().toUpperCase()))
                    .toList();
            for (Role role : adminRoles) {
                var perms = new HashSet<>(role.getPermissions() != null ? role.getPermissions() : List.of());
                if (perms.stream().noneMatch(p -> "GATE_MANAGE".equals(p.getCode()))) {
                    perms.add(gateManagePerm);
                    role.setPermissions(perms);
                    roleRepository.save(role);
                }
            }

            // Khởi tạo 3 Làn Cổng mặc định nếu bảng gates đang trống
            if (gateRepository.findAllActive().isEmpty()) {
                seedGateIfAbsent("IN_GATE", "Cổng Vào", "Làn xe vào cổng chính", "Cổng điều khiển xe vào trong hệ thống");
                seedGateIfAbsent("OUT_GATE", "Cổng Ra", "Làn xe ra cổng chính", "Cổng điều khiển xe ra ngoài hệ thống");
                seedGateIfAbsent("OVERVIEW", "Bãi Xe", "Bãi đỗ xe trung tâm", "Vùng quan sát tổng thể bãi đỗ xe");
                log.info("[Startup] Đã khởi tạo danh mục Làn Cổng (Gate) mặc định.");
            }
        } catch (Exception e) {
            log.warn("[Startup] Không thể khởi tạo danh mục Gate mặc định: {}", e.getMessage());
        }
    }

    private void seedGateIfAbsent(String code, String name, String location, String description) {
        if (gateRepository.findByCode(code).isEmpty()) {
            Gate g = Gate.builder()
                    .code(code)
                    .name(name)
                    .location(location)
                    .description(description)
                    .build();
            g.setActive(true);
            g.setCreated_at(LocalDateTime.now());
            g.setUpdated_at(LocalDateTime.now());
            gateRepository.save(g);
        }
    }

    private void deduplicateRolesOnStartup() {
        try {
            List<Role> activeRoles = roleRepository.findAll().stream()
                    .filter(r -> r.getDeleted_at() == null && r.getName() != null)
                    .toList();
            Map<String, Role> byName = activeRoles.stream()
                    .collect(Collectors.toMap(Role::getName, r -> r, (a, b) -> a));

            LocalDateTime now = LocalDateTime.now();
            for (Role r : activeRoles) {
                if (r.getName().startsWith("ROLE_")) {
                    String cleanName = r.getName().substring("ROLE_".length());
                    Role canonical = byName.get(cleanName);
                    if (canonical != null && !canonical.getId().equals(r.getId())) {
                        // Gộp quyền từ bản ROLE_ sang bản chuẩn (nếu thiếu) và xóa mềm bản ROLE_ thừa
                        if (r.getPermissions() != null && !r.getPermissions().isEmpty()) {
                            var mergedPerms = new HashSet<>(
                                    canonical.getPermissions() != null ? canonical.getPermissions() : List.of()
                            );
                            mergedPerms.addAll(r.getPermissions());
                            canonical.setPermissions(mergedPerms);
                            roleRepository.save(canonical);
                        }
                        r.setDeleted_at(now);
                        roleRepository.save(r);
                        log.info("[Startup] Đã gộp và ẩn bản ghi Role trùng lặp '{}' (id={}) vào '{}' (id={})",
                                r.getName(), r.getId(), canonical.getName(), canonical.getId());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[Startup] Không thể tự động gộp Role trùng lặp: {}", e.getMessage());
        }
    }
}
