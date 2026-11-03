#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
THUẦN ONNX LPR ENGINE (PADDLE PP-OCR CTC RECOGNIZER + PLATE LINE DETECTOR)
========================================================================
Port trực tiếp từ SdkInfer (C# .NET) sang Python ONNX Runtime:
1. plate_line.onnx: Phát hiện dòng chữ (1 dòng hoặc 2 dòng trên/dưới).
2. plate_rec.onnx: Nhận diện ký tự OCR qua PP-OCRv6 CTC greedy decoding (input 48x320 BGR).
3. plate_rec.yml: Bảng từ điển 18.000+ ký tự chuẩn.
4. Bộ khử nhầm lẫn ký tự quang học (Lookalike mapping) & quy chuẩn biển số Việt Nam.

Ưu điểm vượt trội:
- Tốc độ siêu nhanh: ~15-25ms / biển số.
- Cực nhẹ: Không phụ thuộc PyTorch Transformer nặng nề.
- Hỗ trợ cả NVIDIA CUDA GPU và CPU fallback.
- Giao diện: predict(image_input) -> (plate_text, conf).
"""

import os
import sys
import unicodedata
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any, Union

import cv2
import numpy as np
from PIL import Image

# Thư mục gốc AI Service
CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent if CURRENT_DIR.name == "core" else CURRENT_DIR
MODELS_DIR = AI_SERVICE_DIR / "models"

# Thêm đường dẫn vào sys.path
for p in (AI_SERVICE_DIR, CURRENT_DIR, AI_SERVICE_DIR / "utils"):
    if p.exists() and str(p) not in sys.path:
        sys.path.insert(0, str(p))

try:
    from utils.plate_validator import clean_plate_text, validate_vietnam_plate, format_plate_display
    from utils.plate_grammar import clean_raw_ocr_text, decode_plate_top_line, decode_plate_bottom_line
except ImportError:
    try:
        from plate_validator import clean_plate_text, validate_vietnam_plate, format_plate_display  # type: ignore
        from plate_grammar import clean_raw_ocr_text, decode_plate_top_line, decode_plate_bottom_line  # type: ignore
    except ImportError:
        def clean_plate_text(t: str) -> str:
            return "".join(c for c in t if c.isalnum()).upper()
        def validate_vietnam_plate(t: str) -> Tuple[bool, str, Optional[str]]:
            return True, t, None
        def format_plate_display(t: str) -> str:
            return t
        clean_raw_ocr_text = clean_plate_text
        decode_plate_top_line = clean_plate_text
        decode_plate_bottom_line = clean_plate_text


ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# Bản đồ ký tự tương đồng (Lookalike mappings từ SdkInfer)
DEFAULT_CHAR_MAP: Dict[str, str] = {
    "€": "C",
    "đ": "D",
    "Đ": "D",
    "¢": "C",
    "©": "C",
    "®": "R",
    "°": "0",
    "•": "",
    "·": "",
    "-": "",
    ".": "",
    " ": "",
}


def load_onnx_session(model_path: Union[str, Path]):
    """Khởi tạo ONNX Runtime InferenceSession với cấu hình tối ưu luồng CPU và CUDA tự động."""
    import onnxruntime as ort

    from core.model_vault import resolve_model, create_secure_session
    model_path = resolve_model(model_path)
    if not model_path.exists():
        # Fallback thử tìm trong thư mục SdkInfer gốc nếu models trong ai_service chưa có
        alt_path = AI_SERVICE_DIR.parent.parent / "MODULE_AI_CONG_NGHIEP" / "SdkInfer-examples-gpu" / "models" / model_path.name
        if alt_path.exists():
            model_path = alt_path
        else:
            raise FileNotFoundError(f"Không tìm thấy file mô hình ONNX: {model_path}")

    available_providers = ort.get_available_providers()

    # --- AUTO CPU/GPU (Q1): có GPU NVIDIA + onnxruntime-gpu thì chạy GPU, không thì CPU ---
    force_cpu = os.getenv("AI_FORCE_CPU", "0") in ("1", "true", "True")
    _use_gpu = os.getenv("AI_USE_GPU", "").lower()
    if _use_gpu in ("0", "false", "no"):
        force_cpu = True

    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.enable_mem_pattern = True
    so.enable_cpu_mem_arena = True
    total_cores = os.cpu_count() or 4
    default_threads = "2"
    cpu_threads = max(1, int(os.getenv("AI_CPU_THREADS", default_threads)))
    so.intra_op_num_threads = min(cpu_threads, max(1, os.cpu_count() or cpu_threads))
    so.inter_op_num_threads = 1

    # Lớp 3: model .enc được giải mã thẳng vào RAM và xóa ngay khỏi heap sau khi nạp
    session = None
    # 1. Thử ưu tiên chạy trên GPU nếu CUDA có sẵn
    if not force_cpu and "CUDAExecutionProvider" in available_providers:
        try:
            session = create_secure_session(model_path, sess_options=so, providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
        except Exception:
            session = None

    # 2. Nếu không có GPU hoặc khởi tạo GPU thất bại -> Fallback mượt mà sang CPU
    if session is None:
        session = create_secure_session(model_path, sess_options=so, providers=["CPUExecutionProvider"])

    active_provider = session.get_providers()[0] if session.get_providers() else "CPUExecutionProvider"
    return session, active_provider



# =============================================================================
# 0. BỘ NHẬN DIỆN XE VÀ NGƯỜI (OBJECT & VEHICLE DETECTOR - ONNX) - TẦNG 1 SDKINFER
# =============================================================================

class OnnxObjectDetector:
    """
    TẦNG 1 SDKINFER PIPELINE:
    Phát hiện phương tiện giao thông (car, motorcycle, truck, bus, bicycle) & người (person).
    - Model: object_det.onnx (Ultralytics YOLO26s End2End [1, 300, 6], input 640x640 RGB normalized)
    - Output: danh sách xe và người trong khung hình kèm tọa độ bbox thực tế.
    """
    COCO_CLASSES = {
        0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane', 5: 'bus',
        6: 'train', 7: 'truck', 8: 'boat'
    }

    VEHICLE_MAP = {
        2: 'CAR',
        3: 'MOTO',
        5: 'BUS',
        7: 'TRUCK',
        1: 'BICYCLE'
    }

    def __init__(self, model_path: Optional[Union[str, Path]] = None, conf_thresh: float = 0.25):
        self.model_path = Path(model_path) if model_path else (MODELS_DIR / "object_det.onnx")
        self.conf_thresh = conf_thresh
        self.session, self.active_provider = load_onnx_session(self.model_path)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

        dims = self.session.get_inputs()[0].shape
        self.input_h = dims[2] if len(dims) > 2 and isinstance(dims[2], int) and dims[2] > 0 else 640
        self.input_w = dims[3] if len(dims) > 3 and isinstance(dims[3], int) and dims[3] > 0 else 640

    def detect(self, img_bgr: np.ndarray, conf: Optional[float] = None) -> List[Dict[str, Any]]:
        """Phát hiện các đối tượng phương tiện và người trong toàn bộ khung hình camera (Tầng 1 SdkInfer)."""
        h, w = img_bgr.shape[:2]
        if h < 20 or w < 20:
            return []

        c_thresh = float(conf) if conf is not None else float(self.conf_thresh)

        # Chuẩn hóa ảnh: resize (640, 640), RGB, chia 255.0 theo chuẩn SdkInfer
        resized = cv2.resize(img_bgr, (self.input_w, self.input_h), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]

        outputs = self.session.run([self.output_name], {self.input_name: blob})
        dets = np.asarray(outputs[0])[0]  # shape: [300, 6] -> [x1, y1, x2, y2, score, class_id]

        scale_x = float(w) / self.input_w
        scale_y = float(h) / self.input_h

        results = []
        for det in dets:
            score = float(det[4])
            if score < c_thresh:
                continue

            cid = int(det[5])
            # Chỉ lọc xe và người
            if cid not in (0, 1, 2, 3, 5, 7):
                continue

            x1 = max(0, min(w, int(det[0] * scale_x)))
            y1 = max(0, min(h, int(det[1] * scale_y)))
            x2 = max(0, min(w, int(det[2] * scale_x)))
            y2 = max(0, min(h, int(det[3] * scale_y)))

            if (x2 - x1) < 20 or (y2 - y1) < 20:
                continue

            label = self.COCO_CLASSES.get(cid, 'unknown')
            v_type = self.VEHICLE_MAP.get(cid, 'PERSON' if cid == 0 else 'OTHER')

            results.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": score,
                "class_id": cid,
                "label": label,
                "vehicle_type": v_type,
                "is_vehicle": cid in self.VEHICLE_MAP,
                "is_person": (cid == 0)
            })

        # NMS liên lớp (Cross-Class NMS): Triệt tiêu việc 1 xe bị nhận diện đúp (vừa là Ô tô vừa là Xe tải)
        if len(results) > 1:
            results.sort(key=lambda r: r["confidence"], reverse=True)
            kept = []
            for r in results:
                box = r["bbox"]
                duplicate = False
                for k in kept:
                    # Chỉ khử trùng giữa 2 loại xe (car vs truck) hoặc 2 người, TUYỆT ĐỐI không khử trùng Người và Xe máy
                    is_both_veh = r.get("is_vehicle") and k.get("is_vehicle")
                    is_both_person = r.get("is_person") and k.get("is_person")
                    if not (is_both_veh or is_both_person):
                        continue

                    inter_w = min(box[2], k["bbox"][2]) - max(box[0], k["bbox"][0])
                    inter_h = min(box[3], k["bbox"][3]) - max(box[1], k["bbox"][1])
                    if inter_w > 0 and inter_h > 0:
                        inter_area = inter_w * inter_h
                        box_area = (box[2] - box[0]) * (box[3] - box[1])
                        k_area = (k["bbox"][2] - k["bbox"][0]) * (k["bbox"][3] - k["bbox"][1])
                        union_area = box_area + k_area - inter_area
                        iou = inter_area / max(1.0, float(union_area))
                        smaller_area = min(box_area, k_area)
                        contained = inter_area / max(1.0, float(smaller_area))
                        if iou > 0.40 or contained > 0.70:
                            duplicate = True
                            break
                if not duplicate:
                    kept.append(r)
            return kept

        return results


# =============================================================================
# 1. BỘ PHÁT HIỆN DÒNG CHỮ BIỂN SỐ (PLATE LINE DETECTOR - ONNX)
# =============================================================================

class OnnxLineDetector:
    """
    Phát hiện các dòng chữ trong khung hình biển số (1 dòng dài hoặc 2 dòng vuông).
    - Model: plate_line.onnx
    - Input: [1, 3, 640, 640] normalized RGB (x / 255.0)
    - Output: [1, 300, 6] -> [x1, y1, x2, y2, conf, class_id]
    """
    def __init__(self, model_path: Optional[Union[str, Path]] = None, conf_thresh: float = 0.25):
        self.model_path = Path(model_path) if model_path else (MODELS_DIR / "plate_line.onnx")
        self.conf_thresh = conf_thresh

        self.session, self.active_provider = load_onnx_session(self.model_path)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

        dims = self.session.get_inputs()[0].shape
        self.input_h = dims[2] if len(dims) > 2 and isinstance(dims[2], int) and dims[2] > 0 else 640
        self.input_w = dims[3] if len(dims) > 3 and isinstance(dims[3], int) and dims[3] > 0 else 640

    def detect_lines(self, plate_bgr: np.ndarray, conf: Optional[float] = None) -> List[Dict[str, Any]]:
        """Phát hiện các dòng chữ trong ảnh biển số, trả về danh sách bounding boxes theo toạ độ ảnh gốc."""
        h, w = plate_bgr.shape[:2]
        if h < 8 or w < 15:
            return []

        c_thresh = conf if conf is not None else self.conf_thresh

        # Direct resize RGB float32 / 255.0
        resized = cv2.resize(plate_bgr, (self.input_w, self.input_h), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]

        outputs = self.session.run([self.output_name], {self.input_name: blob})
        raw_out = np.asarray(outputs[0])
        dets = raw_out[0]

        scale_x = float(w) / self.input_w
        scale_y = float(h) / self.input_h

        lines = []
        for det in dets:
            score = float(det[4])
            if score < c_thresh:
                continue
            x1 = max(0, min(w, int(det[0] * scale_x)))
            y1 = max(0, min(h, int(det[1] * scale_y)))
            x2 = max(0, min(w, int(det[2] * scale_x)))
            y2 = max(0, min(h, int(det[3] * scale_y)))
            if (x2 - x1) >= 10 and (y2 - y1) >= 6:
                lines.append({
                    "bbox": [x1, y1, x2, y2],
                    "confidence": score,
                    "class_id": int(det[5]) if len(det) > 5 else 0
                })
        return lines

    def pick_lines(self, plate_bgr: np.ndarray, lines: List[Dict[str, Any]]) -> List[np.ndarray]:
        """
        Phân loại dòng theo logic của SdkInfer:
        1. Hai dòng (top + bottom): biển vuông / 2 dòng.
        2. Một dòng: lấy dòng chữ lớn nhất.
        3. Không tìm thấy dòng: trả về toàn bộ ảnh biển số.
        """
        h, w = plate_bgr.shape[:2]
        if not lines:
            return [plate_bgr]

        # Tìm dòng lớn nhất ở nửa trên và nửa dưới
        def center_y(l):
            return (l["bbox"][1] + l["bbox"][3]) * 0.5

        def line_area(l):
            return (l["bbox"][2] - l["bbox"][0]) * (l["bbox"][3] - l["bbox"][1])

        top_candidates = [l for l in lines if center_y(l) < h * 0.55]
        top = max(top_candidates, key=line_area) if top_candidates else None

        bottom = None
        if top is not None:
            top_h = top["bbox"][3] - top["bbox"][1]
            top_cy = center_y(top)
            bottom_candidates = [
                l for l in lines
                if l is not top
                and center_y(l) > h * 0.45
                and (center_y(l) - top_cy) >= 0.4 * min(l["bbox"][3] - l["bbox"][1], top_h)
            ]
            if bottom_candidates:
                bottom = max(bottom_candidates, key=line_area)

        # Cắt crop với chút padding an toàn
        def crop_with_pad(bbox: List[int], pad: float = 0.04) -> np.ndarray:
            bx1, by1, bx2, by2 = bbox
            bw, bh = bx2 - bx1, by2 - by1
            px = int(bw * pad)
            py = int(bh * pad)
            x1 = max(0, bx1 - px)
            y1 = max(0, by1 - py)
            x2 = min(w, bx2 + px)
            y2 = min(h, by2 + py)
            return plate_bgr[y1:y2, x1:x2]

        if top is not None and bottom is not None:
            return [crop_with_pad(top["bbox"]), crop_with_pad(bottom["bbox"])]
        elif lines:
            best = max(lines, key=line_area)
            return [crop_with_pad(best["bbox"])]
        else:
            return [plate_bgr]


# =============================================================================
# 2. BỘ NHẬN DIỆN KÝ TỰ ONNX PP-OCR CTC (PLATE RECOGNIZER - ONNX)
# =============================================================================

class OnnxPlateRecognizer:
    """
    Mô hình nhận diện ký tự PP-OCRv6 CTC ONNX:
    - Model: plate_rec.onnx
    - Dictionary: plate_rec.yml
    - Input: [1, 3, 48, 320] BGR normalized: (x / 127.5) - 1.0 trên canvas xám (127, 127, 127)
    - Output: [1, time_steps, num_classes] CTC decode
    """
    REC_HEIGHT = 48
    REC_WIDTH = 320

    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        dict_path: Optional[Union[str, Path]] = None
    ):
        self.model_path = Path(model_path) if model_path else (MODELS_DIR / "plate_rec.onnx")
        self.dict_path = Path(dict_path) if dict_path else (MODELS_DIR / "plate_rec.yml")

        self.session, self.active_provider = load_onnx_session(self.model_path)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

        self.dictionary: List[str] = self._load_dictionary(self.dict_path)
        self.lookalikes: Dict[str, str] = self._build_lookalikes()

        # Ánh xạ chữ cái Alphabet sang chỉ số class trong từ điển
        self.alphabet_classes: Dict[str, int] = {}
        for idx, entry in enumerate(self.dictionary):
            if len(entry) == 1 and entry in ALPHABET:
                self.alphabet_classes[entry] = idx + 1  # class 0 là CTC blank

    def _load_dictionary(self, dict_path: Path) -> List[str]:
        """Đọc bảng từ điển ký tự từ file plate_rec.yml theo đúng quy chuẩn PP-OCR / SdkInfer."""
        if not dict_path.exists():
            alt_path = AI_SERVICE_DIR.parent.parent / "MODULE_AI_CONG_NGHIEP" / "SdkInfer-examples-gpu" / "models" / dict_path.name
            if alt_path.exists():
                dict_path = alt_path
            else:
                raise FileNotFoundError(f"Không tìm thấy file từ điển ký tự: {dict_path}")

        dictionary = []
        in_dict = False
        with open(dict_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip(" \t\r\n")
                if not line:
                    continue
                if line.startswith("character_dict:"):
                    in_dict = True
                    continue
                if not in_dict:
                    continue
                if line != "-" and not line.startswith("- "):
                    break

                ch = line[2:] if len(line) > 2 else " "
                if len(ch) >= 2 and ((ch[0] == "'" and ch[-1] == "'") or (ch[0] == '"' and ch[-1] == '"')):
                    ch = ch[1:-1].replace("''", "'")
                dictionary.append(ch)

        return dictionary

    def _build_lookalikes(self) -> Dict[str, str]:
        """Xây dựng bảng thay thế ký tự tương đồng (Lookalike / Fullwidth / Unicode fold)."""
        lookalikes = dict(DEFAULT_CHAR_MAP)
        for entry in self.dictionary:
            if not entry or entry in lookalikes:
                continue
            if len(entry) == 1 and entry in ALPHABET:
                continue

            # Unicode KD normalization
            folded = unicodedata.normalize("NFKD", entry)
            if not folded or not (folded[0].isalnum()):
                continue
            # Nếu ký tự đầu là ASCII letter/digit
            first_c = folded[0].upper()
            if first_c in ALPHABET:
                lookalikes[entry] = first_c
        return lookalikes

    def _prepare_canvas(self, crop_bgr: np.ndarray) -> np.ndarray:
        """
        Chuẩn hóa ảnh crop theo chuẩn SdkInfer:
        Resize tỉ lệ về height=48 (width tối đa 320), gắn vào canvas xám 127, chuẩn hóa (x / 127.5) - 1.0 trong hệ BGR.
        """
        h, w = crop_bgr.shape[:2]
        if h == 0 or w == 0:
            return np.zeros((1, 3, self.REC_HEIGHT, self.REC_WIDTH), dtype=np.float32)

        scaled_w = max(1, int(round(float(self.REC_HEIGHT) * w / max(1, h))))
        target_w = min(self.REC_WIDTH, scaled_w)

        canvas = np.full((self.REC_HEIGHT, self.REC_WIDTH, 3), 127, dtype=np.uint8)
        resized = cv2.resize(crop_bgr, (target_w, self.REC_HEIGHT), interpolation=cv2.INTER_LINEAR)
        canvas[0:self.REC_HEIGHT, 0:target_w] = resized

        # BGR: (x / 127.5) - 1.0 -> shape [1, 3, 48, 320]
        norm = (canvas.astype(np.float32) / 127.5) - 1.0
        blob = np.transpose(norm, (2, 0, 1))[np.newaxis, ...]
        return blob

    def recognize_crop(self, crop_bgr: np.ndarray) -> Tuple[str, float, List[Dict[str, Any]]]:
        """
        Nhận diện ký tự của một dòng biển số qua CTC Greedy Decode.
        Trả về: (văn_bản_đọc_được, độ_tin_cậy_trung_bình, danh_sách_chi_tiết_ký_tự)
        """
        blob = self._prepare_canvas(crop_bgr)
        outputs = self.session.run([self.output_name], {self.input_name: blob})
        # raw_out shape: [1, steps, num_classes]
        raw_out = np.asarray(outputs[0])
        data = raw_out[0]
        steps, num_classes = data.shape

        chars_read: List[Dict[str, Any]] = []
        previous = -1
        conf_scores: List[float] = []

        dict_len = len(self.dictionary)

        for t in range(steps):
            row = data[t]
            best = int(np.argmax(row))

            # class 0 là CTC blank
            if best != 0 and (best - 1) < dict_len:
                ch = self.dictionary[best - 1]
                prob = float(row[best])

                if best != previous:
                    # Thay thế ký tự lookalike nếu có
                    mapped_ch = self.lookalikes.get(ch, ch)
                    chars_read.append({
                        "char": mapped_ch,
                        "raw_char": ch,
                        "class_id": best,
                        "prob": prob,
                        "step": t
                    })
                    conf_scores.append(prob)

            previous = best

        # Lọc ký tự hợp lệ
        line_text = "".join(c["char"] for c in chars_read if c["char"] in ALPHABET or c["char"] in ("-", "."))
        avg_conf = (sum(conf_scores) / len(conf_scores)) if conf_scores else 0.0

        return line_text, avg_conf, chars_read


# =============================================================================
# 3. COMPOSITE LPR ENGINE (HOÀN CHỈNH: LINE DETECT + CTC OCR + GRAMMAR VIETNAM)
# =============================================================================

class OnnxLprEngine:
    """
    Engine nhận diện biển số thuần ONNX hoàn chỉnh:
    - Nhận ảnh biển số (toàn cảnh hoặc crop)
    - Tự động phát hiện 1 dòng hoặc 2 dòng bằng plate_line.onnx
    - Giải mã từng dòng bằng plate_rec.onnx qua CTC Greedy Decode
    - Ghép nối và chuẩn hóa theo quy chuẩn biển số Việt Nam
    - Cung cấp hàm predict(image_input) -> (plate_text, conf)
    """
    def __init__(
        self,
        line_model_path: Optional[Union[str, Path]] = None,
        rec_model_path: Optional[Union[str, Path]] = None,
        dict_path: Optional[Union[str, Path]] = None,
        plate_model_path: Optional[Union[str, Path]] = None
    ):
        print("[INFO] Đang nạp mô hình SdkInfer ONNX LPR Engine (Thuần ONNX)...")
        self.line_detector = OnnxLineDetector(line_model_path)
        self.recognizer = OnnxPlateRecognizer(rec_model_path, dict_path)
        self._plate_detector = None
        self._plate_model_path = plate_model_path
        print(f"  👉 Line Detector Provider : {self.line_detector.active_provider}")
        print(f"  👉 Recognizer Provider    : {self.recognizer.active_provider}")
        print(f"  👉 Từ điển ký tự nạp      : {len(self.recognizer.dictionary)} mục")
        print("[INFO] Nạp mô hình ONNX LPR Engine thành công! Sẵn sàng xử lý siêu tốc.\n")

    @property
    def plate_detector(self):
        """Khởi tạo YOLOXPlateDetector khi cần nhận diện ảnh toàn cảnh."""
        if self._plate_detector is None:
            try:
                from core.plate_detector_deskew import YOLOXPlateDetector
            except ImportError:
                from plate_detector_deskew import YOLOXPlateDetector  # type: ignore
            self._plate_detector = YOLOXPlateDetector(self._plate_model_path)
        return self._plate_detector

    def predict(
        self,
        image_input: Union[str, Path, np.ndarray, Image.Image],
        return_prob: bool = True,
        skip_deskew: bool = False,
        skip_enhance: bool = False
    ) -> Tuple[str, float]:
        """
        Hàm nhận diện biển số:
        - Hỗ trợ cả ẢNH TOÀN CẢNH XE (tự phát hiện biển) lẫn ẢNH CROP BIỂN SỐ.
        - Trả về: (biển_số_chuẩn_hóa, độ_tin_cậy_0_đến_1)
        """
        # 1. Chuyển đổi định dạng đầu vào về np.ndarray BGR
        if isinstance(image_input, (str, Path)):
            from utils.image_utils import imread_unicode
            img_bgr = imread_unicode(image_input)
        elif isinstance(image_input, np.ndarray):
            if len(image_input.shape) == 2:
                img_bgr = cv2.cvtColor(image_input, cv2.COLOR_GRAY2BGR)
            elif image_input.shape[2] == 4:
                img_bgr = cv2.cvtColor(image_input, cv2.COLOR_BGRA2BGR)
            else:
                img_bgr = image_input.copy()
        elif isinstance(image_input, Image.Image):
            rgb = np.array(image_input.convert("RGB"))
            img_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        else:
            raise ValueError("Đầu vào phải là đường dẫn ảnh, np.ndarray hoặc đối tượng PIL.Image")

        if img_bgr is None or img_bgr.size == 0:
            return "", 0.0

        h, w = img_bgr.shape[:2]

        # 2. Nếu đầu vào là ảnh toàn cảnh lớn (chỉ chạy khi chưa cắt sẵn biển số skip_deskew=False)
        if not skip_deskew and (w > 360 or h > 200):
            plates = self.plate_detector.detect(img_bgr, conf_thresh=0.20, is_video=True)
            if not plates:
                return "", 0.0
            best_plate = max(plates, key=lambda p: float(p.get("confidence", 0.0)))
            bx1, by1, bx2, by2 = best_plate["bbox"]
            pw, ph = bx2 - bx1, by2 - by1
            pad_x = max(1, int(pw * 0.02))
            pad_y = max(1, int(ph * 0.02))
            x1 = max(0, bx1 - pad_x)
            y1 = max(0, by1 - pad_y)
            x2 = min(w, bx2 + pad_x)
            y2 = min(h, by2 + pad_y)
            img_bgr = img_bgr[y1:y2, x1:x2]
            if img_bgr.size == 0:
                return "", 0.0
            h, w = img_bgr.shape[:2]

        # 3. Phát hiện các dòng chữ qua plate_line.onnx (chuẩn SdkInfer)
        detected_lines = self.line_detector.detect_lines(img_bgr)
        line_crops = self.line_detector.pick_lines(img_bgr, detected_lines)

        # 4. Đọc từng dòng chữ bằng OnnxPlateRecognizer qua CTC Greedy Decode
        read_lines: List[str] = []
        confs: List[float] = []

        for crop in line_crops:
            text, conf, _ = self.recognizer.recognize_crop(crop)
            cleaned = clean_plate_text(text)
            if cleaned:
                read_lines.append(cleaned)
                confs.append(conf)

        if not read_lines:
            return "", 0.0

        # 5. Hậu xử lý ghép dòng ngữ pháp biển số Việt Nam
        ar = float(w) / float(max(1, h))
        if len(read_lines) >= 2 and ar < 2.2:
            top_line = decode_plate_top_line(read_lines[0])
            bot_line = decode_plate_bottom_line(read_lines[1])
            final_text = f"{top_line}{bot_line}"
        else:
            raw_single = "".join(read_lines) if ar >= 2.2 else read_lines[0]
            try:
                from utils.plate_grammar import decode_single_line_plate
                final_text = decode_single_line_plate(raw_single)
            except Exception:
                final_text = raw_single

        final_cleaned = clean_plate_text(final_text)
        avg_confidence = float(sum(confs) / len(confs)) if confs else 0.0

        # Kiểm định quy chuẩn biển số Việt Nam
        is_valid, validated_text, _ = validate_vietnam_plate(final_cleaned)
        if is_valid:
            final_cleaned = validated_text
            avg_confidence = min(1.0, avg_confidence * 1.05)

        return final_cleaned, avg_confidence


# =============================================================================
# KIỂM THỬ ĐỘC LẬP (SELF-TEST)
# =============================================================================

if __name__ == "__main__":
    import sys
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore
            sys.stderr.reconfigure(encoding="utf-8")  # type: ignore
        except Exception:
            pass

    print("=" * 70)
    print("KIỂM TRA ONNX LPR ENGINE (PADDLE PP-OCR CTC + LINE DETECTOR)")
    print("=" * 70)

    engine = OnnxLprEngine()

    test_samples = [
        AI_SERVICE_DIR.parent.parent / "MODULE_AI_CONG_NGHIEP" / "SdkInfer-examples-gpu" / "examples" / "images" / "plate.jpg",
        AI_SERVICE_DIR.parent.parent / "MODULE_AI_CONG_NGHIEP" / "SdkInfer-examples-gpu" / "examples" / "images" / "plate3.jpg",
        AI_SERVICE_DIR.parent.parent / "MODULE_AI_CONG_NGHIEP" / "SdkInfer-examples-gpu" / "examples" / "images" / "plate5.jpg",
    ]

    for p in test_samples:
        if p.exists():
            text, conf = engine.predict(p)
            print(f"Ảnh: {p.name}")
            print(f"  👉 Biển số đọc được : {text} ({format_plate_display(text)})")
            print(f"  👉 Độ tin cậy       : {conf * 100:.2f}%\n")
