#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CẦU NỐI TÍCH HỢP AI BIỂN SỐ VỚI HỆ THỐNG CAMERA WEB STREAM (CAMERA STREAM BRIDGE)
===============================================================================
Kết nối trực tiếp giữa:
1. [AI Engine] MODLE_LICIENSEPLATE (YOLOX-S + Deskew + ONNX LPR - thuần ONNX)
2. [Media Server] MediaMTX (RTSP Stream: rtsp://localhost:8554/<streamPath>)
3. [Backend Server] CameraStream (Spring Boot API: http://localhost:8080)
4. [Frontend UI] CameraStream-FE (React + WebSocket: /topic/cameras/events)

QUY TRÌNH HOẠT ĐỘNG:
- Bước 1: Lấy thông tin luồng Camera từ CameraStream Backend (GET /api/cameras).
- Bước 2: Bắt luồng RTSP từ MediaMTX hoặc Snapshot từ Camera qua OpenCV.
- Bước 3: Áp dụng Kịch bản Video ALPR (Khung ảo Virtual ROI, Frame-Skip, Cooldown).
- Bước 4: Khi phát hiện biển số hợp lệ: Tự động gửi Webhook POST tới:
          http://localhost:8080/api/cameras/{id}/detections
- Bước 5: Spring Boot phát WebSocket -> Bảng 'VehicleAccessPanel' trên Web hiển thị xe theo thời gian thực!
"""

import os
import sys
import time
import json
import base64
import hashlib
import struct
import socket
import random
import itertools
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Optional, Dict, Any, List, Tuple, Set
import urllib.request
import urllib.error

import cv2
import numpy as np

# Định vị thư mục
CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent if CURRENT_DIR.name in ("core", "Camera_connect") else CURRENT_DIR
BASE_DIR = AI_SERVICE_DIR

for p in (AI_SERVICE_DIR, CURRENT_DIR, AI_SERVICE_DIR / "core", AI_SERVICE_DIR / "Camera_connect", AI_SERVICE_DIR / "utils"):
    if p.exists() and str(p) not in sys.path:
        sys.path.insert(0, str(p))

if TYPE_CHECKING:
    from core.video_alpr_processor import VideoALPRProcessor, generate_mock_traffic_video
    from core.plate_detector_deskew import YOLOXPlateDetector
    from core.onnx_lpr_engine import OnnxLprEngine, OnnxObjectDetector
else:
    try:
        from core.video_alpr_processor import VideoALPRProcessor, generate_mock_traffic_video
    except ImportError:
        try:
            from video_alpr_processor import VideoALPRProcessor, generate_mock_traffic_video  # type: ignore
        except ImportError:
            from Camera_connect.video_alpr_processor import VideoALPRProcessor, generate_mock_traffic_video  # type: ignore

    try:
        from core.plate_detector_deskew import YOLOXPlateDetector
        from core.onnx_lpr_engine import OnnxLprEngine, OnnxObjectDetector
    except ImportError:
        try:
            from plate_detector_deskew import YOLOXPlateDetector  # type: ignore
            from onnx_lpr_engine import OnnxLprEngine, OnnxObjectDetector  # type: ignore
        except ImportError:
            YOLOXPlateDetector = None  # type: ignore
            OnnxLprEngine = None  # type: ignore
            OnnxObjectDetector = None  # type: ignore

DEFAULT_BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080")
DEFAULT_MEDIAMTX_RTSP = os.getenv("MEDIAMTX_RTSP_URL", "rtsp://localhost:8554")
DEFAULT_WEB_PORT = int(os.getenv("WEB_PORT", "5000"))

import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ép buộc OpenCV FFMPEG sử dụng giao thức TCP, không buffer và low_delay để triệt tiêu hoàn toàn độ trễ (<0.1s)
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;0|framedrop;1"
)


def get_mediamtx_api_host() -> str:
    """Xác định URL REST API của MediaMTX (cổng 9997) phù hợp với môi trường Docker hoặc Local."""
    env_api = os.getenv("MEDIAMTX_API_URL")
    if env_api:
        return env_api.rstrip("/")
    rtsp_url = os.getenv("MEDIAMTX_RTSP_URL", "rtsp://localhost:8554")
    try:
        from urllib.parse import urlparse
        parsed = urlparse(rtsp_url)
        host = parsed.hostname or "localhost"
        return f"http://{host}:9997"
    except Exception:
        return "http://localhost:9997"


def ensure_mediamtx_running() -> bool:
    """Kiểm tra và tự động khởi động MediaMTX Server nếu chưa chạy."""
    mediamtx_api = get_mediamtx_api_host()
    try:
        req = urllib.request.Request(f"{mediamtx_api}/v3/paths/list", headers={"User-Agent": "ALPR/1.0"})
        with urllib.request.urlopen(req, timeout=1.5):
            return True
    except Exception:
        pass

    # Nếu đang trong môi trường Docker, không khởi chạy file .exe của Windows
    if os.path.exists("/.dockerenv") or os.environ.get("DOTNET_RUNNING_IN_CONTAINER"):
        return False

    mediamtx_candidates = [
        CURRENT_DIR.parents[2] / "CAMERA_WEB_STREAM" / "mediamtx" / "mediamtx.exe",
        CURRENT_DIR.parents[1] / "CAMERA_WEB_STREAM" / "mediamtx" / "mediamtx.exe",
        Path("D:/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/mediamtx/mediamtx.exe"),
    ]

    target_exe = next((p for p in mediamtx_candidates if p.exists() and p.is_file()), None)
    if target_exe:
        print(f"[MEDIAMTX] Đang tự động kích hoạt MediaMTX Server từ: {target_exe}...")
        import subprocess
        try:
            subprocess.Popen(
                [str(target_exe)],
                cwd=str(target_exe.parent),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
            )
            time.sleep(1.8)
            print("✅ MediaMTX Server đã khởi động thành công (RTSP: 8554 | WebRTC: 8889)!")
            return True
        except Exception as e:
            print(f"⚠️ Không thể khởi động MediaMTX: {e}")
    return False


def register_stream_in_mediamtx(stream_path: str, rtsp_source_url: str) -> bool:
    """Đăng ký luồng IP Camera vào MediaMTX với TCP transport để MediaMTX xử lý mượt mà."""
    mediamtx_api = get_mediamtx_api_host()
    payload = json.dumps({
        "source": rtsp_source_url,
        "rtspTransport": "tcp",
        "sourceOnDemand": False
    }).encode("utf-8")

    # Thử thêm mới POST /v3/config/paths/add/{name}
    url_add = f"{mediamtx_api}/v3/config/paths/add/{stream_path}"
    req = urllib.request.Request(url_add, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status in (200, 201):
                print(f"✅ Đã đăng ký luồng '{stream_path}' vào MediaMTX (TCP Transport)!")
                return True
    except urllib.error.HTTPError as e:
        if e.code == 400:
            url_patch = f"{mediamtx_api}/v3/config/paths/patch/{stream_path}"
            req_patch = urllib.request.Request(url_patch, data=payload, headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req_patch, timeout=3) as r:
                    if r.status in (200, 201):
                        print(f"✅ Đã cập nhật luồng '{stream_path}' trong MediaMTX!")
                        return True
            except Exception:
                pass
    except Exception as e:
        print(f"[THÔNG BÁO] MediaMTX đăng ký luồng: {e}")
    return False


import queue
from socketserver import ThreadingMixIn

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        """Bỏ qua thông báo lỗi khi trình duyệt đóng tab hoặc làm mới trang (WinError 10053, BrokenPipe)."""
        exc_type, _, _ = sys.exc_info()
        if exc_type in (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        super().handle_error(request, client_address)

# Quản lý các kết nối SSE từ Frontend React
SSE_SUBSCRIBERS = set()
SSE_LOCK = threading.Lock()
# Giữ toạ độ bám RẼNH theo từng camera (dict cameraId -> payload) để nhiều camera
# chạy song song không ghi đè lên nhau. Giá trị gộp (mọi camera) luôn cập nhật.
LATEST_TRACKING_DATA: Dict[str, Any] = {"tracks": [], "frameWidth": 1920, "frameHeight": 1080}
LATEST_TRACKING_BY_CAMERA: Dict[str, Any] = {}
TRACKING_DATA_LOCK = threading.Lock()

# Quản lý đối tượng camera worker toàn cục để phục vụ snapshot API tức thời
GLOBAL_CAMERA_WORKERS: Dict[int, Any] = {}

# Quản lý lịch sử các lượt xe nhận diện thực tế (cung cấp REST API cho Frontend)
RECENT_DETECTIONS_LOGS: List[Dict[str, Any]] = []
DETECTIONS_LOCK = threading.Lock()
DETECTIONS_CACHE_FILE = BASE_DIR / "events" / "recent_detections.json"

# ============================================================
# LƯU ẢNH SNAPSHOT RA FILE (thay vì nhét base64 vào DB)
# ============================================================
# Ảnh được ghi ra đĩa và tham chiếu bằng URL, thay vì lưu chuỗi base64 trong
# Postgres. Lý do: base64 của 1 ảnh ~30KB, 100k ảnh sẽ phình DB lên vài GB và
# làm chậm mọi query đọc `system_events`.
#
# SNAPSHOT_STORAGE_PATH phải trỏ CÙNG một thư mục với Spring Boot
# (xem `snapshot.storage.path` trong application.properties). Khi tách 2 service
# ra 2 máy, thư mục này phải là shared volume.
#
# Quyền sở hữu retention thuộc về Spring Boot — AI service KHÔNG tự xóa file.
#
# Mặc định trỏ vào <repo>/data/snapshots — CÙNG thư mục với `snapshot.storage.path`
# của Spring Boot. Nếu chạy 2 service trên 2 máy khác nhau, đặt biến môi
# trường SNAPSHOT_STORAGE_PATH trỏ tới shared volume cho cả hai.
_DEFAULT_SNAPSHOT_DIR = AI_SERVICE_DIR.parent / "data" / "snapshots"
SNAPSHOT_DIR = Path(os.getenv("SNAPSHOT_STORAGE_PATH", str(_DEFAULT_SNAPSHOT_DIR)))

# Tiền tố tên file, dùng để tránh trùng khi nhiều camera ghi cùng lúc
_SNAPSHOT_SEQ = itertools.count(1)


def save_snapshot(b64_data: str, prefix: str = "anpr") -> Optional[str]:
    """Giải mã ảnh base64 -> ghi file JPEG -> trả về TÊN FILE (không phải base64).

    Trả None nếu dữ liệu không hợp lệ hoặc ghi file thất bại, để caller có thể
    tiếp tục mà không làm sập luồng nhận diện.
    """
    if not b64_data:
        return None
    try:
        # Chỉ nhận data URL đầy đủ, bỏ tiền tố "data:image/jpeg;base64,"
        payload = b64_data.split(",", 1)[-1] if b64_data.startswith("data:") else b64_data
        raw = base64.b64decode(payload, validate=False)
        if not raw:
            return None
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return None
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        # Tên file: <prefix>_<camera>_<timestamp>_<seq>.jpg — seq chống trùng
        name = f"{prefix}_{int(time.time() * 1000)}_{next(_SNAPSHOT_SEQ):04d}.jpg"
        cv2.imwrite(str(SNAPSHOT_DIR / name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        return name
    except Exception as e:
        print(f"  ⚠️ [SNAPSHOT] Không lưu được ảnh ({prefix}): {e}")
        return None

def load_cached_detections():
    global RECENT_DETECTIONS_LOGS
    try:
        if DETECTIONS_CACHE_FILE.exists():
            with open(DETECTIONS_CACHE_FILE, "r", encoding="utf-8") as f:
                RECENT_DETECTIONS_LOGS = json.load(f)
                print(f"[CACHE] Đã nạp {len(RECENT_DETECTIONS_LOGS)} bản ghi lịch sử nhận diện xe từ trước.")
    except Exception:
        RECENT_DETECTIONS_LOGS = []

_LAST_CACHE_SAVE = 0.0

def _flush_cache_to_disk_throttled():
    """Ghi cache lịch sử ra đĩa có điều tiết (tối đa 1 lần / 5 giây) để bảo vệ SSD/RAM khi xe vào liên tục."""
    global _LAST_CACHE_SAVE
    now = time.time()
    if now - _LAST_CACHE_SAVE < 5.0:
        return
    _LAST_CACHE_SAVE = now
    try:
        with DETECTIONS_LOCK:
            data = list(RECENT_DETECTIONS_LOGS)
        DETECTIONS_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(DETECTIONS_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def record_detection_event(detection_data: Dict[str, Any], cooldown_sec: float = 15.0) -> bool:
    global RECENT_DETECTIONS_LOGS
    with DETECTIONS_LOCK:
        new_plate = detection_data.get("plateNumber", "")
        new_cam_id = detection_data.get("cameraId")
        now_ts = time.time()

        # Chống spam bản ghi: Chỉ chặn nếu CÙNG cameraId, CÙNG biển số và được ghi nhận trong vòng `cooldown_sec` (15s).
        # Hai biển số khác nhau xuất hiện liên tiếp trong thời gian ngắn trên cùng camera luôn được chấp nhận 100%!
        if RECENT_DETECTIONS_LOGS and new_plate:
            try:
                from core.video_alpr_processor import are_similar_plates
            except ImportError:
                from video_alpr_processor import are_similar_plates  # type: ignore

            for recent in RECENT_DETECTIONS_LOGS[:15]:
                if new_cam_id is not None and recent.get("cameraId") is not None and recent.get("cameraId") != new_cam_id:
                    continue
                if are_similar_plates(new_plate, recent.get("plateNumber", "")):
                    rec_time_str = recent.get("detectedAt")
                    if rec_time_str:
                        try:
                            rec_dt = datetime.fromisoformat(rec_time_str)
                            if (now_ts - rec_dt.timestamp()) < cooldown_sec:
                                # Xe vẫn đang đứng tại chỗ trong vùng đón xe
                                return False
                        except Exception:
                            return False
                    else:
                        return False

        RECENT_DETECTIONS_LOGS.insert(0, detection_data)
        if len(RECENT_DETECTIONS_LOGS) > 50:
            RECENT_DETECTIONS_LOGS = RECENT_DETECTIONS_LOGS[:50]

    threading.Thread(target=_flush_cache_to_disk_throttled, daemon=True).start()
    return True

load_cached_detections()

# =============================================================================
# QUẢN LÝ CẤU HÌNH KHUNG ẢO (VIRTUAL ROI) CHO TỪNG CAMERA HOẶC TOÀN BỘ HỆ THỐNG
# =============================================================================
ROI_CONFIG_FILE = BASE_DIR / "config" / "roi_config.json"
ROI_CONFIG_LOCK = threading.Lock()
ACTIVE_PROCESSORS: Dict[int, Any] = {}
PROCESSORS_LOCK = threading.Lock()

DEFAULT_ROI = [
    [0.15, 0.45],  # Điểm trên - trái
    [0.85, 0.45],  # Điểm trên - phải
    [0.95, 0.95],  # Điểm dưới - phải
    [0.05, 0.95]   # Điểm dưới - trái
]

def load_roi_configs() -> Dict[str, Any]:
    """Nạp cấu hình ROI từ file JSON."""
    with ROI_CONFIG_LOCK:
        try:
            if ROI_CONFIG_FILE.exists():
                with open(ROI_CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "default" in data:
                        return data
        except Exception as e:
            print(f"[ROI] Lỗi khi nạp file roi_config.json: {e}")
        return {"default": DEFAULT_ROI, "cameras": {}}

def get_roi_for_camera(camera_id: int) -> List[Tuple[float, float]]:
    """Lấy toạ độ khung ảo theo camera cụ thể hoặc dùng cấu hình chung mặc định."""
    cfg = load_roi_configs()
    cam_str = str(camera_id)
    if "cameras" in cfg and cam_str in cfg["cameras"]:
        return [tuple(pt) for pt in cfg["cameras"][cam_str]]
    return [tuple(pt) for pt in cfg.get("default", DEFAULT_ROI)]

def get_tripwire_for_camera(camera_id: int) -> Optional[List[Tuple[float, float]]]:
    """Lấy vạch ảo Tripwire (2 điểm chuẩn hóa) của camera; None nếu chưa cấu hình (chốt event theo ROI như cũ)."""
    cfg = load_roi_configs()
    tw = cfg.get("tripwires", {})
    line = tw.get(str(camera_id)) or tw.get("default")
    if line and len(line) == 2:
        return [tuple(p) for p in line]
    return None

def get_lanes_for_camera(camera_id: int) -> List[Dict[str, Any]]:
    """Lấy danh sách các làn (Multi-lane) của camera; trả về [] nếu không có (dùng ROI đơn như cũ)."""
    cfg = load_roi_configs()
    lanes_dict = cfg.get("lanes", {})
    cam_lanes = lanes_dict.get(str(camera_id)) or lanes_dict.get("default", [])
    if isinstance(cam_lanes, list) and len(cam_lanes) > 0:
        result = []
        for idx, l in enumerate(cam_lanes):
            if isinstance(l, dict) and "roi" in l and len(l["roi"]) >= 3:
                result.append({
                    "id": str(l.get("id", f"lane-{idx+1}")),
                    "name": str(l.get("name", f"Làn {idx+1}")),
                    "roi": [tuple(pt) for pt in l["roi"]]
                })
        return result
    return []


def update_roi_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Cập nhật cấu hình ROI / Tripwire / Multi-lane và HOT-RELOAD tức thì vào luồng xử lý không cần restart:
    - payload: {"cameraId": 39, "applyAll": True/False,
                "roi": [[x, y], ...],            # tùy chọn
                "tripwire": [[x1, y1], [x2, y2]], # tùy chọn; [] hoặc null = gỡ vạch
                "lanes": [{"id": "lane-1", "name": "Làn 1", "roi": [...]}, ...]} # tùy chọn Multi-lane
    """
    new_roi = payload.get("roi")
    has_tripwire_key = "tripwire" in payload
    has_lanes_key = "lanes" in payload
    raw_lanes = payload.get("lanes") if has_lanes_key else None

    if not new_roi and not has_tripwire_key and not has_lanes_key:
        raise ValueError("Payload phải có ít nhất 'roi', 'tripwire' hoặc 'lanes'")
    if new_roi and len(new_roi) < 3:
        raise ValueError("ROI phải có ít nhất 3 toạ độ [x, y] chuẩn hóa (từ 0.0 đến 1.0)")

    def _clean(points):
        return [[max(0.0, min(1.0, float(p[0]))), max(0.0, min(1.0, float(p[1])))] for p in points]

    cleaned_roi = _clean(new_roi) if new_roi else None

    raw_tw = payload.get("tripwire") if has_tripwire_key else None
    if has_tripwire_key and raw_tw:
        if len(raw_tw) != 2:
            raise ValueError("Tripwire phải có đúng 2 toạ độ [x, y] chuẩn hóa")
        cleaned_tw: Optional[List[List[float]]] = _clean(raw_tw)
    else:
        cleaned_tw = None  # gỡ vạch

    cleaned_lanes: Optional[List[Dict[str, Any]]] = None
    if has_lanes_key:
        if raw_lanes and isinstance(raw_lanes, list):
            cleaned_lanes = []
            for idx, l in enumerate(raw_lanes):
                if isinstance(l, dict) and "roi" in l and len(l["roi"]) >= 3:
                    cleaned_lanes.append({
                        "id": str(l.get("id", f"lane-{idx+1}")),
                        "name": str(l.get("name", f"Làn {idx+1}")),
                        "roi": _clean(l["roi"])
                    })
        else:
            cleaned_lanes = None

    apply_all = bool(payload.get("applyAll", False))
    camera_id = payload.get("cameraId")
    is_global = apply_all or camera_id is None or str(camera_id).lower() in ("all", "default", "none")

    cfg = load_roi_configs()
    with ROI_CONFIG_LOCK:
        cfg.setdefault("cameras", {})
        cfg.setdefault("tripwires", {})
        cfg.setdefault("lanes", {})
        key = "default" if is_global else str(camera_id)
        if cleaned_roi is not None:
            if is_global:
                cfg["default"] = cleaned_roi
            else:
                cfg["cameras"][key] = cleaned_roi
        if has_tripwire_key:
            if cleaned_tw is None:
                cfg["tripwires"].pop(key, None)
            else:
                cfg["tripwires"][key] = cleaned_tw
        if has_lanes_key:
            if cleaned_lanes is None:
                cfg["lanes"].pop(key, None)
            else:
                cfg["lanes"][key] = cleaned_lanes

        try:
            ROI_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(ROI_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[ROI] Lỗi khi lưu file roi_config.json: {e}")

    # CẬP NHẬT TỨC THÌ (HOT-RELOAD) CHO CÁC LUỒNG CAMERA ĐANG CHẠY MÀ KHÔNG CẦN RESTART!
    def _apply(cid: int, proc: Any):
        if cleaned_roi is not None:
            proc.roi_normalized = [tuple(p) for p in cleaned_roi]
        if has_tripwire_key:
            proc.tripwire_normalized = [tuple(p) for p in cleaned_tw] if cleaned_tw else None
            for trk in proc.tracked_plates.values():
                trk.crossed = False
                trk.prev_center = None
        if has_lanes_key:
            proc.lanes = [
                {
                    "id": l["id"],
                    "name": l["name"],
                    "roi": [tuple(p) for p in l["roi"]]
                } for l in cleaned_lanes
            ] if cleaned_lanes else []
        print(f"  ⚡ [HOT-RELOAD] Đã cập nhật cấu hình khung ảo/vạch/làn cho Camera #{cid}!")

    with PROCESSORS_LOCK:
        if is_global:
            for cid, proc in ACTIVE_PROCESSORS.items():
                _apply(cid, proc)
        else:
            try:
                cid = int(camera_id)
                if cid in ACTIVE_PROCESSORS:
                    _apply(cid, ACTIVE_PROCESSORS[cid])
            except Exception:
                pass

    return cfg


class WebSocketClient:
    """Quản lý phiên kết nối WebSocket RFC 6455 độc lập cho từng client (Viewport Subscription Hub)."""
    def __init__(self, sock, client_address):
        self.sock = sock
        self.client_address = client_address
        self.subscribed_cam_ids: Set[int] = set()
        self.authenticated: bool = True
        self.lock = threading.Lock()
        self.is_closed = False

    def send_text(self, text: str) -> bool:
        if self.is_closed:
            return False
        with self.lock:
            try:
                frame = make_ws_text_frame(text)
                self.sock.sendall(frame)
                return True
            except Exception:
                self.is_closed = True
                return False

    def close(self, code: int = 1000):
        if self.is_closed:
            return
        self.is_closed = True
        self.subscribed_cam_ids.clear()
        with self.lock:
            try:
                close_frame = bytes([0x88, 0x02]) + struct.pack("!H", code)
                self.sock.sendall(close_frame)
            except Exception:
                pass
            try:
                self.sock.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                self.sock.close()
            except Exception:
                pass


WS_CLIENTS_LOCK = threading.Lock()
WS_CLIENTS: Set[WebSocketClient] = set()


def is_camera_subscribed(camera_id: Any) -> bool:
    """Kiểm tra camera có client WebSocket nào đang subscribe hoặc có SSE client không."""
    with SSE_LOCK:
        if len(SSE_SUBSCRIBERS) > 0:
            return True
    with WS_CLIENTS_LOCK:
        if not WS_CLIENTS:
            return False
        s_id = str(camera_id)
        try:
            i_id = int(camera_id)
        except (ValueError, TypeError):
            i_id = None
        for client in WS_CLIENTS:
            if client.is_closed:
                continue
            if not client.subscribed_cam_ids:
                return True
            if s_id in client.subscribed_cam_ids or (i_id is not None and i_id in client.subscribed_cam_ids):
                return True
    return False


def make_ws_text_frame(txt: str) -> bytes:
    """Tạo frame WebSocket Text RFC 6455 chuẩn (server-to-client không mask)."""
    payload = txt.encode("utf-8")
    length = len(payload)
    if length <= 125:
        header = bytes([0x81, length])
    elif length <= 65535:
        header = struct.pack("!BBH", 0x81, 126, length)
    else:
        header = struct.pack("!BBQ", 0x81, 127, length)
    return header + payload


def broadcast_tracking_events(data: dict):
    """Phát broadcast toạ độ bám biển số JSON tới WebSocket Hub (Viewport Subscription) và fallback SSE.
    Dữ liệu được lọc thông minh: Client chỉ nhận toạ độ các camera họ đang subscribe trên lưới."""
    global LATEST_TRACKING_DATA
    cam_key = str(data.get("cameraId", "0"))
    cam_id_num = None
    cid_raw = data.get("cameraId")
    if cid_raw is not None:
        try:
            cam_id_num = int(cid_raw)
        except (TypeError, ValueError):
            pass

    with TRACKING_DATA_LOCK:
        LATEST_TRACKING_BY_CAMERA[cam_key] = data
        merged_tracks = []
        for k, v in LATEST_TRACKING_BY_CAMERA.items():
            for t in v.get("tracks", []):
                item = dict(t)
                item.setdefault("cameraId", k)
                merged_tracks.append(item)
        LATEST_TRACKING_DATA = {
            "cameraId": data.get("cameraId"),
            "cameraName": data.get("cameraName"),
            "frameWidth": data.get("frameWidth", 1920),
            "frameHeight": data.get("frameHeight", 1080),
            "fps": data.get("fps", 0),
            "activeInRoi": data.get("activeInRoi", False),
            "roi": data.get("roi"),
            "tripwire": data.get("tripwire"),
            "lanes": data.get("lanes", []),
            "tracks": merged_tracks,
            "cameras": dict(LATEST_TRACKING_BY_CAMERA),
        }

    # 1. PHÁT QUA WEBSOCKET HUB (Định tuyến thông minh theo Viewport Subscription của từng client)
    ws_payload = dict(data)
    ws_payload["cameras"] = dict(LATEST_TRACKING_BY_CAMERA)
    msg_ws = json.dumps(ws_payload, default=str)
    with WS_CLIENTS_LOCK:
        active_ws = list(WS_CLIENTS)
    dead_ws = []
    for client in active_ws:
        # Nếu client chưa subscribe (mặc định nhận tất cả) hoặc camera này nằm trong danh sách đang xem
        if not client.subscribed_cam_ids or (cam_id_num is not None and cam_id_num in client.subscribed_cam_ids) or cam_key in client.subscribed_cam_ids:
            ok = client.send_text(msg_ws)
            if not ok:
                dead_ws.append(client)
    if dead_ws:
        with WS_CLIENTS_LOCK:
            for d in dead_ws:
                WS_CLIENTS.discard(d)

    # 2. PHÁT QUA SSE (FALLBACK TƯƠNG THÍCH NGƯỢC)
    msg_sse = json.dumps(LATEST_TRACKING_DATA, default=str)
    payload = f"data: {msg_sse}\n\n".encode("utf-8")
    with SSE_LOCK:
        subscribers = list(SSE_SUBSCRIBERS)
    for q in subscribers:
        try:
            q.put_nowait(payload)
        except queue.Full:
            try:
                q.get_nowait()
                q.put_nowait(payload)
            except Exception:
                pass


class SSEStreamHandler(BaseHTTPRequestHandler):
    """Máy chủ phát Server-Sent Events (SSE) và WebSocket Hub toạ độ bám realtime & REST API."""
    protocol_version = "HTTP/1.1"

    def send_json_response(self, code: int, data: dict):
        """Gửi JSON response kèm Content-Length chuẩn để Nginx reverse proxy không bị treo / timeout."""
        res_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(res_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(res_bytes)
        try:
            self.wfile.flush()
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/detections"):
            # REST API trả về toàn bộ lịch sử các xe AI nhận diện thật
            with DETECTIONS_LOCK:
                data_copy = list(RECENT_DETECTIONS_LOGS)
            self.send_json_response(200, {
                "code": 200,
                "message": "SUCCESS",
                "data": data_copy
            })

        elif self.path.startswith("/snapshots/"):
            # Phục vụ ảnh snapshot đã lưu ra file. Đây là nguồn DỰ PHÒNG —
            # nguồn chính là Spring Boot (:8080/snapshots/{name}).
            # Dùng `Path(...).name` để chặn path traversal (../).
            name = Path(self.path[len("/snapshots/"):].split("?")[0]).name
            f = SNAPSHOT_DIR / name
            if not f.is_file():
                # Fallback tìm trong video_logs nếu ảnh cũ được lưu ở đó
                f_alt = BASE_DIR / "events" / "video_logs" / name
                if f_alt.is_file():
                    f = f_alt
            if f.is_file():
                body = f.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "*")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(body)
                try:
                    self.wfile.flush()
                except Exception:
                    pass
            else:
                self.send_json_response(404, {"code": 404, "message": "NOT_FOUND"})

        elif self.path.startswith("/api/roi-config"):
            # REST API trả về cấu hình ROI hiện tại cho các camera
            cfg = load_roi_configs()
            self.send_json_response(200, {
                "code": 200,
                "message": "SUCCESS",
                "data": cfg
            })

        elif self.path.startswith("/api/cameras/") and "/snapshot" in self.path:
            # REST API cung cấp snapshot trực tiếp (live frame) hoặc ảnh hiện trường gần nhất để căn chỉnh ROI
            # Hỗ trợ format: /api/cameras/{cam_id}/snapshot
            try:
                parts = self.path.split("/")
                cam_id = int(parts[3])
            except Exception:
                cam_id = None

            frame_bytes = None
            if cam_id is not None and cam_id in GLOBAL_CAMERA_WORKERS:
                worker_data = GLOBAL_CAMERA_WORKERS[cam_id]
                reader = worker_data[1] if isinstance(worker_data, tuple) and len(worker_data) > 1 else None
                if reader:
                    frame = reader.get_latest()
                    if frame is not None:
                        ret, enc = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        if ret:
                            frame_bytes = enc.tobytes()

            if frame_bytes is None:
                # Fallback: Tìm ảnh snapshot hiện trường gần nhất của camera này trong thư mục SNAPSHOT_DIR
                pattern = f"*_c{cam_id}_*.jpg" if cam_id is not None else "*.jpg"
                matching_files = list(SNAPSHOT_DIR.glob(pattern))
                if not matching_files and cam_id is not None:
                    matching_files = list(SNAPSHOT_DIR.glob(f"anpr_c{cam_id}_*.jpg")) or list(SNAPSHOT_DIR.glob(f"plate_c{cam_id}_*.jpg"))
                if not matching_files:
                    matching_files = list(SNAPSHOT_DIR.glob("anpr_*.jpg")) or list(SNAPSHOT_DIR.glob("*.jpg"))

                if matching_files:
                    matching_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
                    try:
                        frame_bytes = matching_files[0].read_bytes()
                    except Exception:
                        frame_bytes = None

            if frame_bytes:
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "*")
                self.send_header("Content-Length", str(len(frame_bytes)))
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(frame_bytes)
                try:
                    self.wfile.flush()
                except Exception:
                    pass
            else:
                self.send_json_response(404, {"code": 404, "message": "NO_SNAPSHOT_AVAILABLE"})

        elif self.path.startswith("/ws/tracking"):
            # NÂNG CẤP KẾT NỐI SANG WEBSOCKET RFC 6455 (VIEWPORT SUBSCRIPTION HUB)
            upgrade = self.headers.get("Upgrade", "").lower()
            ws_key = self.headers.get("Sec-WebSocket-Key")
            origin = self.headers.get("Origin", "")

            # 1. BẢO MẬT: Chống CSWSH (Cross-Site WebSocket Hijacking)
            if origin:
                host_hdr = self.headers.get("Host", "").split(":")[0]
                origin_clean = origin.replace("http://", "").replace("https://", "").split(":")[0]
                # Chặn nếu kết nối từ các domain ngoại lai không xác định
                if origin_clean not in ("localhost", "127.0.0.1", "host.docker.internal", host_hdr) and not origin_clean.startswith("192.168.") and not origin_clean.startswith("10.") and not origin_clean.startswith("172."):
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b"Forbidden: Invalid Origin")
                    return

            if "websocket" not in upgrade or not ws_key:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Bad Request: Expected WebSocket Upgrade")
                return

            # 2. Handshake RFC 6455 chuẩn
            GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            accept_token = base64.b64encode(hashlib.sha1((ws_key.strip() + GUID).encode()).digest()).decode()

            self.send_response(101, "Switching Protocols")
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            self.send_header("Sec-WebSocket-Accept", accept_token)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                self.wfile.flush()
            except Exception:
                pass

            sock = self.request
            sock.settimeout(20.0)
            client = WebSocketClient(sock, self.client_address)
            with WS_CLIENTS_LOCK:
                WS_CLIENTS.add(client)

            # Gửi frame khởi tạo kèm cấu hình hiện tại
            with TRACKING_DATA_LOCK:
                init_data = json.dumps({"type": "init", "connected": True, "cameras": dict(LATEST_TRACKING_BY_CAMERA)}, default=str)
            client.send_text(init_data)

            # Bắn toạ độ ROI & metadata ngay lập tức để Web vẽ khung tức thì
            with PROCESSORS_LOCK:
                for cid, proc in list(ACTIVE_PROCESSORS.items()):
                    try:
                        roi_norm = getattr(proc, "roi_normalized", None) or DEFAULT_ROI
                        tw_norm = getattr(proc, "tripwire_normalized", None)
                        lanes = getattr(proc, "lanes", [])
                        client.send_text(json.dumps({
                            "cameraId": cid,
                            "frameWidth": 960,
                            "frameHeight": 540,
                            "fps": 0,
                            "activeInRoi": False,
                            "roi": roi_norm,
                            "tripwire": tw_norm,
                            "lanes": lanes,
                            "tracks": []
                        }))
                    except Exception:
                        pass

            # 3. Vòng lặp đọc frame từ client (chuẩn masked RFC 6455)
            try:
                msg_count = 0
                sec_window = int(time.time())
                unanswered_pings = 0
                while not client.is_closed:
                    try:
                        b_head = sock.recv(2)
                    except TimeoutError:
                        # Client im lặng quá 20s -> Ping kiểm tra
                        unanswered_pings += 1
                        if unanswered_pings >= 2:
                            # Treo quá 40s không phản hồi -> Tự ngắt giải phóng tài nguyên
                            break
                        with client.lock:
                            try:
                                sock.sendall(bytes([0x89, 0x00]))
                            except Exception:
                                break
                        continue
                    except Exception:
                        break

                    if not b_head or len(b_head) < 2:
                        break

                    unanswered_pings = 0  # Có frame -> Reset ping timeout

                    b0, b1 = b_head[0], b_head[1]
                    opcode = b0 & 0x0F
                    is_masked = bool(b1 & 0x80)
                    payload_len = b1 & 0x7F

                    if payload_len == 126:
                        ext = sock.recv(2)
                        if len(ext) < 2:
                            break
                        payload_len = struct.unpack("!H", ext)[0]
                    elif payload_len == 127:
                        ext = sock.recv(8)
                        if len(ext) < 8:
                            break
                        payload_len = struct.unpack("!Q", ext)[0]

                    # Chống DoS: Giới hạn frame max 8KB
                    if payload_len > 8192:
                        break

                    mask = sock.recv(4) if is_masked else None
                    if is_masked and (not mask or len(mask) < 4):
                        break

                    raw_bytes = bytearray()
                    while len(raw_bytes) < payload_len:
                        chunk = sock.recv(min(4096, payload_len - len(raw_bytes)))
                        if not chunk:
                            break
                        raw_bytes.extend(chunk)

                    if len(raw_bytes) < payload_len:
                        break

                    # Xử lý control frames sau khi đã đọc trọn vẹn mask và payload khỏi socket (tránh lệch offset giao thức)
                    if opcode == 0x8:  # Close frame
                        break
                    elif opcode == 0x9:  # Ping frame -> gửi Pong phản hồi
                        with client.lock:
                            try:
                                sock.sendall(bytes([0x8A, len(raw_bytes)]) + bytes(raw_bytes))
                            except Exception:
                                break
                        continue
                    elif opcode == 0xA:  # Pong frame (phản hồi ping từ client) -> tiếp tục
                        continue

                    if is_masked and mask:
                        payload_str = bytearray([raw_bytes[i] ^ mask[i % 4] for i in range(len(raw_bytes))]).decode("utf-8", errors="ignore")
                    else:
                        payload_str = raw_bytes.decode("utf-8", errors="ignore")

                    # Rate Limiting chống spam (tối đa 15 tin nhắn/giây)
                    now_sec = int(time.time())
                    if now_sec == sec_window:
                        msg_count += 1
                        if msg_count > 15:
                            continue  # Drop tin spam
                    else:
                        sec_window = now_sec
                        msg_count = 1

                    # Xử lý lệnh đăng ký Viewport từ client
                    try:
                        cmd = json.loads(payload_str)
                        action = cmd.get("action")
                        if action == "ping":
                            client.send_text(json.dumps({"type": "pong"}))
                            continue
                        if action == "subscribe":
                            raw_cams = cmd.get("camera_ids", [])
                            cam_ids = set()
                            for c in raw_cams:
                                try:
                                    cam_ids.add(int(c))
                                    cam_ids.add(str(c))
                                except (ValueError, TypeError):
                                    cam_ids.add(str(c))
                            client.subscribed_cam_ids = cam_ids
                            client.send_text(json.dumps({"type": "subscribed", "camera_ids": list(cam_ids)}))
                            # Bắn ngay dữ liệu hiện có của camera vừa subscribe để vẽ ngay khung tức thì
                            with TRACKING_DATA_LOCK:
                                for c in raw_cams:
                                    s_cid = str(c)
                                    if s_cid in LATEST_TRACKING_BY_CAMERA:
                                        client.send_text(json.dumps(LATEST_TRACKING_BY_CAMERA[s_cid], default=str))
                                    else:
                                        try:
                                            cid_int = int(c)
                                            with PROCESSORS_LOCK:
                                                proc = ACTIVE_PROCESSORS.get(cid_int)
                                            if proc:
                                                roi_norm = getattr(proc, "roi_normalized", None) or DEFAULT_ROI
                                                tw_norm = getattr(proc, "tripwire_normalized", None)
                                                lanes = getattr(proc, "lanes", [])
                                                client.send_text(json.dumps({
                                                    "cameraId": cid_int,
                                                    "frameWidth": 960,
                                                    "frameHeight": 540,
                                                    "fps": 0,
                                                    "activeInRoi": False,
                                                    "roi": roi_norm,
                                                    "tripwire": tw_norm,
                                                    "lanes": lanes,
                                                    "tracks": []
                                                }))
                                        except Exception:
                                            pass
                        elif action == "unsubscribe":
                            raw_cams = cmd.get("camera_ids", [])
                            for c in raw_cams:
                                try:
                                    client.subscribed_cam_ids.discard(int(c))
                                    client.subscribed_cam_ids.discard(str(c))
                                except (ValueError, TypeError):
                                    client.subscribed_cam_ids.discard(str(c))
                        elif action == "auth":
                            client.authenticated = True
                    except Exception:
                        pass
            finally:
                with WS_CLIENTS_LOCK:
                    WS_CLIENTS.discard(client)
                client.close()

        elif self.path.startswith("/tracking-events"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.end_headers()

            q = queue.Queue(maxsize=15)
            with SSE_LOCK:
                SSE_SUBSCRIBERS.add(q)

            # Gửi ngay khung toạ độ gần nhất khi client mới kết nối
            try:
                first_msg = f"data: {json.dumps(LATEST_TRACKING_DATA)}\n\n".encode("utf-8")
                self.wfile.write(first_msg)
                self.wfile.flush()
            except Exception:
                with SSE_LOCK:
                    SSE_SUBSCRIBERS.discard(q)
                return

            try:
                while True:
                    try:
                        data = q.get(timeout=1.0)
                        self.wfile.write(data)
                        self.wfile.flush()
                    except queue.Empty:
                        # Heartbeat giữ kết nối sống
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass
            finally:
                with SSE_LOCK:
                    SSE_SUBSCRIBERS.discard(q)

        elif self.path in ("/", "/index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html = """<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI ALPR Tracking Hub - MediaMTX Decoupled</title>
    <style>
        body {
            margin: 0;
            background: #0b0f19;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            box-sizing: border-box;
        }
        .card {
            background: #1e293b;
            padding: 28px;
            border-radius: 16px;
            border: 1px solid #334155;
            max-width: 680px;
            width: 100%;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        h1 { font-size: 20px; color: #38bdf8; margin-top: 0; display: flex; align-items: center; gap: 8px; }
        .badge { background: #22c55e; color: #052e16; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
        p { color: #94a3b8; line-height: 1.6; font-size: 14px; }
        .btn-group { display: flex; gap: 12px; margin-top: 20px; }
        a.btn {
            padding: 10px 18px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 13.5px;
            transition: all 0.2s;
        }
        .btn-primary { background: #0284c7; color: white; }
        .btn-success { background: #16a34a; color: white; }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #f472b6; font-family: monospace; }
        pre { background: #0f172a; padding: 12px; border-radius: 8px; color: #38bdf8; font-size: 12px; overflow-x: auto; max-height: 250px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🎯 AI ALPR TRACKING ENGINE <span class="badge">SSE READY</span></h1>
        <p>Kiến trúc tách rời (Decoupled Stream): <strong>Khắc phục 100% tình trạng giật lag video</strong>:</p>
        <ul>
            <li>Video hình ảnh gốc truyền trực tiếp qua <strong>MediaMTX (WebRTC WHEP)</strong> siêu mượt 60 FPS, độ trễ ~0s.</li>
            <li>Python chỉ nhận diện và phát toạ độ bám biển số qua SSE: <code>/tracking-events</code> (chỉ vài trăm bytes).</li>
            <li>Frontend React tự động vẽ khung bám biển thời gian thực ngay trên thẻ <code>&lt;video&gt;</code>.</li>
        </ul>
        <div class="btn-group">
            <a class="btn btn-success" href="http://localhost:5173" target="_blank">🌐 Mở Web Bãi Xe React (Port 5173)</a>
            <a class="btn btn-primary" href="http://localhost:8889/cam-1" target="_blank">🚀 Mở MediaMTX WebRTC (Port 8889)</a>
        </div>
        <p style="margin-top: 24px; font-size: 12px; color: #64748B;">Dữ liệu toạ độ SSE trực tiếp:</p>
        <pre id="sse-dump">Đang kết nối SSE...</pre>
    </div>
    <script>
        const es = new EventSource('/tracking-events');
        es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                document.getElementById('sse-dump').innerText = JSON.stringify(data, null, 2);
            } catch(err) {}
        };
    </script>
</body>
</html>"""
            self.wfile.write(html.encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path.startswith("/api/roi-config"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                payload = json.loads(body.decode("utf-8"))
                updated_cfg = update_roi_config(payload)
                self.send_json_response(200, {
                    "code": 200,
                    "message": "Cấu hình khung ảo ROI đã được lưu và áp dụng tức thì!",
                    "data": updated_cfg
                })
            except Exception as e:
                self.send_json_response(400, {
                    "code": 400,
                    "message": f"Lỗi khi cập nhật ROI: {str(e)}"
                })
        else:
            self.send_json_response(404, {"code": 404, "message": "NOT_FOUND"})

    def log_message(self, format, *args):
        pass


_SSE_SERVER_INSTANCE = None
_SSE_SERVER_LOCK = threading.Lock()


def start_sse_server(port: int = 5000):
    """Chạy HTTP SSE metadata server ở luồng nền (non-blocking)."""
    global _SSE_SERVER_INSTANCE
    with _SSE_SERVER_LOCK:
        if _SSE_SERVER_INSTANCE is not None:
            return _SSE_SERVER_INSTANCE
        ThreadingHTTPServer.allow_reuse_address = True
        server = ThreadingHTTPServer(("0.0.0.0", port), SSEStreamHandler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        _SSE_SERVER_INSTANCE = server
        return server


class LatestFrameReader:
    """
    Bộ đọc luồng video RTSP độc lập chạy trên Thread riêng biệt (Non-blocking Latest Frame Reader):
    - Đọc liên tục khung hình từ RTSP stream với CAP_PROP_BUFFERSIZE = 1.
    - Điều tiết giải mã thích ứng (Adaptive Decoding Throttling):
      + ACTIVE (đang xem / có xe): giải mã tối đa 20 FPS (interval = 0.05s).
      + IDLE (không ai xem, không có xe): chỉ giải mã 2 FPS (interval = 0.5s) để tiết kiệm 85% CPU.
      + Các frame xen kẽ dùng cap.grab() nuốt gói tin RTSP, không tốn CPU giải mã H.264.
    - Giảm kích thước sớm (max_width=960) để tiết kiệm 70% bộ nhớ đệm RAM.
    - Tự động kết nối lại (Auto Reconnect) khi mất tín hiệu RTSP và giải phóng VideoCapture triệt để.
    """
    def __init__(self, source: Any, max_width: int = 960, fallback_source: Optional[Any] = None):
        self.primary_source = source
        self.source = source
        self.fallback_source = fallback_source
        self.max_width = int(os.getenv("AI_FRAME_MAX_WIDTH", str(max_width)))
        self.lock = threading.Lock()
        self.latest_frame: Optional[np.ndarray] = None
        self.running: bool = False
        self.active_mode: bool = True
        self.burst_mode: bool = False
        self.thread: Optional[threading.Thread] = None
        self.is_connected: bool = False
        self.dims: Tuple[int, int] = (1920, 1080)
        self.last_retrieve_time: float = 0.0

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._read_loop, daemon=True, name="LatestFrameReader")
        self.thread.start()
        return self

    def _read_loop(self):
        cap = None
        is_mp4 = isinstance(self.source, str) and self.source.endswith(".mp4")
        fail_count = 0

        try:
            while self.running:
                try:
                    if cap is None or not cap.isOpened():
                        if cap is not None:
                            try:
                                cap.release()
                            except Exception:
                                pass
                            cap = None

                        # Mở VideoCapture (sử dụng TCP để chống rớt gói h264)
                        if isinstance(self.source, str) and self.source.startswith("rtsp://"):
                            cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
                        else:
                            cap = cv2.VideoCapture(self.source)

                        try:
                            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        except Exception:
                            pass

                        if not cap.isOpened():
                            self.is_connected = False
                            with self.lock:
                                self.latest_frame = None
                            fail_count += 1
                            if fail_count >= 2 and self.fallback_source:
                                if self.source == self.primary_source:
                                    self.source = self.fallback_source
                                    print(f"⚠️ [RTSP-SWITCH] MediaMTX '{self.primary_source}' chưa phản hồi, chuyển sang fallback: '{self.fallback_source}'...")
                                else:
                                    self.source = self.primary_source
                                    print(f"⚠️ [RTSP-SWITCH] Nguồn fallback '{self.fallback_source}' không phản hồi, thử lại MediaMTX: '{self.primary_source}'...")
                                fail_count = 0
                            sleep_time = min(5.0, 1.5 * min(fail_count, 3))
                            time.sleep(sleep_time)
                            continue

                        self.is_connected = True
                        fail_count = 0

                    if is_mp4:
                        ok, frame = cap.read()
                        if not ok:
                            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            time.sleep(0.03)
                            continue
                    else:
                        # ZERO-LATENCY THỰC THỰ: Đọc liên tục cap.read() trên luồng riêng để làm rỗng socket RTSP,
                        # triệt tiêu hoàn toàn độ trễ tích lũy trong FFmpeg. latest_frame luôn luôn là khung hình mới nhất!
                        ok, frame = cap.read()
                        if not ok or frame is None:
                            try:
                                cap.release()
                            except Exception:
                                pass
                            cap = None
                            self.is_connected = False
                            with self.lock:
                                self.latest_frame = None
                            time.sleep(0.2)
                            continue

                    if frame is None:
                        continue

                    h, w = frame.shape[:2]
                    if h <= 0 or w <= 0:
                        continue

                    # Tối ưu RAM & Tốc độ: Thu nhỏ frame bằng INTER_LINEAR siêu nhanh (~1ms) thay vì INTER_AREA
                    if self.max_width > 0 and w > self.max_width:
                        scale = self.max_width / float(w)
                        new_h = int(h * scale)
                        processed = cv2.resize(frame, (self.max_width, new_h), interpolation=cv2.INTER_LINEAR)
                    else:
                        processed = frame

                    # Ghi đè frame mới nhất (drop toàn bộ frame cũ trong hàng đợi)
                    with self.lock:
                        self.latest_frame = processed
                        self.dims = (processed.shape[1], processed.shape[0])

                except Exception as read_ex:
                    print(f"⚠️ [STREAM-RETRY] Lỗi luồng đọc video {self.source}: {read_ex}")
                    self.is_connected = False
                    with self.lock:
                        self.latest_frame = None
                    time.sleep(0.2)

        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass
            self.is_connected = False
            with self.lock:
                self.latest_frame = None

    def get_latest(self) -> Optional[np.ndarray]:
        """Lấy bản sao của frame mới nhất hoặc None nếu camera mất kết nối."""
        with self.lock:
            if not self.is_connected or self.latest_frame is None:
                return None
            return self.latest_frame.copy()

    def stop(self):
        self.running = False
        self.is_connected = False
        with self.lock:
            self.latest_frame = None
        if self.thread is not None and self.thread.is_alive():
            self.thread.join(timeout=2.0)


class CameraStreamBridge:
    def __init__(
        self,
        backend_url: Optional[str] = None,
        mediamtx_rtsp_url: Optional[str] = None
    ):
        self.backend_url = (backend_url or DEFAULT_BACKEND_URL).rstrip("/")
        self.mediamtx_rtsp_url = (mediamtx_rtsp_url or DEFAULT_MEDIAMTX_RTSP).rstrip("/")
        self.is_backend_connected: bool = False
        self.last_fetch_error: Optional[str] = None
        print(f"[BRIDGE] Khởi tạo cầu nối CameraStream:")
        print(f"  👉 Backend API: {self.backend_url}")
        print(f"  👉 MediaMTX RTSP: {self.mediamtx_rtsp_url}")

    def normalize_rtsp_for_docker(self, url: Optional[str], stream_path: str) -> str:
        """Chuẩn hóa URL RTSP khi chạy trong Docker để không bị lỗi Connection Refused tới localhost:8554."""
        if not url:
            return f"{self.mediamtx_rtsp_url}/{stream_path}"
        if not isinstance(url, str):
            return str(url)
        # Khi chạy trong Docker, localhost là chính container AI, cần chuyển sang container mediamtx
        is_docker_env = os.path.exists("/.dockerenv") or "mediamtx" in self.mediamtx_rtsp_url
        if is_docker_env and ("localhost:8554" in url or "127.0.0.1:8554" in url):
            return f"{self.mediamtx_rtsp_url}/{stream_path}"
        return url

    def _probe_backend_candidates(self) -> Optional[str]:
        """Tự động dò tìm Backend Spring Boot nếu URL hiện tại không thể phân giải hoặc kết nối (ví dụ chạy Docker hybrid)."""
        candidates = [
            self.backend_url,
            "http://host.docker.internal:8080",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://backend:8080"
        ]
        service_key = os.getenv("SERVICE_INTERNAL_KEY", "camerastream_secret_key_2026")
        seen = set()
        for cand in candidates:
            cand = cand.rstrip("/")
            if cand in seen or cand == self.backend_url:
                continue
            seen.add(cand)
            try:
                test_req = urllib.request.Request(
                    f"{cand}/api/cameras",
                    headers={"User-Agent": "ALPR-Bridge/1.0", "X-Internal-Service-Key": service_key}
                )
                with urllib.request.urlopen(test_req, timeout=2) as resp:
                    if resp.status == 200:
                        return cand
            except Exception:
                pass
        return None

    def fetch_cameras(self) -> List[Dict[str, Any]]:
        """Lấy danh sách các camera đang được quản lý từ CameraStream Backend."""
        url = f"{self.backend_url}/api/cameras"
        service_key = os.getenv("SERVICE_INTERNAL_KEY", "camerastream_secret_key_2026")
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "ALPR-Bridge/1.0",
                "X-Internal-Service-Key": service_key
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    self.is_backend_connected = True
                    self.last_fetch_error = None
                    return data.get("data", [])
                self.is_backend_connected = False
                self.last_fetch_error = f"HTTP {response.status}"
                return []
        except Exception as e:
            alt = self._probe_backend_candidates()
            if alt:
                print(f"🔄 [BRIDGE] Đã tự động phát hiện và chuyển Backend URL sang: {alt}")
                self.backend_url = alt
                self.is_backend_connected = True
                self.last_fetch_error = None
                return self.fetch_cameras()
            self.is_backend_connected = False
            self.last_fetch_error = str(e)
            return []

    def fetch_ai_tasks(self, ai_type: str = "VEHICLE_ANPR") -> List[Dict[str, Any]]:
        """Lấy danh sách các camera đang được bật phân hệ AI tương ứng từ Backend."""
        url = f"{self.backend_url}/api/cameras/ai-tasks?aiType={ai_type}"
        service_key = os.getenv("SERVICE_INTERNAL_KEY", "camerastream_secret_key_2026")
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "ALPR-Bridge/1.0",
                "X-Internal-Service-Key": service_key
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    return data.get("data", [])
                return []
        except Exception:
            return []

    def send_detection(
        self,
        camera_id: int,
        plate_number: str,
        confidence: float,
        plate_crop_file: Optional[str] = None,
        full_image_file: Optional[str] = None,
        vehicle_type: str = "CAR",
        lane_id: Optional[str] = None
    ) -> bool:
        """Gửi sự kiện nhận diện biển số về Spring Boot Webhook.

        Ảnh được gửi dưới dạng TÊN FILE (đã lưu sẵn ra đĩa), không phải base64 —
        xem `save_snapshot()`. Backend sẽ ghép thành URL tuyệt đối.
        """
        url = f"{self.backend_url}/api/cameras/{camera_id}/detections"

        payload = {
            "plateNumber": plate_number,
            "confidence": round(float(confidence), 3),
            "vehicleType": vehicle_type,
            "plateCropFile": plate_crop_file,
            "fullImageFile": full_image_file,
            "detectedAt": datetime.now().astimezone().isoformat(),
            "laneId": lane_id
        }

        json_bytes = json.dumps(payload).encode("utf-8")
        service_key = os.getenv("SERVICE_INTERNAL_KEY", "camerastream_secret_key_2026")
        req = urllib.request.Request(
            url,
            data=json_bytes,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "ALPR-Bridge/1.0",
                "X-Internal-Service-Key": service_key
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=4) as resp:
                if resp.status in (200, 201):
                    print(f"  🚀 [WEBHOOK ĐÃ GỬI] Camera #{camera_id} -> Biển số: '{plate_number}' ({confidence:.0%}) -> Spring Boot nhận thành công!")
                    return True
        except Exception as e:
            print(f"  ⚠️ [LỖI GỬI WEBHOOK] Không thể gửi về {url}: {e}")
            return False
        return False

    def run_bridge_worker(
        self,
        camera_id: int = 1,
        stream_source: Optional[Any] = None,
        camera_name: str = "Cổng số 1",
        frame_skip: int = 2,
        cooldown_sec: float = 15.0,
        detector_conf: float = 0.20,
        min_ocr_conf: float = 70.0,
        display_window: bool = True,
        web_port: int = 5000,
        enable_mock: bool = False
    ):
        """
        Khởi chạy luồng đọc camera và tự động đẩy dữ liệu sang CameraStream Web:
        1. Nhận diện trực tiếp từ Webcam, RTSP IP Camera hoặc Video File thật.
        2. Tự động khởi chạy Web Stream tại http://localhost:5000 để xem camera bám biển trên trình duyệt.
        3. Lọc hình học biển số, kiểm định quy chuẩn biển VN và chống spam 100%.
        """
        # Khởi chạy HTTP SSE Streaming Server cho Metadata Bám biển số
        try:
            start_sse_server(port=web_port)
            print(f"\n📡 [AI METADATA SSE ĐÃ BẬT] Phát toạ độ bám biển số thời gian thực tại:")
            print(f"   👉 http://localhost:{web_port}/tracking-events")
            print(f"   (Frontend React sẽ tự động kết nối và vẽ khung bám trực tiếp trên video WebRTC)\n")
        except Exception as e:
            print(f"[CẢNH BÁO] Không thể bật SSE Server cổng {web_port}: {e}")

        # Xử lý nguồn video
        source = stream_source

        # Nếu truyền số (vd "0", 0) -> chuyển sang int cho webcam
        if source is not None and str(source).isdigit():
            source = int(source)

        # Tự động tìm camera phù hợp từ CSDL Spring Boot
        camera_name = f"Camera #{camera_id}"
        stream_path = f"cam-{camera_id}"
        cams: List[Dict[str, Any]] = []
        target_cam: Optional[Dict[str, Any]] = None
        try:
            cams = self.fetch_cameras()
            if cams:
                matched = None
                if source and isinstance(source, str):
                    for c in cams:
                        if c.get("ipAddress") and c["ipAddress"] in source:
                            matched = c
                            break
                        if c.get("streamPath") and c["streamPath"] in source:
                            matched = c
                            break
                if not matched:
                    matched = next((c for c in cams if c.get("id") == camera_id), cams[0])
                if matched:
                    target_cam = matched
                    camera_id = int(matched["id"])
                    camera_name = str(matched.get("name", f"Camera #{camera_id}"))
                    stream_path = str(matched.get("streamPath", f"cam-{camera_id}"))
                    print(f"🎯 [AUTO MATCH] Đã tự động khớp Camera #{camera_id} ('{camera_name}') | StreamPath: {stream_path}")
        except Exception:
            stream_path = f"cam-{camera_id}"

        # Nếu nguồn là link RTSP IP Camera ngoài (chưa qua MediaMTX):
        # Tự động kết nối qua MediaMTX nội bộ để chống rớt gói h264
        if isinstance(source, str) and source.startswith("rtsp://") and not ("localhost" in source or "127.0.0.1" in source or "mediamtx" in source):
            print(f"\n[MEDIAMTX RELAY] Kết nối luồng RTSP từ Camera IP: {source}")
            ensure_mediamtx_running()
            register_stream_in_mediamtx(stream_path, source)
            # Dùng RTSP nội bộ từ MediaMTX để OpenCV đọc nhanh, ổn định
            source = f"{self.mediamtx_rtsp_url}/{stream_path}"
            print(f"✅ Luồng AI ALPR nhận diện qua: {source} (MediaMTX TCP)")
            print(f"🌐 Xem trực tiếp WebRTC tại: http://localhost:5173\n")
        elif isinstance(source, str) and source.startswith("rtsp://"):
            source = self.normalize_rtsp_for_docker(source, stream_path)

        if source is None:
            # 1. ƯU TIÊN SỐ 1: Tự động lấy nguồn RTSP của Camera từ CSDL Spring Boot
            if target_cam is None and cams:
                target_cam = next((c for c in cams if c.get("id") == camera_id), cams[0])
            if target_cam:
                camera_id = int(target_cam["id"])
                camera_name = str(target_cam.get("name", f"Camera #{camera_id}"))
                stream_path = str(target_cam.get("streamPath", f"cam-{camera_id}"))
                # Ưu tiên số 1: Luồng phụ Sub-stream (nhẹ, tiết kiệm 80% RAM/GPU, giảm tải tối đa)
                sub_stream = target_cam.get("rtspSubStreamUrl")
                if sub_stream and str(sub_stream).strip():
                    raw_source = str(sub_stream).strip()
                    print(f"⚡ [SUB-STREAM ACTIVATED] Đang dùng luồng phụ nhẹ (Sub-stream) cho AI Camera #{camera_id}: {raw_source}")
                else:
                    raw_source = target_cam.get("rtspRelayUrl") or target_cam.get("rtspSourceUrl")
                source = self.normalize_rtsp_for_docker(raw_source, stream_path)
                print(f"🎯 [AUTO MATCH] Đã tự động kết nối luồng RTSP cho Camera #{camera_id} ('{camera_name}') từ CSDL:")
                print(f"   👉 {source}")

            # 2. Nếu CSDL không có camera nào -> Mới thử tìm Webcam 0 của máy tính
            if source is None:
                test_cap = cv2.VideoCapture(0)
                if test_cap.isOpened():
                    ret, _ = test_cap.read()
                    test_cap.release()
                    if ret:
                        source = 0
                        print(f"[INFO] CSDL chưa có camera, tự động kết nối Webcam 0 của máy tính.")

            # 3. Nếu vẫn không có nguồn nào và người dùng yêu cầu mock:
            if source is None and enable_mock:
                print(f"[INFO] Đang dùng video mô phỏng vì có cờ --mock...")
                mock_video = BASE_DIR / "mock_camera_stream.mp4"
                if not mock_video.exists():
                    generate_mock_traffic_video(str(mock_video), num_seconds=6)
                source = str(mock_video)

            # 4. Nếu không có nguồn nào hợp lệ:
            if source is None:
                print("\n" + "!" * 80)
                print("[HƯỚNG DẪN CẤP NGUỒN CAMERA THẬT]")
                print("Hệ thống chưa tìm thấy Webcam hoặc Camera trong CSDL.")
                print("Vui lòng chỉ định nguồn video thật bằng cách thêm tham số:")
                print("  👉 Dùng Webcam máy tính:       py camera_stream_bridge.py --source 0")
                print("  👉 Dùng IP Camera RTSP:        py camera_stream_bridge.py --source rtsp://admin:pass@ip:554/stream")
                print("  👉 Dùng file video MP4 của bạn: py camera_stream_bridge.py --source D:/video_xe.mp4")
                print("!" * 80 + "\n")
                return

        # Khởi tạo Bộ xử lý ALPR Video với ngưỡng cao chống ảo giác
        roi_polygon = get_roi_for_camera(camera_id)

        # Tự động nạp Cấu hình AI Pipeline động từ Spring Boot cho Camera này (FPS, Ngưỡng tin cậy, ROI)
        try:
            ai_tasks = self.fetch_ai_tasks("VEHICLE_ANPR")
            matching_task = next((t for t in ai_tasks if t.get("cameraId") == camera_id), None)
            if matching_task:
                print(f"⚙️ [DYNAMIC AI CONFIG] Đã nhận cấu hình AI từ Backend cho Camera #{camera_id}:")
                if matching_task.get("inferenceFps"):
                    fps = int(matching_task["inferenceFps"])
                    frame_skip = max(1, int(30 / fps))
                    print(f"   👉 Tần suất xử lý: {fps} FPS (Frame-skip: {frame_skip})")
                if matching_task.get("confidenceThreshold"):
                    detector_conf = float(matching_task["confidenceThreshold"])
                    print(f"   👉 Ngưỡng tin cậy YOLOX: {detector_conf:.0%}")
                if matching_task.get("roiCoordinates"):
                    try:
                        raw_roi = json.loads(matching_task["roiCoordinates"])
                        if isinstance(raw_roi, list) and len(raw_roi) >= 3:
                            roi_polygon = [tuple(p) for p in raw_roi]
                            print(f"   👉 Vùng ảo ROI: Nạp thành công {len(roi_polygon)} điểm góc từ Backend")
                    except Exception:
                        pass
        except Exception as ex:
            print(f"[CẢNH BÁO] Không thể nạp dynamic AI tasks từ Backend: {ex}")

        ai_outdoor = os.getenv("AI_OUTDOOR_MODE", "0") in ("1", "true", "True")
        eff_frame_skip = int(os.getenv("AI_FRAME_SKIP", "2"))
        eff_cooldown = float(os.getenv("AI_COOLDOWN_SEC", str(cooldown_sec or 15.0)))
        lanes = get_lanes_for_camera(camera_id)

        processor = VideoALPRProcessor(
            roi_polygon=roi_polygon,
            frame_skip=eff_frame_skip,
            cooldown_sec=eff_cooldown,
            detector_conf=detector_conf,
            min_ocr_conf=min_ocr_conf,
            tripwire=get_tripwire_for_camera(camera_id),
            lanes=lanes,
            outdoor_mode=ai_outdoor,
            events_dir=SNAPSHOT_DIR
        )

        # Khởi chạy Bộ đọc luồng đọc nhanh chống nghẽn RAM (LatestFrameReader)
        direct_fallback = target_cam.get("rtspSourceUrl") if target_cam else None
        reader = LatestFrameReader(source=source, max_width=1280, fallback_source=direct_fallback)
        reader.start()

        # Đợi frame đầu tiên trong tối đa 4 giây
        t_wait_start = time.time()
        while reader.get_latest() is None and time.time() - t_wait_start < 4.0:
            time.sleep(0.1)

        print("\n" + "=" * 80)
        print(f"KÍCH HOẠT TIẾN TRÌNH AI BÁM BIỂN SỐ CHO CAMERA #{camera_id}: {camera_name}")
        print(f"👉 Nguồn video: {source}")
        print(f"👉 Bộ đệm RAM: LatestFrameReader (Chỉ giữ 1 frame mới nhất, ngăn ngừa nghẽn RAM)")
        print(f"👉 Ngưỡng lọc YOLOX: {detector_conf:.0%} | Ngưỡng tin cậy ONNX LPR: {min_ocr_conf:.0f}%")
        print(f"👉 Khóa chống spam biển lặp: {cooldown_sec}s")
        print(f"👉 Khung ảo ROI: {len(roi_polygon)} điểm góc cấu hình")
        # TRACKER ENGINE (Component 3): hiển thị rõ engine association đang chạy.
        # processor.tracker_mode đọc từ env AI_TRACKER ở __init__ (process-wide, worker thread
        # thừa hưởng) -> đây là nguồn chính xác nhất, log để xác nhận engine live.
        # bytetrack = 2-stage + Kalman CV; legacy = hành vi cũ 100% (round-1 IoU + round-2 area/aspect).
        _tracker_mode = getattr(processor, "tracker_mode", "legacy").lower()
        if _tracker_mode == "bytetrack":
            print("👉 Tracker Engine: ByteTrack (2-Stage Kalman CV) | AI_TRACKER=bytetrack")
        else:
            print("👉 Tracker Engine: Legacy (IoU + Area/Aspect) | AI_TRACKER=legacy")
        print(f"👉 Xem trực tiếp trên Web: http://localhost:{web_port}")
        print("=" * 80 + "\n")

        self._camera_ai_loop(
            camera_id=camera_id,
            camera_name=camera_name,
            reader=reader,
            processor=processor,
            display_window=display_window,
            web_port=web_port
        )

    def _tracking_display_loop(
        self,
        camera_id: int,
        camera_name: str,
        reader: LatestFrameReader,
        processor: VideoALPRProcessor,
        stop_event: threading.Event,
        target_fps: float = 20.0
    ):
        """
        Luồng hiển thị độc lập thời gian thực có điều tiết thông minh (Adaptive SSE Display Loop):
        - Khi CÓ xe/người/biển số: phát liên tục ở nhịp 20 FPS (~50ms) siêu mượt, bám sát video WebRTC.
        - Khi KHÔNG CÓ xe: phát 1 lần xóa khung rồi hạ nhịp xuống 1 lần/giây (1 Hz Heartbeat).
        - Ngăn chặn hoàn toàn việc làm tràn buffer socket và chấm dứt hiện tượng trình duyệt bị reconnect 200+ lần.
        """
        active_interval = 1.0 / max(10.0, target_fps)
        last_state_was_empty = True
        last_send_time = 0.0

        while reader.running and not stop_event.is_set():
            loop_t0 = time.monotonic()

            w, h = reader.dims

            # Khi camera bị ngắt kết nối / Offline / Mất tín hiệu RTSP:
            # Gửi 1 sự kiện rỗng duy nhất để Web dọn sạch mọi khung vẽ và badge XE TRONG ROI
            if not reader.is_connected:
                if not last_state_was_empty:
                    broadcast_tracking_events({
                        "cameraId": camera_id,
                        "cameraName": camera_name,
                        "frameWidth": w,
                        "frameHeight": h,
                        "fps": 0.0,
                        "activeInRoi": False,
                        "roi": processor.roi_normalized,
                        "tripwire": processor.tripwire_normalized,
                        "lanes": getattr(processor, "lanes", []),
                        "tracks": [],
                        "status": "OFFLINE"
                    })
                    last_state_was_empty = True
                time.sleep(0.5)
                continue

            # Nếu camera không có ai subscribe trên Web và không có SSE client:
            # Ngủ nhàn rỗi 0.5s để giải phóng 100% CPU
            if not is_camera_subscribed(camera_id):
                time.sleep(0.5)
                continue

            try:
                tracks = processor.get_tracks_summary(w, h)
                has_targets = len(tracks) > 0 or processor.active_in_roi

                now_mono = time.monotonic()
                time_since_last_send = now_mono - last_send_time

                should_send = False
                if has_targets:
                    should_send = True
                    last_state_was_empty = False
                else:
                    if not last_state_was_empty:
                        # Vừa chuyển từ có mục tiêu sang rỗng: gửi duy nhất 1 lần để xóa khung trên giao diện
                        should_send = True
                        last_state_was_empty = True
                    elif time_since_last_send >= 1.0:
                        # Heartbeat 1 Hz khi vắng xe: Cung cấp toạ độ ROI, vạch ảo, trạng thái kết nối cho Web vẽ khung
                        should_send = True

                if should_send:
                    last_send_time = now_mono
                    broadcast_tracking_events({
                        "cameraId": camera_id,
                        "cameraName": camera_name,
                        "frameWidth": w,
                        "frameHeight": h,
                        "fps": round(target_fps if has_targets else 1.0, 1),
                        "activeInRoi": processor.active_in_roi,
                        "roi": processor.roi_normalized,
                        "tripwire": processor.tripwire_normalized,
                        "lanes": getattr(processor, "lanes", []),
                        "tracks": tracks
                    })
            except Exception:
                pass

            elapsed = time.monotonic() - loop_t0
            # Khi có xe ngủ ~50ms (20 FPS); khi rỗng ngủ 200ms để tiết kiệm CPU và socket
            sleep_budget = active_interval if not last_state_was_empty else 0.20
            sleep_time = max(0.01, sleep_budget - elapsed)
            time.sleep(sleep_time)

    def _async_handle_event(
        self,
        camera_id: int,
        camera_name: str,
        ev: Dict[str, Any],
        fallback_frame: np.ndarray
    ):
        """
        Xử lý sự kiện nhận diện ngầm ở luồng riêng (Non-blocking Event Handler):
        - Mã hóa ảnh JPEG 1080p và crop cận cảnh biển số ngoài luồng AI.
        - Ghi đĩa snapshot và gửi HTTP webhook về Spring Boot không làm block camera loop.
        """
        try:
            plate_txt = ev["plate"]
            conf_pct = ev["confidence"]
            ev_lane_id = ev.get("lane_id")

            # Lưu ảnh snapshot toàn cảnh trực tiếp vào SNAPSHOT_DIR (ở luồng riêng, không block camera loop)
            full_file: Optional[str] = None
            target_full = ev.get("full_img") if (ev.get("full_img") is not None and getattr(ev.get("full_img"), "size", 0) > 0) else fallback_frame
            if target_full is not None and getattr(target_full, "size", 0) > 0:
                try:
                    name = f"anpr_c{camera_id}_{int(time.time() * 1000)}_{next(_SNAPSHOT_SEQ):04d}.jpg"
                    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
                    cv2.imwrite(str(SNAPSHOT_DIR / name), target_full, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    full_file = name
                except Exception as e:
                    print(f"⚠️ [SNAPSHOT] Lỗi ghi ảnh toàn cảnh: {e}")
                    full_file = None

            # Lưu ảnh crop biển số cận cảnh trực tiếp vào SNAPSHOT_DIR
            crop_file: Optional[str] = None
            crop_img = ev.get("crop_img")
            if crop_img is not None and getattr(crop_img, "size", 0) > 0:
                try:
                    ch, cw = crop_img.shape[:2]
                    if cw < 280:
                        scale = 280.0 / float(cw)
                        crop_to_send = cv2.resize(crop_img, (280, max(60, int(ch * scale))), interpolation=cv2.INTER_CUBIC)
                    else:
                        crop_to_send = crop_img
                    name = f"plate_c{camera_id}_{int(time.time() * 1000)}_{next(_SNAPSHOT_SEQ):04d}.jpg"
                    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
                    cv2.imwrite(str(SNAPSHOT_DIR / name), crop_to_send, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    crop_file = name
                except Exception as e:
                    print(f"⚠️ [SNAPSHOT] Lỗi ghi ảnh crop biển số: {e}")
                    crop_file = None

            # Giải phóng mảng ảnh lớn khỏi RAM để chống rò rỉ bộ nhớ
            ev["full_img"] = None
            ev["crop_img"] = None
            del target_full, fallback_frame

            v_type = ev.get("vehicle_type") or "CAR"
            now_dt = datetime.now().astimezone()

            is_new_event = record_detection_event({
                "id": f"AI-LOG-{int(time.time() * 1000) % 100000:05d}-{next(_SNAPSHOT_SEQ):03d}",
                "plateNumber": plate_txt,
                "vehicleType": v_type,
                "gateName": camera_name,
                "gateType": "IN",
                "laneId": ev_lane_id,
                "timestamp": now_dt.strftime("%H:%M:%S"),
                "confidence": round(conf_pct, 1),
                "snapshotUrl": f"/snapshots/{full_file}" if full_file else "",
                "plateCropUrl": f"/snapshots/{crop_file}" if crop_file else "",
                "ticketCode": f"TICK-{random.randint(1000, 9999)}",
                "status": "VALID",
                "note": f"Nhận diện AI tại {camera_name}" + (f" ({ev.get('lane_name')})" if ev.get("lane_name") else ""),
                "cameraId": camera_id,
                "detectedAt": now_dt.isoformat()
            })

            if is_new_event:
                self.send_detection(
                    camera_id=camera_id,
                    plate_number=plate_txt,
                    confidence=conf_pct / 100.0,
                    plate_crop_file=crop_file,
                    full_image_file=full_file,
                    vehicle_type=v_type,
                    lane_id=ev_lane_id
                )
        except Exception as e:
            print(f"⚠️ [ASYNC EVENT] Lỗi xử lý sự kiện ngầm cho Camera #{camera_id}: {e}")

    def _camera_ai_loop(
        self,
        camera_id: int,
        camera_name: str,
        reader: LatestFrameReader,
        processor: VideoALPRProcessor,
        display_window: bool = False,
        web_port: int = 5000,
        stop_event: Optional[threading.Event] = None
    ):
        processed = 0
        t_start = time.time()
        last_inference = 0.0
        is_outdoor = getattr(processor, "outdoor_mode", False)
        default_interval = "0.12" if is_outdoor else "0.08"
        inference_interval = float(os.getenv("AI_INFERENCE_INTERVAL", default_interval))
        loop_sleep = 0.005

        loop_stop = stop_event or threading.Event()

        # KHỞI CHẠY LUỒNG HIỂN THỊ ĐỘC LẬP 30 FPS (Tách riêng biệt khỏi luồng logic AI)
        display_thread = threading.Thread(
            target=self._tracking_display_loop,
            args=(camera_id, camera_name, reader, processor, loop_stop, 30.0),
            daemon=True,
            name=f"DisplayLoop-Cam{camera_id}"
        )
        display_thread.start()

        with PROCESSORS_LOCK:
            ACTIVE_PROCESSORS[camera_id] = processor

        try:
            while reader.running and not loop_stop.is_set():
                try:
                    now_mono = time.monotonic()

                    # Kiểm tra trạng thái On-Demand theo Viewport WebSocket Client & mục tiêu trong ROI
                    with processor._state_lock:
                        has_active_targets = (
                            len(processor.tracked_plates) > 0
                            or len(processor.tracked_vehicles) > 0
                            or processor.active_in_roi
                        )
                    is_sub = is_camera_subscribed(camera_id)
                    is_active = is_sub or has_active_targets

                    reader.active_mode = is_active

                    # Điều tiết tần số AI thích ứng:
                    # 1. Xe khẩn cấp / xe mới vào chưa có biển số: Burst 30 FPS (0.033s) để chụp tức thì trong < 0.3s
                    # 2. Camera đang được người dùng quan sát: 16 FPS (inference_interval)
                    # 3. Camera vắng / không ai xem (IDLE): 2 FPS (0.50s)
                    has_urgent = False
                    if has_active_targets:
                        with processor._state_lock:
                            # Chỉ kích hoạt BURST 30 FPS cho xe thực sự trong ROI hoặc đã chạm vạch ảo mà chưa hoàn tất nhận diện
                            # Tuyệt đối không burst cho xe đỗ ngoài ROI (như xe đỗ lề đường) để chống nghẽn CPU và giật lag
                            has_urgent = any(
                                (getattr(t, "ever_in_roi", False) or getattr(t, "crossed", False))
                                and (not t.plate_text or not t.event_sent)
                                for t in processor.tracked_plates.values()
                            ) or (
                                processor.active_in_roi
                                and any(
                                    vid not in processor.tracked_plates or not processor.tracked_plates[vid].plate_text
                                    for vid in processor.tracked_vehicles.keys()
                                )
                            )

                    reader.burst_mode = has_urgent
                    target_interval = 0.033 if has_urgent else (inference_interval if is_active else 0.50)

                    if now_mono - last_inference < target_interval:
                        time.sleep(loop_sleep if is_active else 0.05)
                        continue

                    if not reader.is_connected:
                        with processor._state_lock:
                            if processor.tracked_plates or processor.tracked_vehicles or processor.current_vehicles or processor.active_in_roi:
                                processor.tracked_plates.clear()
                                processor.tracked_vehicles.clear()
                                processor.current_vehicles.clear()
                                processor.current_persons.clear()
                                processor.active_in_roi = False
                        time.sleep(0.1)
                        continue

                    frame = reader.get_latest()
                    if frame is None:
                        time.sleep(0.01)
                        continue

                    last_inference = time.monotonic()
                    processed += 1

                    annotated_frame, events = processor.process_frame(frame, draw_overlay=display_window)

                    # Khi có sự kiện xe mới: đẩy ngay sang luồng ngầm để nén ảnh JPEG và gửi webhook
                    if events:
                        event_list = events if isinstance(events, list) else [events]
                        for ev in event_list:
                            threading.Thread(
                                target=self._async_handle_event,
                                args=(camera_id, camera_name, ev, frame.copy()),
                                daemon=True
                            ).start()

                    if display_window:
                        try:
                            cv2.imshow(f"ALPR Camera #{camera_id} - {camera_name}", annotated_frame)
                            if cv2.waitKey(1) & 0xFF == ord("q"):
                                break
                        except Exception:
                            display_window = False

                    if processed % 120 == 0:
                        fps_val = processed / max(0.001, time.time() - t_start)
                        with processor._state_lock:
                            active_tracks = len(processor.tracked_plates)
                        mode_str = "BURST" if has_urgent else ("ACTIVE" if is_active else "IDLE")
                        print(f"  [AI-ENGINE] [{camera_name}] AI Speed: {fps_val:.1f} FPS ({mode_str}) | Display: 30.0 FPS SSE/WS | Đang bám: {active_tracks} mục tiêu")

                    del frame

                except Exception as frame_ex:
                    print(f"⚠️ [AI-ENGINE-RECOVER] Lỗi xử lý frame camera #{camera_id} ({camera_name}): {frame_ex}")
                    time.sleep(0.02)

        finally:
            loop_stop.set()
            with PROCESSORS_LOCK:
                ACTIVE_PROCESSORS.pop(camera_id, None)
            reader.stop()
            if display_window:
                try:
                    cv2.destroyWindow(f"ALPR Camera #{camera_id} - {camera_name}")
                except Exception:
                    pass

    def run_bulk_workers(
        self,
        frame_skip: int = 3,
        cooldown_sec: float = 15.0,
        detector_conf: float = 0.20,
        min_ocr_conf: float = 70.0,
        display_window: bool = False,
        web_port: int = 5000
    ):
        """
        Tự động kết nối hàng loạt tất cả camera đang hoạt động trong hệ thống Spring Boot:
        1. Gọi GET /api/cameras để lấy toàn bộ danh sách camera và URL RTSP.
        2. Khởi tạo mô hình YOLOX + ONNX LPR dùng chung một lần duy nhất (tiết kiệm RAM tối đa).
        3. Khởi chạy luồng độc lập đọc RTSP + bám biển số cho từng camera.
        4. Mở SSE metadata và REST API /api/detections cho Frontend.
        """
        try:
            start_sse_server(port=web_port)
            print(f"\n📡 [AI SSE & REST API ĐÃ BẬT] Cổng {web_port}")
            print(f"   👉 SSE Bám biển số:  http://localhost:{web_port}/tracking-events")
            print(f"   👉 REST Detections:  http://localhost:{web_port}/api/detections\n")
        except Exception as e:
            print(f"[CẢNH BÁO] Không thể bật SSE Server cổng {web_port}: {e}")

        # Nạp mô hình dùng chung 1 lần (tiết kiệm GPU/CPU RAM)
        shared_detector = None
        shared_ocr = None
        shared_vehicle_detector = None
        if YOLOXPlateDetector is not None:
            print("[INFO] Đang nạp mô hình AI dùng chung (100% thuần ONNX Runtime)...")
            try:
                # TẦNG 1: Vehicle & Object Detector (object_det.onnx)
                if OnnxObjectDetector is not None:
                    try:
                        shared_vehicle_detector = OnnxObjectDetector()
                        print(f"✅ Nạp mô hình SdkInfer Object/Vehicle Detector thành công (TẦNG 1: object_det.onnx)!")
                        print(f"   👉 Object Detector Provider: {shared_vehicle_detector.active_provider}")
                    except Exception as err:
                        print(f"⚠️ Không thể nạp OnnxObjectDetector: {err}")

                # TẦNG 2: Plate Detector (plate_det.onnx)
                shared_detector = YOLOXPlateDetector()
                det_provider = getattr(shared_detector, "active_provider", "Unknown")

                # TẦNG 3 + 4: Line Detector & PP-OCR Recognizer (plate_line.onnx + plate_rec.onnx + plate_rec.yml)
                # ENGINE DUY NHẤT: ONNX Runtime (VietOCR đã bị loại bỏ khỏi hệ thống).
                if OnnxLprEngine is not None:
                    try:
                        shared_ocr = OnnxLprEngine()
                        ocr_provider = getattr(shared_ocr.recognizer, "active_provider", "Unknown")
                        print(f"✅ Nạp mô hình SdkInfer ONNX LPR thành công (100% Thuần ONNX Runtime)!")
                        print(f"   👉 Plate Detector Provider: {det_provider}")
                        print(f"   👉 Line & OCR Provider:     {ocr_provider} (PP-OCRv6 CTC)")
                    except Exception as err:
                        print(f"❌ Không thể nạp OnnxLprEngine: {err}")
                        print(f"   Kiểm tra models/ (plate_line.onnx, plate_rec.onnx, plate_rec.yml) và onnxruntime.")
                        shared_ocr = None
                else:
                    print(f"❌ OnnxLprEngine không khả dụng (import thất bại). Không thể chạy nhận diện.")
                    shared_ocr = None

                default_threads = str(min(6, max(4, (os.cpu_count() or 4) // 2)))
                cpu_threads = os.getenv("AI_CPU_THREADS", default_threads)
                print(f"   👉 Cấu hình số luồng CPU:        {cpu_threads}")

                # ============================================================
                # BANNER GPU/CPU (Q1: "có GPU NVIDIA thì chạy GPU, không thì CPU")
                # ============================================================
                onnx_providers = "Không rõ (không nạp ONNX)"
                try:
                    import onnxruntime as _ort
                    avail = _ort.get_available_providers()
                    onnx_providers = ", ".join(avail)
                except Exception:
                    pass
                has_cuda = "CUDAExecutionProvider" in onnx_providers
                forced_cpu = os.getenv("AI_FORCE_CPU", "0") in ("1", "true", "True") or \
                    os.getenv("AI_USE_GPU", "").lower() in ("0", "false", "no")
                on_gpu = has_cuda and not forced_cpu

                ocr_mode = os.getenv("AI_OCR_MAX_TOTAL", "0")
                pool_threads = int(ocr_mode) if int(ocr_mode) > 0 else 0
                cores = os.cpu_count() or 8

                print("\n" + "=" * 78)
                print("🖥️  [THIẾT BỊ AI] Chạy trên " + ("GPU (NVIDIA CUDA)" if on_gpu else "CPU"))
                if on_gpu:
                    print(f"   ONNX Runtime tự phát hiện CUDAExecutionProvider -> đẩy inference lên GPU.")
                    print(f"   👉 Pool OCR async: {pool_threads if pool_threads else 'TẮT (sync)'} thread | "
                          f"CPU cores: {cores} | AI_CPU_THREADS: {cpu_threads}")
                else:
                    if has_cuda:
                        print("   👉 GPU CÓ SẴN nhưng đang BỊ ÉP CHẠY CPU (AI_FORCE_CPU=1 hoặc AI_USE_GPU=0).")
                        print("      Muốn chạy GPU: bỏ 2 env đó (mặc định = auto sẽ chọn GPU).")
                    else:
                        print("   👉 Chưa có CUDAExecutionProvider -> CHẠY TRÊN CPU (thiếu onnxruntime-gpu/CUDA).")
                        print("      Muốn chạy GPU: build Docker USE_GPU=1 (requirements-gpu.txt) + card NVIDIA.")
                    print(f"   👉 Pool OCR async: {pool_threads if pool_threads else 'TẮT (sync)'} thread | CPU cores: {cores}")
                print("=" * 78 + "\n")

            except Exception as ex:
                print(f"[CẢNH BÁO] Không thể nạp mô hình AI: {ex}")

        ensure_mediamtx_running()

        stop_event = threading.Event()
        # workers: Dict[cam_id -> (name, reader, thread, stop_event)] liên kết với GLOBAL_CAMERA_WORKERS
        workers: Dict[int, Tuple[str, Any, threading.Thread, threading.Event]] = GLOBAL_CAMERA_WORKERS

        print("\n" + "=" * 80)
        print("🚀 KÍCH HOẠT TIẾN TRÌNH AI BÁM BIỂN SỐ VÀ CẤU HÌNH VÙNG KHUNG ẢO (BULK MODE)")
        print(f"👉 API Cấu hình Khung ảo ROI: http://localhost:{web_port}/api/roi-config")
        print(f"👉 SSE Bám biển số:           http://localhost:{web_port}/tracking-events")
        print(f"👉 Frontend React:            http://localhost:5173")
        print("=" * 80 + "\n")

        last_warn_time = 0.0

        try:
            while not stop_event.is_set():
                cams = self.fetch_cameras()
                now = time.time()
                if not cams:
                    if not self.is_backend_connected:
                        if now - last_warn_time > 15.0:
                            print(f"⚠️ [LỖI KẾT NỐI BE] Không thể kết nối Backend Spring Boot ({self.backend_url}/api/cameras): {self.last_fetch_error}. Đang thử lại sau 10s...")
                            last_warn_time = now
                    else:
                        if now - last_warn_time > 15.0:
                            print(f"✅ [KẾT NỐI BE THÀNH CÔNG] Đã kết nối Spring Boot ({self.backend_url}/api/cameras) nhưng CSDL chưa có Camera nào. Đang đợi tạo Camera mới trên Web...")
                            last_warn_time = now
                    time.sleep(10.0)
                    continue

                # Lọc danh sách camera đang active và ĐƯỢC GÁN PHÂN HỆ NHẬN DIỆN BIỂN SỐ XE (VEHICLE_ANPR)
                active_cam_map: Dict[int, Dict[str, Any]] = {}
                for c in cams:
                    c_id = int(c.get("id", 1))
                    is_active = c.get("active")
                    if is_active is None:
                        is_active = c.get("isActive", True)
                    status_str = str(c.get("status", "")).upper()
                    # Bỏ qua nếu camera bị vô hiệu hóa hoặc đánh dấu không hoạt động
                    if is_active is False or status_str == "INACTIVE":
                        continue

                    # KẾT NỐI VỚI CẤU HÌNH GÁN MODULE AI:
                    # Chỉ khởi chạy ALPR nếu Camera được cấu hình BẬT phân hệ VEHICLE_ANPR
                    active_mods = c.get("activeAiModules")
                    if active_mods is not None and isinstance(active_mods, list):
                        if "VEHICLE_ANPR" not in active_mods:
                            # Camera này bị TẮT AI hoặc chỉ gán phân hệ khác (FaceID, PPE...) -> không chạy ALPR
                            continue

                    active_cam_map[c_id] = c

                # 1. DỌN DẸP / DỪNG TIẾN TRÌNH AI CHO CÁC CAMERA ĐÃ BỊ TẮT HOẶC BỎ GÁN MODULE ALPR
                for wid in list(workers.keys()):
                    if wid not in active_cam_map:
                        old_name, old_reader, old_thread, old_stop = workers.pop(wid)
                        print(f"🛑 [DỪNG TIẾN TRÌNH AI] Camera #{wid} ('{old_name}') đã bị TẮT hoặc bỏ gán Module ALPR -> Dừng tiến trình AI!")
                        old_stop.set()
                        try:
                            old_reader.stop()
                        except Exception:
                            pass
                        with PROCESSORS_LOCK:
                            ACTIVE_PROCESSORS.pop(wid, None)
                        # Phát bản tin xóa sạch khung vẽ & badge trên giao diện Web
                        broadcast_tracking_events({
                            "cameraId": wid,
                            "cameraName": old_name,
                            "frameWidth": 960,
                            "frameHeight": 540,
                            "fps": 0.0,
                            "activeInRoi": False,
                            "roi": [],
                            "tripwire": [],
                            "lanes": [],
                            "tracks": [],
                            "status": "OFFLINE"
                        })

                # 2. KHỞI CHẠY TIẾN TRÌNH AI CHO CÁC CAMERA ĐANG ACTIVE
                for cam_id, c in active_cam_map.items():
                    if cam_id in workers:
                        old_name, old_reader, old_thread, old_stop = workers[cam_id]
                        if old_thread.is_alive():
                            continue
                        print(f"⚠️ [RESTART-CAM] Phát hiện luồng Camera #{cam_id} ('{old_name}') đã dừng, tiến hành khởi động lại ngay!")
                        try:
                            old_stop.set()
                            old_reader.stop()
                        except Exception:
                            pass

                    cam_name = str(c.get("name", f"Camera #{cam_id}"))
                    stream_path = str(c.get("streamPath", f"cam_{cam_id}"))

                    # Ưu tiên số 1: Luồng phụ Sub-stream nếu người dùng có cấu hình
                    sub_stream = c.get("rtspSubStreamUrl")
                    if sub_stream and str(sub_stream).strip():
                        rtsp_source = str(sub_stream).strip()
                    else:
                        rtsp_source = c.get("rtspRelayUrl") or c.get("rtspSourceUrl")
                    if not rtsp_source:
                        rtsp_source = f"{self.mediamtx_rtsp_url}/{stream_path}"

                    if isinstance(rtsp_source, str) and rtsp_source.startswith("rtsp://") and not ("localhost" in rtsp_source or "127.0.0.1" in rtsp_source or "mediamtx" in rtsp_source):
                        register_stream_in_mediamtx(stream_path, rtsp_source)
                        stream_for_ai = f"{self.mediamtx_rtsp_url}/{stream_path}"
                    else:
                        stream_for_ai = self.normalize_rtsp_for_docker(rtsp_source, stream_path)

                    print(f"  👉 [KẾT NỐI MỚI] Camera #{cam_id} ('{cam_name}') -> {stream_for_ai}")

                    max_frame_w = int(os.getenv("AI_FRAME_MAX_WIDTH", "960"))
                    direct_source = c.get("rtspSourceUrl")
                    fallback_src = direct_source if (direct_source and direct_source != stream_for_ai) else None
                    reader = LatestFrameReader(source=stream_for_ai, max_width=max_frame_w, fallback_source=fallback_src)
                    reader.start()

                    roi_polygon = get_roi_for_camera(cam_id)
                    eff_bulk_skip = int(os.getenv("AI_FRAME_SKIP", str(frame_skip)))
                    eff_bulk_conf = float(os.getenv("AI_DETECTOR_CONF", str(detector_conf)))
                    eff_bulk_ocr = float(os.getenv("AI_MIN_OCR_CONF", str(min_ocr_conf)))
                    eff_bulk_cd = float(os.getenv("AI_COOLDOWN_SEC", str(cooldown_sec)))

                    processor = VideoALPRProcessor(
                        detector=shared_detector,
                        ocr=shared_ocr,
                        vehicle_detector=shared_vehicle_detector,
                        roi_polygon=roi_polygon,
                        frame_skip=eff_bulk_skip,
                        cooldown_sec=eff_bulk_cd,
                        detector_conf=eff_bulk_conf,
                        min_ocr_conf=eff_bulk_ocr,
                        tripwire=get_tripwire_for_camera(cam_id)
                    )

                    cam_stop_event = threading.Event()
                    t = threading.Thread(
                        target=self._camera_ai_loop,
                        args=(cam_id, cam_name, reader, processor, display_window, web_port, cam_stop_event),
                        daemon=True,
                        name=f"CameraWorker-{cam_id}"
                    )
                    t.start()
                    workers[cam_id] = (cam_name, reader, t, cam_stop_event)

                # Giãn cách 10 giây mới quét lại CSDL để phát hiện nếu người dùng thêm camera mới hoặc cần khởi động lại
                for _ in range(10):
                    if stop_event.is_set():
                        break
                    time.sleep(1.0)

        except KeyboardInterrupt:
            print("\n[INFO] Đang dừng tất cả các luồng camera...")
            stop_event.set()
            for _, (_, r, _, s) in workers.items():
                s.set()
                r.stop()
            print("Đã dừng an toàn.")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Bridge tích hợp AI Bám Biển Số với CameraStream Web")
    parser.add_argument("--cam", type=int, default=None, help="ID của Camera trong CSDL (để trống để tự động kết nối toàn bộ camera)")
    parser.add_argument("--source", type=str, default=None, help="Nguồn video cụ thể: 0 (webcam), RTSP URL hoặc file .mp4")
    parser.add_argument("--backend", type=str, default=DEFAULT_BACKEND_URL, help="URL Spring Boot Backend")
    parser.add_argument("--port", type=int, default=DEFAULT_WEB_PORT, help="Cổng Web Stream xem trực tiếp (mặc định 5000)")
    parser.add_argument("--conf", type=float, default=float(os.getenv("AI_DETECTOR_CONF", "0.20")), help="Ngưỡng phát hiện YOLOX (mặc định 0.20)")
    parser.add_argument("--ocr-conf", type=float, default=float(os.getenv("AI_MIN_OCR_CONF", "40.0")), help="Ngưỡng tin cậy ONNX LPR tối thiểu (mặc định 40.0)")
    parser.add_argument("--cooldown", type=float, default=float(os.getenv("AI_COOLDOWN_SEC", "15.0")), help="Thời gian khóa chống gửi lặp cùng biển số (giây)")
    parser.add_argument("--gui", action="store_true", help="Bật cửa sổ xem trực tiếp OpenCV (nếu máy có highgui)")
    parser.add_argument("--mock", action="store_true", help="Cho phép chạy video mô phỏng nếu không có camera")
    parser.add_argument("--test-event", action="store_true", help="Gửi ngay 1 sự kiện test thử lên Web để kiểm tra")

    args = parser.parse_args()

    bridge = CameraStreamBridge(backend_url=args.backend, mediamtx_rtsp_url=DEFAULT_MEDIAMTX_RTSP)

    if args.test_event:
        cam_id = args.cam or 39
        print(f"\n[KIỂM THỬ KẾT NỐI] Đang gửi 1 sự kiện xe '14C-405.58' tới Spring Boot (Camera #{cam_id})...")
        success = bridge.send_detection(
            camera_id=cam_id,
            plate_number="14C-405.58",
            confidence=0.88,
            vehicle_type="CAR"
        )
        if success:
            print("✅ Đã gửi thành công! Hãy mở giao diện 'CameraStream-FE' (VehicleAccessPanel) để xem xe xuất hiện!")
        else:
            print("❌ Chưa gửi được. Hãy đảm bảo Spring Boot 'CameraStream' đang chạy ở cổng 8080.")
        return

    # Nếu người dùng không chỉ định --cam hoặc --source -> TỰ ĐỘNG KẾT NỐI HÀNG LOẠT TOÀN BỘ CAMERA CÓ TRONG HỆ THỐNG
    if args.cam is None and args.source is None:
        eff_frame_skip = int(os.getenv("AI_FRAME_SKIP", "1"))
        bridge.run_bulk_workers(
            frame_skip=eff_frame_skip,
            cooldown_sec=args.cooldown,
            detector_conf=args.conf,
            min_ocr_conf=args.ocr_conf,
            display_window=args.gui,
            web_port=args.port
        )
    else:
        cam_id = args.cam if args.cam is not None else 1
        bridge.run_bridge_worker(
            camera_id=cam_id,
            stream_source=args.source,
            display_window=args.gui,
            web_port=args.port,
            enable_mock=args.mock,
            detector_conf=args.conf,
            min_ocr_conf=args.ocr_conf,
            cooldown_sec=args.cooldown
        )


if __name__ == "__main__":
    main()
