package org.example.camerastream.modules.license;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.HexFormat;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Xac minh license dinh dang PX-LIC- do HPLicenseTool phat hanh:
 * "PX-LIC-" + Base64( payloadJson + "|||" + Base64(RSA-SHA256-PKCS1(payloadJson)) ).
 * Logic song song voi LicenseManager.ValidateLicense cua HPTicket (C#).
 */
public final class LicenseVerifier {

    public static final String PREFIX = "PX-LIC-";
    private static final byte[] ED25519_X509_PREFIX = HexFormat.of().parseHex("302a300506032b6570032100");
    private static final Pattern MS_DATE = Pattern.compile("/Date\\((-?\\d+)(?:[+-]\\d{4})?\\)/");
    private static final ObjectMapper MAPPER = new ObjectMapper().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);

    private final PublicKey publicKey;
    private final PublicKey ed25519PublicKey;

    public LicenseVerifier(String modulusB64, String exponentB64) {
        this(modulusB64, exponentB64, LicensePublicKey.ED25519_PUB_B64);
    }

    public LicenseVerifier(String modulusB64, String exponentB64, String ed25519PubB64) {
        try {
            BigInteger n = new BigInteger(1, Base64.getDecoder().decode(modulusB64));
            BigInteger e = new BigInteger(1, Base64.getDecoder().decode(exponentB64));
            this.publicKey = KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(n, e));
            if (ed25519PubB64 != null && !ed25519PubB64.isBlank()) {
                byte[] raw = Base64.getDecoder().decode(ed25519PubB64.trim());
                byte[] spki = new byte[ED25519_X509_PREFIX.length + raw.length];
                System.arraycopy(ED25519_X509_PREFIX, 0, spki, 0, ED25519_X509_PREFIX.length);
                System.arraycopy(raw, 0, spki, ED25519_X509_PREFIX.length, raw.length);
                this.ed25519PublicKey = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(spki));
            } else {
                this.ed25519PublicKey = null;
            }
        } catch (Exception ex) {
            throw new IllegalStateException("Khoa cong khai license khong hop le", ex);
        }
    }

    public LicenseResult verify(String rawKey, String currentMachineCode, Instant now) {
        if (rawKey == null || rawKey.isBlank()) {
            return LicenseResult.fail(LicenseStatus.NOT_FOUND, "License key rong hoac khong tim thay file license.lic.");
        }
        String clean = rawKey.replace("\uFEFF", "").trim();
        if (clean.startsWith("{")) {
            return verifyUnifiedEd25519(clean, currentMachineCode, now);
        }
        if (!clean.regionMatches(true, 0, PREFIX, 0, PREFIX.length())) {
            return LicenseResult.fail(LicenseStatus.MALFORMED,
                    "License key khong dung dinh dang (phai bat dau bang '" + PREFIX + "' hoac JSON Ed25519).");
        }

        String decoded;
        try {
            decoded = new String(Base64.getDecoder().decode(clean.substring(PREFIX.length())), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return LicenseResult.fail(LicenseStatus.MALFORMED, "Khong the giai ma chuoi Base64 cua License key.");
        }

        String[] parts = decoded.split("\\|\\|\\|", -1);
        if (parts.length != 2) {
            return LicenseResult.fail(LicenseStatus.MALFORMED, "Cau truc License key khong hop le.");
        }
        String payloadJson = parts[0];

        boolean signatureOk;
        try {
            Signature sig = Signature.getInstance("SHA256withRSA");
            sig.initVerify(publicKey);
            sig.update(payloadJson.getBytes(StandardCharsets.UTF_8));
            signatureOk = sig.verify(Base64.getDecoder().decode(parts[1]));
        } catch (Exception ex) {
            signatureOk = false;
        }
        if (!signatureOk) {
            return LicenseResult.fail(LicenseStatus.INVALID_SIGNATURE,
                    "Chu ky so RSA khong hop le! License da bi chinh sua trai phep.");
        }

        JsonNode root;
        try {
            root = MAPPER.readTree(payloadJson);
        } catch (Exception ex) {
            return LicenseResult.fail(LicenseStatus.MALFORMED, "Khong the doc du lieu payload cua License.");
        }
        String customer = text(root, "CustomerName");
        String licensedMachine = text(root, "MachineCode");
        Instant expiry = parseDate(text(root, "ExpiryDate"));
        if (licensedMachine == null || licensedMachine.isBlank() || expiry == null) {
            return LicenseResult.fail(LicenseStatus.MALFORMED, "Payload License thieu MachineCode hoac ExpiryDate.");
        }

        boolean permanent = expiry.atZone(ZoneId.systemDefault()).getYear() >= 2099
                || yearOf(text(root, "ExpiryDate")) >= 2099;

        if (currentMachineCode == null || !licensedMachine.trim().equalsIgnoreCase(currentMachineCode.trim())) {
            return new LicenseResult(false, LicenseStatus.MACHINE_MISMATCH,
                    "Ma may khong khop! License cap cho: " + licensedMachine + ", may hien tai: " + currentMachineCode,
                    customer, licensedMachine, expiry, permanent, 0);
        }

        long days;
        if (permanent) {
            days = 99999;
        } else {
            if (now.isAfter(expiry)) {
                return new LicenseResult(false, LicenseStatus.EXPIRED, "License da HET HAN. Vui long lien he nha cung cap de gia han.",
                        customer, licensedMachine, expiry, false, 0);
            }
            days = Math.max(0, (long) Math.ceil(Duration.between(now, expiry).toSeconds() / 86400.0));
        }

        return new LicenseResult(true, LicenseStatus.VALID,
                permanent ? "License VINH VIEN hop le." : "License hop le. Con " + days + " ngay.",
                customer, licensedMachine, expiry, permanent, days);
    }

    private LicenseResult verifyUnifiedEd25519(String jsonDoc, String currentMachineCode, Instant now) {
        if (ed25519PublicKey == null) {
            return LicenseResult.fail(LicenseStatus.INVALID_SIGNATURE, "Chua cau hinh Ed25519 public key cho Backend.");
        }
        JsonNode doc;
        try {
            doc = MAPPER.readTree(jsonDoc);
        } catch (Exception ex) {
            return LicenseResult.fail(LicenseStatus.MALFORMED, "File license JSON khong hop le.");
        }
        JsonNode payloadNode = doc.get("payload");
        String sigB64 = text(doc, "signature");
        if (payloadNode == null || !payloadNode.isObject() || sigB64 == null) {
            return LicenseResult.fail(LicenseStatus.MALFORMED, "File license JSON thieu payload hoac signature.");
        }
        boolean sigOk;
        try {
            TreeMap<?, ?> sorted = MAPPER.treeToValue(payloadNode, TreeMap.class);
            byte[] canonicalBytes = MAPPER.writeValueAsString(sorted).getBytes(StandardCharsets.UTF_8);
            Signature sig = Signature.getInstance("Ed25519");
            sig.initVerify(ed25519PublicKey);
            sig.update(canonicalBytes);
            sigOk = sig.verify(Base64.getDecoder().decode(sigB64));
        } catch (Exception ex) {
            sigOk = false;
        }
        if (!sigOk) {
            return LicenseResult.fail(LicenseStatus.INVALID_SIGNATURE, "Chu ky so Ed25519 khong hop le!");
        }
        String customer = text(payloadNode, "CustomerName") != null ? text(payloadNode, "CustomerName") : text(payloadNode, "customerId");
        String licensedMachine = text(payloadNode, "MachineCode");
        String expStr = text(payloadNode, "ExpiryDate") != null ? text(payloadNode, "ExpiryDate") : text(payloadNode, "expiresAt");
        Instant expiry = parseDate(expStr);
        if (licensedMachine == null || licensedMachine.isBlank() || expiry == null) {
            return LicenseResult.fail(LicenseStatus.MALFORMED, "Payload License thieu MachineCode hoac expiresAt.");
        }
        boolean permanent = expiry.atZone(ZoneId.systemDefault()).getYear() >= 2099 || yearOf(expStr) >= 2099;
        if (currentMachineCode == null || !licensedMachine.trim().equalsIgnoreCase(currentMachineCode.trim())) {
            return new LicenseResult(false, LicenseStatus.MACHINE_MISMATCH,
                    "Ma may khong khop! License cap cho: " + licensedMachine + ", may hien tai: " + currentMachineCode,
                    customer, licensedMachine, expiry, permanent, 0);
        }
        if (!permanent && now.isAfter(expiry)) {
            return new LicenseResult(false, LicenseStatus.EXPIRED, "License da HET HAN.", customer, licensedMachine, expiry, false, 0);
        }
        long days = permanent ? 99999 : Math.max(0, (long) Math.ceil(Duration.between(now, expiry).toSeconds() / 86400.0));
        return new LicenseResult(true, LicenseStatus.VALID,
                permanent ? "License VINH VIEN hop le." : "License hop le. Con " + days + " ngay.",
                customer, licensedMachine, expiry, permanent, days);
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return (v == null || v.isNull()) ? null : v.asText();
    }

    /** Nam ghi trong chuoi ngay (neu co) — tranh sai lech mui gio quanh moc 2099-12-31. */
    private static int yearOf(String s) {
        if (s == null || s.length() < 4) return 0;
        try {
            return Integer.parseInt(s.substring(0, 4));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static Instant parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        try {
            return OffsetDateTime.parse(t).toInstant();
        } catch (Exception ignore) {
        }
        try {
            return LocalDateTime.parse(t).atZone(ZoneId.systemDefault()).toInstant();
        } catch (Exception ignore) {
        }
        Matcher m = MS_DATE.matcher(t);
        if (m.matches()) {
            return Instant.ofEpochMilli(Long.parseLong(m.group(1)));
        }
        return null;
    }
}
