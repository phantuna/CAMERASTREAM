package org.example.camerastream.common.integrity;

import lombok.extern.slf4j.Slf4j;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

/**
 * ServiceIntegrityVerifier: Kiem tra va xac thuc tinh toan ven goi tin (Request & Telemetry Integrity).
 * Dong bo theo khung thoi gian (Time-Window slot) giua Spring Boot va cac service ve tinh (AI Service).
 */
@Slf4j
public final class ServiceIntegrityVerifier {

    public static final String INTEGRITY_HEADER = "X-Service-Integrity";
    private static final String DEFAULT_INTEGRITY_KEY = "HPT_INTERNAL_SECURE_HANDSHAKE_2026";
    private static final int DEFAULT_WINDOW_SECONDS = 30;

    private ServiceIntegrityVerifier() {
    }

    public static String getIntegrityKey() {
        String env = System.getenv("SERVICE_INTEGRITY_KEY");
        if (env != null && !env.isBlank()) {
            return env.trim();
        }
        String fallbackEnv = System.getenv("INTERNAL_SERVICE_SECRET");
        if (fallbackEnv != null && !fallbackEnv.isBlank()) {
            return fallbackEnv.trim();
        }
        return DEFAULT_INTEGRITY_KEY;
    }

    public static String computeWindowSignature(long slot, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] rawHmac = mac.doFinal(("CS_STREAM_INTEGRITY_" + slot).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : rawHmac) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            log.error("[INTEGRITY] Loi tinh toan HMAC-SHA256 cho window slot {}: {}", slot, e.getMessage());
            return "";
        }
    }

    public static String generateIntegrityHeader() {
        long now = Instant.now().getEpochSecond();
        long slot = now / DEFAULT_WINDOW_SECONDS;
        String sig = computeWindowSignature(slot, getIntegrityKey());
        return now + ":" + sig;
    }

    public static boolean verifyRequestIntegrity(String headerValue) {
        return verifyRequestIntegrity(headerValue, getIntegrityKey(), DEFAULT_WINDOW_SECONDS);
    }

    public static boolean verifyRequestIntegrity(String headerValue, String key, int windowSeconds) {
        if (headerValue == null || !headerValue.contains(":")) {
            return false;
        }

        String[] parts = headerValue.trim().split(":", 2);
        if (parts.length != 2) {
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

        // Chống replay attack: Chênh lệch thời gian không quá 2 khung window
        if (Math.abs(now - reqTime) > ((long) windowSeconds * 2)) {
            return false;
        }

        long currentSlot = now / windowSeconds;
        long[] validSlots = new long[]{currentSlot - 1, currentSlot, currentSlot + 1};

        for (long s : validSlots) {
            String expectedSig = computeWindowSignature(s, key);
            if (MessageDigest.isEqual(expectedSig.getBytes(StandardCharsets.UTF_8),
                    receivedSig.getBytes(StandardCharsets.UTF_8))) {
                return true;
            }
        }

        return false;
    }
}

