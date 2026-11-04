package org.example.camerastream.common.security.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.auth.entity.Permission;
import org.example.camerastream.modules.auth.entity.Role;
import org.example.camerastream.modules.auth.entity.User;
import org.example.camerastream.modules.auth.repository.UserRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;

/**
 * PermissionInterceptor: Kiểm soát quyền truy cập trên từng API endpoint theo RBAC.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PermissionInterceptor implements HandlerInterceptor {

    private final UserRepository userRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // Cho qua các yêu cầu OPTIONS (CORS preflight)
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        // Bỏ qua nếu không phải HandlerMethod
        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        HandlerMethod handlerMethod = (HandlerMethod) handler;

        // Tìm annotation @RequirePermission trên method trước, nếu không có thì tìm trên class
        RequirePermission requirePerm = handlerMethod.getMethodAnnotation(RequirePermission.class);
        if (requirePerm == null) {
            requirePerm = handlerMethod.getBeanType().getAnnotation(RequirePermission.class);
        }

        String path = request.getRequestURI();
        boolean isInternalAiWebhook = (path.startsWith("/api/cameras/") && path.endsWith("/detections"));

        // Nếu endpoint không yêu cầu quyền cụ thể và không phải AI Webhook, cho phép tiếp tục
        if (requirePerm == null && !isInternalAiWebhook) {
            return true;
        }

        String requiredCode = (requirePerm != null) ? requirePerm.value() : "DEVICE_MANAGE";

        // A. Xác thực tính toàn vẹn gói tin liên dịch vụ 2 chiều (Telemetry & Request Integrity)
        String integrityHeader = request.getHeader(org.example.camerastream.common.integrity.ServiceIntegrityVerifier.INTEGRITY_HEADER);
        if (integrityHeader != null && org.example.camerastream.common.integrity.ServiceIntegrityVerifier.verifyRequestIntegrity(integrityHeader)) {
            response.setHeader(
                    org.example.camerastream.common.integrity.ServiceIntegrityVerifier.INTEGRITY_HEADER,
                    org.example.camerastream.common.integrity.ServiceIntegrityVerifier.generateIntegrityHeader()
            );
            return true;
        }

        // B. Bypass chỉ dành riêng cho tài nguyên tĩnh / snapshot công khai cho trình duyệt
        if (path.startsWith("/snapshots/") || (path.startsWith("/api/cameras/") && path.contains("/snapshot"))) {
            return true;
        }

        // C. Trích xuất Token: Ưu tiên Cookie 'access_token' (ADR 0008), fallback sang Authorization Header
        String token = null;
        if (request.getCookies() != null) {
            for (jakarta.servlet.http.Cookie c : request.getCookies()) {
                if ("access_token".equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) {
                    token = c.getValue().trim();
                    break;
                }
            }
        }

        if (token == null || token.isBlank()) {
            String authHeader = request.getHeader("Authorization");
            if (authHeader != null && !authHeader.isBlank()) {
                token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : authHeader.trim();
            }
        }

        if (token == null || token.isBlank()) {
            // Q15/E9: endpoint có @RequirePermission mà không có token -> 401 (không còn "cho qua" GET)
            sendErrorResponse(request, response, HttpServletResponse.SC_UNAUTHORIZED, 401, "Yêu cầu đăng nhập để truy cập tài nguyên này.");
            return false;
        }

        String username = extractUsernameFromToken(token);
        if (username == null || username.isBlank()) {
            // Q15/E9: token không đọc được user -> 401 (không còn fallback sang 'admin')
            sendErrorResponse(request, response, HttpServletResponse.SC_UNAUTHORIZED, 401, "Phiên làm việc không hợp lệ. Vui lòng đăng nhập lại.");
            return false;
        }

        // 2. Tìm người dùng trong CSDL (Q15/E9: không còn fallback sang tài khoản 'admin')
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            sendErrorResponse(request, response, HttpServletResponse.SC_UNAUTHORIZED, 401, "Tài khoản không tồn tại trên hệ thống.");
            return false;
        }

        User user = userOpt.get();
        if (Boolean.FALSE.equals(user.getActive())) {
            sendErrorResponse(request, response, HttpServletResponse.SC_FORBIDDEN, 403, "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.");
            return false;
        }

        // 3. Super Admin & Admin mặc định có toàn quyền 100%
        if ("admin".equalsIgnoreCase(user.getUsername())) {
            return true;
        }

        Set<Role> roles = user.getRoles();
        if (roles != null) {
            for (Role r : roles) {
                if (r.getDeleted_at() != null || Boolean.FALSE.equals(r.getActive())) {
                    continue;
                }
                String rName = r.getName() != null ? r.getName().toUpperCase() : "";
                if (rName.contains("SUPER_ADMIN") || rName.equals("ADMIN") || rName.equals("ROLE_ADMIN")) {
                    return true;
                }
            }
        }

        // 4. Kiểm tra Permission cụ thể trong danh sách quyền của User
        boolean hasPermission = false;
        if (roles != null) {
            for (Role r : roles) {
                if (r.getDeleted_at() != null || Boolean.FALSE.equals(r.getActive())) {
                    continue;
                }
                if (r.getPermissions() != null) {
                    for (Permission p : r.getPermissions()) {
                        if (requiredCode.equalsIgnoreCase(p.getCode())) {
                            hasPermission = true;
                            break;
                        }
                    }
                }
                if (hasPermission) break;
            }
        }

        if (!hasPermission) {
            log.warn("[RBAC] User '{}' bị từ chối truy cập endpoint '{}': Thiếu quyền '{}'", username, request.getRequestURI(), requiredCode);
            sendErrorResponse(request, response, HttpServletResponse.SC_FORBIDDEN, 403, 
                "Từ chối truy cập: Bạn không có quyền '" + requiredCode + "' để thực hiện hành động này.");
            return false;
        }

        return true;
    }

    private String extractUsernameFromToken(String token) {
        if (token == null || token.isBlank()) return null;
        if (token.startsWith("jwt_") || token.startsWith("token_")) {
            String[] parts = token.split("_");
            if (parts.length >= 2 && !parts[1].isBlank()) {
                return parts[1];
            }
        }
        // Q15/E9: token không theo cấu trúc jwt_<user>_<uuid> -> null (người gọi đứng tên), không mặc định 'admin'
        return null;
    }

    private void sendErrorResponse(HttpServletRequest request, HttpServletResponse response, int httpStatus, int code, String message) throws IOException {
        response.setStatus(httpStatus);
        response.setContentType("application/json;charset=UTF-8");
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank()) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Access-Control-Allow-Credentials", "true");
            response.setHeader("Access-Control-Allow-Headers", "*");
            response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
        }
        ApiResponse<Void> apiResponse = ApiResponse.error(code, message);
        response.getWriter().write(objectMapper.writeValueAsString(apiResponse));
    }
}
