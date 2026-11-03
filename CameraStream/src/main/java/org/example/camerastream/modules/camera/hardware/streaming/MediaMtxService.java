package org.example.camerastream.modules.camera.hardware.streaming;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Service
@Slf4j
public class MediaMtxService {

    @Value("${mediamtx.api-url:http://localhost:9997}")
    private String apiUrl;

    @Value("${mediamtx.webrtc-base-url:http://localhost:8889}")
    private String webrtcBaseUrl;

    @Value("${mediamtx.rtsp-base-url:rtsp://localhost:8554}")
    private String rtspBaseUrl;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    public boolean registerStream(String streamPath, String rtspSourceUrl) {
        try {
            // MediaMTX v1.11+: POST /v3/config/paths/add/{name} with body {"source": "..."}
            String jsonPayload = String.format(
                    "{\"source\":\"%s\"}",
                    rtspSourceUrl.replace("\\", "\\\\").replace("\"", "\\\"")
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl + "/v3/config/paths/add/" + streamPath))
                    .timeout(Duration.ofSeconds(4))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 || response.statusCode() == 201) {
                log.info("Successfully registered stream '{}' into MediaMTX", streamPath);
                return true;
            } else if (response.statusCode() == 400 && response.body().contains("already exists")) {
                return updateStream(streamPath, rtspSourceUrl);
            }

            // Fallback for older MediaMTX API /v3/config/paths/add
            String legacyPayload = String.format(
                    "{\"name\":\"%s\",\"source\":\"%s\",\"sourceOnDemand\":false}",
                    streamPath,
                    rtspSourceUrl.replace("\\", "\\\\").replace("\"", "\\\"")
            );
            HttpRequest legacyRequest = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl + "/v3/config/paths/add"))
                    .timeout(Duration.ofSeconds(4))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(legacyPayload))
                    .build();
            HttpResponse<String> legacyResponse = httpClient.send(legacyRequest, HttpResponse.BodyHandlers.ofString());
            if (legacyResponse.statusCode() == 200 || legacyResponse.statusCode() == 201) {
                log.info("Successfully registered stream '{}' into MediaMTX (legacy API)", streamPath);
                return true;
            }
        } catch (Exception e) {
            log.warn("MediaMTX API ({}) is not reachable: {}. Stream will activate when MediaMTX starts.", apiUrl, e.getMessage());
        }
        return false;
    }

    public boolean updateStream(String streamPath, String rtspSourceUrl) {
        try {
            String jsonPayload = String.format(
                    "{\"source\":\"%s\"}",
                    rtspSourceUrl.replace("\\", "\\\\").replace("\"", "\\\"")
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl + "/v3/config/paths/patch/" + streamPath))
                    .timeout(Duration.ofSeconds(4))
                    .header("Content-Type", "application/json")
                    .method("PATCH", HttpRequest.BodyPublishers.ofString(jsonPayload))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                log.info("Successfully updated stream '{}' in MediaMTX", streamPath);
                return true;
            }
        } catch (Exception e) {
            log.debug("MediaMTX update error: {}", e.getMessage());
        }
        return false;
    }

    public boolean removeStream(String streamPath) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl + "/v3/config/paths/delete/" + streamPath))
                    .timeout(Duration.ofSeconds(4))
                    .DELETE()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 || response.statusCode() == 204) {
                log.info("Successfully removed stream '{}' from MediaMTX", streamPath);
                return true;
            }
            // Some MediaMTX versions use POST for delete
            if (response.statusCode() == 404 || response.statusCode() == 405) {
                HttpRequest postReq = HttpRequest.newBuilder()
                        .uri(URI.create(apiUrl + "/v3/config/paths/delete/" + streamPath))
                        .timeout(Duration.ofSeconds(4))
                        .POST(HttpRequest.BodyPublishers.noBody())
                        .build();
                HttpResponse<String> postRes = httpClient.send(postReq, HttpResponse.BodyHandlers.ofString());
                return postRes.statusCode() == 200 || postRes.statusCode() == 204;
            }
        } catch (Exception e) {
            log.debug("MediaMTX delete stream error: {}", e.getMessage());
        }
        return false;
    }

    public boolean isStreamReady(String streamPath) {
        if (streamPath == null || streamPath.isBlank()) return false;
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl + "/v3/paths/get/" + streamPath))
                    .timeout(Duration.ofSeconds(2))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 && (response.body().contains("\"ready\":true") || response.body().contains("\"ready\": true"))) {
                return true;
            }
        } catch (Exception e) {
            // ignore
        }
        return false;
    }

    public String buildWebrtcUrl(String streamPath) {
        return String.format("%s/%s/whep", webrtcBaseUrl.replaceAll("/+$", ""), streamPath);
    }

    public String buildHlsUrl(String streamPath) {
        return String.format("%s/%s/index.m3u8", webrtcBaseUrl.replaceAll("/+$", ""), streamPath);
    }

    public String buildRtspRelayUrl(String streamPath) {
        return String.format("%s/%s", rtspBaseUrl.replaceAll("/+$", ""), streamPath);
    }
}
