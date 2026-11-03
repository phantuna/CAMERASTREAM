# -*- coding: utf-8 -*-
"""Lop 5: kiem tra toan ven ban giao bang manifest ky Ed25519.

manifest.json = {"payload": {"version":1, "files": {"rel/path": "<sha256>"}}, "signature": "<b64>"}
- Khi chay ban BIEN DICH (Nuitka) hoac AI_REQUIRE_INTEGRITY=1: BAT BUOC co manifest hop le.
- Ban dev (chay .py) bo qua de khong can build.
Phat hien: file bi sua, bi xoa, hoac file thuc thi la (.dll/.pyd/.exe/.py/.so) khong co trong manifest.
"""
import base64
import hashlib
import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Optional
DOMAIN = b"HP-MANIFEST-v1|"
EXCLUDE_DIRS = {"license", "events", "config", "logs", "__pycache__", "snapshots"}
EXCLUDE_FILES = {"manifest.json"}
EXEC_SUFFIX = {".dll", ".pyd", ".exe", ".py", ".so"}
CRITICAL_SUFFIX = {".exe", ".enc", ".pyd"}


class IntegrityError(Exception):
    pass


def _is_compiled() -> bool:
    return "__compiled__" in globals()


def app_root() -> Path:
    return Path(sys.argv[0]).resolve().parent


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def list_files(root: Path):
    for p in root.rglob("*"):
        if not p.is_file() or p.name in EXCLUDE_FILES:
            continue
        rel = p.relative_to(root)
        if rel.parts[0] in EXCLUDE_DIRS or "__pycache__" in rel.parts:
            continue
        yield rel.as_posix(), p


def _signed_bytes(payload: dict) -> bytes:
    return DOMAIN + json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def _public_key() -> bytes:
    from core.license_manager import _load_public_key
    return _load_public_key()


def verify_manifest(root: Optional[Path] = None, critical_only: bool = False) -> None:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    root = Path(root) if root else app_root()
    mf = root / "manifest.json"
    if not mf.exists():
        raise IntegrityError("Thieu manifest.json")
    try:
        doc = json.loads(mf.read_text(encoding="utf-8"))
        payload, sig = doc["payload"], base64.b64decode(doc["signature"])
        files = payload["files"]
    except Exception:
        raise IntegrityError("manifest.json hong")
    try:
        Ed25519PublicKey.from_public_bytes(_public_key()).verify(sig, _signed_bytes(payload))
    except InvalidSignature:
        raise IntegrityError("Chu ky manifest khong hop le")

    for rel, expected in files.items():
        if critical_only and Path(rel).suffix.lower() not in CRITICAL_SUFFIX:
            continue
        p = root / rel
        if not p.exists():
            raise IntegrityError(f"Thieu file: {rel}")
        if sha256_file(p) != expected:
            raise IntegrityError(f"File bi thay doi: {rel}")

    known = set(files)
    for rel, p in list_files(root):
        if rel not in known and p.suffix.lower() in EXEC_SUFFIX:
            raise IntegrityError(f"File thuc thi la khong co trong manifest: {rel}")


def verify_file_in_manifest(target_file: Path, root: Optional[Path] = None) -> None:
    """Kiem tra doc lap 1 file (vd model .enc) voi manifest.json da ky Ed25519 (chong va main.py)."""
    if not (_is_compiled() or os.getenv("AI_REQUIRE_INTEGRITY") == "1"):
        return
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    root = Path(root) if root else app_root()
    mf = root / "manifest.json"
    if not mf.exists():
        raise IntegrityError("Thieu manifest.json khi nap model")
    doc = json.loads(mf.read_text(encoding="utf-8"))
    payload, sig = doc["payload"], base64.b64decode(doc["signature"])
    try:
        Ed25519PublicKey.from_public_bytes(_public_key()).verify(sig, _signed_bytes(payload))
    except InvalidSignature:
        raise IntegrityError("Chu ky manifest khong hop le khi nap model")
    try:
        rel = Path(target_file).resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return
    expected = payload.get("files", {}).get(rel)
    if not expected or sha256_file(Path(target_file)) != expected:
        raise IntegrityError(f"Model bi thay doi hoac khong khop manifest: {rel}")



def enforce_integrity(root: Optional[Path] = None, periodic_seconds: int = 3600) -> None:
    """Goi 1 lan luc khoi dong. That bai -> thoat tien trinh."""
    if not (_is_compiled() or os.getenv("AI_REQUIRE_INTEGRITY") == "1"):
        return  # ban dev
    try:
        verify_manifest(root)
    except Exception as e:
        print(f"[INTEGRITY] That bai: {e}", file=sys.stderr, flush=True)
        os._exit(3)

    def _loop():
        while True:
            time.sleep(periodic_seconds)
            try:
                verify_manifest(root, critical_only=True)
            except Exception as e:
                print(f"[INTEGRITY] That bai (dinh ky): {e}", file=sys.stderr, flush=True)
                os._exit(3)

    threading.Thread(target=_loop, daemon=True).start()

