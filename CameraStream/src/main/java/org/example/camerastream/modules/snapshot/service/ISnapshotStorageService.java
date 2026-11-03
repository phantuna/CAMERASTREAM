package org.example.camerastream.modules.snapshot.service;

import java.nio.file.Path;

/**
 * Quản lý vòng đời file ảnh snapshot trên đĩa.
 */
public interface ISnapshotStorageService {

    /**
     * Dựng URL công bố cho một tên file ảnh.
     *
     * @param fileName tên file trong thư mục snapshot (không có đường dẫn)
     * @return URL tuyệt đối, hoặc {@code null} nếu {@code fileName} rỗng
     */
    String buildPublicUrl(String fileName);

    /**
     * Tìm đường dẫn tuyệt đối của một tên file ảnh, đảm bảo nằm trong thư mục
     * snapshot (chống path traversal).
     *
     * @param fileName tên file do client cung cấp
     * @return đường dẫn đã kiểm tra an toàn, hoặc {@code null} nếu tên file không hợp lệ
     */
    Path resolve(String fileName);

    /**
     * Xóa các file ảnh cũ hơn {@code retentionDays}.
     *
     * @return số file đã xóa
     */
    int deleteExpired();
}
