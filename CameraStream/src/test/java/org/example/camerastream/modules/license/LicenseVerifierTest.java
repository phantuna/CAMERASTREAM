package org.example.camerastream.modules.license;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test voi license sinh tu LicenseCrypto THAT cua HPLicenseTool (ky bang khoa RSA tam).
 * Ma may co dinh nen test doc lap voi may chay.
 */
class LicenseVerifierTest {

    private static final String MACHINE = "PX-TEST-0000-0000-0001";
    private static final Path DIR = Path.of("src/test/resources/license-fixtures");
    private static LicenseVerifier verifier;

    @BeforeAll
    static void setUp() throws IOException {
        List<String> k = Files.readAllLines(DIR.resolve("test_public_key.txt"));
        verifier = new LicenseVerifier(k.get(0).trim(), k.get(1).trim());
    }

    private static String lic(String name) throws IOException {
        return Files.readString(DIR.resolve(name), StandardCharsets.UTF_8);
    }

    @Test
    void validLicenseOnRightMachine() throws IOException {
        LicenseResult r = verifier.verify(lic("ok.lic"), MACHINE, Instant.now());
        assertTrue(r.valid(), r.message());
        assertEquals(LicenseStatus.VALID, r.status());
        assertEquals("Khach Test", r.customerName());
        assertFalse(r.permanent());
        assertTrue(r.daysRemaining() > 1000);
    }

    @Test
    void machineCodeIsCaseAndWhitespaceInsensitive() throws IOException {
        assertTrue(verifier.verify(lic("ok.lic"), "  px-test-0000-0000-0001 ", Instant.now()).valid());
    }

    @Test
    void permanentLicense() throws IOException {
        LicenseResult r = verifier.verify(lic("permanent.lic"), MACHINE, Instant.now());
        assertTrue(r.valid(), r.message());
        assertTrue(r.permanent());
    }

    @Test
    void expiredLicenseRejected() throws IOException {
        LicenseResult r = verifier.verify(lic("expired.lic"), MACHINE, Instant.now());
        assertFalse(r.valid());
        assertEquals(LicenseStatus.EXPIRED, r.status());
    }

    @Test
    void licenseForOtherMachineRejected() throws IOException {
        LicenseResult r = verifier.verify(lic("othermachine.lic"), MACHINE, Instant.now());
        assertFalse(r.valid());
        assertEquals(LicenseStatus.MACHINE_MISMATCH, r.status());
    }

    @Test
    void wrongMachineRejected() throws IOException {
        assertEquals(LicenseStatus.MACHINE_MISMATCH,
                verifier.verify(lic("ok.lic"), "PX-0000-0000-0000-0000", Instant.now()).status());
    }

    @Test
    void tamperedPayloadRejected() throws IOException {
        String raw = lic("ok.lic").trim();
        String decoded = new String(Base64.getDecoder().decode(raw.substring(LicenseVerifier.PREFIX.length())), StandardCharsets.UTF_8);
        String forged = decoded.replace("Khach Test", "Khach Gia ");
        String forgedKey = LicenseVerifier.PREFIX + Base64.getEncoder().encodeToString(forged.getBytes(StandardCharsets.UTF_8));
        LicenseResult r = verifier.verify(forgedKey, MACHINE, Instant.now());
        assertFalse(r.valid());
        assertEquals(LicenseStatus.INVALID_SIGNATURE, r.status());
    }

    @Test
    void signedByOtherKeyRejected() throws IOException {
        // Verifier dung khoa CONG KHAI THAT cua HPLicenseTool: license ky bang khoa tam phai bi tu choi
        LicenseVerifier real = new LicenseVerifier(LicensePublicKey.MODULUS_B64, LicensePublicKey.EXPONENT_B64);
        assertEquals(LicenseStatus.INVALID_SIGNATURE, real.verify(lic("ok.lic"), MACHINE, Instant.now()).status());
    }

    @Test
    void malformedInputs() {
        assertEquals(LicenseStatus.NOT_FOUND, verifier.verify("", MACHINE, Instant.now()).status());
        assertEquals(LicenseStatus.MALFORMED, verifier.verify("hello", MACHINE, Instant.now()).status());
        assertEquals(LicenseStatus.MALFORMED, verifier.verify("PX-LIC-@@@", MACHINE, Instant.now()).status());
        String noSep = "PX-LIC-" + Base64.getEncoder().encodeToString("abc".getBytes(StandardCharsets.UTF_8));
        assertEquals(LicenseStatus.MALFORMED, verifier.verify(noSep, MACHINE, Instant.now()).status());
    }

    @Test
    void realPublicKeyParses() {
        assertDoesNotThrow(() -> new LicenseVerifier(LicensePublicKey.MODULUS_B64, LicensePublicKey.EXPONENT_B64));
    }

    @Test
    void dateParsingFormats() {
        assertNotNull(LicenseVerifier.parseDate("2026-12-01T22:23:23.6700572+07:00"));
        assertNotNull(LicenseVerifier.parseDate("2026-12-01T22:23:23"));
        assertNotNull(LicenseVerifier.parseDate("/Date(1790000000000)/"));
        assertNull(LicenseVerifier.parseDate("khong phai ngay"));
    }

    @Test
    void machineCodeFormatMatchesCSharpAlgorithm() throws Exception {
        String code = MachineCodeProvider.format("CPU:a|MB:b|DISK:c|BIOS:d");
        assertTrue(code.matches("PX-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}"), code);
    }

    @Test
    void unifiedEd25519JsonLicenseVerifiedByJava() throws Exception {
        java.security.KeyPair kp = java.security.KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        byte[] spki = kp.getPublic().getEncoded();
        byte[] raw32 = java.util.Arrays.copyOfRange(spki, spki.length - 32, spki.length);
        String edPubB64 = Base64.getEncoder().encodeToString(raw32);

        List<String> k = Files.readAllLines(DIR.resolve("test_public_key.txt"));
        LicenseVerifier unified = new LicenseVerifier(k.get(0).trim(), k.get(1).trim(), edPubB64);

        String payload = "{\"CustomerName\":\"Unified Co\",\"ExpiryDate\":\"2030-01-01T00:00:00Z\","
                + "\"MachineCode\":\"" + MACHINE + "\",\"customerId\":\"Unified Co\","
                + "\"expiresAt\":\"2030-01-01T00:00:00Z\",\"issuedAt\":\"2026-11-02T00:00:00Z\","
                + "\"keyScheme\":\"tpm-v1\",\"licenseId\":\"HPT-1\",\"machineFingerprint\":\"abcd\","
                + "\"maxCameras\":16,\"product\":\"CameraStream\",\"tpmWrappedModelKey\":\"AAAA\"}";
        java.security.Signature sig = java.security.Signature.getInstance("Ed25519");
        sig.initSign(kp.getPrivate());
        sig.update(payload.getBytes(StandardCharsets.UTF_8));
        String doc = "{\"payload\":" + payload + ",\"signature\":\""
                + Base64.getEncoder().encodeToString(sig.sign()) + "\"}";

        LicenseResult ok = unified.verify(doc, MACHINE, Instant.now());
        assertTrue(ok.valid(), ok.message());
        assertEquals("Unified Co", ok.customerName());

        LicenseResult badMachine = unified.verify(doc, "PX-9999-9999-9999-9999", Instant.now());
        assertEquals(LicenseStatus.MACHINE_MISMATCH, badMachine.status());

        String tampered = doc.replace("\"maxCameras\":16", "\"maxCameras\":99");
        assertEquals(LicenseStatus.INVALID_SIGNATURE, unified.verify(tampered, MACHINE, Instant.now()).status());
    }
}

