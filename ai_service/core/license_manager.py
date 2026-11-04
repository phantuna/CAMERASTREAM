# -*- coding: utf-8 -*-
"""Lop 4: kiem tra license offline (Ed25519) gan may (TPM 2.0 hoac DPAPI+Da phan cung) + mo khoa model.

license.lic = {"payload": {...}, "signature": "<b64 Ed25519 tren payload chuan hoa>"}
payload co: licenseId, customerId, machineFingerprint, machineCode (PX-XXXX-...),
            expiresAt (ISO UTC), maxCameras, keyScheme ('tpm-v1' | 'dpapi-hw-v1' | 'kdf-v1'),
            tpmWrappedModelKey / wrappedModelKey.
Public key nam trong core/_license_pubkey.py (nhung vao binary khi build).
"""
import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

APP_SALT = b"hp-camerastream-lic-v1"
CLOCK_SECRET = b"CameraStream_AI_AntiRollback_Secret_2026"
PUBLIC_KEY_B64 = ""  # co the bi ghi de boi _license_pubkey (xem _load_public_key)

RSA_MODULUS_B64 = (
    "ngkRE8TrNYUW5hyaHEdG0B9Ez+pV28ewRYCiGxDlu5uZapISLi03JAbhdvSYP1pTjU3o2+ygMOxyCKjt4QA0iXQ6qhGsPKAJP5tASkCbHaqc7pyJb2+lpVkT"
    "iusMl+XJTXJPsfdUMkusP43hHUO4NdXV+yDvWhzOKfkjhIvLv5au2DttvQmluxCqmHPbwygt4sZjmqR7EIPtMRBFe5tPUN6045dVpBQXeKr6joTbkPB9/XtTl"
    "MjOcq1e4JfTHTJw9AyMRGoDlSVkMiaIQCfR6GLs0nfUbfWzpvm998UrYHZWaWJCIkZF7HOYb9t23OJzJ/jFN9q2tZ2jGy4keP9OkYSgoNMC1MiCUMXeXRIid"
    "NVxIp9VtcBV/Il1sxZVzoXX/k0K6WQaOu2EM2sD06U8Hi9CUgBFSX1MT0ie9OnzWk1ALC8mzF6efuTgalp600DRn5ZFCHIWb+2Yz179Y6VZ7H8/+46ZDQJxu"
    "feVNMXN2rQo/iS7qW+WzS/KJ2SC/EEh"
)
RSA_EXPONENT_B64 = "AQAB"

_WMI_PS = (
    "$ErrorActionPreference='SilentlyContinue';"
    "function F($c,$p){foreach($o in Get-CimInstance $c){$v=$o.$p;if($v){$s=([string]$v).Trim();"
    "if($s -and $s -ne 'None' -and $s -ne 'To be filled by O.E.M.'){return $s}}};return ''};"
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;"
    "Write-Output ((F 'Win32_Processor' 'ProcessorId')+'|'+(F 'Win32_BaseBoard' 'SerialNumber')+'|'"
    "+(F 'Win32_DiskDrive' 'SerialNumber')+'|'+(F 'Win32_BIOS' 'SerialNumber'))"
)
_cached_hw_code: Optional[str] = None


class LicenseError(Exception):
    pass


def machine_fingerprint() -> str:
    """Dau van may on dinh: MachineGuid (Windows), /etc/machine-id (Linux), hoac bien moi truong MACHINE_CODE."""
    env_code = os.getenv("MACHINE_CODE", "").strip() or os.getenv("HOST_MACHINE_CODE", "").strip()
    if env_code:
        return hashlib.sha256(env_code.encode("utf-8") + APP_SALT).hexdigest()

    raw = ""
    if sys.platform == "win32":
        import winreg
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography",
                             0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY)
        raw = winreg.QueryValueEx(key, "MachineGuid")[0]
    else:
        for p in ("/etc/host-machine-id", "/etc/machine-id", "/var/lib/dbus/machine-id"):
            if Path(p).exists():
                raw = Path(p).read_text().strip()
                break
    if not raw:
        raise LicenseError("Khong doc duoc dinh danh may")
    return hashlib.sha256(raw.encode() + APP_SALT).hexdigest()


def hardware_code() -> str:
    """Ma may PX-XXXX-XXXX-XXXX-XXXX tu CPU+MB+DISK+BIOS (khop 100% voi Java Backend & HPLicenseTool)."""
    global _cached_hw_code
    if _cached_hw_code:
        return _cached_hw_code

    env_code = os.getenv("MACHINE_CODE", "").strip() or os.getenv("HOST_MACHINE_CODE", "").strip()
    if env_code:
        _cached_hw_code = env_code
        return _cached_hw_code

    if sys.platform == "win32":
        try:
            out = subprocess.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", _WMI_PS],
                capture_output=True, text=True, timeout=15, check=False
            ).stdout.strip()
            parts = out.split("|")
            if len(parts) == 4 and any(p.strip() for p in parts):
                cpu, mb, disk, bios = (p.strip() for p in parts)
                raw = f"CPU:{cpu}|MB:{mb}|DISK:{disk}|BIOS:{bios}"
                h = hashlib.sha256(raw.encode("utf-8")).hexdigest().upper()
                _cached_hw_code = f"PX-{h[0:4]}-{h[4:8]}-{h[8:12]}-{h[12:16]}"
                return _cached_hw_code
        except Exception:
            pass
    fp = machine_fingerprint().upper()
    _cached_hw_code = f"PX-{fp[0:4]}-{fp[4:8]}-{fp[8:12]}-{fp[12:16]}"
    return _cached_hw_code


def hw_entropy() -> bytes:
    """Entropy ket hop MachineGuid + CPU/MB/DISK/BIOS dung de niem phong DPAPI khi may khong co TPM."""
    return hashlib.sha256(f"{machine_fingerprint()}|{hardware_code()}".encode("utf-8") + APP_SALT).digest()


def canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def derive_wrap_key(fingerprint: str, license_id: str) -> bytes:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=APP_SALT,
                info=f"{fingerprint}|{license_id}".encode()).derive(b"model-key-wrap")


def _load_public_key() -> bytes:
    pub = PUBLIC_KEY_B64
    if not pub:
        try:
            from core._license_pubkey import PUBLIC_KEY_B64 as pub  # type: ignore
        except Exception:
            pub = ""
    if not pub:
        raise LicenseError("Chua cau hinh public key license")
    return base64.b64decode(pub)


def find_license_path() -> Path:
    env = os.getenv("AI_LICENSE_PATH", "").strip()
    if env:
        return Path(env)
    base = Path(sys.argv[0]).resolve().parent
    for c in (base / "license" / "license.lic", base / "license.lic",
              Path.cwd() / "license" / "license.lic"):
        if c.exists():
            return c
    return base / "license" / "license.lic"


def _check_clock_rollback(license_file: Path, now_utc: datetime) -> None:
    """Chong tua lui dong ho he thong (luu moc thoi gian + HMAC-SHA256)."""
    try:
        state_file = license_file.resolve().parent / "ai-license.state"
        now_ms = int(now_utc.timestamp() * 1000)
        if state_file.exists():
            lines = [ln.strip() for ln in state_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
            if len(lines) >= 2:
                expected_mac = hmac.new(CLOCK_SECRET, lines[0].encode(), hashlib.sha256).hexdigest().upper()
                if not hmac.compare_digest(lines[1].upper(), expected_mac):
                    raise LicenseError("File trang thai thoi gian bi can thiep trai phep")
                last_ms = int(lines[0])
                if now_ms < last_ms - 300_000:  # dung sai 5 phut
                    raise LicenseError("Phat hien dong ho he thong bi tua lui")
                if now_ms < last_ms:
                    return
        mac = hmac.new(CLOCK_SECRET, str(now_ms).encode(), hashlib.sha256).hexdigest().upper()
        state_file.write_text(f"{now_ms}\n{mac}\n", encoding="utf-8")
    except LicenseError:
        raise
    except Exception:
        pass


def _load_px_lic(raw_str: str, p: Path) -> dict:
    """Xac minh license dinh dang PX-LIC- do HPLicenseTool phat hanh (RSA-3072 PKCS1v15 SHA-256)."""
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes

    try:
        b64_content = raw_str[len("PX-LIC-"):].strip()
        decoded = base64.b64decode(b64_content).decode("utf-8")
        parts = decoded.split("|||")
        if len(parts) != 2:
            raise LicenseError("Dinh dang file license PX-LIC- khong hop le")
        payload_str, sig_b64 = parts[0], parts[1]
    except Exception as e:
        raise LicenseError(f"Khong the giai ma file license PX-LIC-: {e}")

    try:
        mod = int.from_bytes(base64.b64decode(RSA_MODULUS_B64), "big")
        exp = int.from_bytes(base64.b64decode(RSA_EXPONENT_B64), "big")
        pub = RSAPublicNumbers(exp, mod).public_key()
        pub.verify(base64.b64decode(sig_b64), payload_str.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    except Exception:
        raise LicenseError("Chu ky so RSA-3072 cua License khong hop le! File da bi chinh sua trai phep.")

    try:
        payload = json.loads(payload_str)
    except Exception:
        raise LicenseError("Noi dung payload trong license khong phai JSON hop le")

    lic_mc = payload.get("MachineCode", "").strip().upper()
    curr_mc = hardware_code().strip().upper()
    if lic_mc != curr_mc:
        raise LicenseError(f"License khong danh cho may nay (cap cho {lic_mc}, may hien tai: {curr_mc})")

    is_perm = payload.get("IsPermanent", False)
    if not is_perm:
        exp_str = payload.get("ExpiryDate", "")
        if exp_str:
            try:
                if exp_str.endswith("Z"):
                    exp_dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
                elif "+" in exp_str or ("-" in exp_str[10:]):
                    exp_dt = datetime.fromisoformat(exp_str)
                else:
                    exp_dt = datetime.fromisoformat(exp_str).replace(tzinfo=timezone.utc)
                now_utc = datetime.now(timezone.utc)
                if now_utc > exp_dt:
                    raise LicenseError(f"License da HET HAN tu ngay {exp_str}")
            except LicenseError:
                raise
            except Exception:
                pass

    _check_clock_rollback(p, datetime.now(timezone.utc))
    payload["customerId"] = payload.get("CustomerName", "")
    payload["expiresAt"] = payload.get("ExpiryDate", "")
    return payload


def load_license(path: Optional[Path] = None) -> dict:
    """Xac minh chu ky, may, han dung va chong tua lui dong ho. Tra ve payload hop le hoac nem LicenseError.
    Ho tro ca 2 dinh dang:
    1. Dinh dang chuan HPLicenseTool: PX-LIC-... (RSA-3072)
    2. Dinh dang Ed25519 JSON
    """
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    p = Path(path) if path else find_license_path()
    if not p.exists():
        raise LicenseError(f"Khong tim thay license: {p}")
    raw_content = p.read_text(encoding="utf-8").replace("\ufeff", "").strip()
    if raw_content.startswith("PX-LIC-"):
        return _load_px_lic(raw_content, p)

    try:
        doc = json.loads(raw_content)
        payload, sig = doc["payload"], base64.b64decode(doc["signature"])
    except Exception:
        raise LicenseError("File license hong")
    try:
        Ed25519PublicKey.from_public_bytes(_load_public_key()).verify(sig, canonical(payload))
    except InvalidSignature:
        raise LicenseError("Chu ky license khong hop le")
    lic_fp = payload.get("machineFingerprint")
    lic_mc = payload.get("MachineCode")
    if lic_fp != machine_fingerprint():
        if not (lic_mc and lic_mc.strip().upper() == hardware_code().strip().upper()):
            raise LicenseError(f"License khong danh cho may nay (cap cho {lic_mc or lic_fp}, may hien tai: {hardware_code()})")
    now = datetime.now(timezone.utc)
    exp = datetime.fromisoformat(payload["expiresAt"].replace("Z", "+00:00"))
    if now > exp:
        raise LicenseError("License da het han")
    _check_clock_rollback(p, now)
    return payload


def get_model_key(path: Optional[Path] = None) -> bytes:
    """Mo khoa model tu license:
    - 'tpm-v1': giai ma RSA-OAEP ben trong chip TPM 2.0.
    - 'dpapi-hw-v1': giai ma RSA-OAEP qua Windows DPAPI + Hardware Entropy (CPU+MB+DISK+BIOS+Guid).
    - Con lai: HKDF tren dau van may that dang chay.
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    payload = load_license(path)
    scheme = payload.get("keyScheme", "")
    if scheme == "tpm-v1":
        from core import tpm_vault
        return tpm_vault.decrypt(base64.b64decode(payload["tpmWrappedModelKey"]))
    if scheme == "dpapi-hw-v1":
        from core import tpm_vault
        return tpm_vault.decrypt_dpapi(base64.b64decode(payload["tpmWrappedModelKey"]), hw_entropy())
    wrapped = base64.b64decode(payload["wrappedModelKey"])
    wk = derive_wrap_key(machine_fingerprint(), payload["licenseId"])
    return AESGCM(wk).decrypt(wrapped[:12], wrapped[12:], payload["licenseId"].encode())


def get_max_cameras(path: Optional[Path] = None) -> int:
    return int(load_license(path).get("maxCameras", 0))
