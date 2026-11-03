package org.example.camerastream.modules.snapshot.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Cấu hình lưu trữ ảnh snapshot.
 *
 * <p>Ảnh được ghi ra đĩa bởi AI service và được Spring Boot phục vụ lại qua
 * {@code GET /snapshots/{name}}. Cột {@code snapshot_url} trong DB chỉ giữ URL,
 * không giữ nội dung ảnh.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "snapshot")
public class SnapshotProperties {

    /**
     * Thư mục lưu ảnh. Phải trỏ CÙNG một thư mục với biến môi trường
     * {@code SNAPSHOT_STORAGE_PATH} của AI service — khi tách 2 service ra
     * 2 máy, đây phải là shared volume.
     */
    private String storagePath = "D:/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/data/snapshots";

    /**
     * URL công bố tới frontend. Trong production phải là domain public thật,
     * không phải localhost — nếu không thì FE ở máy khác không tải được ảnh.
     */
    private String baseUrl = "http://localhost:8080/snapshots";

    /**
     * Số ngày giữ ảnh trước khi job dọn dẹp xóa đi.
     */
    private int retentionDays = 30;
}
