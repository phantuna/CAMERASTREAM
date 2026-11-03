package org.example.camerastream.modules.gate.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.repository.CameraRepository;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.example.camerastream.modules.eventhub.audit.service.IAuditLogService;
import org.example.camerastream.modules.gate.dto.GateDto;
import org.example.camerastream.modules.gate.dto.GateRequest;
import org.example.camerastream.modules.gate.entity.Gate;
import org.example.camerastream.modules.gate.repository.GateRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class GateServiceImpl implements IGateService {

    private final GateRepository gateRepository;
    private final CameraRepository cameraRepository;
    private final IAuditLogService auditLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private GateDto toDto(Gate g) {
        return GateDto.builder()
                .id(g.getId())
                .code(g.getCode())
                .name(g.getName())
                .location(g.getLocation())
                .description(g.getDescription())
                .active(g.getActive() == null || g.getActive())
                .createdAt(g.getCreated_at())
                .updatedAt(g.getUpdated_at())
                .build();
    }

    @Override
    public List<GateDto> getAllGates() {
        return gateRepository.findAllActive().stream().map(this::toDto).toList();
    }

    @Override
    public Optional<GateDto> getGateById(Long id) {
        return gateRepository.findActiveById(id).map(this::toDto);
    }

    @Override
    @Transactional
    public GateDto createGate(GateRequest request) {
        if (request == null || request.getCode() == null || request.getCode().isBlank()) {
            throw new IllegalArgumentException("Mã cổng (code) không được để trống.");
        }
        if (request.getName() == null || request.getName().isBlank()) {
            throw new IllegalArgumentException("Tên cổng (name) không được để trống.");
        }

        String code = request.getCode().trim().toUpperCase();
        Optional<Gate> existingByCode = gateRepository.findByCode(code);
        if (existingByCode.isPresent() && existingByCode.get().getDeleted_at() == null) {
            throw new IllegalArgumentException("Mã cổng '" + code + "' đã tồn tại.");
        }

        Gate gate;
        if (existingByCode.isPresent()) {
            // Khôi phục bản ghi đã xóa mềm
            gate = existingByCode.get();
            gate.setName(request.getName().trim());
            gate.setLocation(trimOrNull(request.getLocation()));
            gate.setDescription(trimOrNull(request.getDescription()));
            gate.setActive(request.getActive() == null || request.getActive());
            gate.setDeleted_at(null);
            gate.setUpdated_at(LocalDateTime.now());
        } else {
            gate = Gate.builder()
                    .code(code)
                    .name(request.getName().trim())
                    .location(trimOrNull(request.getLocation()))
                    .description(trimOrNull(request.getDescription()))
                    .build();
            gate.setActive(request.getActive() == null || request.getActive());
            gate.setCreated_at(LocalDateTime.now());
            gate.setUpdated_at(LocalDateTime.now());
        }

        Gate saved = gateRepository.save(gate);
        log.info("[GateAPI] Tạo Làn Cổng mới: code={}, id={}", code, saved.getId());

        Map<String, Object> newData = new LinkedHashMap<>();
        newData.put("code", saved.getCode());
        newData.put("name", saved.getName());
        newData.put("location", saved.getLocation());
        newData.put("description", saved.getDescription());
        newData.put("active", saved.getActive());

        auditLogService.record(AuditRecord.builder()
                .actionType("CREATE")
                .targetEntity("Gate")
                .targetId(saved.getId())
                .targetDisplay(saved.getCode() + " - " + saved.getName())
                .reason(toJsonReason("Thêm mới Làn Cổng Gate " + saved.getName(), null, newData, null))
                .success(true)
                .build());

        return toDto(saved);
    }

    @Override
    @Transactional
    @CacheEvict(value = "active_cameras", allEntries = true)
    public GateDto updateGate(Long id, GateRequest request) {
        Gate gate = gateRepository.findActiveById(id)
                .orElseThrow(() -> new IllegalArgumentException("Làn Cổng không tồn tại với ID: " + id));

        String oldName = gate.getName();
        Map<String, Object> oldData = new LinkedHashMap<>();
        oldData.put("code", gate.getCode());
        oldData.put("name", gate.getName());
        oldData.put("location", gate.getLocation());
        oldData.put("description", gate.getDescription());
        oldData.put("active", gate.getActive());

        if (request.getCode() != null && !request.getCode().isBlank()) {
            String code = request.getCode().trim().toUpperCase();
            if (!code.equals(gate.getCode()) && gateRepository.existsActiveByCode(code)) {
                throw new IllegalArgumentException("Mã cổng '" + code + "' đã tồn tại.");
            }
            gate.setCode(code);
        }
        if (request.getName() != null && !request.getName().isBlank()) {
            gate.setName(request.getName().trim());
        }
        if (request.getLocation() != null) {
            gate.setLocation(trimOrNull(request.getLocation()));
        }
        if (request.getDescription() != null) {
            gate.setDescription(trimOrNull(request.getDescription()));
        }
        if (request.getActive() != null) {
            gate.setActive(request.getActive());
        }
        gate.setUpdated_at(LocalDateTime.now());

        Gate saved = gateRepository.save(gate);

        // Đồng bộ lại location của các camera đang gắn với tên cũ của Gate này
        if (oldName != null && !oldName.equalsIgnoreCase(saved.getName())) {
            List<Camera> activeCams = cameraRepository.findAllActive();
            for (Camera cam : activeCams) {
                if (cam.getLocation() != null && cam.getLocation().trim().equalsIgnoreCase(oldName.trim())) {
                    cam.setLocation(saved.getName());
                    cameraRepository.save(cam);
                }
            }
        }

        Map<String, Object> newData = new LinkedHashMap<>();
        newData.put("code", saved.getCode());
        newData.put("name", saved.getName());
        newData.put("location", saved.getLocation());
        newData.put("description", saved.getDescription());
        newData.put("active", saved.getActive());

        auditLogService.record(AuditRecord.builder()
                .actionType("UPDATE")
                .targetEntity("Gate")
                .targetId(saved.getId())
                .targetDisplay(saved.getCode() + " - " + saved.getName())
                .reason(toJsonReason("Cập nhật Làn Cổng Gate " + saved.getName(), oldData, newData, null))
                .success(true)
                .build());

        log.info("[GateAPI] Cập nhật Làn Cổng ID: {}", id);
        return toDto(saved);
    }

    @Override
    @Transactional
    public void deleteGate(Long id) {
        gateRepository.findActiveById(id).ifPresent(gate -> {
            Map<String, Object> oldData = new LinkedHashMap<>();
            oldData.put("code", gate.getCode());
            oldData.put("name", gate.getName());
            oldData.put("description", gate.getDescription());

            gate.setDeleted_at(LocalDateTime.now());
            gate.setUpdated_at(LocalDateTime.now());
            gateRepository.save(gate);
            log.info("[GateAPI] Soft-delete Làn Cổng ID: {}", id);

            auditLogService.record(AuditRecord.builder()
                    .actionType("DELETE")
                    .targetEntity("Gate")
                    .targetId(gate.getId())
                    .targetDisplay(gate.getCode() + " - " + gate.getName())
                    .reason(toJsonReason("Xóa Làn Cổng Gate " + gate.getName(), oldData, null, null))
                    .success(true)
                    .build());
        });
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

    private static String trimOrNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
