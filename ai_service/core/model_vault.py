# -*- coding: utf-8 -*-
"""Lop 3 (Hardened): nap model .enc (AES-256-GCM) thang vao RAM, xoa ngay buffer sau khi nap,
ket hop chong debugger/hook va kiem tra cheo manifest.json.
"""
import ctypes
import os
import sys
from pathlib import Path
from typing import List, Optional


def _anti_debug_and_hook_check() -> None:
    """Chong trace/debugger va chong monkey-patch ham InferenceSession."""
    if os.getenv("AI_DISABLE_ANTIDEBUG", "0") == "1":
        return
    if sys.gettrace() is not None:
        raise RuntimeError("Tu choi nap model: phat hien Python trace/debugger")
    if sys.platform == "win32":
        try:
            k32 = ctypes.windll.kernel32
            if k32.IsDebuggerPresent() != 0:
                raise RuntimeError("Tu choi nap model: phat hien native debugger")
            remote = ctypes.c_int(0)
            k32.CheckRemoteDebuggerPresent(k32.GetCurrentProcess(), ctypes.byref(remote))
            if remote.value != 0:
                raise RuntimeError("Tu choi nap model: phat hien remote debugger")
        except RuntimeError:
            raise
        except Exception:
            pass
    import onnxruntime as ort
    if hasattr(ort.InferenceSession, "__code__") or hasattr(ort.InferenceSession.__init__, "__wrapped__"):
        raise RuntimeError("Tu choi nap model: phat hien hook tren ort.InferenceSession")
    capi_cls = getattr(getattr(ort, "capi", None), "_pybind_state", None)
    if capi_cls is not None:
        raw_sess = getattr(capi_cls, "InferenceSession", None)
        if raw_sess is not None and hasattr(raw_sess, "__code__"):
            raise RuntimeError("Tu choi nap model: phat hien hook tren pybind11 InferenceSession")


def _wipe_bytes(b: Optional[bytes]) -> None:
    """Ghi de 0x00 len vung nho cua doi tuong bytes/bytearray sau khi ONNX Runtime da nap xong graph C++."""
    if not b:
        return
    try:
        ptr = ctypes.c_char_p(b)
        if ptr.value is not None or len(b) > 0:
            ctypes.memset(ptr, 0, len(b))
    except Exception:
        pass


def _get_key() -> Optional[bytes]:
    # Ban giao khach: khoa lay tu license (dung may + con han). Neu co file license
    # thi PHAI hop le, khong am tham quay sang khoa khac.
    try:
        from core.license_manager import find_license_path, get_model_key
        if find_license_path().exists():
            return get_model_key()
    except ImportError:
        pass
    # Ban dev: khoa tu moi truong / file
    hex_key = os.getenv("AI_MODEL_KEY_HEX", "").strip()
    if hex_key:
        return bytes.fromhex(hex_key)
    key_file = os.getenv("AI_MODEL_KEY_FILE", "").strip()
    if key_file and Path(key_file).exists():
        return Path(key_file).read_bytes()
    return None


def resolve_model(path) -> Path:
    """Tra ve duong dan .enc neu .onnx khong ton tai ma .enc ton tai."""
    p = Path(path)
    if p.exists():
        return p
    enc = p.with_suffix(".enc")
    return enc if enc.exists() else p


def read_model_bytes(path) -> Optional[bytes]:
    """Neu path la .enc -> kiem tra anti-debug + manifest + giai ma tra bytes ONNX."""
    p = Path(path)
    if p.suffix != ".enc":
        return None
    _anti_debug_and_hook_check()
    try:
        from core.integrity import verify_file_in_manifest
        verify_file_in_manifest(p)
    except ImportError:
        pass
    key = _get_key()
    if key is None or len(key) != 32:
        raise RuntimeError("Thieu khoa giai ma model (license.lic / AI_MODEL_KEY_HEX / AI_MODEL_KEY_FILE)")
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    blob = p.read_bytes()
    nonce, ct = blob[:12], blob[12:]
    try:
        return AESGCM(key).decrypt(nonce, ct, (p.stem + ".onnx").encode())
    finally:
        _wipe_bytes(key)


def create_secure_session(model_path: Path, sess_options, providers: List[str]):
    """Nap InferenceSession va xoa ngay plaintext ONNX khoi Python Heap sau khi khoi tao."""
    import onnxruntime as ort
    raw = read_model_bytes(model_path)
    if raw is None:
        return ort.InferenceSession(str(model_path), sess_options=sess_options, providers=providers)
    try:
        return ort.InferenceSession(raw, sess_options=sess_options, providers=providers)
    finally:
        _wipe_bytes(raw)
        del raw
