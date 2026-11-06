package org.example.camerastream.modules.license;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.example.camerastream.common.dto.ApiResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Khi bat enforce va license khong hop le: chan moi API (/api/**) tru /api/license/**.
 */
@Component
@RequiredArgsConstructor
public class LicenseFilter extends OncePerRequestFilter {

    private final LicenseService licenseService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path != null && path.startsWith("/api/")) {
            response.setHeader(ApiResponse.TRACE_HEADER, ApiResponse.nextTraceToken());
        }
        if (!licenseService.isEnforced()
                || "OPTIONS".equalsIgnoreCase(request.getMethod())
                || !path.startsWith("/api/")
                || path.startsWith("/api/license")) {
            chain.doFilter(request, response);
            return;
        }
        LicenseResult r = licenseService.current();
        if (r.valid()) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(
                ApiResponse.error(403, "LICENSE_INVALID: " + r.message())));
    }
}

