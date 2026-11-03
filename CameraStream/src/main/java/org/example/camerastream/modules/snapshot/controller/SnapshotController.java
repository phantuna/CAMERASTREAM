package org.example.camerastream.modules.snapshot.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.snapshot.service.ISnapshotStorageService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Phục vụ ảnh snapshot.
 *
 * <p>Cố ý KHÔNG dùng {@code WebMvcConfigurer.addResourceHandlers}: cần kiểm soát
 * retention và chặn path traversal, nên đọc file trực tiếp ở đây.
 */
@RestController
@RequestMapping("/snapshots")
@RequiredArgsConstructor
@Slf4j
public class SnapshotController {

    private final ISnapshotStorageService snapshotStorageService;

    /**
     * Trả ảnh snapshot theo tên file.
     *
     * <p>Trả 404 (không phải 500) khi file không tồn tại — trường hợp này là
     * bình thường với ảnh đã quá hạn retention nhưng DB vẫn giữ URL. Frontend
     * cần bắt {@code onError} để hiện placeholder.
     */
    @GetMapping("/{fileName:.+}")
    public ResponseEntity<byte[]> getSnapshot(@PathVariable String fileName) {
        Path path = snapshotStorageService.resolve(fileName);
        if (path == null || !Files.isRegularFile(path) || !Files.isReadable(path)) {
            // Thử lấy ảnh trực tiếp từ AI service Python (:5000) nếu file đang lưu trong container chưa mount
            byte[] remoteBody = fetchFromAiService(fileName);
            if (remoteBody != null && remoteBody.length > 0) {
                if (path != null) {
                    try {
                        if (path.getParent() != null) {
                            Files.createDirectories(path.getParent());
                        }
                        Files.write(path, remoteBody);
                        log.info("[Snapshot] Đã đồng bộ ảnh từ AI service về ổ đĩa: {}", path);
                    } catch (Exception e) {
                        log.warn("[Snapshot] Không thể ghi cache ảnh ra ổ đĩa: {}", e.getMessage());
                    }
                }
                return ResponseEntity.ok()
                        .contentType(MediaType.IMAGE_JPEG)
                        .cacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic().immutable())
                        .body(remoteBody);
            }
            return ResponseEntity.notFound().build();
        }
        try {
            byte[] body = Files.readAllBytes(path);
            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_JPEG)
                    // Ảnh là bất biến theo tên file -> cache mạnh với immutable, giảm tải 100% request lặp
                    .cacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic().immutable())
                    .body(body);
        } catch (IOException e) {
            log.error("[Snapshot] Không đọc được file {}: {}", path, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private byte[] fetchFromAiService(String fileName) {
        try {
            String url = "http://localhost:5000/snapshots/" + fileName;
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofMillis(1500))
                    .build();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(3))
                    .GET()
                    .build();
            HttpResponse<byte[]> resp = client.send(req, java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() == 200) {
                return resp.body();
            }
        } catch (Exception e) {
            log.debug("[Snapshot] Fallback tới AI service không thành công cho file {}: {}", fileName, e.getMessage());
        }
        return null;
    }
}
