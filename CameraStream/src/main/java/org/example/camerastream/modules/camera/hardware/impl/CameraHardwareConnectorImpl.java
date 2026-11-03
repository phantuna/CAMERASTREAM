package org.example.camerastream.modules.camera.hardware.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.camera.dto.OnvifDiscoveryDevice;
import org.example.camerastream.modules.camera.hardware.ICameraHardwareConnector;
import org.example.camerastream.modules.camera.hardware.onvif.OnvifClientService;
import org.example.camerastream.modules.camera.hardware.onvif.OnvifDiscoveryService;
import org.example.camerastream.modules.camera.hardware.streaming.MediaMtxService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class CameraHardwareConnectorImpl implements ICameraHardwareConnector {

    private final OnvifClientService onvifClientService;
    private final OnvifDiscoveryService onvifDiscoveryService;
    private final MediaMtxService mediaMtxService;

    @Override
    public List<OnvifDiscoveryDevice> discoverCameras(int timeoutMs) {
        return onvifDiscoveryService.discoverCameras(timeoutMs);
    }

    @Override
    public boolean testConnection(String ip, int port, String username, String password) {
        return onvifClientService.testConnection(ip, port, username, password);
    }

    @Override
    public String resolveRtspUri(String ip, int port, String username, String password) {
        return onvifClientService.resolveRtspUri(ip, port, username, password);
    }

    @Override
    public byte[] fetchSnapshot(String ip, int port, String username, String password) {
        return onvifClientService.fetchSnapshot(ip, port, username, password);
    }

    @Override
    public boolean ptzControl(String ip, int port, String username, String password, String action) {
        return onvifClientService.ptzControl(ip, port, username, password, action);
    }

    @Override
    public boolean registerStream(String streamPath, String rtspSourceUrl) {
        return mediaMtxService.registerStream(streamPath, rtspSourceUrl);
    }

    @Override
    public boolean updateStream(String streamPath, String rtspSourceUrl) {
        return mediaMtxService.updateStream(streamPath, rtspSourceUrl);
    }

    @Override
    public boolean removeStream(String streamPath) {
        return mediaMtxService.removeStream(streamPath);
    }

    @Override
    public boolean isStreamReady(String streamPath) {
        return mediaMtxService.isStreamReady(streamPath);
    }

    @Override
    public String buildWebrtcUrl(String streamPath) {
        return mediaMtxService.buildWebrtcUrl(streamPath);
    }

    @Override
    public String buildHlsUrl(String streamPath) {
        return mediaMtxService.buildHlsUrl(streamPath);
    }

    @Override
    public String buildRtspRelayUrl(String streamPath) {
        return mediaMtxService.buildRtspRelayUrl(streamPath);
    }
}
