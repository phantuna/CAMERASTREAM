package org.example.camerastream.modules.camera.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlateDetectionRequest {
    private String plateNumber;
    private Double confidence;
    private String vehicleType;

    /**
     * Tên file ảnh crop biển số đã được AI service lưu ra đĩa.
     * Đây là đường đi CHÍNH — backend ghép thành URL tuyệt đối để trả về FE.
     */
    private String plateCropFile;

    /**
     * Tên file ảnh toàn cảnh đã được AI service lưu ra đĩa.
     */
    private String fullImageFile;

    /**
     * @deprecated Giữ lại để tương thích ngược với AI service phiên bản cũ
     * (gửi base64 trong body). Backend sẽ ưu tiên {@link #plateCropFile}.
     */
    @Deprecated
    private String plateCropBase64;

    /**
     * @deprecated Giữ lại để tương thích ngược với AI service phiên bản cũ.
     */
    @Deprecated
    private String fullImageBase64;

    private String detectedAt;
    private String laneId;

    /**
     * Mã kiểm chứng toàn vẹn (frameDigest = HMAC-SHA256 của cameraId + cleanPlate + timeSlot)
     * Sinh ra trực tiếp từ binary _frame_sync để xác thực sự kiện từ camera thật.
     */
    private String frameDigest;
}
