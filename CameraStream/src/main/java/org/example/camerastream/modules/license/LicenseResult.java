package org.example.camerastream.modules.license;

import java.time.Instant;

/**
 * Ket qua kiem tra license. Bat bien.
 */
public record LicenseResult(
        boolean valid,
        LicenseStatus status,
        String message,
        String customerName,
        String licensedMachineCode,
        Instant expiryDate,
        boolean permanent,
        long daysRemaining) {

    public static LicenseResult fail(LicenseStatus status, String message) {
        return new LicenseResult(false, status, message, null, null, null, false, 0);
    }

    public LicenseResult withFailure(LicenseStatus newStatus, String newMessage) {
        return new LicenseResult(false, newStatus, newMessage, customerName, licensedMachineCode,
                expiryDate, permanent, daysRemaining);
    }
}

