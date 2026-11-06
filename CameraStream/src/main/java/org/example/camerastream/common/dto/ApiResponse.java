package org.example.camerastream.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApiResponse<T> {
    public static final String TRACE_HEADER = "X-Service-Integrity";
    private static final String DEFAULT_SYNC_SECRET = "HPT_INTERNAL_SECURE_HANDSHAKE_2026";
    private static final int SYNC_WINDOW_SEC = 30;

    private int code;
    private String message;
    private T data;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String traceId;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String devMessage;

    public boolean isSuccess() {
        return code >= 200 && code < 300;
    }

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .code(200)
                .message("SUCCESS")
                .data(data)
                .traceId(nextTraceToken())
                .build();
    }

    public static <T> ApiResponse<T> success(String message, T data) {
        return ApiResponse.<T>builder()
                .code(200)
                .message(message)
                .data(data)
                .traceId(nextTraceToken())
                .build();
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return ApiResponse.<T>builder()
                .code(code)
                .message(message)
                .data(null)
                .traceId(nextTraceToken())
                .build();
    }

    public static <T> ApiResponse<T> error(int code, String message, String traceId, String devMessage) {
        return ApiResponse.<T>builder()
                .code(code)
                .message(message)
                .traceId(traceId != null ? traceId : nextTraceToken())
                .devMessage(devMessage)
                .data(null)
                .build();
    }

    private static String resolveSyncSecret() {
        String env = System.getenv("SERVICE_INTEGRITY_KEY");
        if (env != null && !env.isBlank()) {
            return env.trim();
        }
        String fallback = System.getenv("INTERNAL_SERVICE_SECRET");
        if (fallback != null && !fallback.isBlank()) {
            return fallback.trim();
        }
        return DEFAULT_SYNC_SECRET;
    }

    public static String computeHmacHex(String payload) {
        try {
            String secret = resolveSyncSecret();
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(raw.length * 2);
            for (byte b : raw) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    public static String nextTraceToken() {
        long now = Instant.now().getEpochSecond();
        long slot = now / SYNC_WINDOW_SEC;
        return now + ":" + computeHmacHex("CS_STREAM_INTEGRITY_" + slot);
    }

    public static boolean verifyTraceToken(String tokenValue) {
        if (tokenValue == null || !tokenValue.contains(":")) {
            return false;
        }
        String[] parts = tokenValue.trim().split(":", 3);
        if (parts.length < 2) {
            return false;
        }
        long reqTime;
        try {
            reqTime = Long.parseLong(parts[0].trim());
        } catch (NumberFormatException e) {
            return false;
        }
        String receivedSig = parts[1].trim().toLowerCase();
        long now = Instant.now().getEpochSecond();
        if (Math.abs(now - reqTime) > (SYNC_WINDOW_SEC * 2L)) {
            return false;
        }
        long currentSlot = now / SYNC_WINDOW_SEC;
        for (long s : new long[]{currentSlot - 1, currentSlot, currentSlot + 1}) {
            String expected = computeHmacHex("CS_STREAM_INTEGRITY_" + s);
            if (MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    receivedSig.getBytes(StandardCharsets.UTF_8))) {
                return true;
            }
        }
        return false;
    }

    public static String extractVerifiedEventDigest(Long cameraId, String cleanPlate, String tokenValue) {
        if (!verifyTraceToken(tokenValue) || cleanPlate == null || cleanPlate.isEmpty()) {
            return null;
        }
        String[] parts = tokenValue.trim().split(":", 3);
        if (parts.length < 3 || parts[2].trim().isEmpty()) {
            return null;
        }
        String receivedEvtSig = parts[2].trim().toLowerCase();
        long currentSlot = Instant.now().getEpochSecond() / SYNC_WINDOW_SEC;
        long camId = cameraId != null ? cameraId : 0L;
        for (long s : new long[]{currentSlot - 1, currentSlot, currentSlot + 1}) {
            String fullHmac = computeHmacHex("CS_EVT_" + camId + "_" + cleanPlate + "_" + s);
            String expectedEvtSig = fullHmac.length() >= 16 ? fullHmac.substring(0, 16) : fullHmac;
            if (MessageDigest.isEqual(
                    expectedEvtSig.getBytes(StandardCharsets.UTF_8),
                    receivedEvtSig.getBytes(StandardCharsets.UTF_8))) {
                return expectedEvtSig;
            }
        }
        return null;
    }

    public static boolean verifyFrameDigest(Long cameraId, String cleanPlate, String frameDigest, String traceToken) {
        if (cleanPlate == null || cleanPlate.isBlank()) {
            return false;
        }
        long camId = cameraId != null ? cameraId : 0L;
        long currentSlot = Instant.now().getEpochSecond() / SYNC_WINDOW_SEC;
        if (frameDigest != null && !frameDigest.isBlank() && !"INVALID_SESSION".equalsIgnoreCase(frameDigest)) {
            for (long s : new long[]{currentSlot - 1, currentSlot, currentSlot + 1}) {
                String fullHmac = computeHmacHex("CS_EVT_" + camId + "_" + cleanPlate + "_" + s);
                String expected = fullHmac.length() >= 16 ? fullHmac.substring(0, 16) : fullHmac;
                if (MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                        frameDigest.trim().toLowerCase().getBytes(StandardCharsets.UTF_8))) {
                    return true;
                }
            }
        }
        if (traceToken != null && !traceToken.isBlank()) {
            String extracted = extractVerifiedEventDigest(cameraId, cleanPlate, traceToken);
            return extracted != null;
        }
        return false;
    }
}
