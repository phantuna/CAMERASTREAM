package org.example.camerastream.modules.camera.hardware;

import org.example.camerastream.modules.camera.dto.OnvifDiscoveryDevice;

import java.util.List;

/**
 * Hardware Integration Interface (Facade) for camera device protocols & streaming relay.
 * Adheres to RULE.md Separation of Concerns & Clean Architecture.
 */
public interface ICameraHardwareConnector {

    // Discovery & Connection Diagnostics
    List<OnvifDiscoveryDevice> discoverCameras(int timeoutMs);
    boolean testConnection(String ip, int port, String username, String password);
    String resolveRtspUri(String ip, int port, String username, String password);

    // Hardware Peripheral Controls
    byte[] fetchSnapshot(String ip, int port, String username, String password);
    boolean ptzControl(String ip, int port, String username, String password, String action);

    // Media Server (MediaMTX) Relay Management
    boolean registerStream(String streamPath, String rtspSourceUrl);
    boolean updateStream(String streamPath, String rtspSourceUrl);
    boolean removeStream(String streamPath);
    boolean isStreamReady(String streamPath);

    // URL Resolvers
    String buildWebrtcUrl(String streamPath);
    String buildHlsUrl(String streamPath);
    String buildRtspRelayUrl(String streamPath);
}
