package org.example.camerastream.modules.camera.entity;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;
import java.util.List;

/**
 * Danh mục chuẩn hóa các Module AI xử lý trên Camera
 * Khớp với kịch bản kiến trúc V2.0 (ALPR, FaceID, Hàng rào ảo, PPE, Báo cháy)
 */
@Getter
@RequiredArgsConstructor
public enum CameraAiType {

    VEHICLE_ANPR(
            "VEHICLE_ANPR",
            "Nhận diện biển số xe (ALPR)",
            "Quét biển số, bóc tách ký tự và phân loại phương tiện",
            6,
            0.80f
    ),
    FACE_RECOGNITION(
            "FACE_RECOGNITION",
            "Nhận diện khuôn mặt (FaceID)",
            "Quét khuôn mặt, so khớp nhân sự và điểm danh",
            6,
            0.80f
    ),
    INTRUSION_ROI(
            "INTRUSION_ROI",
            "Hàng rào ảo & Cảnh báo xâm nhập",
            "Phát hiện chuyển động vượt ranh giới hoặc khu vực cấm",
            6,
            0.75f
    ),
    SAFETY_PPE(
            "SAFETY_PPE",
            "An toàn lao động & Mũ bảo hộ",
            "Phát hiện công nhân không đội mũ/áo bảo hộ trong công trường/nhà máy",
            6,
            0.80f
    ),
    FIRE_DETECT(
            "FIRE_DETECT",
            "Cảnh báo cháy & Khói sớm",
            "Phát hiện ngọn lửa hoặc đám khói bất thường, kích hoạt báo động",
            6,
            0.80f
    );

    private final String code;
    private final String title;
    private final String description;
    private final int defaultFps;
    private final float defaultConfidence;

    /**
     * Lấy danh sách toàn bộ mã String chuẩn hóa của các Module AI
     */
    public static List<String> getAllCodes() {
        return Arrays.stream(values())
                .map(CameraAiType::getCode)
                .toList();
    }

    /**
     * Chuyển đổi an toàn từ chuỗi mã String sang Enum
     */
    public static CameraAiType fromCode(String code) {
        if (code == null || code.isBlank()) return null;
        for (CameraAiType type : values()) {
            if (type.code.equalsIgnoreCase(code.trim()) || type.name().equalsIgnoreCase(code.trim())) {
                return type;
            }
        }
        return null;
    }

    /**
     * Kiểm tra tính hợp lệ của mã module
     */
    public static boolean isValid(String code) {
        return fromCode(code) != null;
    }
}
