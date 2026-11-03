package org.example.camerastream.modules.license;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

/**
 * Nap/kiem tra license (PX-LIC-) cua HPLicenseTool, chong tua lui dong ho, kich hoat license moi.
 * license.enforce: auto (mac dinh: chi ep khi chay tu JAR) | true | false.
 */
@Service
@Slf4j
public class LicenseService {

    private static final long RECHECK_MS = 60_000;
    private static final String CLOCK_SECRET = "CameraStream_AntiRollback_Secret_2026";

    private final LicenseVerifier verifier = new LicenseVerifier(LicensePublicKey.MODULUS_B64, LicensePublicKey.EXPONENT_B64);

    @Value("${license.path:./license/license.lic}")
    private String licensePath;

    @Value("${license.enforce:auto}")
    private String enforceMode;

    private volatile LicenseResult current = LicenseResult.fail(LicenseStatus.NOT_FOUND, "Chua nap license.");
    private volatile long lastCheckMs = 0;

    @PostConstruct
    void init() {
        reload();
        log.info("[LICENSE] enforce={} | ma may={} | trang thai={} - {}",
                isEnforced(), machineCode(), current.status(), current.message());
    }

    public boolean isEnforced() {
        if ("true".equalsIgnoreCase(enforceMode)) return true;
        if ("false".equalsIgnoreCase(enforceMode)) return false;
        var res = LicenseService.class.getResource("LicenseService.class");
        return res != null && "jar".equals(res.getProtocol());
    }

    public String machineCode() {
        return MachineCodeProvider.getMachineCode();
    }

    public LicenseResult current() {
        if (System.currentTimeMillis() - lastCheckMs > RECHECK_MS) {
            reload();
        }
        return current;
    }

    public synchronized LicenseResult reload() {
        Path p = Path.of(licensePath);
        LicenseResult r;
        if (!Files.exists(p)) {
            r = LicenseResult.fail(LicenseStatus.NOT_FOUND, "Khong tim thay file license: " + p.toAbsolutePath());
        } else {
            try {
                r = evaluate(Files.readString(p, StandardCharsets.UTF_8), p);
            } catch (IOException e) {
                r = LicenseResult.fail(LicenseStatus.MALFORMED, "Khong doc duoc file license: " + e.getMessage());
            }
        }
        current = r;
        lastCheckMs = System.currentTimeMillis();
        return r;
    }

    /** Kich hoat: chi ghi file khi license hop le cho may nay. */
    public synchronized LicenseResult activate(String rawKey) throws IOException {
        LicenseResult r = verifier.verify(rawKey, machineCode(), Instant.now());
        if (!r.valid()) return r;
        Path p = Path.of(licensePath);
        Path dir = p.toAbsolutePath().getParent();
        if (dir != null) Files.createDirectories(dir);
        Path tmp = Files.createTempFile(dir, "license", ".tmp");
        Files.writeString(tmp, rawKey.trim(), StandardCharsets.UTF_8);
        Files.move(tmp, p, StandardCopyOption.REPLACE_EXISTING);
        return reload();
    }

    private LicenseResult evaluate(String raw, Path licenseFile) {
        Instant now = Instant.now();
        LicenseResult r = verifier.verify(raw, machineCode(), now);
        if (!r.valid()) return r;
        String clockMsg = checkClock(now, licenseFile);
        return clockMsg == null ? r : r.withFailure(LicenseStatus.CLOCK_TAMPERED, clockMsg);
    }

    /** Chong tua lui dong ho: luu moc thoi gian lon nhat da thay, co HMAC. Tra ve null neu OK. */
    private String checkClock(Instant now, Path licenseFile) {
        try {
            Path dir = licenseFile.toAbsolutePath().getParent();
            Path state = dir.resolve("camerastream-license.state");
            if (Files.exists(state)) {
                List<String> lines = Files.readAllLines(state, StandardCharsets.UTF_8);
                if (lines.size() >= 2) {
                    if (!lines.get(1).trim().equalsIgnoreCase(hmac(lines.get(0).trim()))) {
                        return "File trang thai thoi gian bi can thiep trai phep.";
                    }
                    Instant last = Instant.ofEpochMilli(Long.parseLong(lines.get(0).trim()));
                    if (now.isBefore(last.minusSeconds(300))) {
                        return "Phat hien dong ho he thong bi tua lui.";
                    }
                    if (now.isBefore(last)) return null;
                }
            }
            String ms = Long.toString(now.toEpochMilli());
            Files.writeString(state, ms + System.lineSeparator() + hmac(ms), StandardCharsets.UTF_8);
            return null;
        } catch (Exception e) {
            log.warn("[LICENSE] Khong kiem tra duoc trang thai dong ho: {}", e.getMessage());
            return null; // khong chan neu loi doc/ghi file cuc bo (giong ban HPTicket)
        }
    }

    private static String hmac(String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(CLOCK_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().withUpperCase().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }
}

