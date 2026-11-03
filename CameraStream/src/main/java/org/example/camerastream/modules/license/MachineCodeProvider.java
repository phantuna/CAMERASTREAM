package org.example.camerastream.modules.license;

import lombok.extern.slf4j.Slf4j;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.TimeUnit;

/**
 * Tinh Ma May giong HardwareFingerprint.GetMachineCode() cua HPTicket (C#):
 * SHA-256("CPU:{cpu}|MB:{mb}|DISK:{disk}|BIOS:{bios}") -> "PX-XXXX-XXXX-XXXX-XXXX".
 * Gia tri lay tu WMI (qua PowerShell). Chi ho tro Windows.
 */
@Slf4j
public final class MachineCodeProvider {

    private static final String PS_SCRIPT =
            "$ErrorActionPreference='SilentlyContinue';"
                    + "function F($c,$p){foreach($o in Get-CimInstance $c){$v=$o.$p;if($v){$s=([string]$v).Trim();"
                    + "if($s -and $s -ne 'None' -and $s -ne 'To be filled by O.E.M.'){return $s}}};return ''};"
                    + "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;"
                    + "Write-Output ((F 'Win32_Processor' 'ProcessorId')+'|'+(F 'Win32_BaseBoard' 'SerialNumber')+'|'"
                    + "+(F 'Win32_DiskDrive' 'SerialNumber')+'|'+(F 'Win32_BIOS' 'SerialNumber'))";

    private static volatile String cached;

    private MachineCodeProvider() {
    }

    public static String getMachineCode() {
        String c = cached;
        if (c != null) return c;
        synchronized (MachineCodeProvider.class) {
            if (cached == null) {
                cached = compute();
            }
            return cached;
        }
    }

    private static String compute() {
        // 1. Uu tien doc tu bien moi truong (khi chay trong Docker Container)
        String envCode = System.getenv("MACHINE_CODE");
        if (envCode == null || envCode.isBlank()) {
            envCode = System.getenv("HOST_MACHINE_CODE");
        }
        if (envCode != null && !envCode.isBlank()) {
            log.info("[LICENSE] Su dung ma may tu bien moi truong MACHINE_CODE: {}", envCode.trim());
            return envCode.trim();
        }

        // 2. Kiem tra file dinh danh host mount trong container Linux (/etc/host-machine-id hoac /etc/machine-id)
        try {
            java.nio.file.Path hostIdPath = java.nio.file.Path.of("/etc/host-machine-id");
            if (!java.nio.file.Files.exists(hostIdPath)) {
                hostIdPath = java.nio.file.Path.of("/etc/machine-id");
            }
            if (java.nio.file.Files.exists(hostIdPath)) {
                String raw = java.nio.file.Files.readString(hostIdPath, StandardCharsets.UTF_8).trim();
                if (!raw.isBlank()) {
                    log.info("[LICENSE] Phat hien Linux machine-id trong container: {}", hostIdPath);
                    return format("MACHINE-ID:" + raw);
                }
            }
        } catch (Exception ignored) {
        }

        // 3. Neu chay tren Windows Host: tinh ma may bang WMI PowerShell
        if (!System.getProperty("os.name", "").toLowerCase().contains("win")) {
            log.warn("[LICENSE] Chay tren Linux/Docker nhung chua gan bien moi truong MACHINE_CODE!");
            return "UNAVAILABLE";
        }
        try {
            Process p = new ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT)
                    .redirectErrorStream(true).start();
            String line;
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                line = r.readLine();
            }
            if (!p.waitFor(30, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return "UNAVAILABLE";
            }
            if (line == null) return "UNAVAILABLE";
            String[] f = line.split("\\|", -1);
            if (f.length != 4) return "UNAVAILABLE";
            String cpu = f[0].trim(), mb = f[1].trim(), disk = f[2].trim(), bios = f[3].trim();
            if (cpu.isEmpty() && mb.isEmpty() && disk.isEmpty()) {
                log.warn("[LICENSE] WMI khong tra ve gia tri nao; khong the tinh ma may.");
                return "UNAVAILABLE";
            }
            return format("CPU:" + cpu + "|MB:" + mb + "|DISK:" + disk + "|BIOS:" + bios);
        } catch (Exception e) {
            log.warn("[LICENSE] Loi tinh ma may: {}", e.getMessage());
            return "UNAVAILABLE";
        }
    }

    static String format(String raw) throws Exception {
        byte[] h = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : h) hex.append(String.format("%02X", b));
        return "PX-" + hex.substring(0, 4) + "-" + hex.substring(4, 8) + "-" + hex.substring(8, 12) + "-" + hex.substring(12, 16);
    }
}

