package org.example.camerastream.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApiResponse<T> {
    private int code;
    private String message;
    private T data;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String traceId;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String devMessage;

    public boolean isSuccess() {
        return code >= 200 && code < 300;
    }

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .code(200)
                .message("SUCCESS")
                .data(data)
                .build();
    }

    public static <T> ApiResponse<T> success(String message, T data) {
        return ApiResponse.<T>builder()
                .code(200)
                .message(message)
                .data(data)
                .build();
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return ApiResponse.<T>builder()
                .code(code)
                .message(message)
                .data(null)
                .build();
    }

    public static <T> ApiResponse<T> error(int code, String message, String traceId, String devMessage) {
        return ApiResponse.<T>builder()
                .code(code)
                .message(message)
                .traceId(traceId)
                .devMessage(devMessage)
                .data(null)
                .build();
    }
}
