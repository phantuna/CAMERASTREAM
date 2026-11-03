# -*- coding: utf-8 -*-
"""Tao activation-request.json tren MAY KHACH (chay 1 lan, tu dong chon TPM 2.0 hoac DPAPI+Hardware).

  ai_service.exe --activation-request [duong_dan.json]

- Neu may co TPM 2.0: tao khoa trong chip TPM ('bindingMode': 'tpm-v1').
- Neu may KHONG co TPM 2.0: tu dong chuyen sang DPAPI + Da phan cung ('bindingMode': 'dpapi-hw-v1').
Chay lai se cho ket qua GIONG HET (khong tao khoa moi).
"""
import base64
import json
import sys
from pathlib import Path


def run(out_path: str = "activation-request.json") -> int:
    from core.license_manager import hardware_code, hw_entropy, machine_fingerprint
    from core import tpm_vault
    try:
        mode, pub_der = tpm_vault.ensure_key_auto(hw_entropy())
        req = {
            "product": "CameraStream",
            "bindingMode": mode,
            "machineCode": hardware_code(),
            "machineFingerprint": machine_fingerprint(),
            "tpmPublicKey": base64.b64encode(pub_der).decode(),
        }
    except Exception as e:
        print(f"[LOI] Khong tao duoc yeu cau kich hoat: {e}", file=sys.stderr)
        return 2
    Path(out_path).write_text(json.dumps(req, indent=2), encoding="utf-8")
    print(f"[OK] Da tao {out_path} (che do: {req['bindingMode']}, ma may: {req['machineCode']}).")
    return 0
