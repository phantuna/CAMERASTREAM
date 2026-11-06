package org.example.camerastream.common.config;

import org.example.camerastream.common.dto.ApiResponse;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * Tự động đính kèm header đồng bộ thời gian và chữ ký toàn vẹn (X-Service-Integrity)
 * cho tất cả các API trả về ApiResponse trên toàn hệ thống.
 */
@ControllerAdvice
public class ApiResponseIntegrityAdvice implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        try {
            response.getHeaders().set(ApiResponse.TRACE_HEADER, ApiResponse.nextTraceToken());
        } catch (Exception ignored) {
        }
        return body;
    }
}

