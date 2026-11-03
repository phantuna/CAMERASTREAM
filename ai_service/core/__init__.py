# -*- coding: utf-8 -*-

"""
AI SERVICE CORE MODULES
=======================
- camera_stream_bridge: Cầu nối RTSP MediaMTX, Spring Boot API, SSE & Webhook
- video_alpr_processor: Kịch bản video ALPR, Virtual ROI, Multi-lane, Cooldown
- plate_detector_deskew: Phát hiện vị trí biển số (plate_det.onnx) & Deskew
- onnx_lpr_engine: SdkInfer Thuần ONNX LPR Engine (Line Detector + PP-OCRv6 CTC)

100% thuần ONNX Runtime — VietOCR đã bị loại bỏ.
"""

from .plate_detector_deskew import OnnxPlateDetector, YOLOXPlateDetector, FullALPRPipeline
from .onnx_lpr_engine import OnnxLprEngine, OnnxLineDetector, OnnxPlateRecognizer

__all__ = [
    "OnnxPlateDetector",
    "YOLOXPlateDetector",
    "FullALPRPipeline",
    "OnnxLprEngine",
    "OnnxLineDetector",
    "OnnxPlateRecognizer",
]
