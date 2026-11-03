package org.example.camerastream.common.security.annotation;

import java.lang.annotation.*;

/**
 * RequirePermission: Đánh dấu phương thức hoặc Controller yêu cầu quyền hạn cụ thể.
 * Áp dụng chuẩn RBAC cho CameraStream.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequirePermission {
    /**
     * Mã quyền yêu cầu (ví dụ: "DEVICE_MANAGE", "ALPR_EXPORT", "IAM_VIEW"...)
     */
    String value();
}

