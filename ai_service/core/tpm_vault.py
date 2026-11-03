# -*- coding: utf-8 -*-
"""Khoa phan cung 2 tang (Auto-Fallback):
- Tang 1 (Uu tien): Chip TPM 2.0 (Windows CNG 'Microsoft Platform Crypto Provider') -> keyScheme = 'tpm-v1'
- Tang 2 (Du phong khi may khong co TPM 2.0): Windows DPAPI Keystore + Da phan cung (CPU+MB+DISK+BIOS+Guid) -> keyScheme = 'dpapi-hw-v1'

Ca 2 tang deu:
- Tao cap khoa RSA-2048 chi 1 lan duy nhat tren may khach (goi lai se dung lai khoa cu).
- Khoa rieng khong bao gio nam dang ro tren dia.
- Cong ty boc khoa model bang public key (RSA-OAEP SHA-256); chi may khach nay giai ma duoc.
"""
import base64
import ctypes
import os
import sys
from ctypes import wintypes
from pathlib import Path
from typing import Optional, Tuple

PROVIDER = "Microsoft Platform Crypto Provider"
KEY_NAME = os.getenv("HP_TPM_KEY_NAME", "HPCameraStreamModelKey")
SCOPE_FLAG = 0 if os.getenv("HP_TPM_SCOPE", "machine").lower() == "user" else 0x00000020

NCRYPT_MACHINE_KEY_FLAG = 0x00000020
NCRYPT_SILENT_FLAG = 0x00000040
NCRYPT_PAD_OAEP_FLAG = 0x00000004
NCRYPT_ALLOW_DECRYPT_FLAG = 0x00000001
NTE_BAD_KEYSET = 0x80090016 - 0x100000000
NTE_EXISTS = 0x8009000F - 0x100000000

CRYPTPROTECT_UI_FORBIDDEN = 0x1
CRYPTPROTECT_LOCAL_MACHINE = 0x4


class TpmError(Exception):
    pass


class _OaepInfo(ctypes.Structure):
    _fields_ = [("pszAlgId", wintypes.LPCWSTR), ("pbLabel", ctypes.c_void_p), ("cbLabel", wintypes.ULONG)]


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def _lib():
    if sys.platform != "win32":
        raise TpmError("TPM chi ho tro Windows")
    nc = ctypes.WinDLL("ncrypt.dll")
    H = ctypes.c_size_t
    nc.NCryptOpenStorageProvider.argtypes = [ctypes.POINTER(H), wintypes.LPCWSTR, wintypes.DWORD]
    nc.NCryptOpenKey.argtypes = [H, ctypes.POINTER(H), wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD]
    nc.NCryptCreatePersistedKey.argtypes = [H, ctypes.POINTER(H), wintypes.LPCWSTR, wintypes.LPCWSTR,
                                            wintypes.DWORD, wintypes.DWORD]
    nc.NCryptSetProperty.argtypes = [H, wintypes.LPCWSTR, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD]
    nc.NCryptFinalizeKey.argtypes = [H, wintypes.DWORD]
    nc.NCryptExportKey.argtypes = [H, H, wintypes.LPCWSTR, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD,
                                   ctypes.POINTER(wintypes.DWORD), wintypes.DWORD]
    nc.NCryptDecrypt.argtypes = [H, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p, ctypes.c_void_p,
                                 wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), wintypes.DWORD]
    nc.NCryptFreeObject.argtypes = [H]
    nc.NCryptDeleteKey.argtypes = [H, wintypes.DWORD]
    for f in (nc.NCryptOpenStorageProvider, nc.NCryptOpenKey, nc.NCryptCreatePersistedKey, nc.NCryptSetProperty,
              nc.NCryptFinalizeKey, nc.NCryptExportKey, nc.NCryptDecrypt, nc.NCryptFreeObject, nc.NCryptDeleteKey):
        f.restype = ctypes.c_long
    return nc


def _check(status: int, what: str):
    if status != 0:
        raise TpmError(f"{what} that bai (0x{status & 0xFFFFFFFF:08X})")


def _open_provider(nc):
    h = ctypes.c_size_t()
    _check(nc.NCryptOpenStorageProvider(ctypes.byref(h), PROVIDER, 0), "Mo TPM provider")
    return h


def _open_key(nc, prov) -> Optional[ctypes.c_size_t]:
    k = ctypes.c_size_t()
    st = nc.NCryptOpenKey(prov, ctypes.byref(k), KEY_NAME, 0, SCOPE_FLAG | NCRYPT_SILENT_FLAG)
    if st == 0:
        return k
    if st == NTE_BAD_KEYSET:
        return None
    _check(st, "Mo khoa TPM")


def ensure_key() -> bytes:
    """Tao khoa trong TPM neu chua co (1 lan). Tra ve public key DER (SubjectPublicKeyInfo)."""
    nc = _lib()
    prov = _open_provider(nc)
    try:
        key = _open_key(nc, prov)
        if key is None:
            key = ctypes.c_size_t()
            _check(nc.NCryptCreatePersistedKey(prov, ctypes.byref(key), "RSA", KEY_NAME, 0,
                                               SCOPE_FLAG | NCRYPT_SILENT_FLAG),
                   "Tao khoa trong TPM")
            length = wintypes.DWORD(2048)
            _check(nc.NCryptSetProperty(key, "Length", ctypes.byref(length), 4, 0), "Dat do dai khoa")
            usage = wintypes.DWORD(NCRYPT_ALLOW_DECRYPT_FLAG)
            _check(nc.NCryptSetProperty(key, "Key Usage", ctypes.byref(usage), 4, 0), "Dat quyen giai ma")
            _check(nc.NCryptFinalizeKey(key, NCRYPT_SILENT_FLAG), "Hoan tat khoa TPM")
        try:
            return _export_public_der(nc, key)
        finally:
            nc.NCryptFreeObject(key)
    finally:
        nc.NCryptFreeObject(prov)


def has_key() -> bool:
    nc = _lib()
    prov = _open_provider(nc)
    try:
        k = _open_key(nc, prov)
        if k is None:
            return False
        nc.NCryptFreeObject(k)
        return True
    finally:
        nc.NCryptFreeObject(prov)


def delete_key() -> bool:
    """Xoa khoa TPM (chi dung khi go bo/doi may, hoac don khoa test). Sau do phai cap license moi."""
    nc = _lib()
    prov = _open_provider(nc)
    try:
        k = _open_key(nc, prov)
        if k is None:
            return False
        _check(nc.NCryptDeleteKey(k, 0), "Xoa khoa TPM")
        return True
    finally:
        nc.NCryptFreeObject(prov)


def _export_public_der(nc, key) -> bytes:
    n = wintypes.DWORD(0)
    _check(nc.NCryptExportKey(key, 0, "RSAPUBLICBLOB", None, None, 0, ctypes.byref(n), 0), "Do kich thuoc public key")
    buf = (ctypes.c_ubyte * n.value)()
    _check(nc.NCryptExportKey(key, 0, "RSAPUBLICBLOB", None, buf, n.value, ctypes.byref(n), 0), "Xuat public key")
    raw = bytes(buf)[:n.value]
    cb_exp = int.from_bytes(raw[8:12], "little")
    cb_mod = int.from_bytes(raw[12:16], "little")
    exp = int.from_bytes(raw[24:24 + cb_exp], "big")
    mod = int.from_bytes(raw[24 + cb_exp:24 + cb_exp + cb_mod], "big")
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
    pub = RSAPublicNumbers(exp, mod).public_key()
    return pub.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)


def decrypt(ciphertext: bytes, hash_alg: str = "SHA256") -> bytes:
    """Giai ma RSA-OAEP BEN TRONG TPM. Chi thanh cong tren dung chip da tao khoa."""
    nc = _lib()
    prov = _open_provider(nc)
    try:
        key = _open_key(nc, prov)
        if key is None:
            raise TpmError("May nay khong co khoa TPM (chua kich hoat hoac da xoa TPM)")
        try:
            pad = _OaepInfo(hash_alg, None, 0)
            n = wintypes.DWORD(0)
            inbuf = (ctypes.c_ubyte * len(ciphertext)).from_buffer_copy(ciphertext)
            _check(nc.NCryptDecrypt(key, inbuf, len(ciphertext), ctypes.byref(pad), None, 0, ctypes.byref(n),
                                    NCRYPT_PAD_OAEP_FLAG), "TPM giai ma (do kich thuoc)")
            out = (ctypes.c_ubyte * n.value)()
            _check(nc.NCryptDecrypt(key, inbuf, len(ciphertext), ctypes.byref(pad), out, n.value, ctypes.byref(n),
                                    NCRYPT_PAD_OAEP_FLAG), "TPM giai ma")
            return bytes(out)[:n.value]
        finally:
            nc.NCryptFreeObject(key)
    finally:
        nc.NCryptFreeObject(prov)


def public_key_b64() -> str:
    return base64.b64encode(ensure_key()).decode()


# ==============================================================================
# TANG 2 (DU PHONG): WINDOWS DPAPI KEYSTORE + DA PHAN CUNG (KHI KHONG CO TPM 2.0)
# ==============================================================================

def _dpapi_store_path() -> Path:
    custom = os.getenv("HP_DPAPI_KEY_PATH", "").strip()
    if custom:
        return Path(custom)
    prog_data = os.getenv("ProgramData", r"C:\ProgramData")
    return Path(prog_data) / "HPCameraStream" / "hw_keystore.dpapi"


def _make_blob(data: bytes):
    arr = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    return _DataBlob(len(data), ctypes.cast(arr, ctypes.POINTER(ctypes.c_ubyte))), arr


def _dpapi_protect(plain: bytes, entropy: bytes) -> bytes:
    if sys.platform != "win32":
        raise TpmError("DPAPI chi ho tro Windows")
    crypt32 = ctypes.WinDLL("crypt32.dll")
    kernel32 = ctypes.WinDLL("kernel32.dll")
    crypt32.CryptProtectData.argtypes = [
        ctypes.POINTER(_DataBlob), wintypes.LPCWSTR, ctypes.POINTER(_DataBlob),
        ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(_DataBlob)
    ]
    crypt32.CryptProtectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]

    in_blob, _in_ref = _make_blob(plain)
    ent_blob, _ent_ref = _make_blob(entropy)
    out_blob = _DataBlob()
    flags = CRYPTPROTECT_UI_FORBIDDEN | (0 if os.getenv("HP_TPM_SCOPE", "machine").lower() == "user" else CRYPTPROTECT_LOCAL_MACHINE)
    if not crypt32.CryptProtectData(ctypes.byref(in_blob), "HPCameraStreamKey", ctypes.byref(ent_blob), None, None, flags, ctypes.byref(out_blob)):
        raise TpmError("DPAPI CryptProtectData that bai")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _dpapi_unprotect(cipher: bytes, entropy: bytes) -> bytes:
    if sys.platform != "win32":
        raise TpmError("DPAPI chi ho tro Windows")
    crypt32 = ctypes.WinDLL("crypt32.dll")
    kernel32 = ctypes.WinDLL("kernel32.dll")
    crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(_DataBlob), ctypes.c_void_p, ctypes.POINTER(_DataBlob),
        ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(_DataBlob)
    ]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]

    in_blob, _in_ref = _make_blob(cipher)
    ent_blob, _ent_ref = _make_blob(entropy)
    out_blob = _DataBlob()
    if not crypt32.CryptUnprotectData(ctypes.byref(in_blob), None, ctypes.byref(ent_blob), None, None, CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(out_blob)):
        raise TpmError("DPAPI giai ma that bai (sai may hoac phan cung da thay doi)")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def ensure_dpapi_key(hw_entropy: bytes) -> bytes:
    """Tao khoa RSA-2048 boc bang Windows DPAPI + Hardware Entropy (1 lan). Tra ve public key DER."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    p = _dpapi_store_path()
    if p.exists():
        priv_der = bytearray(_dpapi_unprotect(p.read_bytes(), hw_entropy))
        try:
            priv = serialization.load_der_private_key(bytes(priv_der), password=None)
            return priv.public_key().public_bytes(
                serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        finally:
            ctypes.memset((ctypes.c_char * len(priv_der)).from_buffer(priv_der), 0, len(priv_der))

    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_der = bytearray(priv.private_bytes(
        serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    try:
        sealed = _dpapi_protect(bytes(priv_der), hw_entropy)
    finally:
        ctypes.memset((ctypes.c_char * len(priv_der)).from_buffer(priv_der), 0, len(priv_der))
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(sealed)
    return priv.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)


def decrypt_dpapi(ciphertext: bytes, hw_entropy: bytes) -> bytes:
    """Giai ma RSA-OAEP-SHA256 bang khoa niêm phong DPAPI + Hardware Entropy, xoa ngay khoi RAM."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa

    p = _dpapi_store_path()
    if not p.exists():
        raise TpmError("May nay chua co khoa DPAPI (chua kich hoat hoac da xoa keystore)")
    priv_der = bytearray(_dpapi_unprotect(p.read_bytes(), hw_entropy))
    try:
        priv = serialization.load_der_private_key(bytes(priv_der), password=None)
        if not isinstance(priv, rsa.RSAPrivateKey):
            raise TpmError("Khoa trong DPAPI keystore khong phai RSA")
        h = hashes.SHA256()
        return priv.decrypt(ciphertext, padding.OAEP(mgf=padding.MGF1(h), algorithm=h, label=None))
    finally:
        ctypes.memset((ctypes.c_char * len(priv_der)).from_buffer(priv_der), 0, len(priv_der))


def ensure_key_auto(hw_entropy: bytes) -> Tuple[str, bytes]:
    """Tu dong uu tien TPM 2.0 ('tpm-v1'); neu may khong co TPM thi chuyen sang DPAPI+Hardware ('dpapi-hw-v1')."""
    if os.getenv("HP_FORCE_NO_TPM", "0") != "1":
        try:
            return "tpm-v1", ensure_key()
        except Exception:
            pass
    return "dpapi-hw-v1", ensure_dpapi_key(hw_entropy)
