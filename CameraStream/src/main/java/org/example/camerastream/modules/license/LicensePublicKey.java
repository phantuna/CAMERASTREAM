package org.example.camerastream.modules.license;

/**
 * Khoa CONG KHAI RSA-3072 cua HPLicenseTool (chi dung de XAC MINH chu ky license PX-LIC-).
 * Khong chua khoa rieng. Giong khoa trong LicenseManager.cs cua HPTicket.
 */
public final class LicensePublicKey {

    public static final String MODULUS_B64 =
            "ngkRE8TrNYUW5hyaHEdG0B9Ez+pV28ewRYCiGxDlu5uZapISLi03JAbhdvSYP1pTjU3o2+ygMOxyCKjt4QA0iXQ6qhGsPKAJP5tASkCbHaqc7pyJb2+lpVkTiusMl+XJTXJPsfdUMkusP43hHUO4NdXV+yDvWhzOKfkjhIvLv5au2DttvQmluxCqmHPbwygt4sZjmqR7EIPtMRBFe5tPUN6045dVpBQXeKr6joTbkPB9/XtTlMjOcq1e4JfTHTJw9AyMRGoDlSVkMiaIQCfR6GLs0nfUbfWzpvm998UrYHZWaWJCIkZF7HOYb9t23OJzJ/jFN9q2tZ2jGy4keP9OkYSgoNMC1MiCUMXeXRIidNVxIp9VtcBV/Il1sxZVzoXX/k0K6WQaOu2EM2sD06U8Hi9CUgBFSX1MT0ie9OnzWk1ALC8mzF6efuTgalp600DRn5ZFCHIWb+2Yz179Y6VZ7H8/+46ZDQJxufeVNMXN2rQo/iS7qW+WzS/KJ2SC/EEh";

    public static final String EXPONENT_B64 = "AQAB";

    /** Khoa CONG KHAI Ed25519 (32 byte raw, base64) dung chung voi AI Service (cap nhat boi license_issuer.py keygen). */
    public static final String ED25519_PUB_B64 = "1Q6Erd7EdMK5e1ekK0590GPUxtMK2QI5OPJuAq6WLSU=";

    private LicensePublicKey() {
    }
}
