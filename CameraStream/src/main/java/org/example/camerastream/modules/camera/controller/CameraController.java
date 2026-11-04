package org.example.camerastream.modules.camera.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.camera.dto.*;
import org.example.camerastream.modules.camera.hardware.ICameraHardwareConnector;
import org.example.camerastream.modules.camera.service.ICameraService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.example.camerastream.modules.camera.service.ICameraAiService; 
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/cameras")
@RequiredArgsConstructor
@Slf4j
public class CameraController {

    private final ICameraService cameraService;
    private final ICameraHardwareConnector hardwareConnector;
    private final ICameraAiService cameraAiService;

    @RequirePermission("SURVEILLANCE_VIEW")
    @GetMapping
    public ApiResponse<?> getAllCameras(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false, defaultValue = "10") Integer size) {
        if (page != null) {
            return ApiResponse.success(cameraService.getCamerasPaginated(
                    search,
                    PageRequest.of(
                            Math.max(0, page),
                            Math.min(size, 200),
                            Sort.by(Sort.Direction.DESC, "id")
                    )
            ));
        }
        if (search != null && !search.trim().isEmpty()) {
            return ApiResponse.success(cameraService.searchCameras(search));
        }
        return ApiResponse.success(cameraService.getAllCameras());
    }

    @RequirePermission("SURVEILLANCE_VIEW")
    @GetMapping("/{id}")
    public ApiResponse<CameraDto> getCameraById(@PathVariable Long id) {
        return cameraService.getCameraById(id)
                .map(ApiResponse::success)
                .orElseGet(() -> ApiResponse.error(404, "Camera not found with ID: " + id));
    }

    @RequirePermission("DEVICE_MANAGE")
    @PostMapping
    public ApiResponse<CameraDto> createCamera(@RequestBody CameraCreateRequest request) {
        CameraDto created = cameraService.createCamera(request);
        return ApiResponse.success("Camera created successfully", created);
    }

    @RequirePermission("DEVICE_MANAGE")
    @PutMapping("/{id}")
    public ApiResponse<CameraDto> updateCamera(@PathVariable Long id, @RequestBody CameraUpdateRequest request) {
        CameraDto updated = cameraService.updateCamera(id, request);
        return ApiResponse.success("Camera updated successfully", updated);
    }

    @RequirePermission("DEVICE_MANAGE")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteCamera(@PathVariable Long id) {
        cameraService.deleteCamera(id);
        return ApiResponse.success("Camera deleted successfully", null);
    }

    @RequirePermission("DEVICE_MANAGE")
    @RequestMapping(value = "/discover", method = {RequestMethod.GET, RequestMethod.POST})
    public ApiResponse<List<OnvifDiscoveryDevice>> discoverCameras(
            @RequestParam(defaultValue = "3000") int timeoutMs) {
        List<OnvifDiscoveryDevice> devices = hardwareConnector.discoverCameras(timeoutMs);
        return ApiResponse.success(devices);
    }

    @RequirePermission("DEVICE_MANAGE")
    @PostMapping("/test-connection")
    public ApiResponse<Map<String, Object>> testConnection(@RequestBody Map<String, Object> body) {
        String ip = (String) body.get("ipAddress");
        int port = body.containsKey("port") ? Integer.parseInt(body.get("port").toString()) : 80;
        String username = (String) body.get("username");
        String password = (String) body.get("password");

        boolean connected = hardwareConnector.testConnection(ip, port, username, password);
        String resolvedRtsp = null;
        if (connected) {
            resolvedRtsp = hardwareConnector.resolveRtspUri(ip, port, username, password);
        }

        Map<String, Object> result = Map.of(
                "success", connected,
                "message", connected ? "ONVIF Connected successfully" : "Could not connect to camera via ONVIF",
                "resolvedRtspUrl", resolvedRtsp != null ? resolvedRtsp : ""
        );
        return ApiResponse.success(result);
    }

    @GetMapping("/{id}/snapshot")
    public ResponseEntity<byte[]> getSnapshot(@PathVariable Long id) {
        byte[] imageBytes = cameraService.getCameraSnapshot(id);
        if (imageBytes != null && imageBytes.length > 0) {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_JPEG);
            return new ResponseEntity<>(imageBytes, headers, HttpStatus.OK);
        }
        return ResponseEntity.notFound().build();
    }

    /**
     * AI Service Webhook (Python YOLOX + VietOCR)
     */
    @PostMapping("/{id}/detections")
    public ApiResponse<Void> receiveDetection(
            @PathVariable Long id,
            @RequestBody PlateDetectionRequest request) {
        cameraService.processPlateDetection(id, request);
        return ApiResponse.success("Detection processed successfully", null);
    }

    /**
     * ONVIF PTZ Camera Control (UP, DOWN, LEFT, RIGHT, ZOOM_IN, ZOOM_OUT, STOP)
     */
    @RequirePermission("BARRIER_CONTROL")
    @PostMapping("/{id}/ptz")
    public ApiResponse<Map<String, Object>> ptzControl(
            @PathVariable Long id,
            @RequestParam String action) {
        boolean success = cameraService.ptzControl(id, action);
        return ApiResponse.success(Map.of(
                "action", action,
                "success", success,
                "message", success ? "PTZ command executed" : "PTZ command failed or not supported by camera"
        ));
    }

    /**
     * Get AI Pipeline Configs for a specific Camera
     */
    @RequirePermission("DEVICE_VIEW")
    @GetMapping("/{id}/ai-config")
    public ApiResponse<List<CameraAiConfigDto>> getCameraAiConfigs(
            @PathVariable Long id) {
        return ApiResponse.success(cameraAiService.getAiConfigsByCamera(id));
    }

    /**
     * Update AI Pipeline Configs for a specific Camera (Enable/Disable, FPS, ROI)
     */
    @RequirePermission("DEVICE_MANAGE")
    @PutMapping("/{id}/ai-config")
    public ApiResponse<List<CameraAiConfigDto>> updateCameraAiConfigs(
            @PathVariable Long id,
            @RequestBody List<CameraAiConfigDto> configs) {
        List<CameraAiConfigDto> updated =
                cameraAiService.saveCameraAiConfigs(id, configs);
        return ApiResponse.success("Camera AI configurations updated successfully", updated);
    }

    /**
     * AI Worker Discovery API: Get active camera tasks by AI type (e.g. VEHICLE_ANPR, FACE_RECOGNITION)
     */
    @RequirePermission("DEVICE_VIEW")
    @GetMapping("/ai-tasks")
    public ApiResponse<List<CameraAiConfigDto>> getActiveAiTasks(
            @RequestParam(defaultValue = "VEHICLE_ANPR") String aiType) {
        return ApiResponse.success(cameraAiService.getActiveTasksByAiType(aiType));
    }
}
