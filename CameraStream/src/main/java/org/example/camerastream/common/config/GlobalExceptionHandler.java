package org.example.camerastream.common.config;

import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

/**
 * GlobalExceptionHandler: Đồng bộ mọi lỗi HTTP thành JSON chuẩn ApiResponse.
 *
 * Trước đây lỗi kiểu IllegalArgumentException / not-found trả về raw HTML 500/404,
 * frontend (catch fetch) không parse được và nuốt im lặng. Giờ mọi lỗi đều có:
 *   - HTTP status đúng (400/404/409/413/500)
 *   - body JSON { code, message, devMessage }
 *
 * Không ảnh hưởng các path exempt (webhook / detections / ai-tasks) vì các route
 * đó tự xử lý exception ở service; chỉ các lỗi chưa được xử lý cục bộ rơi về đây.
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    /** 400: thân request sai (JSON lỗi, missing param, kiểu không khớp, validation). */
    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class
    })
    public ApiResponse<Void> handleBadRequest(Exception ex) {
        String message;
        if (ex instanceof MethodArgumentNotValidException mave) {
            message = mave.getBindingResult().getFieldErrors().stream()
                    .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                    .collect(Collectors.joining("; "));
        } else {
            message = ex.getMessage() != null ? ex.getMessage() : "Dữ liệu yêu cầu không hợp lệ.";
        }
        return ApiResponse.error(400, message, null, ex.getClass().getSimpleName());
    }

    /** 404: không tìm thấy tài nguyên / endpoint. */
    @ExceptionHandler({
            EmptyResultDataAccessException.class,
            NoHandlerFoundException.class,
            NoResourceFoundException.class
    })
    public ApiResponse<Void> handleNotFound(Exception ex) {
        return ApiResponse.error(404, "Không tìm thấy tài nguyên yêu cầu.", null, ex.getClass().getSimpleName());
    }

    /** 409: vi phạm ràng buộc dữ liệu (duy nhất, conflict optimistic lock). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ApiResponse<Void> handleDataIntegrity(DataIntegrityViolationException ex) {
        log.warn("[GLOBAL] Violation ràng buộc dữ liệu: {}", ex.getMostSpecificCause().getMessage());
        return ApiResponse.error(409, "Dữ liệu mâu thuẫn (trùng lặp hoặc đã bị thay đổi). Vui lòng kiểm tra lại.",
                null, ex.getMostSpecificCause().getMessage());
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ApiResponse<Void> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        return ApiResponse.error(409, "Dữ liệu đã bị thay đổi bởi phiên làm việc khác. Vui lòng làm mới và thử lại.",
                null, ex.getClass().getSimpleName());
    }

    /** 413: file upload vượt giới hạn. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ApiResponse<Void> handlePayloadTooLarge(MaxUploadSizeExceededException ex) {
        return ApiResponse.error(413, "File tải lên vượt quá dung lượng cho phép.", null, ex.getClass().getSimpleName());
    }

    /** 500: lỗi hệ thống chưa phân loại. */
    @ExceptionHandler(Exception.class)
    public ApiResponse<Void> handleUnexpected(Exception ex) {
        log.error("[GLOBAL] Lỗi hệ thống chưa phân loại: {}", ex.getMessage(), ex);
        return ApiResponse.error(500, "Đã xảy ra lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị viên.",
                null, ex.getClass().getSimpleName() + ": " + ex.getMessage());
    }
}
