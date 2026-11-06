#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
KỊCH BẢN XỬ LÝ NHẬN DIỆN BIỂN SỐ CHO VIDEO & CAMERA THỜI GIAN THỰC (REAL-TIME VIDEO ALPR)
=======================================================================================
Thiết kế tối ưu theo chuẩn Bãi xe & Giao thông thông minh:
1. Khung ảo (Virtual ROI / Vòng từ ảo):
   - Đặt tại "vùng điểm vàng" (40% - 85% chiều dọc khung hình).
   - Chỉ kích hoạt khi biển số xe thực sự tiến vào vùng đón xe trước Barie.
2. Bộ lọc kích thước & Độ nét (Sharpness / Resolution Gate):
   - Chỉ kích hoạt khi chiều rộng biển số >= 75px (xe đã đủ gần, không quét khi xe còn ở xa tít tắp).
3. Cơ chế Khóa & Chống quét lặp (Cooldown & Deduplication):
   - Khi đã đọc thành công 1 xe (ví dụ: '14C-405.58'), hệ thống KHÓA lại trong 3 - 5 giây.
   - Tránh việc 1 chiếc xe dừng chờ mở barie bị quét lại 30 lần/giây gây nghẽn CPU.
4. Bỏ qua khung hình thông minh (Frame Skipping):
   - Luồng video vẫn hiển thị mượt mà 30 FPS.
   - Luồng YOLOX chỉ lấy mẫu mỗi 3 - 5 frames để tiết kiệm 70% CPU/GPU.
5. Ghi nhận nhật ký sự kiện (Event Logging):
   - Chụp snapshot ảnh xe lúc vào vùng kích hoạt.
   - Ghi nhận thời gian, biển số, độ tin cậy và xuất ra file JSON/CSDL.
"""

import os
import re
import sys
import time
import math
import queue
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any, Set, Union, Sequence

import cv2
import numpy as np
from PIL import Image

# Định vị thư mục
CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent if CURRENT_DIR.name == "core" else CURRENT_DIR
BASE_DIR = AI_SERVICE_DIR
MODLE_ROOT = AI_SERVICE_DIR.parent.parent / "MODLE_LICIENSEPLATE"
if not MODLE_ROOT.exists():
    MODLE_ROOT = BASE_DIR

for p in (AI_SERVICE_DIR / "native_modules", AI_SERVICE_DIR, CURRENT_DIR, AI_SERVICE_DIR / "core", AI_SERVICE_DIR / "utils"):
    if p.exists() and str(p) not in sys.path:
        sys.path.insert(0, str(p))

import gc
# ENGINE DUY NHẤT: ONNX Runtime (SdkInfer). VietOCR đã bị loại bỏ -> 100% thuần ONNX.
try:
    from core.plate_detector_deskew import YOLOXPlateDetector, deskew_and_rectify
    from core.onnx_lpr_engine import OnnxLprEngine, OnnxObjectDetector
except ImportError:
    from plate_detector_deskew import YOLOXPlateDetector, deskew_and_rectify
    try:
        from onnx_lpr_engine import OnnxLprEngine, OnnxObjectDetector
    except ImportError:
        OnnxLprEngine = None
        OnnxObjectDetector = None

try:
    from utils.image_utils import preprocess_for_ocr, imwrite_unicode, recover_glare_image
    from utils.plate_validator import validate_vietnam_plate, format_plate_display, clean_plate_text
except ImportError:
    from image_utils import preprocess_for_ocr, imwrite_unicode, recover_glare_image
    from plate_validator import validate_vietnam_plate, format_plate_display, clean_plate_text

try:
    from core._frame_sync import filter_ocr_result
except Exception:
    try:
        from _frame_sync import filter_ocr_result
    except Exception:
        def filter_ocr_result(t, c):
            return t, c

# OCR WORKER POOL + BENCHMARK (đa luồng, dùng chung 1 ONNX engine).
# Import an toàn: pool dùng OcrWorkerPool/OcrBenchmark; tắt (sync) khi AI_OCR_MAX_TOTAL=0.
try:
    from core.ocr_worker_pool import OcrBenchmark, get_ocr_pool
except ImportError:
    from ocr_worker_pool import OcrBenchmark, get_ocr_pool  # type: ignore

# BYTETRACK TRACKER (2-stage + Kalman CV, thuần NumPy). Toggle AI_TRACKER, mặc định legacy.
try:
    from core.bytetrack_tracker import ByteTrackTracker, dets_from_plate_detections
except ImportError:
    from bytetrack_tracker import ByteTrackTracker, dets_from_plate_detections  # type: ignore


def compute_iou(boxA: List[int], boxB: List[int]) -> float:
    """Tính Intersection-over-Union (IoU) giữa 2 bounding box [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interW = max(0, xB - xA)
    interH = max(0, yB - yA)
    interArea = interW * interH
    boxAArea = max(1, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    boxBArea = max(1, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))
    unionArea = float(boxAArea + boxBArea - interArea)
    return interArea / unionArea if unionArea > 0 else 0.0


CONFUSION_PAIRS: Set[Tuple[str, str]] = {
    ('3', '8'), ('8', '3'),
    ('0', '8'), ('8', '0'),
    ('0', 'D'), ('D', '0'),
    ('0', 'O'), ('O', '0'),
    ('0', 'Q'), ('Q', '0'),
    ('5', '6'), ('6', '5'),
    ('5', '9'), ('9', '5'),
    ('6', '8'), ('8', '6'),
    ('1', '7'), ('7', '1'),
    ('1', 'I'), ('I', '1'),
    ('1', 'T'), ('T', '1'),
    ('2', 'Z'), ('Z', '2'),
    ('B', '8'), ('8', 'B'),
    ('4', 'A'), ('A', '4'),
    ('2', '7'), ('7', '2'),
    ('0', '9'), ('9', '0')
}


def are_similar_plates(p1: str, p2: str) -> bool:
    """
    Kiểm tra 2 biển số có phải là cùng 1 biển số vật lý bị nhiễu quang học 1 ký tự hay không.
    Tuyệt đối KHÔNG gộp nhầm 2 biển số khác nhau xuất hiện liên tiếp hoặc song song trong cùng camera!
    """
    c1 = clean_plate_text(p1)
    c2 = clean_plate_text(p2)
    if not c1 or not c2:
        return False
    if c1 == c2:
        return True

    # Chênh lệch độ dài > 1 ký tự chắc chắn là 2 biển số khác nhau
    if abs(len(c1) - len(c2)) > 1:
        return False

    # Nếu lệch đúng 1 ký tự (do lẹm mép 1 ký tự đầu/cuối): chỉ coi là cùng biển nếu chuỗi ngắn nằm trọn trong chuỗi dài
    if len(c1) != len(c2):
        short_s, long_s = (c1, c2) if len(c1) < len(c2) else (c2, c1)
        return len(short_s) >= 7 and (long_s.startswith(short_s) or long_s.endswith(short_s))

    # Cùng độ dài: đếm số vị trí khác nhau và kiểm tra cặp nhầm lẫn quang học (Confusion Pairs)
    diff_count = 0
    confusion_diffs = 0
    for ch1, ch2 in zip(c1, c2):
        if ch1 != ch2:
            diff_count += 1
            if (ch1, ch2) in CONFUSION_PAIRS:
                confusion_diffs += 1

    # Chỉ coi là cùng 1 biển nếu:
    # 1) Khác đúng 1 ký tự và ký tự đó nằm trong bảng nhầm lẫn quang học (VD: 8 <-> B, 0 <-> D, 3 <-> 8)
    if diff_count == 1 and confusion_diffs == 1:
        return True

    # 2) Hoặc trùng khớp hoàn toàn 5 số cuối (số thứ tự đăng ký xe) và chỉ lệch 1 ký tự ở phần đầu (seri/tỉnh)
    if len(c1) >= 7 and c1[-5:] == c2[-5:] and diff_count == 1:
        return True

    return False


def classify_vehicle(
    hint_type: Optional[str] = None,
    vbox: Optional[Sequence[int]] = None,
    plate_text: Optional[str] = None,
    plate_bbox: Optional[Sequence[int]] = None
) -> str:
    """Xác định chính xác loại phương tiện (CAR, TRUCK, BUS, MOTO, PERSON).
    Ưu tiên 100% nhãn nhận diện trực tiếp từ module AI (object_det.onnx).
    Chỉ dùng fallback khi camera không nạp được model hoặc không thấy thân xe."""
    # 1. Ưu tiên số 1: Kết quả nhận diện trực quan từ mô hình AI Tầng 1 (object_det.onnx)
    if hint_type:
        ht = hint_type.upper().strip()
        if ht in ("TRUCK", "VAN", "LORRY", "PICKUP"):
            return "TRUCK"
        if ht in ("BUS", "COACH"):
            return "BUS"
        if ht in ("MOTORCYCLE", "MOTO", "BIKE", "BICYCLE", "SCOOTER"):
            return "MOTO"
        if ht == "PERSON":
            return "PERSON"
        if ht in ("CAR", "SUV", "SEDAN", "AUTOMOBILE", "VEHICLE"):
            return "CAR"
        return ht

    # 2. Fallback dự phòng: Kiểm tra theo kích thước thân xe (vbox) nếu có
    if vbox and len(vbox) >= 4:
        vw = max(1, vbox[2] - vbox[0])
        vh = max(1, vbox[3] - vbox[1])
        area = vw * vh
        if area > 35000 or vw > 160 or vh > 150:
            return "CAR"
        if vw < 120 and vh < 150:
            return "MOTO"

    # 3. Fallback dự phòng cuối cùng: Dạng biển số (chỉ áp dụng khi không có thân xe)
    if plate_text:
        clean = re.sub(r'[^A-Z0-9]', '', plate_text.upper())
        if len(clean) >= 7:
            if re.match(r'^\d{2}[A-Z]\d{4,5}$', clean):
                return "CAR"
            if re.match(r'^\d{2}[A-Z][0-9A-Z]\d{3,5}$', clean):
                return "MOTO"

    # 4. Fallback mặc định
    return "CAR"


def calculate_sharpness(img_bgr: np.ndarray) -> float:
    """
    Đo độ nét của ảnh biển số bằng phương sai toán tử Laplacian (Laplacian Variance).
    Nếu camera đang lia/di chuyển nhanh, độ nét sẽ giảm mạnh (thường < 65.0).
    """
    if img_bgr is None or img_bgr.size == 0:
        return 0.0
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


class TrackedPlate:
    """
    Đối tượng lưu vết biển số (Object Tracker - Bám biển theo thời gian thực):
    - Làm mịn tọa độ bounding box qua các khung hình để chuyển động mượt mà (EMA).
    - Lưu giữ biển số đã nhận diện để không phải quét lại nhiều lần gây nghẽn.
    - Đảm bảo mỗi lượt xe vào chỉ kích hoạt sự kiện gửi lên Web duy nhất 1 lần.
    """
    def __init__(self, track_id: int, bbox: List[int], confidence: float):
        self.track_id = track_id
        self.bbox = list(bbox)
        self.smooth_bbox = [float(x) for x in bbox]
        self.det_conf = confidence
        self.plate_text: Optional[str] = None
        self.ocr_conf: float = 0.0
        self.ocr_attempted: bool = False
        self.ocr_attempts: int = 0
        self.last_ocr_frame: int = 0
        self.event_sent: bool = False
        self.frames_lost: int = 0
        self.hits: int = 1
        self.first_seen: float = time.time()
        self.last_seen: float = time.time()
        # Tâm ban đầu (chỉ dùng cho lớp hiển thị AI_TRACK_V2: phát hiện vật thể tĩnh đã chốt event)
        self.init_center: Tuple[float, float] = ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)
        # Vận tốc chuyển động (vx, vy) theo pixel / khung hình
        self.vx: float = 0.0
        self.vy: float = 0.0
        # Bộ bỏ phiếu xác nhận biển số qua các khung hình (Temporal Voting Gate)
        self.plate_votes: Dict[str, int] = {}
        self.best_candidate_conf: float = 0.0
        self.best_candidate_plate: str = ""
        # Best-Shot Selection: giữ lại khung hình tốt nhất của lượt xe này (nét + biển to + OCR tin cậy)
        self.best_score: float = -1.0
        self.best_crop: Optional[np.ndarray] = None
        self.best_frame: Optional[np.ndarray] = None
        self.best_angle: float = 0.0
        # Tripwire: tâm biển ở khung trước và cờ đã cắt vạch ảo
        self.prev_center: Optional[Tuple[float, float]] = None
        self.crossed: bool = False
        self.ever_in_roi: bool = False
        # Gán làn xe (Multi-lane)
        self.lane_id: Optional[str] = None
        self.lane_name: Optional[str] = None
        # Thông tin phương tiện từ TẦNG 1 (object_det.onnx)
        self.vehicle_type: Optional[str] = None
        self.vehicle_bbox: Optional[List[int]] = None
        self.vehicle_conf: float = 0.0
        self.vehicle_label: Optional[str] = None
        # Cờ OCR đang chạy trên worker (async pool) - chống submit trùng 1 biển
        self.ocr_pending: bool = False

    def release_best_shot(self):
        """Giải phóng ảnh best-shot khỏi RAM sau khi đã chốt event."""
        self.best_crop = None
        self.best_frame = None

    def update(self, bbox: List[int], confidence: float):
        old_cx = (self.smooth_bbox[0] + self.smooth_bbox[2]) / 2.0
        old_cy = (self.smooth_bbox[1] + self.smooth_bbox[3]) / 2.0
        new_cx = (bbox[0] + bbox[2]) / 2.0
        new_cy = (bbox[1] + bbox[3]) / 2.0

        # Cập nhật vận tốc chuyển động tức thời
        # Chuẩn hóa theo số frame trôi qua (frames_lost + 1) để không bị nhân khống vận tốc
        elapsed_frames = max(1, self.frames_lost + 1)
        inst_vx = (new_cx - old_cx) / float(elapsed_frames)
        inst_vy = (new_cy - old_cy) / float(elapsed_frames)

        # Giới hạn vận tốc cực đại tránh overshoot khi người dùng lia camera đột ngột
        max_vel = 20.0
        inst_vx = max(-max_vel, min(max_vel, inst_vx))
        inst_vy = max(-max_vel, min(max_vel, inst_vy))

        self.vx = 0.5 * inst_vx + 0.5 * self.vx
        self.vy = 0.5 * inst_vy + 0.5 * self.vy

        # Bám sát biển (Tight Bounding Box):
        # Bbox từ plate_det.onnx là vị trí thực tế của biển số trên frame này.
        # Nếu đang dịch chuyển hoặc camera lia (diff > 3px): snap bám sát tức thì (alpha=0.92) để không trễ/lệch.
        # Nếu đứng yên (diff <= 3px): alpha=0.75 để loại bỏ rung lắc vi mô (sub-pixel jitter).
        diff = max(abs(bbox[i] - self.smooth_bbox[i]) for i in range(4))
        alpha = 0.92 if diff > 3.0 else 0.75

        for i in range(4):
            self.smooth_bbox[i] = alpha * bbox[i] + (1.0 - alpha) * self.smooth_bbox[i]
        self.bbox = [round(x) for x in self.smooth_bbox]
        self.det_conf = confidence
        self.frames_lost = 0
        self.hits += 1
        self.last_seen = time.time()

    def apply_predicted_box(self, pred_box: List[float]):
        """Giữ nguyên toạ độ ổn định từ detection thực tế, không di chuyển hộp bằng Kalman ảo khi không có detection."""
        pass

    def predict_step(self, damping: float = 0.92):
        """Giữ nguyên toạ độ ổn định từ detection thực tế, tuyệt đối KHÔNG cộng quán tính vận tốc ảo làm trôi dạt khung ra đường trống."""
        pass

    def get_predicted_bbox(self) -> List[float]:
        """Trả về toạ độ thực tế ổn định cuối cùng để so khớp detection"""
        return list(self.smooth_bbox)


class VideoALPRProcessor:
    def __init__(
        self,
        yolox_weights: Optional[str] = None,
        roi_polygon: Optional[List[Tuple[float, float]]] = None,
        frame_skip: int = 3,
        cooldown_sec: float = 15.0,
        detector_conf: float = 0.20,
        min_ocr_conf: float = 70.0,
        min_plate_width: int = 14,
        events_dir: Optional[Union[Path, str]] = None,
        detector: Optional[Any] = None,
        ocr: Optional[Any] = None,
        vehicle_detector: Optional[Any] = None,
        tripwire: Optional[List[Tuple[float, float]]] = None,
        lanes: Optional[List[Dict[str, Any]]] = None,
        outdoor_mode: bool = False
    ):
        """
        Khởi tạo Bộ xử lý Video ALPR Chuẩn Công Nghiệp (100% thuần ONNX Runtime):
        :param detector_conf: Ngưỡng phát hiện YOLOX (0.40 tối ưu cho cả biển xe máy lẫn ô tô trong vùng đón xe).
        :param min_ocr_conf: Ngưỡng tin cậy tối thiểu của ONNX LPR (70% kết hợp kiểm định quy chuẩn 100% biển VN).
        :param cooldown_sec: Thời gian khóa tránh gửi lặp cùng 1 biển số (mặc định 15 giây).
        :param min_plate_width: Chiều rộng biển số tối thiểu (pixel) để bắt đầu nhận diện (32px phù hợp độ phân giải 960p).
        :param detector: Thể hiện YOLOXPlateDetector dùng chung (TẦNG 2: plate_det.onnx).
        :param ocr: Thể hiện OnnxLprEngine dùng chung (TẦNG 3 + 4: plate_line + plate_rec).
        :param vehicle_detector: Thể hiện OnnxObjectDetector dùng chung (TẦNG 1: object_det.onnx).
        :param lanes: Danh sách các làn độc lập [{id, name, roi}] (Multi-lane).
        :param outdoor_mode: Bật chế độ xử lý xe đường ngoài trời chạy tốc độ 30-60 km/h.
        """
        # TẦNG 1: NHẬN DIỆN XE VÀ NGƯỜI (object_det.onnx)
        if vehicle_detector is not None:
            self.vehicle_detector = vehicle_detector
        else:
            if OnnxObjectDetector is not None:
                try:
                    self.vehicle_detector = OnnxObjectDetector()
                    print("[INFO] Đang nạp mô hình TẦNG 1: OnnxObjectDetector (object_det.onnx)...")
                except Exception as ex:
                    print(f"[CẢNH BÁO] Không thể nạp OnnxObjectDetector ({ex}), bỏ qua Tầng 1...")
                    self.vehicle_detector = None
            else:
                self.vehicle_detector = None

        # TẦNG 2: PHÁT HIỆN BIỂN SỐ (plate_det.onnx)
        if detector is not None:
            self.detector = detector
        else:
            print("[INFO] Đang khởi tạo mô hình YOLOX Detection...")
            self.detector = YOLOXPlateDetector(weights_path=yolox_weights)

        # TẦNG 3 + 4: TÁCH DÒNG VÀ GIẢI MÃ KÝ TỰ (plate_line.onnx + plate_rec.onnx + plate_rec.yml)
        if ocr is not None:
            self.ocr = ocr
        else:
            # ENGINE DUY NHẤT: ONNX LPR (SdkInfer). VietOCR đã bị loại bỏ khỏi hệ thống.
            if OnnxLprEngine is not None:
                try:
                    self.ocr = OnnxLprEngine()
                    print("[INFO] Đang nạp mô hình ONNX LPR (TẦNG 3 + 4: plate_line + plate_rec)...")
                except Exception as ex:
                    raise RuntimeError(
                        f"Không thể nạp OnnxLprEngine ({ex}). Hệ thống cần ONNX Runtime + "
                        f"trọng số trong models/ (object_det/plate_det/plate_line/plate_rec.onnx)."
                    ) from ex
            else:
                raise RuntimeError(
                    "OnnxLprEngine không khả dụng: hệ thống chỉ chạy thuần ONNX, "
                    "không còn engine dự phòng. Kiểm tra onnx_lpr_engine.py và models/."
                )

        self.current_vehicles: List[Dict[str, Any]] = []
        self.current_persons: List[Dict[str, Any]] = []

        # Cấu hình Vùng Khung Ảo (Tỷ lệ tương đối theo W, H của video)
        # Bao quát khu vực mặt bàn/vùng xe đỗ (từ 38% đến 98% chiều cao)
        self.roi_normalized = roi_polygon or [
            (0.04, 0.38),  # Điểm trên - trái
            (0.96, 0.38),  # Điểm trên - phải
            (0.98, 0.98),  # Điểm dưới - phải
            (0.02, 0.98),  # Điểm dưới - trái
        ]

        self.lanes: List[Dict[str, Any]] = lanes or []
        self.outdoor_mode = outdoor_mode or (os.getenv("AI_OUTDOOR_MODE", "0") in ("1", "true", "True"))
        # Số track tối đa bám cùng lúc (đa biển/đa xe). Ép qua env AI_MAX_TRACKS nếu cần.
        _default_max_tracks = 12 if self.outdoor_mode else 6
        self.max_tracks = int(os.getenv("AI_MAX_TRACKS", str(_default_max_tracks)))
        # Giới hạn số biển số gọi OCR trong 1 frame (chống nghẽn khi nhiều xe cùng qua).
        # Các track còn lại sẽ đến lượt ở frame kế; state (last_ocr_frame, plate_votes) được giữ.
        self.ocr_per_frame = int(os.getenv("AI_OCR_PER_FRAME", "3"))
        # BẬT BỘ ĐỆM GIẢM SỐC (Warm Pre-tracking): AI vẫn theo dõi và giải mã biển số ngầm từ xa ngoài ROI
        # để khi xe lăn bánh vào ROI là có sẵn biển số ngay lập tức (chỉ vẽ khung & chụp khi vào trong ROI).
        self.track_outside_roi = os.getenv("AI_TRACK_OUTSIDE_ROI", "1") in ("1", "true", "True")
        # TỐI ƯU TIER-1 (on-demand, Fix 2): object_det.onnx tốn ~136ms/detector-frame (CPU) nhưng
        # CHỈ dùng để phân loại xe (CAR/MOTO/TRUCK/BUS) — KHÔNG phải để đọc biển. Với cam cố định
        # 1 dòng (cam cổng), "xe đã có track + đã gán vehicle_type" là trạng thái ổn định -> không
        # cần chạy lại. Mặc định TẮT (bảo toàn 100% hành vi cũ); bật AI_TIER1_ON_DEMAND=1 để tiết
        # kiệm ~45% stack detector. An toàn: nếu có track CHƯA gán vehicle_type -> Tier-1 vẫn chạy.
        self.tier1_on_demand = os.getenv("AI_TIER1_ON_DEMAND", "1") in ("1", "true", "True")

        self.frame_skip = max(1, frame_skip)
        self.cooldown_sec = cooldown_sec
        self.detector_conf = max(0.18, float(os.getenv("AI_DETECTOR_CONF", str(detector_conf))))
        raw_ocr_env = float(os.getenv("AI_MIN_OCR_CONF", str(min_ocr_conf)))
        self.min_ocr_conf = raw_ocr_env if raw_ocr_env <= 1.0 else raw_ocr_env / 100.0
        self.min_plate_width = int(os.getenv("AI_MIN_PLATE_WIDTH", str(min_plate_width)))

        # Vạch ảo Tripwire (toạ độ chuẩn hóa 2 điểm). None = không dùng vạch, chốt event theo ROI như cũ.
        self.tripwire_normalized: Optional[List[Tuple[float, float]]] = (
            [tuple(p) for p in tripwire] if tripwire and len(tripwire) == 2 else None
        )

        # Thư mục lưu snapshot các lượt xe qua cổng
        self.events_dir = Path(events_dir) if events_dir else BASE_DIR / "events" / "video_logs"
        self.events_dir.mkdir(parents=True, exist_ok=True)
        self._last_prune_ts = 0.0
        self._prune_old_snapshots(force=True)

        # Trạng thái theo dõi thời gian thực
        self.frame_count = 0
        self.last_detection_time = 0.0
        self.last_detected_plate = ""
        self.last_plate_confidence = 0.0
        self.barrier_state = "CLOSED"  # CLOSED / OPEN
        self.barrier_open_until = 0.0
        self.active_in_roi = False

        # Bộ bám biển số đa mục tiêu (Multi-Object Tracker)
        self.tracked_plates: Dict[int, TrackedPlate] = {}
        # Bộ theo dõi thân xe tầng 1 (Vehicle Lifecycle Tracker) bảo toàn ID từ xa
        self.tracked_vehicles: Dict[int, Dict[str, Any]] = {}
        self.next_track_id = 1

        # Sổ bộ nhớ chống spam biển số lặp lại {cleaned_plate_number: last_sent_time}
        self.plate_cooldown_registry: Dict[str, float] = {}
        # Sổ khóa sự kiện theo Thân Xe vật lý (1 Xe = 1 Event duy nhất, không chặn xe mới nối đuôi)
        self.recent_vehicle_events: List[Dict[str, Any]] = []

        # Nhật ký sự kiện xe vào
        self.history_events: List[Dict[str, Any]] = []

        # --- OCR WORKER POOL (đa luồng, dùng chung 1 ONNX engine) ---
        # `self.pool` dùng chung 1 `OnnxLprEngine`; None = chạy SYNC (an toàn, default).
        # Worker thread CHỈ chạy deskew+enhance+ONNX (tinh khiết, không đụng state),
        # trả kết quả về `self._ocr_results` (queue thread-safe). LỘP CAMERA DUY NHẤT
        # đọc + áp dụng kết quả vào track -> KHÔNG có data race, không cần lock chéo.
        # `self.near_px` (AI_NEAR_PX, mặc định 160): chiều rộng biển >= ngưỡng này (hoặc đã
        # cắt tripwire) là FINE tier -> ưu tiên thread trước; biển nhỏ còn xa là COARSE.
        self.near_px = int(os.getenv("AI_NEAR_PX", "160"))
        self.cam_key: str = "local"
        self.bench = OcrBenchmark()
        self.pool = get_ocr_pool(self.ocr, bench=self.bench)
        self._ocr_results: "queue.Queue[Dict[str, Any]]" = queue.Queue()

        # --- TRACKER: association vehicle/plate (ByteTrack 2-stage + Kalman CV) ---
        # AI_TRACKER=legacy (mặc định, hành vi cũ 100%) | bytetrack (module mới, song song).
        # ByteTrack tracker chỉ lo association + prediction; state biển/event/OCR vẫn nằm
        # trong TrackedPlate. Per-camera (1 instance/processor), chạy sync trên detector-frame.
        # LUÔN init: legacy thì chỉ dùng làm sổ đăng ký (register/drop) cho debug log +
        # Kalman velocity; association + pruning vẫn là hành vi cũ 100%.
        self.tracker_mode = os.getenv("AI_TRACKER", "legacy").lower()
        self.bt = ByteTrackTracker()

        # AI_TRACK_V2 (mặc định OFF): chỉ tác động lớp HIỂN THỊ + vài ngưỡng matching khi xe đang chạy nhanh.
        # Không đổi state event/OCR/cooldown. Đo chu kỳ detector (EMA) để TTL ẩn khung thích ứng.
        self._last_det_ts: float = 0.0
        self._det_interval_ema: float = 0.25

        # DEBUG tracking (AI_TRACK_DEBUG=1): mỗi detector-frame emit 1 khối [TRK] dạng key=value.
        # Mặc định OFF -> khi off chỉ tốn 1 lần so cờ ở call-site, KHÔNG build string (gần như zero-cost).
        # Bật để chase ID-switch: xem track nào new/recovered/dead/lost và vx/vy/lost/hits.
        self.track_debug = os.getenv("AI_TRACK_DEBUG", "0").strip().lower() in ("1", "true", "yes")
        # Snapshot THẲNG (set ID) của plan bytetrack frame cuối (KHÔNG giữ dict kế hoạch):
        # dùng cho debug log [TRK] (đếm new/rec/lost/dead + tag từng track).
        self._last_bt_new: Set[int] = set()
        self._last_bt_recovered: Set[int] = set()
        self._last_bt_lost: Set[int] = set()
        self._last_bt_dead: Set[int] = set()
        # None khi AI_TRACKER=legacy (khi đó _associate_bytetrack không chạy -> _last_bt_plan
        # không bao giờ được gán; _debug_tracks đọc `self._last_bt_plan or {}` nên phải có sẵn,
        # nếu không AttributeError khi bật AI_TRACK_DEBUG ở chế độ legacy).
        self._last_bt_plan: Optional[Dict[str, Any]] = None

        # Khóa đồng bộ thread-safe giữa luồng hiển thị 30 FPS và luồng suy luận AI
        self._state_lock = threading.Lock()

        print("[INFO] Bộ xử lý Video ALPR đã sẵn sàng!")
        if self.pool is not None:
            print(f"[INFO] OCR pool: {os.getenv('AI_OCR_MAX_TOTAL')} thread (async, dùng chung ONNX engine)")
        print()

    def _get_pixel_roi(self, frame_w: int, frame_h: int) -> np.ndarray:
        """Chuyển đổi tọa độ tỷ lệ sang tọa độ pixel thực tế của khung hình."""
        pts = [[int(x * frame_w), int(y * frame_h)] for x, y in self.roi_normalized]
        return np.array(pts, dtype=np.int32)

    def _is_inside_roi(self, bbox: List[int], roi_pts: np.ndarray) -> bool:
        """Kiểm tra đối tượng có thực sự nằm trong hoặc chạm vùng ROI hay không.
        Chấp nhận đối tượng khi tâm (center), các góc hoặc điểm biên chạm đa giác ROI."""
        if roi_pts is None or len(roi_pts) < 3:
            return True
        x1, y1, x2, y2 = bbox
        center_x = (x1 + x2) / 2.0
        center_y = (y1 + y2) / 2.0

        # 1. Kiểm tra tâm hộp (chấp nhận dung sai -6.0 px sát mép vạch ROI)
        if cv2.pointPolygonTest(roi_pts, (center_x, center_y), True) >= -6.0:
            return True

        # 2. Kiểm tra các điểm biên và 4 góc hộp
        test_pts = [
            (center_x, float(y2)),
            (center_x, float(y1)),
            (float(x1), center_y),
            (float(x2), center_y),
            (float(x1), float(y1)),
            (float(x2), float(y2)),
            (float(x1), float(y2)),
            (float(x2), float(y1)),
        ]
        inside_pts = sum(1 for pt in test_pts if cv2.pointPolygonTest(roi_pts, pt, True) >= -2.0)

        # Chỉ cần tâm hoặc bất kỳ điểm biên nào chạm vào đa giác ROI là tính đã vào ROI
        if inside_pts >= 1:
            return True

        return False

    def is_track_in_roi(self, track: "TrackedPlate", roi_pts: np.ndarray) -> bool:
        """Kiểm tra toàn diện xem xe hoặc biển số của track này đã tiến vào vùng ROI hay chưa."""
        if self._is_inside_roi(track.bbox, roi_pts):
            return True
        if track.vehicle_bbox and self._is_inside_roi(track.vehicle_bbox, roi_pts):
            return True
        return False


    def _get_lane_for_bbox(self, bbox: List[int], frame_w: int, frame_h: int) -> Tuple[Optional[str], Optional[str]]:
        """Xác định bounding box thuộc làn nào trong danh sách Multi-lane."""
        if not self.lanes:
            return None, None
        for lane in self.lanes:
            l_roi = lane.get("roi")
            if l_roi and len(l_roi) >= 3:
                pts = np.array([[int(x * frame_w), int(y * frame_h)] for x, y in l_roi], dtype=np.int32)
                if self._is_inside_roi(bbox, pts):
                    return str(lane.get("id", "")), str(lane.get("name", ""))
        return None, None

    @staticmethod
    def _segments_intersect(p1, p2, p3, p4) -> bool:
        """Hai đoạn thẳng p1-p2 và p3-p4 có cắt nhau không (so sánh hướng của tích có hướng)."""
        def cross(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        d1 = cross(p3, p4, p1)
        d2 = cross(p3, p4, p2)
        d3 = cross(p1, p2, p3)
        d4 = cross(p1, p2, p4)
        return (d1 * d2 < 0) and (d3 * d4 < 0)

    def _update_tripwire_cross(self, track: "TrackedPlate", frame_w: int, frame_h: int):
        """Cập nhật cờ track.crossed khi tâm biển cắt qua vạch ảo giữa 2 khung liên tiếp."""
        x1, y1, x2, y2 = track.bbox
        center = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
        prev = track.prev_center
        track.prev_center = center
        if self.tripwire_normalized is None or track.crossed or prev is None:
            return
        a = (self.tripwire_normalized[0][0] * frame_w, self.tripwire_normalized[0][1] * frame_h)
        b = (self.tripwire_normalized[1][0] * frame_w, self.tripwire_normalized[1][1] * frame_h)
        if self._segments_intersect(prev, center, a, b):
            track.crossed = True
            # Ép OCR chạy ngay ở khung kế tiếp để chốt sự kiện kịp lúc xe còn trong tầm nhìn
            track.last_ocr_frame = 0

    def _log_health(self, interval_s: float = 300.0):
        """Log định kỳ (mặc định 5 phút/camera) kích thước các cấu trúc state + RSS process để theo dõi rò rỉ khi chạy lâu.
        Chỉ đọc số liệu, không đổi state; lỗi (vd thiếu psutil) bị nuốt để không ảnh hưởng luồng chính."""
        now_m = time.monotonic()
        if now_m - getattr(self, "_last_health_log", 0.0) < interval_s:
            return
        self._last_health_log = now_m
        try:
            rss_mb = -1.0
            try:
                import psutil  # type: ignore
                rss_mb = psutil.Process().memory_info().rss / (1024.0 * 1024.0)
            except Exception:
                pass
            print(
                f"[HEALTH] cam={getattr(self, 'cam_key', '?')} plates={len(self.tracked_plates)} "
                f"vehicles={len(self.tracked_vehicles)} recent_ev={len(self.recent_vehicle_events)} "
                f"history={len(self.history_events)} ocr_q={self._ocr_results.qsize()} "
                f"det_interval={self._det_interval_ema:.2f}s rss_mb={rss_mb:.0f}",
                flush=True,
            )
        except Exception:
            pass

    def get_tracks_summary(self, frame_w: int, frame_h: int) -> List[Dict[str, Any]]:
        """Xuất danh sách toạ độ và thông tin các biển số, xe và người đang bám trong ROI để gửi về Web UI qua SSE."""
        self._log_health()
        roi_pts = self._get_pixel_roi(frame_w, frame_h)
        tracks = []
        now = time.time()
        show_plate_box = os.getenv("AI_SHOW_PLATE_BOX", "1").strip().lower() in ("1", "true", "yes")
        enable_vehicle_box = os.getenv("AI_ENABLE_VEHICLE_BOX", "1").strip().lower() in ("1", "true", "yes")

        with self._state_lock:
            claimed_plate_boxes = []
            # AI_TRACK_V2: lớp hiển thị an toàn (chỉ ẩn/gộp KHUNG VẼ, không đụng state tracked_*).
            v2 = os.getenv("AI_TRACK_V2", "0").strip().lower() in ("1", "true", "yes")
            display_ttl = min(2.0, max(0.8, 3.0 * float(self._det_interval_ema))) if v2 else 0.0
            plated_refs: List[Tuple[int, List[int], Optional[List[int]]]] = []  # (trackId, plate_box, vehicle_box)
            has_roi_poly = (roi_pts is not None and len(roi_pts) >= 3)
            for trk in self.tracked_plates.values():
                # 1. Hiển thị xe trong ROI: khi camera đã cấu hình vùng ROI ảo, CHỈ vẽ khung cho xe nằm trong ROI
                in_roi = self.is_track_in_roi(trk, roi_pts)
                if has_roi_poly and not in_roi:
                    continue
                elif not has_roi_poly and not in_roi and not self.track_outside_roi:
                    continue
                # Giữ khung bám tối đa 2 frame mất dấu khi xe đi nhanh để chống chớp giật
                if trk.frames_lost > 2:
                    continue
                if v2:
                    # (a) Chống khung đơ: chỉ ẨN khung khi quá TTL thích ứng (không xoá track -> khối dọn dẹp cũ
                    #     vẫn chốt last-chance event như trước).
                    if (now - trk.last_seen) > display_ttl:
                        continue
                    # (b) Vật thể tĩnh ĐÃ CHỐT EVENT (vd: tờ giấy in biển): không cần vẽ tiếp.
                    #     Miễn trừ: chưa gửi event / đang chờ OCR / mới xuất hiện < 1.5s.
                    if trk.event_sent and not trk.ocr_pending and (now - trk.first_seen) >= 1.5:
                        _ic = trk.init_center
                        _cx = (trk.bbox[0] + trk.bbox[2]) / 2.0
                        _cy = (trk.bbox[1] + trk.bbox[3]) / 2.0
                        if math.hypot(_cx - _ic[0], _cy - _ic[1]) < 6.0:
                            continue

                det_pct = trk.det_conf if trk.det_conf <= 100.0 else trk.det_conf / 100.0
                cur_vbox = list(trk.vehicle_bbox) if (enable_vehicle_box and trk.vehicle_bbox) else None

                # Phân loại phương tiện chuẩn xác
                v_type = classify_vehicle(trk.vehicle_type, cur_vbox, trk.plate_text, trk.bbox)
                trk.vehicle_type = v_type

                real_pbox = list(trk.bbox)
                real_vbox = list(cur_vbox) if cur_vbox else None

                # HỖ TRỢ ĐA XE ĐỒNG THỜI TRONG CÙNG KHUNG HÌNH (Multi-vehicle parallel tracking):
                # Chỉ hạ về khung biển số nếu 2 xe trùng lấn cực lớn (> 0.65) để không nuốt mất xe thứ 2 đi sát bên hông
                canonical_box = real_vbox if real_vbox else real_pbox
                if any(t.get("vehicleBbox") and compute_iou(canonical_box, t["vehicleBbox"]) > 0.65 for t in tracks):
                    canonical_box = real_pbox

                claimed_plate_boxes.append(real_pbox)
                plated_refs.append((trk.track_id, real_pbox, canonical_box))
                tracks.append({
                    "trackId": trk.track_id,
                    "laneId": trk.lane_id,
                    "laneName": trk.lane_name,
                    "bbox": real_pbox if show_plate_box else None,
                    "vehicleBbox": canonical_box,
                    "plate": trk.plate_text or "",
                    "confidence": round(float(trk.ocr_conf if trk.plate_text else det_pct), 1),
                    "vehicleType": v_type,
                    "inRoi": in_roi,
                    "crossed": trk.crossed
                })

            # BỔ SUNG CÁC XE ĐANG Ở TRONG ROI HOẶC ĐANG TIẾN VÀO (Hỗ trợ đa xe song song & xe máy không biển trước)
            show_unplated = os.getenv("AI_SHOW_UNPLATED_VEHICLES", "1").strip().lower() in ("1", "true", "yes")
            if show_unplated and enable_vehicle_box:
                for vid, v_data in list(self.tracked_vehicles.items()):
                    v_box = v_data.get("bbox")
                    if not v_box or v_data.get("lost", 0) > 2 or v_data.get("confidence", 0.0) < 0.15:
                        continue
                    # AI_TRACK_V2: ẩn khung xe không biển nếu quá TTL thích ứng (không xoá state)
                    if v2 and (now - v_data.get("last_seen", now)) > display_ttl:
                        continue

                    # 1. KIỂM TRA XE NẰM TRONG VÙNG ROI:
                    in_roi_v = self._is_inside_roi(v_box, roi_pts) if has_roi_poly else True
                    if has_roi_poly and not in_roi_v:
                        continue
                    elif not has_roi_poly and not in_roi_v and not self.track_outside_roi:
                        continue

                    # 2. CHỈ BỎ QUA KHI TRÙNG THỰC SỰ VỚI CHÍNH CHIẾC XE ĐÃ CÓ BIỂN (IoU > 0.65):
                    # Tuyệt đối KHÔNG chặn xe thứ 2 đang chạy sát bên hông hoặc bám đuôi!
                    is_already_drawn = False
                    for t in tracks:
                        tvb = t.get("vehicleBbox")
                        if tvb and compute_iou(v_box, tvb) > 0.65:
                            is_already_drawn = True
                            break
                    # AI_TRACK_V2: gộp KHUNG KHÔNG BIỂN vào khung ĐÃ CÓ BIỂN của cùng 1 xe (chống #3 + #4).
                    # Chỉ gộp vào track có biển; ngưỡng theo tỉ lệ kích thước thân xe, KHÔNG gộp 2 xe có biển khác nhau.
                    if v2 and not is_already_drawn:
                        vw = max(1.0, float(v_box[2] - v_box[0]))
                        vcx = (v_box[0] + v_box[2]) / 2.0
                        vcy = (v_box[1] + v_box[3]) / 2.0
                        for pid, pbox, pvbox in plated_refs:
                            if pid == vid:
                                is_already_drawn = True
                                break
                            pcx = (pbox[0] + pbox[2]) / 2.0
                            pcy = (pbox[1] + pbox[3]) / 2.0
                            if v_box[0] <= pcx <= v_box[2] and v_box[1] <= pcy <= v_box[3]:
                                is_already_drawn = True
                                break
                            if pvbox:
                                if compute_iou(v_box, pvbox) > 0.30:
                                    is_already_drawn = True
                                    break
                                ref_w = max(vw, float(pvbox[2] - pvbox[0]))
                                tcx = (pvbox[0] + pvbox[2]) / 2.0
                                tcy = (pvbox[1] + pvbox[3]) / 2.0
                                if math.hypot(tcx - vcx, tcy - vcy) < 0.5 * ref_w:
                                    is_already_drawn = True
                                    break
                    if is_already_drawn:
                        continue

                    raw_vtype = str(v_data.get("type") or "CAR")
                    classified_type = classify_vehicle(raw_vtype, v_box, None, None)

                    tracks.append({
                        "trackId": vid,
                        "laneId": None,
                        "laneName": None,
                        "bbox": None,
                        "vehicleBbox": list(v_box),
                        "plate": "",
                        "confidence": round(float(v_data.get("confidence", 0.8)) * 100, 1),
                        "vehicleType": classified_type,
                        "inRoi": in_roi_v,
                        "crossed": False
                    })

            # Bổ sung NGƯỜI ĐI BỘ (PERSON) đang xuất hiện trong khung ROI từ Tầng 1
            for p_idx, p in enumerate(getattr(self, "current_persons", [])):
                p_box = p.get("bbox")
                if not p_box:
                    continue
                p_in_roi = self._is_inside_roi(p_box, roi_pts)
                if not p_in_roi:
                    continue
                tracks.append({
                    "trackId": 90000 + p_idx,
                    "laneId": None,
                    "laneName": None,
                    "bbox": None,
                    "vehicleBbox": list(p_box),
                    "plate": "",
                    "confidence": round(float(p.get("confidence", 0.75)) * 100, 1),
                    "vehicleType": "PERSON",
                    "inRoi": True,
                    "crossed": False
                })

            # Cập nhật cờ active_in_roi khi có bất kỳ xe, biển số hoặc người nào nằm trong ROI
            self.active_in_roi = any(t.get("inRoi", False) for t in tracks)

        return tracks

    def _prune_old_snapshots(self, force: bool = False):
        """
        Rolling Disk Retention cho ảnh sự kiện, cấu hình bằng biến môi trường:
          - AI_SNAPSHOT_RETENTION_DAYS (mặc định 7): xóa ảnh cũ hơn N ngày (0 = tắt)
          - AI_SNAPSHOT_MAX_FILES (mặc định 20000): chỉ giữ N ảnh mới nhất (0 = tắt)
          - AI_SNAPSHOT_MAX_MB (mặc định 4096): tổng dung lượng tối đa, xóa từ ảnh cũ nhất (0 = tắt)
        Throttle 60 giây để nhiều camera không quét ổ đĩa liên tục.
        """
        now_ts = time.time()
        if not force and now_ts - self._last_prune_ts < 60.0:
            return
        self._last_prune_ts = now_ts

        def _env_num(name: str, default: float) -> float:
            try:
                return float(os.getenv(name, str(default)))
            except ValueError:
                return default

        retention_days = _env_num("AI_SNAPSHOT_RETENTION_DAYS", 7)
        max_files = int(_env_num("AI_SNAPSHOT_MAX_FILES", 20000))
        max_bytes = int(_env_num("AI_SNAPSHOT_MAX_MB", 4096) * 1024 * 1024)

        try:
            if not self.events_dir.exists():
                return
            entries = []
            for p in self.events_dir.glob("*.jpg"):
                try:
                    st = p.stat()
                    entries.append((p, st.st_mtime, st.st_size))
                except OSError:
                    continue
            entries.sort(key=lambda e: e[1], reverse=True)  # mới nhất trước

            to_delete = set()
            if retention_days > 0:
                cutoff = now_ts - retention_days * 86400.0
                to_delete.update(p for p, mtime, _ in entries if mtime < cutoff)
            if max_files > 0 and len(entries) > max_files:
                to_delete.update(p for p, _, _ in entries[max_files:])
            if max_bytes > 0:
                total = 0
                for p, _, size in entries:
                    total += size
                    if total > max_bytes:
                        to_delete.add(p)

            for p in to_delete:
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass
        except Exception:
            pass

    def _apply_ocr_result(
        self,
        track: "TrackedPlate",
        plate_text: str,
        ocr_conf: float,
        sharpness: float,
        meta: Dict[str, Any],
        bw: int,
        bh: int,
        frame_bgr: np.ndarray,
        raw_crop: np.ndarray,
        now: float,
        events_out: List[Dict[str, Any]],
    ) -> None:
        """Áp dụng KẾT QUẢ OCR (từ sync LẶP hoặc từ worker async) vào track.

        Mọi đột biến state (plate_votes, event_sent, best_shot, cooldown, history_events)
        ĐỀU nằm trong method này và chỉ được gọi bởi DUY NHẤT thread loop camera
        (sync: gọi trực tiếp; async: đọc từ `self._ocr_results` queue rồi gọi).
        Worker thread CHỈ tính deskew+ONNX thuần rồi push kết quả compact -> không data race.
        """
        conf_val = float(ocr_conf) if isinstance(ocr_conf, (int, float, str)) else 0.0
        plate_text, conf_val = filter_ocr_result(plate_text, conf_val)
        if not plate_text:
            return
        ocr_conf_pct = round(conf_val * 100, 1) if conf_val <= 1.0 else round(conf_val, 1)

        # BỘ LỌC 1: Ngưỡng độ tự tin OCR (mặc định 40% từ AI_MIN_OCR_CONF) để bắt nhạy 100% xe phóng nhanh
        effective_ocr_cutoff = self.min_ocr_conf * 100.0 if self.min_ocr_conf <= 1.0 else self.min_ocr_conf
        if ocr_conf_pct < effective_ocr_cutoff:
            return

        # BỘ LỌC 2: BẮT BUỘC ĐÚNG QUY CHUẨN BIỂN SỐ VIỆT NAM (7-9 ký tự, loại bỏ 20X555)
        is_valid, cleaned_plate, _ = validate_vietnam_plate(plate_text)
        if not is_valid:
            return

        display_text = format_plate_display(cleaned_plate)
        clean_key = clean_plate_text(cleaned_plate)

        # BEST-SHOT: chấm điểm khung hình (OCR tin cậy + độ nét + diện tích biển) và giữ lại khung tốt nhất
        shot_score = (
            ocr_conf_pct
            + min(sharpness, 400.0) / 400.0 * 30.0
            + min(float(bw * bh), 8000.0) / 8000.0 * 20.0
        )
        if not track.event_sent and shot_score > track.best_score:
            track.best_score = shot_score
            track.best_crop = raw_crop.copy()
            track.best_frame = frame_bgr.copy()
            track.best_angle = float(meta.get("angle", 0.0))

        # BỎ PHIẾU XÁC NHẬN (TEMPORAL VOTING): Ghi nhận biển số ứng viên
        track.plate_votes[clean_key] = track.plate_votes.get(clean_key, 0) + 1
        votes_for_this = track.plate_votes[clean_key]
        old_key = clean_plate_text(track.plate_text) if track.plate_text else ""

        # =========================================================================
        # TRƯỜNG HỢP 1: TRACK ĐÃ GỬI SỰ KIỆN CHO BIỂN SỐ TRƯỚC ĐÓ
        # =========================================================================
        if track.event_sent:
            # 1a. Nếu là CÙNG biển số (đọc nét hơn khi xe tiến lại gần): chỉ cập nhật nhãn hiển thị, KHÔNG bắn thêm event.
            if are_similar_plates(clean_key, old_key):
                if ocr_conf_pct > track.ocr_conf + 1.0 or votes_for_this >= 2:
                    track.plate_text = display_text
                    track.ocr_conf = max(track.ocr_conf, ocr_conf_pct)
                    for hev in self.history_events[:5]:
                        if hev.get("track_id") == track.track_id and are_similar_plates(hev.get("plate", ""), old_key):
                            hev["plate"] = display_text
                            hev["confidence"] = track.ocr_conf
                            break
                return

            # 1b. Nếu xuất hiện MỘT BIỂN SỐ MỚI KHÁC HẲN ngay tại vị trí track này trong thời gian ngắn
            # (VD: xe thứ 2 nối đuôi sát vào đúng vùng vừa chụp xe 1, hoặc đưa biển số thứ 2 vào camera):
            # Khi biển mới đạt >= 2 votes hoặc độ tự tin cao (>= 68%), mở khóa track để xử lý biển mới ngay lập tức!
            if votes_for_this >= 2 or ocr_conf_pct >= max(effective_ocr_cutoff, 68.0):
                track.event_sent = False
                track.plate_votes = {clean_key: votes_for_this}
                track.best_candidate_conf = ocr_conf_pct
                track.best_candidate_plate = display_text
                track.plate_text = display_text
                track.ocr_conf = ocr_conf_pct
                track.best_score = shot_score
                track.best_crop = raw_crop.copy()
                track.best_frame = frame_bgr.copy()
                track.best_angle = float(meta.get("angle", 0.0))
            else:
                return

        # =========================================================================
        # TRƯỜNG HỢP 2: TRACK ĐANG TRONG QUÁ TRÌNH NHẬN DIỆN (TỔNG QUÁT MỌI LOẠI BIỂN)
        # =========================================================================
        # Chấm điểm ứng viên tổng quát dựa trên: số phiếu bầu (votes) + độ tin cậy OCR + độ đầy đủ ký tự
        cand_score = votes_for_this * 18.0 + ocr_conf_pct + len(clean_key) * 6.0
        old_votes = track.plate_votes.get(old_key, 1) if old_key else 0
        old_score = (old_votes * 18.0 + track.best_candidate_conf + len(old_key) * 6.0) if old_key else 0.0

        if not track.plate_text or cand_score >= old_score:
            track.best_candidate_conf = max(track.best_candidate_conf, ocr_conf_pct) if clean_key == old_key else ocr_conf_pct
            track.best_candidate_plate = display_text
            track.plate_text = display_text
            track.ocr_conf = track.best_candidate_conf

        track.ocr_attempted = True

        # KIỂM ĐỊNH CHỐT SỰ KIỆN TỔNG QUÁT 2 GIAI ĐOẠN:
        self._try_finalize_track_event(
            track, frame_bgr, now, events_out,
            raw_crop=raw_crop,
            angle=float(meta.get("angle", 0.0)),
            force_last_chance=False,
        )

    def _try_finalize_track_event(
        self,
        track: "TrackedPlate",
        frame_bgr: np.ndarray,
        now: float,
        events_out: List[Dict[str, Any]],
        raw_crop: Optional[np.ndarray] = None,
        angle: float = 0.0,
        force_last_chance: bool = False,
    ) -> None:
        """Cơ chế chốt sự kiện tổng quát 2 giai đoạn (Universal 2-Stage Event Commit):
        - Giai đoạn 1 (Xe đang di chuyển trong ROI): Chốt khi đạt sự đồng thuận >= 2 frames (votes >= 2, chỉ mất ~66ms)
          để tự động loại bỏ mọi nhiễu đọc lẹm ở mép khung hình và chọn đúng ảnh Best-Shot nét nhất.
        - Giai đoạn 2 (Xe phóng nhanh lướt qua ROI chỉ kịp đọc 1 frame - force_last_chance=True):
          Chốt ngay tức thì với 1 vote (ocr_conf >= 42%) ngay khi xe rời ROI hoặc mất dấu để không bao giờ bỏ lỡ xe đi nhanh!"""
        if track.event_sent or not track.plate_text:
            return

        clean_key = clean_plate_text(track.plate_text)
        if not clean_key:
            return

        current_votes = track.plate_votes.get(clean_key, 1)

        min_conf_pct = self.min_ocr_conf * 100.0 if self.min_ocr_conf <= 1.0 else self.min_ocr_conf
        is_confirmed = (
            (current_votes >= 1 and track.ocr_conf >= min_conf_pct)
            or (force_last_chance and current_votes >= 1 and track.ocr_conf >= min_conf_pct)
        )
        if not is_confirmed:
            return

        # BỘ LỌC TRONG ROI NGHIÊM NGẶT: Biển số (track.bbox) BẮT BUỘC phải thực sự nằm trong đa giác ROI!
        # Loại bỏ 100% xe đỗ trong gara ngoài ROI (như 30G-521.92) dù thân xe hay vạch tripwire có chạm ngang!
        roi_pts = self._get_pixel_roi(frame_bgr.shape[1], frame_bgr.shape[0])
        if roi_pts is not None and len(roi_pts) >= 3:
            if not (self.is_track_in_roi(track, roi_pts) or getattr(track, "ever_in_roi", False)):
                return

        # BỘ LỌC 3: KHÓA SỰ KIỆN THEO BIỂN SỐ (1 XE = 1 EVENT DUY NHẤT, KHÔNG CHẶN XE THỨ 2 ĐI CẠNH)
        current_lane_key = track.lane_id or "default"

        # Giữ lịch sử sự kiện theo cooldown_sec (mặc định 15s) để không khóa chặn nhầm xe chạy nối đuôi
        dedup_window = max(5.0, float(self.cooldown_sec))
        self.recent_vehicle_events = [
            item for item in self.recent_vehicle_events if (now - item["time"]) < dedup_window
        ]

        # 3.1: Kiểm tra xem cùng biển số đã gửi event trong cửa sổ dedup_window chưa (Bảo vệ ĐA BIỂN / ĐA XE)
        cur_vbox = list(track.vehicle_bbox) if track.vehicle_bbox else list(track.bbox)
        for item in self.recent_vehicle_events:
            is_same_plate = are_similar_plates(clean_key, item["plate"])
            # CHỈ chặn trùng khi thực sự là CÙNG biển số tương đồng!
            # Tuyệt đối KHÔNG chặn theo `item["track_id"] == track.track_id` vì track_id có thể được tái sử dụng
            # hoặc xe thứ 2 tiến vào ngay vị trí xe thứ 1 vừa rời đi trong thời gian ngắn!
            if is_same_plate:
                track.event_sent = True
                return

        # 3.2: Khóa chống lặp nếu có track khác đang sống trong ROI đã gửi CÙNG biển số tương đồng
        # Hỗ trợ ĐA BIỂN: các xe mang biển số khác nhau trong cùng khung hình luôn được xử lý và ghi nhận độc lập 100%!
        if any(t.event_sent and t.plate_text and are_similar_plates(clean_key, t.plate_text)
               for t in self.tracked_plates.values() if t.track_id != track.track_id):
            track.event_sent = True
            return

        # 3.3: So khớp tương đồng trong sổ bộ nhớ cooldown (90s)
        for reg_key, reg_time in self.plate_cooldown_registry.items():
            if now - reg_time < dedup_window:
                reg_lane, _, reg_plate = reg_key.partition(":")
                if reg_lane == current_lane_key and are_similar_plates(clean_key, reg_plate):
                    track.event_sent = True
                    return

        # ĐẠT ĐỦ TẤT CẢ ĐIỀU KIỆN -> KÍCH HOẠT SỰ KIỆN 1 LẦN DUY NHẤT!
        self.plate_cooldown_registry[f"{current_lane_key}:{clean_key}"] = now
        self.recent_vehicle_events.append({
            "track_id": track.track_id,
            "plate": clean_key,
            "vbox": cur_vbox,
            "pbox": list(track.bbox),
            "time": now,
        })
        track.event_sent = True

        self.last_detected_plate = track.plate_text
        self.last_plate_confidence = track.ocr_conf
        self.last_detection_time = now
        self.barrier_state = "OPEN"
        self.barrier_open_until = now + 4.0

        # Dùng khung hình TỐT NHẤT (best-shot) của lượt xe
        final_crop = track.best_crop if track.best_crop is not None else raw_crop
        final_frame = track.best_frame if track.best_frame is not None else frame_bgr
        final_angle = track.best_angle if track.best_crop is not None else angle
        if final_crop is None:
            x1, y1, x2, y2 = track.bbox
            final_crop = final_frame[max(0, y1):min(final_frame.shape[0], y2), max(0, x1):min(final_frame.shape[1], x2)].copy()

        dt_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        snap_name = f"event_{dt_str}_{clean_key or 'car'}_full.jpg"
        snap_path = self.events_dir / snap_name
        crop_name = f"event_{dt_str}_{clean_key or 'car'}_crop.jpg"
        crop_path = self.events_dir / crop_name

        # Phân loại phương tiện chuẩn xác (chống gán nhầm Ô tô/Xe tải thành Xe máy)
        final_vtype = classify_vehicle(track.vehicle_type, track.vehicle_bbox, track.plate_text, track.bbox)
        track.vehicle_type = final_vtype

        ev = {
            "timestamp": datetime.now().strftime("%H:%M:%S %d/%m/%Y"),
            "track_id": track.track_id,
            "lane_id": track.lane_id,
            "lane_name": track.lane_name,
            "plate": track.plate_text,
            "confidence": track.ocr_conf,
            "bbox": track.bbox,
            "vehicle_type": final_vtype,
            "vehicle_bbox": track.vehicle_bbox,
            "skew_angle": final_angle,
            "snapshot_file": str(snap_path),
            "crop_file": str(crop_path),
            "crop_img": final_crop,
            "full_img": final_frame,
            "barrier": "OPEN"
        }
        track.release_best_shot()
        events_out.append(ev)
        # GIẢI PHÓNG RAM: Lưu vào history không giữ mảng numpy full 1080p (6.2MB) để chống tràn bộ nhớ
        hist_ev = dict(ev)
        hist_ev["full_img"] = None
        self.history_events.insert(0, hist_ev)
        if len(self.history_events) > 20:
            self.history_events = self.history_events[:20]

    def _associate_legacy(self, valid_detections: List[Dict[str, Any]], W: int, H: int, roi_pts):
        """Association theo biển số độc lập (Hỗ trợ nhiều xe / nhiều biển số trong cùng 1 khung hình).
        Không gộp theo khung thân xe to (vehicle_bbox) để xe thứ 2 đi cạnh ô tô không bị nuốt biển số."""
        matched_det_indices = set()
        unmatched_tracks = set(self.tracked_plates.keys())

        # VÒNG 1: Khớp toàn cục theo IoU cực đại của biển số (Global Greedy Matching)
        iou_candidates = []
        for track_id in unmatched_tracks:
            track = self.tracked_plates[track_id]
            pred_bbox = track.get_predicted_bbox()
            pred_box_int = [round(x) for x in pred_bbox]
            for idx, det in enumerate(valid_detections):
                if idx in matched_det_indices:
                    continue
                iou_pred = compute_iou(pred_box_int, det["bbox"])
                iou_curr = compute_iou(track.bbox, det["bbox"])
                iou = max(iou_pred, iou_curr)
                min_iou = 0.08 if self.outdoor_mode else 0.15
                if iou >= min_iou:
                    iou_candidates.append((iou, track_id, idx))

        iou_candidates.sort(key=lambda x: x[0], reverse=True)
        for iou, track_id, idx in iou_candidates:
            if track_id in unmatched_tracks and idx not in matched_det_indices:
                det = valid_detections[idx]
                track = self.tracked_plates[track_id]
                track.update(det["bbox"], det["confidence"])
                if det.get("vehicle_type"):
                    track.vehicle_type = det["vehicle_type"]
                    track.vehicle_bbox = det.get("vehicle_bbox")
                    track.vehicle_conf = det.get("vehicle_conf", 0.0)
                    track.vehicle_label = det.get("vehicle_label")
                if not track.lane_id:
                    track.lane_id, track.lane_name = self._get_lane_for_bbox(det["bbox"], W, H)
                matched_det_indices.add(idx)
                unmatched_tracks.discard(track_id)

        # VÒNG 2: Khớp dự phòng cho xe di chuyển và camera lia (Khoảng cách tâm)
        dist_candidates = []
        area_min = 0.35 if self.outdoor_mode else 0.55
        area_max = 2.80 if self.outdoor_mode else 1.85
        ar_diff_max = 1.20 if self.outdoor_mode else 0.80

        for track_id in unmatched_tracks:
            track = self.tracked_plates[track_id]
            pred_bbox = track.get_predicted_bbox()
            tcx = (pred_bbox[0] + pred_bbox[2]) / 2.0
            tcy = (pred_bbox[1] + pred_bbox[3]) / 2.0
            tw = max(1.0, pred_bbox[2] - pred_bbox[0])
            th = max(1.0, pred_bbox[3] - pred_bbox[1])
            t_area = tw * th
            t_ar = tw / th

            max_allowed_dist = max(max(tw, th) * 1.5, 55.0) if self.outdoor_mode else max(max(tw, th) * 1.2, 45.0)
            # AI_TRACK_V2: chỉ nới bán kính cho track ĐANG CHẠY NHANH, theo tỉ lệ kích thước thân xe (clamp 60..160px)
            _v2 = os.getenv("AI_TRACK_V2", "0").strip().lower() in ("1", "true", "yes")
            _moving = _v2 and (abs(track.vx) >= 1.5 or abs(track.vy) >= 1.5)
            if _moving:
                _ref_w = float(track.vehicle_bbox[2] - track.vehicle_bbox[0]) if track.vehicle_bbox else max(tw, th) * 4.0
                max_allowed_dist = max(max_allowed_dist, min(160.0, max(60.0, 2.0 * _ref_w)))

            for idx, det in enumerate(valid_detections):
                if idx in matched_det_indices:
                    continue
                dx1, dy1, dx2, dy2 = det["bbox"]
                dcx = (dx1 + dx2) / 2.0
                dcy = (dy1 + dy2) / 2.0
                dw = max(1, dx2 - dx1)
                dh = max(1, dy2 - dy1)
                d_area = dw * dh
                d_ar = dw / float(dh)

                area_ratio = d_area / float(t_area)
                if area_ratio < area_min or area_ratio > area_max:
                    continue
                if abs(t_ar - d_ar) > ar_diff_max:
                    continue

                iou_test = compute_iou(track.bbox, det["bbox"])
                dist = math.hypot(tcx - dcx, tcy - dcy)
                if iou_test > 0.05 or dist <= max_allowed_dist:
                    norm_dist = dist / max(tw, th)
                    if _moving and dist > 1.0:
                        # Cosine hướng chuyển động chỉ để ƯU TIÊN ứng viên cùng hướng (không loại bỏ ứng viên nào)
                        _vn = math.hypot(track.vx, track.vy)
                        _cos = ((dcx - tcx) * track.vx + (dcy - tcy) * track.vy) / (dist * _vn)
                        norm_dist *= (1.0 - 0.3 * max(-1.0, min(1.0, _cos)))
                    dist_candidates.append((norm_dist, dist, track_id, idx))

        dist_candidates.sort(key=lambda x: x[0])
        for norm_dist, dist, track_id, idx in dist_candidates:
            if track_id in unmatched_tracks and idx not in matched_det_indices:
                det = valid_detections[idx]
                track = self.tracked_plates[track_id]
                track.update(det["bbox"], det["confidence"])
                if det.get("vehicle_type"):
                    track.vehicle_type = det["vehicle_type"]
                    track.vehicle_bbox = det.get("vehicle_bbox")
                    track.vehicle_conf = det.get("vehicle_conf", 0.0)
                    track.vehicle_label = det.get("vehicle_label")
                if not track.lane_id:
                    track.lane_id, track.lane_name = self._get_lane_for_bbox(det["bbox"], W, H)
                matched_det_indices.add(idx)
                unmatched_tracks.discard(track_id)

        for tid in unmatched_tracks:
            self.tracked_plates[tid].frames_lost += 1
            self.tracked_plates[tid].predict_step()

        for idx, det in enumerate(valid_detections):
            if idx not in matched_det_indices:
                # KIỂM TRA CHẶN TRÙNG LẶP THEO BIỂN SỐ: Nếu detection này trùng vị trí biển số đã có (IoU > 0.35) -> UPDATE
                # Tuyệt đối KHÔNG gộp 2 biển khác nhau chỉ vì 2 xe đi sát nhau (v_iou)!
                matched_existing = None
                for exist_trk in self.tracked_plates.values():
                    if compute_iou(exist_trk.bbox, det["bbox"]) > 0.35:
                        matched_existing = exist_trk
                        break

                if matched_existing is not None:
                    matched_existing.update(det["bbox"], det["confidence"])
                    if det.get("vehicle_bbox"):
                        matched_existing.vehicle_bbox = det.get("vehicle_bbox")
                    continue

                # Tạo track mới cho xe/vật thể mới xuất hiện (ưu tiên kế thừa ID đã cấp từ tầng 1)
                create_ok = len(self.tracked_plates) < self.max_tracks
                if create_ok and not self.track_outside_roi:
                    create_ok = self._is_inside_roi(det["bbox"], roi_pts)
                if create_ok:
                    assigned_tid = None
                    det_vbox = det.get("vehicle_bbox")
                    if det_vbox:
                        for vid, v_data in list(self.tracked_vehicles.items()):
                            if compute_iou(det_vbox, v_data["bbox"]) > 0.30 and vid not in self.tracked_plates:
                                assigned_tid = vid
                                break
                    if assigned_tid is None:
                        pcx = (det["bbox"][0] + det["bbox"][2]) / 2.0
                        pcy = (det["bbox"][1] + det["bbox"][3]) / 2.0
                        for vid, v_data in list(self.tracked_vehicles.items()):
                            vx1, vy1, vx2, vy2 = v_data["bbox"]
                            if vx1 <= pcx <= vx2 and vy1 <= pcy <= vy2 and vid not in self.tracked_plates:
                                assigned_tid = vid
                                break
                    if assigned_tid is None:
                        assigned_tid = self._alloc_track_id()

                    new_track = TrackedPlate(assigned_tid, det["bbox"], det["confidence"])
                    new_track.lane_id, new_track.lane_name = self._get_lane_for_bbox(det["bbox"], W, H)
                    new_track.vehicle_type = det.get("vehicle_type", "CAR")
                    new_track.vehicle_bbox = det.get("vehicle_bbox")
                    new_track.vehicle_conf = det.get("vehicle_conf", 0.0)
                    new_track.vehicle_label = det.get("vehicle_label", "car")
                    self.bt_register(new_track)
                    self.tracked_plates[assigned_tid] = new_track

    def _associate_bytetrack(self, valid_detections: List[Dict[str, Any]], W: int, H: int, roi_pts):
        """ByteTrack 2-stage: Kalman CV dự đoán + high/low conf gate + lost/recovered.
        State biển/event vẫn nằm trong TrackedPlate; tracker chỉ trả kế hoạch gán ID.
        CHỈ chạy khi AI_TRACKER=bytetrack (call-site chọn theo tracker_mode)."""
        bt_dets = dets_from_plate_detections(valid_detections)
        current = [
            {
                "id": tid,
                "lost": trk.frames_lost,
                "has_plate": bool(trk.plate_text),
                # confirmed: >= 2 lần bắt gặp (spec Component 2) -> track chưa có biển
                # nhưng đã "chắc chắn" vẫn được hưởng lost-window dài.
                "confirmed": trk.hits >= 2,
            }
            for tid, trk in self.tracked_plates.items()
        ]
        plan = self.bt.update(bt_dets, current)

        def _apply_det(track, det):
            track.update(det["bbox"], det["confidence"])
            if det.get("vehicle_type"):
                track.vehicle_type = det["vehicle_type"]
                if det.get("vehicle_bbox"):
                    track.vehicle_bbox = det.get("vehicle_bbox")
                track.vehicle_conf = det.get("vehicle_conf", 0.0)
                track.vehicle_label = det.get("vehicle_label")
            if self.is_track_in_roi(track, roi_pts):
                track.ever_in_roi = True
            if track.event_sent and track.vehicle_bbox:
                for item in self.recent_vehicle_events:
                    if item.get("track_id") == track.track_id:
                        item["vbox"] = list(track.vehicle_bbox)
                        item["time"] = time.time()

        # MATCHED (stage 1: conf cao) -> nạp Kalman thật, reset lost
        for tid, di in plan["matched"].items():
            if tid in self.tracked_plates and di < len(bt_dets):
                _apply_det(self.tracked_plates[tid], valid_detections[di])

        # RECOVERED (stage 2: conf thấp cứu track MẤT) -> giữ ID, phục hồi
        for tid, di in plan["recovered"].items():
            if tid in self.tracked_plates and di < len(bt_dets):
                _apply_det(self.tracked_plates[tid], valid_detections[di])

        # LOST: không detection nhận -> cộng lost
        for tid in plan["lost"]:
            trk = self.tracked_plates.get(tid)
            if trk is not None:
                trk.frames_lost += 1

        # DEAD: vượt cửa sổ -> chỉ gỡ khỏi Kalman tracker; giữ TrackedPlate để khối dọn dẹp tập trung kiểm tra Last-Chance Flush
        for tid in plan["dead"]:
            self.bt.drop(tid)
            trk = self.tracked_plates.get(tid)
            if trk is not None:
                trk.frames_lost += 1

        # NEW: detection cao không ai nhận -> sinh track mới (ưu tiên kế thừa ID đã cấp từ tầng 1)
        for di in plan["new"]:
            det = valid_detections[di]
            create_ok = len(self.tracked_plates) < self.max_tracks
            if create_ok and not self.track_outside_roi:
                create_ok = self._is_inside_roi(det["bbox"], roi_pts)
            if create_ok:
                assigned_tid = None
                det_vbox = det.get("vehicle_bbox")
                if det_vbox:
                    for vid, v_data in list(self.tracked_vehicles.items()):
                        if compute_iou(det_vbox, v_data["bbox"]) > 0.30 and vid not in self.tracked_plates:
                            assigned_tid = vid
                            break
                if assigned_tid is None:
                    pcx = (det["bbox"][0] + det["bbox"][2]) / 2.0
                    pcy = (det["bbox"][1] + det["bbox"][3]) / 2.0
                    for vid, v_data in list(self.tracked_vehicles.items()):
                        vx1, vy1, vx2, vy2 = v_data["bbox"]
                        if vx1 <= pcx <= vx2 and vy1 <= pcy <= vy2 and vid not in self.tracked_plates:
                            assigned_tid = vid
                            break
                if assigned_tid is None:
                    assigned_tid = self._alloc_track_id()

                new_track = TrackedPlate(assigned_tid, det["bbox"], det["confidence"])
                new_track.lane_id, new_track.lane_name = self._get_lane_for_bbox(det["bbox"], W, H)
                new_track.vehicle_type = det.get("vehicle_type", "CAR")
                new_track.vehicle_bbox = det.get("vehicle_bbox")
                new_track.vehicle_conf = det.get("vehicle_conf", 0.0)
                new_track.vehicle_label = det.get("vehicle_label", "car")
                if self.is_track_in_roi(new_track, roi_pts):
                    new_track.ever_in_roi = True
                self.bt.register(new_track.track_id, [float(x) for x in det["bbox"]], det["confidence"])
                self.tracked_plates[assigned_tid] = new_track
        self._last_bt_plan = plan

    def _alloc_track_id(self) -> int:
        """Cấp ID chưa sử dụng cho phương tiện mới, đồng thời tránh trùng với các track_id vừa chốt sự kiện gần đây."""
        recent_ids = {int(item["track_id"]) for item in self.recent_vehicle_events if "track_id" in item}
        used_ids = set(self.tracked_plates.keys()) | set(self.tracked_vehicles.keys()) | recent_ids
        cand = 1
        while cand in used_ids:
            cand += 1
        return cand

    def bt_register(self, track: "TrackedPlate"):
        """Đăng ký track mới vào tracker (no-op khi legacy, vì legacy không dùng tracker)."""
        if self.bt is not None:
            self.bt.register(track.track_id, [float(x) for x in track.bbox], track.det_conf)

    def _debug_tracks(self, det_count: int):
        """Emit 1 khối [TRK] (dạng key=value, 1 dòng/track) mỗi detector-frame KHI BẬT.
        Mặc định AI_TRACK_DEBUG off -> trả về ngay, KHÔNG build string (gần như zero-cost).
        Dùng để chase ID-switch: state NEW/OK/REC/LOST/DEAD + vx/vy + lost/hits.
        """
        if not self.track_debug:
            return
        plan = (self._last_bt_plan or {}) if self.bt is not None else {}
        new_ids = set(plan.get("new", [])) if self.bt is not None else set()
        rec_ids = set((plan.get("recovered") or {}).values()) if self.bt is not None else set()
        lost_ids = set(plan.get("lost", [])) if self.bt is not None else set()
        dead_ids = set(plan.get("dead", [])) if self.bt is not None else set()

        lines = [
            f"[TRK] cam={self.cam_key} mode={self.tracker_mode} frame={self.frame_count} "
            f"dets={det_count} tracks={len(self.tracked_plates)} "
            f"new={len(new_ids)} rec={len(rec_ids)} lost={len(lost_ids)} dead={len(dead_ids)}"
        ]
        for tid, trk in self.tracked_plates.items():
            if self.bt is not None:
                v = self.bt.velocity(tid)
                vx, vy = (v if v is not None else (0.0, 0.0))
                tag = ("NEW" if tid in new_ids else "REC" if tid in rec_ids
                       else "LOST" if tid in lost_ids else "DEAD" if tid in dead_ids else "OK")
            else:
                vx, vy = trk.vx, trk.vy
                tag = "LOST" if trk.frames_lost > 0 else "OK"
            lines.append(
                f"[TRK] cam={self.cam_key} t={tid} {tag} x={trk.bbox[0]} y={trk.bbox[1]} "
                f"w={trk.bbox[2]-trk.bbox[0]} h={trk.bbox[3]-trk.bbox[1]} vx={vx:.1f} vy={vy:.1f} "
                f"conf={trk.det_conf:.2f} lost={trk.frames_lost} hits={trk.hits} "
                f"lane={trk.lane_id or '-'} plate={trk.plate_text or '-'}"
            )
        print("\n".join(lines), flush=True)

    def process_frame(self, frame_bgr: np.ndarray, draw_overlay: bool = True) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
        """
        Xử lý từng khung hình video với bộ lọc chống ảo giác & chống spam nghiêm ngặt:
        1. Lọc YOLOX theo tỷ lệ hình học biển số (Aspect Ratio: 1.15 -> 5.2) và độ tin cậy >= 58%.
        2. Bắt buộc kiểm định quy chuẩn biển số Việt Nam (loại bỏ 100% ảo giác số rác).
        3. Khóa chống spam theo số biển (Plate Cooldown) trong 15 giây.
        """
        self.frame_count += 1
        now = time.time()
        H, W = frame_bgr.shape[:2]
        annotated = frame_bgr.copy() if draw_overlay else frame_bgr
        roi_pts = self._get_pixel_roi(W, H)

        events_triggered: List[Dict[str, Any]] = []

        # --- DRAIN kết quả OCR ASYNC (pool worker) ---
        # Chỉ thread loop camera ghi state (plate_votes, event_sent, best_shot, cooldown,
        # history_events). Worker đã CHẠY deskew+ONNX (tính toán thuần, thread-safe) và
        # push kết quả COMPACT vào `self._ocr_results`; ở đây (1 thread) ta APPLY vào track
        # -> KHÔNG có data race. Nếu pool=None (sync) khối này bỏ qua (queue rỗng).
        if not self._ocr_results.empty():
            while True:
                try:
                    r = self._ocr_results.get_nowait()
                except queue.Empty:
                    break
                _t = r.get("t")
                if _t is None:
                    continue
                _t.ocr_pending = False
                if r.get("ok"):
                    self._apply_ocr_result(
                        _t, r["plate_text"], r["ocr_conf"], r["sharpness"], r["meta"],
                        r["bw"], r["bh"], r["frame"], r["crop"], now, events_triggered,
                    )
                    # Nếu xe đi nhanh đã rời vùng phát hiện (frames_lost >= 1) khi OCR vừa trả kết quả về:
                    # Kích hoạt Last-Chance Flush ngay lập tức để không bỏ lỡ sự kiện!
                    if _t.frames_lost >= 1 and not _t.event_sent and _t.plate_text:
                        self._try_finalize_track_event(
                            _t, r["frame"], now, events_triggered, force_last_chance=True
                        )

        # --- BENCHMARK (Q2: đo ms/tầng trước khi bật thread) ---
        self.bench.report(self.frame_count)

        # Cập nhật trạng thái Barie tự động đóng sau khi mở
        if self.barrier_state == "OPEN" and now > self.barrier_open_until:
            self.barrier_state = "CLOSED"

        # ---------------------------------------------------------------------
        # BƯỚC 1: NHẬN DIỆN VỊ TRÍ BIỂN SỐ (YOLOX Detector với ngưỡng lọc cao)
        # ---------------------------------------------------------------------
        # ĐIỀU TIẾT NHỊP QUÉT ĐẠT 25-30 FPS (Decoupled Detection & Tracking):
        # 1. Khi có xe trong ROI chưa nhận diện được: quét nhanh (skip=1 nếu bật AI_BURST_URGENT=1, mặc định 2).
        # 2. Bình thường: quét mỗi 2 frames (15 FPS), các frame còn lại Kalman/ByteTrack dự đoán ở 30 FPS.
        has_urgent_plate = any(
            (self._is_inside_roi(t.bbox, roi_pts) or t.crossed)
            and not t.plate_text
            for t in self.tracked_plates.values()
        ) or any(
            self._is_inside_roi(v["bbox"], roi_pts)
            for v in self.tracked_vehicles.values()
            if v.get("lost", 0) == 0
        )
        effective_skip = 1 if has_urgent_plate else max(1, self.frame_skip)
        should_run_detector = (self.frame_count % effective_skip == 0)

        # ROI PRE-CROP: CHỈ crop khi người dùng tắt track_outside_roi (AI_TRACK_OUTSIDE_ROI=0).
        # Khi bật track_outside_roi (mặc định), giữ toàn khung để đón đầu phát hiện xe & biển từ xa trước khi lao vào ROI!
        has_roi = roi_pts is not None and len(roi_pts) >= 3
        crop_x1, crop_y1, crop_x2, crop_y2 = 0, 0, W, H
        is_roi_cropped = False
        if has_roi and not self.track_outside_roi:
            rx_coords = [p[0] for p in roi_pts]
            ry_coords = [p[1] for p in roi_pts]
            pad_x = int(W * 0.06)
            pad_y = int(H * 0.10)
            crop_x1 = max(0, min(rx_coords) - pad_x)
            crop_y1 = max(0, min(ry_coords) - pad_y)
            crop_x2 = min(W, max(rx_coords) + pad_x)
            crop_y2 = min(H, max(ry_coords) + pad_y)
            if (crop_x2 - crop_x1) < (W * 0.92) or (crop_y2 - crop_y1) < (H * 0.92):
                is_roi_cropped = True

        det_frame = frame_bgr[crop_y1:crop_y2, crop_x1:crop_x2] if is_roi_cropped else frame_bgr

        if should_run_detector:
            # -----------------------------------------------------------------
            # TẦNG 1: NHẬN DIỆN XE VÀ NGƯỜI (object_det.onnx) - HỖ TRỢ ĐA XE TRONG ROI
            # Chạy mỗi 3 frames (các frame xen giữa dùng vận tốc Kalman/CV nội suy 30 FPS)
            # để dành tối đa tài nguyên CPU cho Tầng 2 (`plate_det.onnx`) và Tầng 3+4 (OCR) nổ tức thì!
            # -----------------------------------------------------------------
            detected_vehicles = []
            detected_persons = []
            run_tier1 = os.getenv("AI_ENABLE_VEHICLE_BOX", "1").strip().lower() in ("1", "true", "yes")
            if self.vehicle_detector is not None and run_tier1:
                try:
                    _t0 = time.perf_counter()
                    det_conf_tier1 = float(os.getenv("AI_VEHICLE_CONF", "0.16"))
                    raw_objs = self.vehicle_detector.detect(det_frame, conf=det_conf_tier1)
                    self.bench.tick("t1_objdet", (time.perf_counter() - _t0) * 1000.0)
                    for obj in raw_objs:
                        if is_roi_cropped:
                            ob = obj["bbox"]
                            obj["bbox"] = [ob[0] + crop_x1, ob[1] + crop_y1, ob[2] + crop_x1, ob[3] + crop_y1]
                        # Nếu không cho phép ngoài ROI: bỏ qua ngay các phương tiện bên ngoài khung ROI
                        if not self.track_outside_roi and not self._is_inside_roi(obj["bbox"], roi_pts):
                            continue
                        if obj.get("is_vehicle"):
                            detected_vehicles.append(obj)
                        elif obj.get("is_person"):
                            detected_persons.append(obj)
                except Exception as e:
                    pass
            if run_tier1:
                with self._state_lock:
                    self.current_vehicles = detected_vehicles
                    self.current_persons = detected_persons

                    # ĐỒNG BỘ THEO DÕI THÂN XE TẦNG 1 (Master Vehicle-Centric Track ID):
                    # 1. Luôn khớp `detected_vehicles` với `self.tracked_vehicles` TRƯỚC TIÊN để giữ nguyên 100% ID
                    #    của từng xe từ lúc xuất hiện đến lúc rời đi (kể cả khi biển số bị che khuất tạm thời).
                    unmatched_v_indices = set(range(len(detected_vehicles)))

                    for vid, v_data in list(self.tracked_vehicles.items()):
                        best_match = None
                        best_score = 0.0
                        old_box = v_data["bbox"]
                        old_cx = (old_box[0] + old_box[2]) / 2.0
                        old_cy = (old_box[1] + old_box[3]) / 2.0

                        for v_idx in list(unmatched_v_indices):
                            cand_box = detected_vehicles[v_idx]["bbox"]
                            iou = compute_iou(old_box, cand_box)
                            cand_cx = (cand_box[0] + cand_box[2]) / 2.0
                            cand_cy = (cand_box[1] + cand_box[3]) / 2.0
                            dist = ((old_cx - cand_cx) ** 2 + (old_cy - cand_cy) ** 2) ** 0.5

                            # Khớp theo IoU (>= 0.15) HOẶC khoảng cách tâm (< 90px cho xe di chuyển)
                            score = 0.0
                            if iou >= 0.15:
                                score = iou + 0.5
                            elif dist < 90.0:
                                score = 0.45 * (1.0 - dist / 90.0)

                            if score > best_score:
                                best_score = score
                                best_match = v_idx

                        if best_match is not None:
                            unmatched_v_indices.discard(best_match)
                            new_box = list(detected_vehicles[best_match]["bbox"])
                            new_cx = (new_box[0] + new_box[2]) / 2.0
                            new_cy = (new_box[1] + new_box[3]) / 2.0
                            inst_vx = new_cx - old_cx
                            inst_vy = new_cy - old_cy
                            old_vx, old_vy = v_data.get("velocity", (0.0, 0.0))
                            v_data["velocity"] = (old_vx * 0.5 + inst_vx * 0.5, old_vy * 0.5 + inst_vy * 0.5)

                            # Khoảng cách thực tế từ vị trí xuất hiện ban đầu (chống cộng dồn nhiễu rung hình của xe đỗ tĩnh!)
                            init_cx, init_cy = v_data.get("init_center", (old_cx, old_cy))
                            v_data["net_disp"] = ((new_cx - init_cx) ** 2 + (new_cy - init_cy) ** 2) ** 0.5

                            v_data["bbox"] = new_box
                            raw_t = str(detected_vehicles[best_match].get("vehicle_type") or v_data.get("type") or "CAR")
                            v_data["type"] = classify_vehicle(raw_t, new_box, None, None)
                            v_data["label"] = v_data["type"].lower()
                            v_data["confidence"] = detected_vehicles[best_match].get("confidence", 0.8)
                            v_data["hits"] = v_data.get("hits", 0) + 1
                            v_data["lost"] = 0
                            v_data["last_seen"] = time.time()
                        else:
                            v_data["lost"] = v_data.get("lost", 0) + 1
                            if v_data["lost"] >= 3:
                                del self.tracked_vehicles[vid]

                    # Dọn dẹp tức thì mọi xe đã rời khỏi hoàn toàn vùng ROI:
                    for vid, v_data in list(self.tracked_vehicles.items()):
                        vb = v_data.get("bbox")
                        if not vb:
                            del self.tracked_vehicles[vid]
                            continue
                        if roi_pts is not None and len(roi_pts) >= 3:
                            if not self.track_outside_roi and not self._is_inside_roi(vb, roi_pts):
                                del self.tracked_vehicles[vid]

                    # 2. Xe mới xuất hiện hoàn toàn: Cấp track_id ổn định duy nhất (tái sử dụng từ #1) và lưu tâm gốc `init_center`!
                    for v_idx in unmatched_v_indices:
                        vid = self._alloc_track_id()
                        b0 = list(detected_vehicles[v_idx]["bbox"])
                        cx0 = (b0[0] + b0[2]) / 2.0
                        cy0 = (b0[1] + b0[3]) / 2.0
                        self.tracked_vehicles[vid] = {
                            "bbox": b0,
                            "init_center": (cx0, cy0),
                            "net_disp": 0.0,
                            "velocity": (0.0, 0.0),
                            "type": detected_vehicles[v_idx].get("vehicle_type", "CAR"),
                            "confidence": detected_vehicles[v_idx].get("confidence", 0.8),
                            "label": detected_vehicles[v_idx].get("label", detected_vehicles[v_idx].get("vehicle_type", "car").lower()),
                            "hits": 1,
                            "lost": 0,
                            "last_seen": time.time()
                        }

                    # 3. Đồng bộ toạ độ thân xe sang `self.tracked_plates` (Bipartite 1-1 tổng quát: ưu tiên hộp thân xe nhỏ nhất bao chứa biển số)
                    claimed_vids = set()
                    for trk in self.tracked_plates.values():
                        pcx = (trk.bbox[0] + trk.bbox[2]) / 2.0
                        pcy = (trk.bbox[1] + trk.bbox[3]) / 2.0
                        best_vid = None
                        best_v_area = float("inf")
                        for vid, v_data in self.tracked_vehicles.items():
                            if vid in claimed_vids or v_data.get("lost", 0) > 0:
                                continue
                            vb = v_data["bbox"]
                            if (vb[0] - 12 <= pcx <= vb[2] + 12 and vb[1] - 12 <= pcy <= vb[3] + 12):
                                area = max(1, (vb[2] - vb[0]) * (vb[3] - vb[1]))
                                if area < best_v_area:
                                    best_v_area = area
                                    best_vid = vid
                        if best_vid is not None:
                            claimed_vids.add(best_vid)
                            matched_vdata = self.tracked_vehicles[best_vid]
                            trk.vehicle_bbox = list(matched_vdata["bbox"])
                            raw_vtype = str(matched_vdata.get("type") or trk.vehicle_type or "CAR")
                            trk.vehicle_type = classify_vehicle(raw_vtype, trk.vehicle_bbox, trk.plate_text, trk.bbox)
                            trk.vehicle_conf = float(matched_vdata.get("confidence", 0.85))
                            trk.vehicle_label = trk.vehicle_type.lower()
            else:
                # Khi bỏ qua scan Tier 1: Giữ nguyên vị trí ổn định từ frame trước (chống trôi dạt ra đường)
                with self._state_lock:
                    detected_vehicles = [
                        {
                            "bbox": v["bbox"],
                            "vehicle_type": v.get("type", "CAR"),
                            "confidence": v.get("confidence", 0.8),
                            "label": v.get("label", v.get("type", "car").lower()),
                            "is_vehicle": True
                        }
                        for v in self.tracked_vehicles.values()
                    ]
                    if not detected_vehicles and self.current_vehicles:
                        detected_vehicles = list(self.current_vehicles)
                    detected_persons = list(self.current_persons)

            # -----------------------------------------------------------------
            # TẦNG 2: NHẬN DIỆN VỊ TRÍ BIỂN SỐ (plate_det.onnx) - 1-PASS
            # -----------------------------------------------------------------
            _t0 = time.perf_counter()
            raw_detections = self.detector.detect(det_frame, conf_thresh=self.detector_conf, max_plates=12, is_video=True)
            self.bench.tick("t2_platedet", (time.perf_counter() - _t0) * 1000.0)
            if is_roi_cropped:
                for det in raw_detections:
                    db = det["bbox"]
                    det["bbox"] = [db[0] + crop_x1, db[1] + crop_y1, db[2] + crop_x1, db[3] + crop_y1]

            # LỌC HÌNH HỌC: Biển vuông xe máy (ar ~ 0.80 - 1.85) và Biển dài ô tô (ar ~ 2.5 - 5.5)
            raw_valid = []
            for det in raw_detections:
                bx1, by1, bx2, by2 = det["bbox"]
                bw, bh = bx2 - bx1, by2 - by1
                if bh < 8 or bw < self.min_plate_width:
                    continue
                ar = bw / float(bh)
                if 0.80 <= ar <= 5.5:
                    # LỌC THEO ROI (nếu không bật track_outside_roi)
                    if not self.track_outside_roi and not self._is_inside_roi(det["bbox"], roi_pts):
                        continue
                    raw_valid.append(det)

            # KHỬ TRÙNG LẤN NMS GIỮA CÁC DETECTIONS TRONG CÙNG KHUNG HÌNH
            raw_valid.sort(key=lambda d: d["confidence"], reverse=True)
            valid_detections = []
            for det in raw_valid:
                if any(compute_iou(det["bbox"], kept["bbox"]) > 0.30 for kept in valid_detections):
                    continue
                valid_detections.append(det)

            # LIÊN KẾT TẦNG 1 & TẦNG 2: Gán trực tiếp loại xe từ object_det.onnx (Hỗ trợ đa xe / đa biển số trong 1 khung hình)
            # Mỗi thân xe chỉ nhận tối đa 1 biển số khớp sát nhất (diện tích nhỏ nhất bao quanh tâm biển),
            # tránh việc 1 xe tải/ô tô to nuốt mất biển của xe máy đi cạnh!
            filtered_valid_detections = []
            claimed_v_indices = set()
            for det in valid_detections:
                pbx1, pby1, pbx2, pby2 = det["bbox"]
                pcx = (pbx1 + pbx2) / 2.0
                pcy = (pby1 + pby2) / 2.0

                matched_v = None
                matched_v_idx = None
                best_v_area = float("inf")
                for v_idx, v in enumerate(detected_vehicles):
                    if v_idx in claimed_v_indices:
                        continue
                    v_box = v.get("bbox")
                    if not isinstance(v_box, (list, tuple)) or len(v_box) < 4:
                        continue
                    vx1, vy1, vx2, vy2 = int(v_box[0]), int(v_box[1]), int(v_box[2]), int(v_box[3])
                    if (vx1 - 15) <= pcx <= (vx2 + 15) and (vy1 - 15) <= pcy <= (vy2 + 15):
                        v_area = max(1, (vx2 - vx1) * (vy2 - vy1))
                        if v_area < best_v_area:
                            best_v_area = v_area
                            matched_v = v
                            matched_v_idx = v_idx

                if matched_v_idx is not None:
                    claimed_v_indices.add(matched_v_idx)

                m_vbox = matched_v.get("bbox") if matched_v else None
                if matched_v and isinstance(m_vbox, (list, tuple)) and len(m_vbox) >= 4:
                    raw_type = str(matched_v.get("vehicle_type") or "CAR")
                    m_vbox_int = [int(m_vbox[0]), int(m_vbox[1]), int(m_vbox[2]), int(m_vbox[3])]
                    v_type = classify_vehicle(raw_type, m_vbox_int, None, det["bbox"])
                    det["vehicle_type"] = v_type
                    det["vehicle_bbox"] = m_vbox_int
                    det["vehicle_conf"] = float(matched_v.get("confidence", 0.0))
                    det["vehicle_label"] = v_type.lower()
                    filtered_valid_detections.append(det)
                else:
                    # Xe phóng nhanh có thể lướt qua trước khi Tier 1 kịp khớp thân xe:
                    # Giữ lại 100% mọi biển số do plate_det.onnx phát hiện để đọc OCR ngay lập tức!
                    det_bw = pbx2 - pbx1
                    det_bh = max(1, pby2 - pby1)
                    det_ar = det_bw / float(det_bh)
                    v_type = "MOTO" if det_ar < 1.85 else "CAR"
                    det["vehicle_type"] = v_type
                    det["vehicle_conf"] = 0.85
                    det["vehicle_label"] = v_type.lower()
                    det["vehicle_bbox"] = None
                    filtered_valid_detections.append(det)

            # -----------------------------------------------------------------
            # TẦNG 2+: KÍNH LÚP SOI BIỂN SỐ BÊN TRONG THÂN XE (Vehicle-Centric Plate Search)
            # Mặc định TẮT (AI_ENABLE_VEHICLE_CROP_DET=0) để tiết kiệm 65% CPU, đạt 20-25 FPS.
            # Chỉ chạy khi bật cờ này VÀ khi toàn khung hình chưa tìm thấy biển số nào.
            # -----------------------------------------------------------------
            enable_veh_crop = os.getenv("AI_ENABLE_VEHICLE_CROP_DET", "0").strip().lower() in ("1", "true", "yes")
            if enable_veh_crop and len(filtered_valid_detections) == 0:
                for v_idx, v in enumerate(detected_vehicles):
                    if v_idx in claimed_v_indices:
                        continue
                    v_box = v.get("bbox")
                    if not isinstance(v_box, (list, tuple)) or len(v_box) < 4:
                        continue
                    vx1, vy1, vx2, vy2 = int(v_box[0]), int(v_box[1]), int(v_box[2]), int(v_box[3])
                    v_box_int = [vx1, vy1, vx2, vy2]
                    vw = vx2 - vx1
                    vh = vy2 - vy1
                    if vw < 35 or vh < 35:
                        continue
                    # Soi các xe đang ở trong ROI hoặc đang tiến vào ROI
                    if not self.track_outside_roi and not self._is_inside_roi(v_box_int, roi_pts):
                        continue

                    pad_x = int(vw * 0.06)
                    pad_y = int(vh * 0.06)
                    cx1 = max(0, vx1 - pad_x)
                    cy1 = max(0, vy1 - pad_y)
                    cx2 = min(W, vx2 + pad_x)
                    cy2 = min(H, vy2 + pad_y)
                    veh_crop = frame_bgr[cy1:cy2, cx1:cx2]
                    if veh_crop.size == 0:
                        continue

                    # Quét biển số bên trong thân xe với ngưỡng nhạy 0.14:
                    sub_conf = min(0.14, float(self.detector_conf) * 0.75)
                    v_plates = self.detector.detect(veh_crop, conf_thresh=sub_conf, max_plates=2, is_video=True)
                    for vp in v_plates:
                        vpb = vp["bbox"]
                        mapped_bbox = [vpb[0] + cx1, vpb[1] + cy1, vpb[2] + cx1, vpb[3] + cy1]
                        mbw = mapped_bbox[2] - mapped_bbox[0]
                        mbh = max(1, mapped_bbox[3] - mapped_bbox[1])
                        mar = mbw / float(mbh)
                        if 0.70 <= mar <= 5.5 and mbw >= max(10, self.min_plate_width - 3):
                            raw_type = str(v.get("vehicle_type") or "CAR")
                            m_vbox_int = [vx1, vy1, vx2, vy2]
                            v_type = classify_vehicle(raw_type, m_vbox_int, None, mapped_bbox)
                            vp["bbox"] = mapped_bbox
                            vp["vehicle_type"] = v_type
                            vp["vehicle_bbox"] = m_vbox_int
                            vp["vehicle_conf"] = float(v.get("confidence", 0.8))
                            vp["vehicle_label"] = v_type.lower()
                            filtered_valid_detections.append(vp)
                            claimed_v_indices.add(v_idx)
                            break

            valid_detections = filtered_valid_detections

            # GHÉP NỐI detection VỚI danh sách xe đang bám (Tracker Association)
            _tn = time.time()
            if self._last_det_ts > 0.0:
                self._det_interval_ema = 0.8 * self._det_interval_ema + 0.2 * min(3.0, _tn - self._last_det_ts)
            self._last_det_ts = _tn
            with self._state_lock:
                if self.tracker_mode == "bytetrack":
                    self._associate_bytetrack(valid_detections, W, H, roi_pts)
                else:
                    self._associate_legacy(valid_detections, W, H, roi_pts)

                # DEBUG TRACKING (AI_TRACK_DEBUG=1): emit 1 khối [TRK] cho detector-frame này.
                self._debug_tracks(len(valid_detections))

                # -------------------------------------------------------------
                # KHỬ TRÙNG LẶP BIỂN SỐ (HỖ TRỢ ĐA BIỂN / ĐA XE TRONG CÙNG 1 KHUNG HÌNH)
                # Chỉ gộp 2 track khi chúng thực sự là CÙNG 1 BIỂN SỐ (chữ tương đồng hoặc 2 khung biển số đè lên nhau p_iou > 0.35).
                # TUYỆT ĐỐI KHÔNG gộp theo vehicle_bbox (v_iou) để xe thứ 2, thứ 3 đi bên cạnh ô tô luôn được nhận diện độc lập 100%!
                # -------------------------------------------------------------
                track_ids = list(self.tracked_plates.keys())
                for i in range(len(track_ids)):
                    t1_id = track_ids[i]
                    if t1_id not in self.tracked_plates:
                        continue
                    t1 = self.tracked_plates[t1_id]

                    for j in range(i + 1, len(track_ids)):
                        t2_id = track_ids[j]
                        if t2_id not in self.tracked_plates:
                            continue
                        t2 = self.tracked_plates[t2_id]

                        # Kiểm tra 1: Biển số quang học tương đồng (VD: 29A-612.80 vs 29H-612.80)
                        is_sim_plate = False
                        if t1.plate_text and t2.plate_text:
                            is_sim_plate = are_similar_plates(t1.plate_text, t2.plate_text)

                        p_iou = compute_iou(t1.bbox, t2.bbox)
                        c1x = (t1.bbox[0] + t1.bbox[2]) / 2.0
                        c1y = (t1.bbox[1] + t1.bbox[3]) / 2.0
                        c2x = (t2.bbox[0] + t2.bbox[2]) / 2.0
                        c2y = (t2.bbox[1] + t2.bbox[3]) / 2.0
                        max_bw = max(1, t1.bbox[2] - t1.bbox[0], t2.bbox[2] - t2.bbox[0])
                        center_dist = math.hypot(c1x - c2x, c1y - c2y)
                        spatially_close = p_iou > 0.10 or center_dist < (max_bw * 1.6)

                        # BẢO VỆ ĐA BIỂN TỔNG QUÁT (Bất biến theo tỉ lệ xa/gần của mọi góc camera):
                        # Nếu 2 hộp biển số không chồng lấn nhau (p_iou <= 0.35) và không phải cùng 1 biển ở sát nhau -> Giữ độc lập cả 2!
                        if p_iou <= 0.35 and not (is_sim_plate and spatially_close):
                            continue

                        if p_iou > 0.35 or (is_sim_plate and spatially_close):
                            len1 = len(clean_plate_text(t1.plate_text)) if t1.plate_text else 0
                            len2 = len(clean_plate_text(t2.plate_text)) if t2.plate_text else 0
                            score1 = (2000 if len1 > 0 else 0) + len1 * 150 + t1.ocr_conf * 15 + t1.hits * 2 - t1.frames_lost * 100
                            score2 = (2000 if len2 > 0 else 0) + len2 * 150 + t2.ocr_conf * 15 + t2.hits * 2 - t2.frames_lost * 100

                            if score1 >= score2:
                                drop_id = t2_id
                                keep_trk = t1
                            else:
                                drop_id = t1_id
                                keep_trk = t2

                            if not keep_trk.plate_text or (len(clean_plate_text(keep_trk.plate_text)) < 8 and max(len1, len2) >= 8):
                                if len1 >= len2 and t1.plate_text:
                                    keep_trk.plate_text = t1.plate_text
                                    keep_trk.ocr_conf = t1.ocr_conf
                                elif t2.plate_text:
                                    keep_trk.plate_text = t2.plate_text
                                    keep_trk.ocr_conf = t2.ocr_conf

                            if self.bt and self.tracker_mode == "bytetrack":
                                self.bt.drop(drop_id)
                            self.tracked_plates.pop(drop_id, None)

                            if drop_id == t1_id:
                                break
        else:
            # Khung hình bỏ qua detector: Nội suy toạ độ Kalman 30 FPS để khung di chuyển siêu mượt, không bị đứng hình
            with self._state_lock:
                for trk in self.tracked_plates.values():
                    if self.tracker_mode == "bytetrack" and self.bt:
                        pred = self.bt.predict_step(trk.track_id)
                        if pred and len(pred) >= 4:
                            trk.bbox = [int(pred[0]), int(pred[1]), int(pred[2]), int(pred[3])]
                    else:
                        trk.predict_step()
                for vid, v in self.tracked_vehicles.items():
                    vel = v.get("velocity", (0.0, 0.0))
                    if abs(vel[0]) > 0.1 or abs(vel[1]) > 0.1:
                        old_b = v["bbox"]
                        v["bbox"] = [
                            int(old_b[0] + vel[0]),
                            int(old_b[1] + vel[1]),
                            int(old_b[2] + vel[0]),
                            int(old_b[3] + vel[1])
                        ]

        # DỌN DẸP TRACK THÔNG MINH, TÁI SỬ DỤNG ID (#1, #2...) & BẮT XE ĐI NHANH (LAST-CHANCE EVENT FLUSH):
        # - Ngay khi xe đã vào ROI (`ever_in_roi`) mà đi ra khỏi vùng ROI hoặc mất dấu:
        #   nếu đã có biển số mà chưa gửi event -> Chốt ngay lập tức (force_last_chance=True)!
        # - Không xóa ngay lập tức ở frame 0 khi xe vừa chớm ra ngoài ROI (tránh xóa nhầm trước khi OCR trả về).
        max_lost_unconfirmed = 3
        max_lost_confirmed = 5
        with self._state_lock:
            for tid, trk in list(self.tracked_plates.items()):
                was_in_roi = getattr(trk, "ever_in_roi", False)
                outside_roi_now = has_roi and not self.is_track_in_roi(trk, roi_pts)
                exited_roi = was_in_roi and outside_roi_now
                if (trk.frames_lost >= 1 or exited_roi) and not trk.event_sent and trk.plate_text:
                    self._try_finalize_track_event(
                        trk, frame_bgr, now, events_triggered, force_last_chance=True
                    )

            dead_tracks = []
            for tid, trk in list(self.tracked_plates.items()):
                was_in_roi = getattr(trk, "ever_in_roi", False)
                outside_roi_now = has_roi and not self.is_track_in_roi(trk, roi_pts)
                exited_roi = was_in_roi and outside_roi_now

                # Bảo vệ an toàn cho track đang đợi OCR worker async (tối đa 8 frames)
                if getattr(trk, "ocr_pending", False) and trk.frames_lost < 8:
                    continue

                # 1. Xe đã gửi event thành công và đã ra khỏi ROI: dọn dẹp sau 3 frame để giải phóng slot cho xe sau
                if trk.event_sent and exited_roi and trk.frames_lost >= 3:
                    dead_tracks.append(tid)
                    continue

                # 2. Xe chưa đọc được biển và mất dấu quá lâu (>= max_lost_unconfirmed)
                if not trk.plate_text and trk.frames_lost >= max_lost_unconfirmed:
                    dead_tracks.append(tid)
                    continue

                # 3. Xe đã mất dấu quá lâu (>= max_lost_confirmed)
                if trk.frames_lost >= max_lost_confirmed:
                    dead_tracks.append(tid)
                    continue
            for tid in dead_tracks:
                if self.bt and self.tracker_mode == "bytetrack":
                    self.bt.drop(tid)
                trk = self.tracked_plates.get(tid)
                if trk is not None:
                    trk.release_best_shot()
                del self.tracked_plates[tid]
                self.tracked_vehicles.pop(tid, None)

        # ---------------------------------------------------------------------
        # BƯỚC 2: NHẬN DIỆN CHỮ VIETOCR & KIỂM ĐỊNH QUY CHUẨN (CHỐNG ẢO GIÁC)
        # ---------------------------------------------------------------------
        # CHỌN BIỂN GỌI OCR CHO FRAME NÀY (chống nghẽn khi NHIỀU XE chạy liên tục):
        # - Mỗi frame chỉ gọi ocr_per_frame biển số (mặc định 3); các track còn lại
        #   giữ nguyên state (last_ocr_frame, plate_votes, best_shot) và đến lượt ở frame kế.
        # - Ưu tiên thứ tự (fine tier chạy trước coarse):
        #   (1) track CHƯA đọc được chữ, (2) đã cắt tripwire, (3) FINE tier (bw>=near_px
        #   hoặc đã cắt tripwire -> biển GẦN, cần nhiều vote) trước COARSE (biển xa),
        #   (4) biển to nhất.
        # ---------------------------------------------------------------
        # CHỌN BIỂN GỌI OCR: HỖ TRỢ NHẬN DIỆN LIÊN TỤC (CONTINUOUS ALPR RECOGNITION)
        # - Xe mới đến / chưa có chữ: nổ OCR liên tục (frame_gap=1 hoặc 2) để đọc ngay tức thì.
        # - Xe đã có chữ biển: duy trì nhịp nhận diện liên tục định kỳ để bám sát và làm tươi dữ liệu.
        # - Cho phép nhận diện cả xe trong và ngoài ROI khi bật track_outside_roi.
        # ---------------------------------------------------------------
        _cand: List[Tuple[int, int, int, float, int]] = []
        for _t in self.tracked_plates.values():
            _bw = _t.bbox[2] - _t.bbox[0]
            if _bw < max(10, self.min_plate_width - 3):
                continue
            _in_roi = self.is_track_in_roi(_t, roi_pts)
            if not self.track_outside_roi and not (_in_roi or _t.crossed):
                continue

            # Chu kỳ OCR nhận diện liên tục thông minh (hỗ trợ bắt tức thì biển số thứ 2 xuất hiện nối tiếp):
            if not _t.plate_text or not _t.event_sent:
                _gap = 1
            elif _t.ocr_conf < 85.0:
                _gap = 2
            else:
                _gap = 4  # Kiểm tra định kỳ mỗi 4 frames để phát hiện ngay nếu có biển số mới thế chỗ
            if (self.frame_count - _t.last_ocr_frame) < _gap:
                continue

            _area = _bw * max(1, _t.bbox[3] - _t.bbox[1])
            # FINE tier: biển GẦN (chiều rộng >= AI_NEAR_PX) hoặc đã cắt tripwire -> ưu tiên thread.
            _is_fine = 0 if (_bw >= self.near_px or _t.crossed or _in_roi) else 1
            _cand.append((0 if (not _t.plate_text or not _t.event_sent) else 1, 0 if (_t.crossed or _in_roi) else 1, _is_fine, -_area, id(_t)))
        _cand.sort()
        # Nếu có Thread Pool: cho phép đẩy đồng thời TẤT CẢ các biển trong khung hình vào pool chạy song song!
        max_ocr = max(self.ocr_per_frame, getattr(self.pool, "per_cam_limit", 8)) if self.pool is not None else max(4, self.ocr_per_frame)
        allowed_ocr_ids = set(c[4] for c in _cand[: max_ocr])

        self.active_in_roi = False

        # SNAPSHOT FRAME (1 lần) cho BEST-SHOT trong chế độ ASYNC:
        # DRAIN chạy sau vài frame; nếu reader TÁI DỤNG buffer, phải dùng copy chụp
        # ở THỜI ĐIỂM SUBMIT (khung hình này), không phải tham chiếu live.
        frame_snapshot = frame_bgr.copy() if self.pool is not None else frame_bgr

        for track in list(self.tracked_plates.values()):
            bw = track.bbox[2] - track.bbox[0]
            bh = track.bbox[3] - track.bbox[1]
            is_in_roi = self.is_track_in_roi(track, roi_pts)
            self._update_tripwire_cross(track, W, H)

            if is_in_roi:
                self.active_in_roi = True
                track.ever_in_roi = True  # type: ignore
                # Khi xe vừa chạm vào ROI mà đã đọc sẵn được biển số từ vùng đệm phía trước -> Chốt sự kiện ngay tức thì!
                if track.plate_text and not track.event_sent:
                    self._try_finalize_track_event(
                        track, frame_bgr, now, events_triggered, force_last_chance=False
                    )

            # Chu kỳ OCR nhận diện liên tục:
            if not track.plate_text or not track.event_sent or len(clean_plate_text(track.plate_text)) < 8:
                frame_gap = 1
            elif track.ocr_conf < 85.0:
                frame_gap = 2
            else:
                frame_gap = 4

            # Cho phép đọc OCR trước từ xa (ngoài ROI) cho xe mới xuất hiện hoặc đang di chuyển để bắt xe phóng nhanh,
            # nhưng bỏ qua xe đỗ tĩnh ngoài ROI (như xe đỗ trong gara bên phải) để không tốn CPU!
            is_moving_or_new_outside = self.track_outside_roi and (
                track.hits <= 3 or abs(track.vx) >= 1.5 or abs(track.vy) >= 1.5
            )
            can_ocr = (
                id(track) in allowed_ocr_ids
                and (is_in_roi or is_moving_or_new_outside)
                and bw >= max(10, self.min_plate_width - 3)
                and (self.frame_count - track.last_ocr_frame >= frame_gap)
                and not track.ocr_pending  # đang chạy trên worker thread -> không submit trùng
            )

            if can_ocr:
                x1, y1, x2, y2 = track.bbox

                # Thêm padding ngang 16% và dọc 14% để TUYỆT ĐỐI KHÔNG bị cắt lẹm chữ số cuối (như 30E-402.80 bị lẹm số 0 thành 30F4028)
                pad_x = max(6, int(bw * 0.16))
                pad_y = max(5, int(bh * 0.14))
                mx1, my1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
                mx2, my2 = min(W, x2 + pad_x), min(H, y2 + pad_y)

                raw_crop = frame_bgr[my1:my2, mx1:mx2]
                if raw_crop.size > 0:
                    # BỘ LỌC ĐỘ NÉT: Hạ xuống 1.2 để không bỏ sót xe chạy nhanh bị nhòe chuyển động (Motion Blur)
                    sharpness = calculate_sharpness(raw_crop)
                    if sharpness < 1.2:
                        continue

                    track.ocr_attempts += 1
                    track.last_ocr_frame = self.frame_count

                    # ============================================================
                    # DESKEW + ENHANCE + ONNX OCR  (hoặc giao cho worker pool)
                    # ============================================================
                    if self.pool is not None:
                        # ===== ASYNC (bật khi AI_OCR_MAX_TOTAL>0): không block loop camera =====
                        # Loop camera chỉ submit rồi `continue`; worker chạy deskew+ONNX trên
                        # thread riêng, kết quả compact được push về `self._ocr_results`.
                        # DRAIN (đầu process_frame) chỉ chạy trên thread loop -> không data race.
                        # Default-arg chụp giá trị TẠI THỜI ĐIỂM SUBMIT (bảo vệ đúng crop/frame).
                        track.ocr_pending = True
                        _crop_now = raw_crop.copy()  # copy riêng, không phụ thuộc vòng đời frame

                        def _job(_crop: np.ndarray = _crop_now) -> Dict[str, Any]:
                            # CHỈ chạy trên worker thread (deskew + enhance + ONNX = tính toán thuần,
                            # pure function, không state -> thread-safe, không data race).
                            b0 = time.perf_counter()
                            _rect, _meta = deskew_and_rectify(_crop)
                            _enh = preprocess_for_ocr(_rect)
                            self.bench.tick("deskew", (time.perf_counter() - b0) * 1000.0)
                            b1 = time.perf_counter()
                            _pt, _oc = self.ocr.predict(_enh, skip_deskew=True, skip_enhance=True)
                            # FALLBACK CHỐNG LÓA ĐÈN PHA / HỒNG NGOẠI BAN ĐÊM:
                            # Chỉ chạy pass 2 khi pass 1 không đọc được chữ VÀ ảnh thực sự bị chói lóa nặng (>18% điểm ảnh cháy sáng),
                            # tránh chạy 2 lần ONNX OCR gây nghẽn hàng đợi CPU vào ban ngày!
                            _oc_f = float(_oc) if isinstance(_oc, (int, float)) else 0.0
                            if not _pt and _rect.size > 0 and (np.sum(_rect > 240) > _rect.size * 0.18):
                                _glare = recover_glare_image(_rect)
                                if _glare is not None and _glare is not _rect:
                                    _enh2 = preprocess_for_ocr(_glare)
                                    _pt2, _oc2 = self.ocr.predict(_enh2, skip_deskew=True, skip_enhance=True)
                                    _oc2_f = float(_oc2) if isinstance(_oc2, (int, float)) else 0.0
                                    if _pt2 and _oc2_f > _oc_f:
                                        _pt, _oc = _pt2, _oc2
                            self.bench.tick("ocr_onnx", (time.perf_counter() - b1) * 1000.0)
                            return {"pt": _pt, "oc": _oc, "meta": _meta}

                        def _cb(_res: Optional[Dict[str, Any]],
                                _trk: TrackedPlate = track,
                                _crop: np.ndarray = _crop_now,
                                _sh: float = sharpness,
                                _bw: int = bw,
                                _bh: int = bh,
                                _frame: np.ndarray = frame_snapshot) -> None:
                            # Gọi trên worker thread (SUY RA KẾT QUẢ) -> chỉ push kết quả COMPACT
                            # vào queue; mọi đột biến track/state do DRAIN (loop thread) đảm nhiệm.
                            _ok = _res is not None
                            self._ocr_results.put({
                                "t": _trk, "ok": _ok,
                                "plate_text": _res["pt"] if _ok else "",
                                "ocr_conf": float(_res["oc"]) if _ok else 0.0,
                                "meta": _res["meta"] if _ok else {},
                                "sharpness": _sh, "bw": _bw, "bh": _bh,
                                "frame": _frame, "crop": _crop,
                            })

                        if not self.pool.submit(self.cam_key, _job, _cb):
                            track.ocr_pending = False   # camera đạt fair-limit -> bỏ qua frame này
                        continue

                    # ===== SYNC (MẶC ĐỊNH, pool=None): hành vi 100% như trước, an toàn =====
                    _t_dw = time.perf_counter()
                    rectified, meta = deskew_and_rectify(raw_crop)
                    enhanced = preprocess_for_ocr(rectified)
                    self.bench.tick("deskew", (time.perf_counter() - _t_dw) * 1000.0)

                    _t_onnx = time.perf_counter()
                    plate_text, ocr_conf = self.ocr.predict(enhanced, skip_deskew=True, skip_enhance=True)
                    ocr_conf_f = float(ocr_conf) if isinstance(ocr_conf, (int, float)) else 0.0
                    if not plate_text and rectified.size > 0 and (np.sum(rectified > 240) > rectified.size * 0.18):
                        glare_fixed = recover_glare_image(rectified)
                        if glare_fixed is not None and glare_fixed is not rectified:
                            enh2 = preprocess_for_ocr(glare_fixed)
                            pt2, oc2 = self.ocr.predict(enh2, skip_deskew=True, skip_enhance=True)
                            oc2_f = float(oc2) if isinstance(oc2, (int, float)) else 0.0
                            if pt2 and oc2_f > ocr_conf_f:
                                plate_text, ocr_conf = pt2, oc2
                    self.bench.tick("ocr_onnx", (time.perf_counter() - _t_onnx) * 1000.0)

                    # Áp dụng kết quả OCR vào track (chung 1 con đường cho cả sync & async)
                    self._apply_ocr_result(
                        track, plate_text, ocr_conf, sharpness, meta,
                        bw, bh, frame_bgr, raw_crop, now, events_triggered,
                    )

        # DỌN DẸP BỘ NHỚ RAM VÀ Ổ ĐĨA ĐỊNH KỲ (CHỐNG TRÀN RAM & TRÀN Ổ CỨNG)
        if self.frame_count % 120 == 0:
            cutoff = now - (self.cooldown_sec * 2)
            self.plate_cooldown_registry = {k: v for k, v in self.plate_cooldown_registry.items() if v > cutoff}
        if self.frame_count % 300 == 0:
            gc.collect()
            self._prune_old_snapshots()

        if not draw_overlay:
            return annotated, events_triggered

        # ---------------------------------------------------------------------
        # BƯỚC 3: VẼ GIAO DIỆN BÁM BIỂN TRỰC QUAN (VISUAL TRACKING OVERLAYS)
        # ---------------------------------------------------------------------
        # 1. Vẽ Khung ảo ROI / Multi-lane (Mỗi làn 1 màu)
        if self.lanes:
            LANE_PALETTE = [(240, 180, 50), (50, 200, 100), (50, 140, 255), (220, 100, 200), (255, 100, 100)]
            for l_idx, lane in enumerate(self.lanes):
                l_roi = lane.get("roi")
                if l_roi and len(l_roi) >= 3:
                    l_pts = np.array([[int(x * W), int(y * H)] for x, y in l_roi], dtype=np.int32)
                    col = LANE_PALETTE[l_idx % len(LANE_PALETTE)]
                    cv2.polylines(annotated, [l_pts], isClosed=True, color=col, thickness=2, lineType=cv2.LINE_AA)
                    cv2.putText(annotated, lane.get("name", f"LAN {l_idx+1}"), (l_pts[0][0], max(25, l_pts[0][1] - 8)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2, cv2.LINE_AA)
        else:
            roi_color = (0, 230, 100) if self.active_in_roi else (240, 180, 50)
            roi_thickness = 3 if self.active_in_roi else 2
            cv2.polylines(annotated, [roi_pts], isClosed=True, color=roi_color, thickness=roi_thickness, lineType=cv2.LINE_AA)

            rx, ry = roi_pts[0][0], max(30, roi_pts[0][1] - 10)
            roi_status_text = "VUNG KHUNG AO (VIRTUAL ROI) - CO XE DANG VAO" if self.active_in_roi else "VUNG KHUNG AO (VIRTUAL ROI) - CHO XE"
            cv2.putText(annotated, roi_status_text, (rx, ry), cv2.FONT_HERSHEY_SIMPLEX, 0.60, roi_color, 2, cv2.LINE_AA)

        # Vẽ vạch ảo Tripwire (màu cam) nếu đã cấu hình
        if self.tripwire_normalized is not None:
            ta = (int(self.tripwire_normalized[0][0] * W), int(self.tripwire_normalized[0][1] * H))
            tb = (int(self.tripwire_normalized[1][0] * W), int(self.tripwire_normalized[1][1] * H))
            cv2.line(annotated, ta, tb, (0, 140, 255), 3, cv2.LINE_AA)
            cv2.putText(annotated, "TRIPWIRE", (ta[0], max(20, ta[1] - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 140, 255), 2, cv2.LINE_AA)

        # 2. Vẽ Bounding Box bám theo từng biển số (TRACKING & LABELS)
        for track in self.tracked_plates.values():
            is_in_roi = self.is_track_in_roi(track, roi_pts)
            # CHỈ VẼ CÁC MỤC TIÊU TRONG ROI
            if not self.track_outside_roi and not is_in_roi:
                continue
            if not is_in_roi and not track.plate_text:
                continue

            bx1, by1, bx2, by2 = track.bbox
            box_color = (0, 255, 120) if track.plate_text else (0, 215, 255)
            cv2.rectangle(annotated, (bx1, by1), (bx2, by2), box_color, 2)

            # Vẽ các góc ngắm bắn (Target Corners)
            c_len = min(15, (bx2 - bx1) // 4, (by2 - by1) // 4)
            cv2.line(annotated, (bx1, by1), (bx1 + c_len, by1), box_color, 4)
            cv2.line(annotated, (bx1, by1), (bx1, by1 + c_len), box_color, 4)
            cv2.line(annotated, (bx2, by1), (bx2 - c_len, by1), box_color, 4)
            cv2.line(annotated, (bx2, by1), (bx2, by1 + c_len), box_color, 4)
            cv2.line(annotated, (bx1, by2), (bx1 + c_len, by2), box_color, 4)
            cv2.line(annotated, (bx1, by2), (bx1, by2 - c_len), box_color, 4)
            cv2.line(annotated, (bx2, by2), (bx2 - c_len, by2), box_color, 4)
            cv2.line(annotated, (bx2, by2), (bx2, by2 - c_len), box_color, 4)

            # Nhãn thông tin bám ngay trên đầu biển số
            if track.plate_text:
                status_suffix = " [DA CHECK-IN]" if track.event_sent else ""
                label_txt = f"[{track.track_id}] {track.plate_text} ({track.ocr_conf:.0f}%){status_suffix}"
                badge_bg = (0, 160, 50) if track.event_sent else (0, 180, 60)
            else:
                det_pct = track.det_conf if track.det_conf <= 100.0 else track.det_conf / 100.0
                label_txt = f"[{track.track_id}] BIEN SO ({int(det_pct)}%)"
                badge_bg = (0, 130, 200)

            (tw, th), baseline = cv2.getTextSize(label_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.60, 2)
            lbl_y1 = max(0, by1 - th - 12)
            lbl_y2 = by1
            lbl_x1 = bx1
            lbl_x2 = min(W, bx1 + tw + 12)

            cv2.rectangle(annotated, (lbl_x1, lbl_y1), (lbl_x2, lbl_y2), badge_bg, -1)
            cv2.putText(annotated, label_txt, (lbl_x1 + 6, lbl_y2 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2, cv2.LINE_AA)

        # 3. Vẽ Bảng Dashboard HUD trên đỉnh video
        self._draw_hud(annotated, W, H)

        return annotated, events_triggered

    def _draw_hud(self, img: np.ndarray, w: int, h: int):
        """Vẽ thanh thông tin Dashboard chuyên nghiệp trên đầu khung hình."""
        # Nền banner mờ trên đỉnh
        overlay = img.copy()
        cv2.rectangle(overlay, (0, 0), (w, 80), (15, 23, 42), -1)
        cv2.addWeighted(overlay, 0.75, img, 0.25, 0, img)
        cv2.line(img, (0, 80), (w, 80), (56, 189, 248), 2)

        # Trạng thái Barie
        if self.barrier_state == "OPEN":
            bar_color = (0, 220, 80)
            bar_text = "BARRIER: MO (OPEN) - MOI VAO"
        else:
            bar_color = (50, 70, 240)
            bar_text = "BARRIER: DONG (CLOSED) - DUNG XE"

        cv2.rectangle(img, (16, 16), (320, 64), (30, 41, 59), -1)
        cv2.rectangle(img, (16, 16), (320, 64), bar_color, 2)
        cv2.putText(img, bar_text, (28, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.55, bar_color, 2, cv2.LINE_AA)

        # Biển số gần nhất nhận diện được
        plate_str = self.last_detected_plate if self.last_detected_plate else "CHO XE..."
        conf_str = f"({self.last_plate_confidence:.0f}%)" if self.last_detected_plate else ""
        cv2.putText(img, "BIEN SO MOI NHAT:", (350, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (148, 163, 184), 1, cv2.LINE_AA)
        cv2.putText(img, f"{plate_str} {conf_str}", (350, 64), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (255, 255, 255), 2, cv2.LINE_AA)

        # Thông tin Frame rate / Hệ thống
        time_str = datetime.now().strftime("%H:%M:%S")
        cv2.putText(img, f"CAMERA: ALPR-LANE-01 | {time_str}", (w - 280, 48),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (56, 189, 248), 1, cv2.LINE_AA)

    def process_video_stream(
        self,
        video_source: Any,
        output_path: Optional[str] = None,
        max_frames: Optional[int] = None,
        display_window: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Xử lý toàn bộ luồng video (File MP4, Webcam Index 0, hoặc Luồng RTSP).
        """
        cap = cv2.VideoCapture(video_source)
        if not cap.isOpened():
            raise RuntimeError(f"Không thể mở luồng video từ nguồn: {video_source}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        writer = None
        if output_path:
            fourcc_func = getattr(cv2, "VideoWriter_fourcc", cv2.VideoWriter.fourcc)
            fourcc = fourcc_func(*"mp4v")
            writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        print(f"\n[BẮT ĐẦU XỬ LÝ VIDEO]")
        print(f"  - Nguồn: {video_source}")
        print(f"  - Độ phân giải: {width}x{height} | FPS: {fps:.1f} | Tổng số frame: {total_frames}")
        if output_path:
            print(f"  - Xuất video kết quả ra: {output_path}")

        processed_count = 0
        t0 = time.time()

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                processed_count += 1
                annotated_frame, events = self.process_frame(frame)

                if events:
                    for ev in events:
                        print(f"  🚗 [SỰ KIỆN] {ev['timestamp']} -> Biển số: {ev['plate']} (Tin cậy: {ev['confidence']}%) | Mở Barie!")

                if writer:
                    writer.write(annotated_frame)

                if display_window:
                    try:
                        cv2.imshow("ALPR Video Stream", annotated_frame)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            print("[INFO] Người dùng bấm 'q' để dừng xem video.")
                            break
                    except Exception:
                        display_window = False

                if max_frames and processed_count >= max_frames:
                    break

                if processed_count % 30 == 0:
                    elapsed = time.time() - t0
                    cur_fps = processed_count / max(0.001, elapsed)
                    print(f"  ... Đã xử lý {processed_count}/{total_frames or '?'} frames ({cur_fps:.1f} FPS)")

        finally:
            cap.release()
            if writer:
                writer.release()
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass

        elapsed_total = time.time() - t0
        avg_fps = processed_count / max(0.001, elapsed_total)
        print(f"\n🎉 [HOÀN TẤT] Xử lý xong {processed_count} frames trong {elapsed_total:.1f}s ({avg_fps:.1f} FPS)!")
        print(f"👉 Tổng số lượt xe nhận diện thành công: {len(self.history_events)}")
        return self.history_events


# =============================================================================
# HÀM SINH VIDEO MẪU ĐỂ TEST KỊCH BẢN (NẾU CHƯA CÓ FILE VIDEO THẬT)
# =============================================================================

def generate_mock_traffic_video(output_mp4: str, num_seconds: int = 6):
    """
    Tạo 1 video mô phỏng xe tiến từ xa vào cổng barie (độ phân giải 1280x720, 25 FPS)
    bằng cách phóng to và di chuyển ảnh xe mẫu vào đúng Vùng Khung Ảo ROI.
    """
    from PIL import Image

    # Tìm 1 ảnh xe mẫu trong dataset
    sample_dir = MODLE_ROOT / "DATA_LICENSE_PLATE" / "dataset" / "train" / "images"
    if not sample_dir.exists():
        sample_dir = MODLE_ROOT / "DATA_LICENSE_PLATE" / "license_plate_kaggle" / "valid" / "images"

    images = list(sample_dir.glob("*.jpg")) if sample_dir.exists() else []
    if not images:
        print("[LỖI] Không tìm thấy ảnh xe để sinh video mô phỏng!")
        return None

    car_img = cv2.imread(str(images[0]))
    if car_img is None:
        return None

    W, H = 1280, 720
    fps = 25
    total_frames = num_seconds * fps
    fourcc_func = getattr(cv2, "VideoWriter_fourcc", cv2.VideoWriter.fourcc)
    fourcc = fourcc_func(*"mp4v")
    out = cv2.VideoWriter(output_mp4, fourcc, fps, (W, H))

    print(f"[INFO] Đang tạo video mô phỏng dài {num_seconds}s từ ảnh '{images[0].name}'...")

    for f_idx in range(total_frames):
        # Tạo hiệu ứng xe từ xa (nhỏ) chạy từ từ tiến vào cổng (lớn dần)
        progress = f_idx / float(total_frames)
        scale = 0.45 + (progress * 0.55)  # từ 45% đến 100% kích thước
        cur_w = int(W * scale)
        cur_h = int(H * scale)
        resized_car = cv2.resize(car_img, (cur_w, cur_h))

        frame = np.zeros((H, W, 3), dtype=np.uint8)
        # Nền đường xám
        frame[:] = (45, 52, 60)

        # Đặt xe vào giữa khung hình, trượt từ trên xuống dưới
        start_y = int(50 + progress * (H - cur_h - 40))
        start_x = int((W - cur_w) / 2)

        start_y = max(0, min(H - cur_h, start_y))
        start_x = max(0, min(W - cur_w, start_x))

        frame[start_y:start_y + cur_h, start_x:start_x + cur_w] = resized_car
        out.write(frame)

    out.release()
    print(f"✅ Video mô phỏng đã được tạo thành công tại: {output_mp4}")
    return output_mp4


if __name__ == "__main__":
    print("=" * 80)
    print("DEMO KỊCH BẢN XỬ LÝ ALPR CHO VIDEO")
    print("=" * 80)

    # 1. Tạo video mô phỏng mẫu
    mock_video = BASE_DIR / "mock_car_entry.mp4"
    generate_mock_traffic_video(str(mock_video), num_seconds=6)

    # 2. Khởi tạo Processor và chạy kịch bản
    output_annotated = BASE_DIR / "mock_car_entry_annotated.mp4"
    processor = VideoALPRProcessor(frame_skip=3, cooldown_sec=3.0)
    processor.process_video_stream(str(mock_video), output_path=str(output_annotated))
