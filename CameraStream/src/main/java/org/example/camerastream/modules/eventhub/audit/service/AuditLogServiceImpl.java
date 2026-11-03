package org.example.camerastream.modules.eventhub.audit.service;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.auth.entity.Role;
import org.example.camerastream.modules.auth.entity.User;
import org.example.camerastream.modules.auth.repository.UserRepository;
import org.example.camerastream.modules.eventhub.audit.dto.AuditLogDto;
import org.example.camerastream.modules.eventhub.audit.dto.AuditLogFilterQuery;
import org.example.camerastream.modules.eventhub.audit.dto.AuditRecord;
import org.example.camerastream.modules.eventhub.audit.entity.AuditLog;
import org.example.camerastream.modules.eventhub.audit.repository.AuditLogRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditLogServiceImpl implements IAuditLogService {

    private final AuditLogRepository auditRepository;
    private final UserRepository userRepository;
    private final PlatformTransactionManager transactionManager;
    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void ensureAuditColumnsText() {
        try {
            jdbcTemplate.execute("ALTER TABLE audit_logs ALTER COLUMN reason TYPE TEXT");
            jdbcTemplate.execute("ALTER TABLE audit_logs ALTER COLUMN target_display TYPE VARCHAR(500)");
            log.info("[AuditLog] Đã nâng cấp cột audit_logs.reason sang kiểu TEXT để lưu JSON diff.");
        } catch (Exception e) {
            log.debug("[AuditLog] Bỏ qua nâng cấp cột audit_logs.reason: {}", e.getMessage());
        }
    }

    @Override
    public void record(AuditRecord request) {
        if (request == null) return;

        try {
            TransactionTemplate requiresNewTx = new TransactionTemplate(transactionManager);
            requiresNewTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            requiresNewTx.executeWithoutResult(status -> persistAuditInternal(request, false));
        } catch (Exception e) {
            try {
                ensureAuditColumnsText();
                TransactionTemplate fallbackTx = new TransactionTemplate(transactionManager);
                fallbackTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
                fallbackTx.executeWithoutResult(status -> persistAuditInternal(request, true));
            } catch (Exception ex) {
                log.warn("Failed to persist audit record [{}->{}]: {}",
                        request.getActionType(), request.getTargetEntity(), ex.getMessage());
            }
        }
    }

    private void persistAuditInternal(AuditRecord request, boolean truncateFallback) {
        String actorUsername = request.getActorUsername();
        Long actorId = request.getActorId();
        String actorRole = request.getActorRole();
        String source = request.getSource();

        HttpServletRequest httpReq = currentRequest();
        if (httpReq != null) {
            if (actorUsername == null || actorUsername.isBlank() || "SYSTEM".equalsIgnoreCase(actorUsername)) {
                String extracted = extractUsernameFromRequest(httpReq);
                if (extracted != null && !extracted.isBlank()) {
                    actorUsername = extracted;
                }
            }
            String clientIp = extractClientIp(httpReq);
            if (clientIp != null && !clientIp.isBlank()) {
                if (source == null || source.isBlank() || "SYSTEM".equalsIgnoreCase(source) || "WEB".equalsIgnoreCase(source)) {
                    source = clientIp;
                }
            }
        }

        if (actorUsername != null && !actorUsername.isBlank() && !"SYSTEM".equalsIgnoreCase(actorUsername)
                && (actorId == null || actorRole == null)) {
            try {
                Optional<User> uOpt = userRepository.findByUsername(actorUsername);
                if (uOpt.isPresent()) {
                    User u = uOpt.get();
                    if (actorId == null) actorId = u.getId();
                    if (actorRole == null) {
                        if ("admin".equalsIgnoreCase(u.getUsername())) {
                            actorRole = "SUPER_ADMIN";
                        } else if (u.getRoles() != null && !u.getRoles().isEmpty()) {
                            Role r = u.getRoles().iterator().next();
                            actorRole = r.getName() != null ? r.getName().replace("ROLE_", "") : "USER";
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }

        String reasonVal = request.getReason();
        if (truncateFallback && reasonVal != null && reasonVal.length() > 250) {
            reasonVal = reasonVal.substring(0, 247) + "...";
        }
        String targetDisplayVal = request.getTargetDisplay();
        if (truncateFallback && targetDisplayVal != null && targetDisplayVal.length() > 250) {
            targetDisplayVal = targetDisplayVal.substring(0, 247) + "...";
        }

        AuditLog entity = AuditLog.builder()
                .actorId(actorId)
                .actorUsername(actorUsername != null && !actorUsername.isBlank() ? actorUsername : "SYSTEM")
                .actorRole(actorRole)
                .source(source != null && !source.isBlank() ? source : "SYSTEM")
                .actionType(request.getActionType())
                .targetEntity(request.getTargetEntity())
                .targetId(request.getTargetId())
                .targetDisplay(targetDisplayVal)
                .reason(reasonVal)
                .success(request.getSuccess() != null ? request.getSuccess() : true)
                .errorMessage(request.getErrorMessage())
                .build();

        auditRepository.save(entity);
    }

    private HttpServletRequest currentRequest() {
        try {
            if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
                return attrs.getRequest();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String extractUsernameFromRequest(HttpServletRequest req) {
        if (req.getCookies() != null) {
            for (Cookie c : req.getCookies()) {
                if ("access_token".equals(c.getName()) && c.getValue() != null) {
                    String parsed = parseTokenUsername(c.getValue().trim());
                    if (parsed != null) return parsed;
                }
            }
        }
        String authHeader = req.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String parsed = parseTokenUsername(authHeader.substring(7).trim());
            if (parsed != null) return parsed;
        }
        return null;
    }

    private String parseTokenUsername(String token) {
        if (token.startsWith("jwt_") || token.startsWith("token_") || token.startsWith("refresh_")) {
            String[] parts = token.split("_");
            if (parts.length >= 2 && !parts[1].isBlank()) {
                return parts[1];
            }
        }
        return null;
    }

    private String extractClientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String realIp = req.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        String remoteAddr = req.getRemoteAddr();
        if ("0:0:0:0:0:0:0:1".equals(remoteAddr) || "::1".equals(remoteAddr)) {
            return "127.0.0.1";
        }
        return remoteAddr;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<AuditLogDto> search(AuditLogFilterQuery query, Pageable pageable) {
        return auditRepository.searchAudits(query, pageable).map(AuditLogDto::from);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Long> getStats() {
        return auditRepository.getAuditStats();
    }
}
