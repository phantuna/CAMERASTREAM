#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
AI ALPR SERVICE - BÃI XE THÔNG MINH VIỆT NAM (DOCKER & LOCAL ENTRYPOINT)
========================================================================
Quản lý tập trung toàn bộ tiến trình:
1. Tự động kết nối tất cả luồng Camera trong hệ thống từ Spring Boot API.
2. Nạp AI dùng chung (YOLOX-S + Deskew + ONNX LPR - thuần ONNX Runtime).
3. Phát SSE Metadata bám biển số & mở REST API /api/detections.
4. Gửi Webhook tự động đến Spring Boot mỗi khi có xe qua cổng.
"""

import os
import sys
from pathlib import Path

# Thiết lập đường dẫn gốc cho toàn bộ module AI
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Tạo yêu cầu kích hoạt (mã máy + public key TPM) cho công ty cấp license, rồi thoát
if "--activation-request" in sys.argv:
    from core.activation import run as _activation_run
    _i = sys.argv.index("--activation-request")
    sys.exit(_activation_run(sys.argv[_i + 1] if len(sys.argv) > _i + 1 else "activation-request.json"))

# Lớp 5: bản biên dịch bắt buộc có manifest hợp lệ (bản dev .py bỏ qua)
from core.integrity import enforce_integrity
enforce_integrity()

try:
    from core.camera_stream_bridge import main
except ImportError:
    from camera_stream_bridge import main

if __name__ == "__main__":
    main()
