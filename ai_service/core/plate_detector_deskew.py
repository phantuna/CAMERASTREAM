#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Module Phát Hiện Vị Trí Biển Số (YOLOX) & Làm Phẳng Góc Nghiêng (Deskew / Perspective Transform)
- Input: Ảnh chụp xe toàn cảnh hoặc ảnh crop góc nghiêng
- Output: 
    1. Vị trí biển số (Bounding Box)
    2. Ảnh biển số đã cắt và nắn phẳng (Deskewed / Rectified Plate)
    3. Nhận diện chữ biển số bằng ONNX LPR
"""

import os
import sys
import math

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore
    except Exception:
        pass

from pathlib import Path
from typing import List, Tuple, Optional, Dict

import cv2
import numpy as np
from PIL import Image

# Thư mục dự án
BASE_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = BASE_DIR.parent if BASE_DIR.name == "core" else BASE_DIR
PROJECT_ROOT = AI_SERVICE_DIR.parent.parent / "MODLE_LICIENSEPLATE"
if not PROJECT_ROOT.exists():
    PROJECT_ROOT = AI_SERVICE_DIR

for p in (AI_SERVICE_DIR, BASE_DIR, AI_SERVICE_DIR / "utils"):
    if p.exists() and str(p) not in sys.path:
        sys.path.insert(0, str(p))

try:
    from core.model_vault import resolve_model
    ONNX_PLATE_WEIGHTS = resolve_model(AI_SERVICE_DIR / "models" / "plate_det.onnx")
except Exception:
    ONNX_PLATE_WEIGHTS = AI_SERVICE_DIR / "models" / "plate_det.onnx"

if not ONNX_PLATE_WEIGHTS.exists():
    sdk_weights = AI_SERVICE_DIR.parent.parent / "MODULE_AI_CONG_NGHIEP" / "SdkInfer-examples-gpu" / "models" / "plate_det.onnx"
    if sdk_weights.exists():
        ONNX_PLATE_WEIGHTS = sdk_weights

YOLOX_WEIGHTS = ONNX_PLATE_WEIGHTS


# =============================================================================
# 0b. NMS THUẦN NUMPY (thay torchvision.ops.nms — bỏ phụ thuộc torch mỗi frame)
# =============================================================================
def _nms_numpy(boxes: List[List[float]], scores: List[float], iou_thresh: float) -> List[int]:
    """Non-Maximum Suppression thuần numpy (trả về index giữ lại)."""
    import numpy as np
    if not boxes:
        return []
    x1 = np.array([b[0] for b in boxes], dtype=np.float32)
    y1 = np.array([b[1] for b in boxes], dtype=np.float32)
    x2 = np.array([b[2] for b in boxes], dtype=np.float32)
    y2 = np.array([b[3] for b in boxes], dtype=np.float32)
    area = (x2 - x1) * (y2 - y1)
    order = np.argsort(scores)[::-1]
    keep = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        iou = inter / np.maximum(1e-6, area[i] + area[order[1:]] - inter)
        order = order[1:][iou <= iou_thresh]
    return keep


# =============================================================================
# 1. THUẬT TOÁN LÀM PHẲNG & KHỬ NGHIÊNG BIỂN SỐ (DESKEW & PERSPECTIVE WARP)
# =============================================================================

def order_points(pts: np.ndarray) -> np.ndarray:
    """
    Sắp xếp 4 điểm góc theo thứ tự chuẩn:
    [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
    """
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # Top-Left: tổng x+y nhỏ nhất
    rect[2] = pts[np.argmax(s)]  # Bottom-Right: tổng x+y lớn nhất

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # Top-Right: hiệu y-x nhỏ nhất
    rect[3] = pts[np.argmax(diff)]  # Bottom-Left: hiệu y-x lớn nhất

    return rect


def deskew_and_rectify(image_bgr: np.ndarray) -> Tuple[np.ndarray, dict]:
    """
    Nắn phẳng và khử độ nghiêng của biển số:
    1. Thử tìm 4 góc của khung biển số để biến đổi phối cảnh (Perspective Transform)
    2. Nếu không tìm được 4 góc rõ ràng, khử xoay góc nghiêng (Affine Rotation Deskew)
    """
    h, w = image_bgr.shape[:2]
    meta = {"method": "none", "angle": 0.0, "rectified": False}

    if h < 10 or w < 20:
        return image_bgr, meta

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.bilateralFilter(gray, 9, 75, 75)

    # -------------------------------------------------------------
    # PHƯƠNG PHÁP 1: TÌM 4 GÓC ĐỂ CHIẾU PHỐI CẢNH (PERSPECTIVE WARP)
    # -------------------------------------------------------------
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 19, 7
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    plate_contour = None
    for c in contours:
        area = cv2.contourArea(c)
        if area < (w * h * 0.20):  # Phải chiếm tối thiểu 20% diện tích
            continue

        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.035 * peri, True)

        if len(approx) == 4:
            # Kiểm tra hình tứ giác lồi
            if cv2.isContourConvex(approx):
                plate_contour = approx
                break

    if plate_contour is not None:
        pts = plate_contour.reshape(4, 2).astype("float32")
        rect = order_points(pts)
        (tl, tr, br, bl) = rect

        # Tính toán chiều rộng mới
        width_top = np.linalg.norm(tr - tl)
        width_bot = np.linalg.norm(br - bl)
        max_w = max(int(width_top), int(width_bot))

        # Tính toán chiều cao mới
        height_r = np.linalg.norm(tr - br)
        height_l = np.linalg.norm(tl - bl)
        max_h = max(int(height_r), int(height_l))

        # Đảm bảo tỷ lệ khung biển số hợp lý (hỗ trợ cả biển vuông xe máy lẫn biển dài ô tô)
        aspect = max_w / max(1, max_h)
        if 0.85 <= aspect <= 6.5 and max_w > 30 and max_h > 18:
            dst = np.array([
                [0, 0],
                [max_w - 1, 0],
                [max_w - 1, max_h - 1],
                [0, max_h - 1]
            ], dtype="float32")

            M = cv2.getPerspectiveTransform(rect, dst)
            warped = cv2.warpPerspective(image_bgr, M, (max_w, max_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            meta = {"method": "perspective_4points", "angle": 0.0, "rectified": True}
            return warped, meta

    # -------------------------------------------------------------
    # -------------------------------------------------------------
    # PHƯƠNG PHÁP 2: KHỬ ĐỘ NGHIÊNG BẰNG ĐƯỜNG NGANG HOUGH (HOUGH LINES)
    # Chỉ bắt các đường kẻ ngang có góc lệch nhỏ (tối đa 15 độ)
    # -------------------------------------------------------------
    edges = cv2.Canny(blurred, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=25, minLineLength=int(w * 0.35), maxLineGap=6)
    hough_angle = None
    if lines is not None and len(lines) >= 3:
        lines = lines.reshape(-1, 4)
        angles = []
        for x1, y1, x2, y2 in lines:
            dx = float(x2 - x1)
            dy = float(y2 - y1)
            if dx != 0:
                ang = math.degrees(math.atan2(dy, dx))
                if -15.0 <= ang <= 15.0:
                    angles.append(ang)
        if len(angles) >= 3 and float(np.std(angles)) < 3.5:
            hough_angle = float(np.median(angles))

    # CHỐNG BẺ NHẦM & TỐI ƯU TỐC ĐỘ REAL-TIME:
    # Dùng trực tiếp góc Hough Lines (nhanh < 1ms), bỏ vòng lặp xoay thử 17 lần Projection Profile gây trễ CPU,
    # vì Tầng 3 (`plate_line.onnx`) đã tự động bắt dòng nghiêng chuẩn SdkInfer!
    target_angle = 0.0
    method_name = "none"

    if hough_angle is not None and abs(hough_angle) >= 1.5:
        target_angle = max(-8.0, min(8.0, hough_angle))
        method_name = "hough_rotation"

    if 1.5 <= abs(target_angle) <= 15.0:
        center = (w // 2, h // 2)
        rot_mat = cv2.getRotationMatrix2D(center, target_angle, 1.0)
        rotated = cv2.warpAffine(
            image_bgr, rot_mat, (w, h),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )
        meta = {"method": method_name, "angle": round(target_angle, 1), "rectified": True}
        return rotated, meta

    return image_bgr, meta


# =============================================================================
# 2. MODEL PHÁT HIỆN BIỂN SỐ XE (ONNX DETECTOR - THAY THẾ YOLOX)
# =============================================================================

class OnnxPlateDetector:
    """
    Bộ phát hiện biển số xe công nghiệp ứng dụng ONNX Runtime (End-to-End NMS Model).
    - Model: plate_det.onnx (Kích thước input: 640x640 RGB normalized)
    - Tốc độ cực nhanh: ~15-25ms / frame, hỗ trợ GPU CUDA và CPU fallback
    - Output: [{"bbox": [x1, y1, x2, y2], "confidence": 88.82, "source": "onnx"}]
    """
    def __init__(self, weights_path=None, conf_thresh=0.20, nms_thresh=0.45, input_size=(640, 640)):
        if weights_path is None:
            weights_path = ONNX_PLATE_WEIGHTS
        from core.model_vault import resolve_model, create_secure_session
        self.weights_path = resolve_model(weights_path)

        # Nếu truyền đường dẫn .pth cũ hoặc file không tồn tại, tự động chuyển sang plate_det.onnx
        if not self.weights_path.exists() or self.weights_path.suffix == ".pth":
            _default = resolve_model(ONNX_PLATE_WEIGHTS)
            if _default.exists():
                self.weights_path = _default
            elif not self.weights_path.exists():
                raise FileNotFoundError(f"Không tìm thấy file trọng số phát hiện biển số ONNX: {self.weights_path}")

        self.conf_thresh = conf_thresh
        self.nms_thresh = nms_thresh
        self.input_size = input_size

        print(f"[INFO] Đang nạp mô hình phát hiện biển số ONNX Runtime...")
        print(f"  Trọng số: {self.weights_path}")
        print(f"  Kích thước input: {self.input_size}")

        import onnxruntime as ort
        available_providers = ort.get_available_providers()

        # AUTO CPU/GPU (Q1): có GPU NVIDIA + onnxruntime-gpu thì chạy GPU, không thì CPU.
        # Env: AI_FORCE_CPU=1 (hoặc AI_USE_GPU=0/false) -> BẮT BUỘC CPU. Mặc định = AUTO.
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

        # Lớp 3: .enc giải mã vào RAM và xóa ngay khỏi heap sau khi nạp
        session = None
        if not force_cpu and "CUDAExecutionProvider" in available_providers:
            try:
                session = create_secure_session(self.weights_path, sess_options=so, providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
            except Exception:
                session = None

        if session is None:
            session = create_secure_session(self.weights_path, sess_options=so, providers=["CPUExecutionProvider"])

        if session is None:
            raise RuntimeError(f"Không thể khởi tạo ONNX InferenceSession cho mô hình: {self.weights_path}")

        self.session = session
        self.active_provider = session.get_providers()[0] if session.get_providers() else "CPUExecutionProvider"
        self.input_name = session.get_inputs()[0].name
        self.output_name = session.get_outputs()[0].name
        print(f"  Thiết bị / Provider hoạt động: {self.active_provider} (Luồng CPU: {cpu_threads})")
        print("[INFO] Nạp mô hình ONNX Plate Detector thành công!\n")

    def preprocess_direct(self, img_bgr: np.ndarray) -> np.ndarray:
        """Chuẩn hóa ảnh theo chuẩn SdkInfer: resize trực tiếp về (640, 640), RGB, chia 255.0 (không letterbox)"""
        target_h, target_w = self.input_size
        resized = cv2.resize(img_bgr, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        return np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]

    def preprocess(self, img_bgr: np.ndarray) -> Tuple[np.ndarray, float, Tuple[int, int]]:
        """Letterbox resize giữ nguyên tỷ lệ khung hình với padding (114, 114, 114)"""
        h, w = img_bgr.shape[:2]
        target_h, target_w = self.input_size
        r = min(target_h / h, target_w / w)
        new_unpad_w, new_unpad_h = round(w * r), round(h * r)

        resized = cv2.resize(img_bgr, (new_unpad_w, new_unpad_h), interpolation=cv2.INTER_LINEAR)

        dw = (target_w - new_unpad_w) / 2.0
        dh = (target_h - new_unpad_h) / 2.0
        top = round(dh - 0.1)
        bottom = round(dh + 0.1)
        left = round(dw - 0.1)
        right = round(dw + 0.1)

        padded = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))

        # BGR -> RGB -> normalize 0..1 -> transpose (1, 3, H, W)
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]
        return blob, r, (left, top)

    def _run_pass_direct(self, img: np.ndarray, conf: float, offset=(0, 0), inv_scale: float = 1.0) -> List[dict]:
        """Chạy ONNX detector trực tiếp theo chuẩn SdkInfer (direct resize)"""
        if self.session is None:
            raise RuntimeError("Mô hình ONNX Plate Detector chưa được nạp (session is None)!")
        h, w = img.shape[:2]
        target_h, target_w = self.input_size
        blob = self.preprocess_direct(img)
        raw_outputs = self.session.run([self.output_name], {self.input_name: blob})
        dets = np.asarray(raw_outputs[0])[0]

        out = []
        for det in dets:
            score = float(det[4])
            if score < conf:
                continue

            # Scale toạ độ từ [0..640] về [0..w, 0..h]
            x1 = max(0, min(w, round(float(det[0]) * w / float(target_w))))
            y1 = max(0, min(h, round(float(det[1]) * h / float(target_h))))
            x2 = max(0, min(w, round(float(det[2]) * w / float(target_w))))
            y2 = max(0, min(h, round(float(det[3]) * h / float(target_h))))

            orig_x1 = int(x1 * inv_scale) + offset[0]
            orig_y1 = int(y1 * inv_scale) + offset[1]
            orig_x2 = int(x2 * inv_scale) + offset[0]
            orig_y2 = int(y2 * inv_scale) + offset[1]

            out.append({
                "bbox": [orig_x1, orig_y1, orig_x2, orig_y2],
                "confidence": round(score * 100, 2),
                "source": "onnx"
            })
        return out

    def _run_pass(self, img: np.ndarray, conf: float, offset=(0, 0), inv_scale: float = 1.0) -> List[dict]:
        """Chạy ONNX detector 1 lượt trên ảnh, đưa toạ độ về ảnh gốc (offset + inv_scale)."""
        if self.session is None:
            raise RuntimeError("Mô hình ONNX Plate Detector chưa được nạp (session is None)!")
        h, w = img.shape[:2]
        blob, r, (left, top) = self.preprocess(img)
        raw_outputs = self.session.run([self.output_name], {self.input_name: blob})
        output_array = np.asarray(raw_outputs[0])

        # outputs shape: (1, 300, 6) -> [x1, y1, x2, y2, score, class_id]
        dets = output_array[0]
        out = []
        for det in dets:
            score = float(det[4])
            if score < conf:
                continue

            x1 = max(0, min(w, round((float(det[0]) - left) / r)))
            y1 = max(0, min(h, round((float(det[1]) - top) / r)))
            x2 = max(0, min(w, round((float(det[2]) - left) / r)))
            y2 = max(0, min(h, round((float(det[3]) - top) / r)))

            # Padding an toàn 4% tránh sát chữ
            pw = int((x2 - x1) * 0.04)
            ph = int((y2 - y1) * 0.04)
            x1 = max(0, x1 - pw)
            y1 = max(0, y1 - ph)
            x2 = min(w, x2 + pw)
            y2 = min(h, y2 + ph)

            orig_x1 = int(x1 * inv_scale) + offset[0]
            orig_y1 = int(y1 * inv_scale) + offset[1]
            orig_x2 = int(x2 * inv_scale) + offset[0]
            orig_y2 = int(y2 * inv_scale) + offset[1]

            out.append({
                "bbox": [orig_x1, orig_y1, orig_x2, orig_y2],
                "confidence": round(score * 100, 2),
                "source": "onnx"
            })
        return out

    def detect(self, img_bgr: np.ndarray, conf_thresh=None, enable_color_fallback: bool = False, max_plates: int = 5, is_video: bool = True) -> List[dict]:
        """
        Phát hiện vị trí biển số xe (Fast-Path chuẩn SdkInfer + Smart Fallback):
        1. Fast-Path: Chạy ONNX trực tiếp (direct resize chuẩn SdkInfer) + letterbox fallback (~15ms).
        2. Lọc tỷ lệ hình học và áp dụng NMS.
        """
        orig_h, orig_w = img_bgr.shape[:2]
        effective_conf = conf_thresh if conf_thresh is not None else self.conf_thresh
        if effective_conf is None or effective_conf <= 0:
            effective_conf = 0.20
        if effective_conf > 1.0:
            effective_conf /= 100.0

        def _filter_and_nms(cands_list, min_conf=None, max_keep=None):
            limit = max_keep if max_keep is not None else max_plates
            cutoff = min_conf if min_conf is not None else effective_conf
            cutoff_pct = cutoff * 100.0 if cutoff <= 1.0 else cutoff

            filtered = []
            for c in cands_list:
                if c.get("confidence", 0) < cutoff_pct:
                    continue
                x1, y1, x2, y2 = c["bbox"]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(orig_w, x2), min(orig_h, y2)
                bw, bh = x2 - x1, y2 - y1
                if bw < 14 or bh < 8:
                    continue
                ar = bw / max(1, bh)
                # Biển số Việt Nam: Biển vuông xe máy (ar ~ 0.85 - 1.85), Biển dài ô tô (ar ~ 2.5 - 5.5)
                if not (0.80 <= ar <= 5.5):
                    continue
                # Bỏ khung quá to (biển số thực tế không bao giờ vượt quá 12% diện tích khung hình toàn cảnh)
                if max(orig_w, orig_h) >= 480 and (bw * bh > 0.12 * orig_w * orig_h or bw > orig_w * 0.45 or bh > orig_h * 0.35):
                    continue
                # Bỏ dải viền dính sát mép trên/dưới camera
                if (y1 < 8 and bh < 30) or (y2 > orig_h - 8 and bh < 30):
                    continue
                filtered.append({
                    "bbox": [x1, y1, x2, y2],
                    "confidence": c["confidence"],
                    "source": c.get("source", "onnx")
                })

            res = []
            if filtered:
                keep = _nms_numpy(
                    [f["bbox"] for f in filtered],
                    [f["confidence"] for f in filtered],
                    self.nms_thresh,
                )
                res = [filtered[i] for i in keep]
                res.sort(key=lambda item: item["confidence"], reverse=True)
                res = res[:limit]
                res.sort(key=lambda item: item["bbox"][0])
            return res

        # 1. PRIMARY FAST-PATH: Letterbox 1-Pass bảo toàn tỷ lệ khung hình 100% (chuẩn cho cả video & ảnh)
        lb_cands = self._run_pass(img_bgr, conf=effective_conf)
        lb_results = _filter_and_nms(lb_cands, min_conf=effective_conf, max_keep=max_plates)
        if lb_results:
            return lb_results

        # Với luồng Video thời gian thực: Bắt buộc thoát ngay sau 1-Pass (12ms) để giữ tốc độ 25-30 FPS mượt mà, không lag!
        if is_video:
            return []

        # 2. FALLBACK: Direct Resize (hữu ích cho ảnh tĩnh crop sát biển số hoặc tỷ lệ 1:1)
        direct_cands = self._run_pass_direct(img_bgr, conf=effective_conf)
        direct_results = _filter_and_nms(direct_cands, min_conf=effective_conf, max_keep=max_plates)
        if direct_results:
            return direct_results

        # 3. SELECTIVE FALLBACK (cho ảnh tĩnh is_video=False):
        fallback_cands = list(lb_cands) + list(direct_cands)

        try:
            from utils.image_utils import recover_glare_image
            glare_recovered = recover_glare_image(img_bgr)
            if glare_recovered is not None and glare_recovered is not img_bgr:
                fallback_cands += self._run_pass(glare_recovered, conf=max(0.25, effective_conf - 0.08))
        except Exception:
            pass

        # Quét tile nếu ảnh lớn
        if max(orig_w, orig_h) > 800:
            tw = max(450, int(orig_w * 0.55))
            th = max(450, int(orig_h * 0.55))
            xs = sorted({0, max(0, orig_w - tw)})
            ys = sorted({0, max(0, orig_h - th)})
            for y0 in ys:
                for x0 in xs:
                    tile = img_bgr[y0:y0 + th, x0:x0 + tw]
                    if tile.size:
                        fallback_cands += self._run_pass(tile, conf=max(0.30, effective_conf), offset=(x0, y0))

        fallback_results = _filter_and_nms(fallback_cands, min_conf=max(0.28, effective_conf - 0.07), max_keep=5)
        if fallback_results:
            return fallback_results

        if enable_color_fallback:
            color_cands = self._color_contour_fallback(img_bgr)
            if color_cands:
                color_results = _filter_and_nms(color_cands, min_conf=35.0, max_keep=2)
                if color_results:
                    return color_results

        # Trường hợp ảnh đầu vào vốn là ảnh crop sẵn của biển số
        aspect = orig_w / max(1, orig_h)
        if 1.2 <= aspect <= 5.0 and orig_w >= 80 and orig_h >= 25 and max(orig_w, orig_h) < 600:
            return [{
                "bbox": [0, 0, orig_w, orig_h],
                "confidence": 75.0,
                "is_full_frame": True,
                "source": "crop_passthrough"
            }]

        return []

    def _color_contour_fallback(self, img_bgr: np.ndarray) -> List[dict]:
        """Dự phòng nhận diện biển số bằng màu sắc và hình học (Color & Contour Heuristic)"""
        orig_h, orig_w = img_bgr.shape[:2]
        if orig_h < 30 or orig_w < 30:
            return []

        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        lower_yellow = np.array([15, 60, 60], dtype=np.uint8)
        upper_yellow = np.array([35, 255, 255], dtype=np.uint8)
        mask_yellow = cv2.inRange(hsv, lower_yellow, upper_yellow)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        cleaned = cv2.morphologyEx(mask_yellow, cv2.MORPH_CLOSE, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        candidates = []
        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            if bw < 25 or bh < 16:
                continue
            area = bw * bh
            if area < 400 or (area / (orig_w * orig_h)) > 0.12:
                continue
            ar = bw / max(1, bh)
            if not (1.2 <= ar <= 4.8):
                continue

            area_ratio = area / float(orig_w * orig_h)
            if area_ratio < 0.025 and (y + bh) > 0.90 * orig_h and (x + bw) > 0.70 * orig_w:
                continue
            if area_ratio < 0.025 and y < 0.05 * orig_h and (x + bw) > 0.70 * orig_w:
                continue

            roi_gray = cv2.cvtColor(img_bgr[y:y+bh, x:x+bw], cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(roi_gray, 40, 120)
            edge_density = np.count_nonzero(edges) / float(area)
            if edge_density < 0.08:
                continue

            pw = int(bw * 0.06)
            ph = int(bh * 0.06)
            x1 = max(0, x - pw)
            y1 = max(0, y - ph)
            x2 = min(orig_w, x + bw + pw)
            y2 = min(orig_h, y + bh + ph)

            candidates.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": 45.0,
                "source": "color_plate_fallback"
            })

        return candidates


# ALIAS TƯƠNG THÍCH NGƯỢC 100% CHO CODE CŨ
YOLOXPlateDetector = OnnxPlateDetector


# =============================================================================
# 3. PIPELINE KẾT HỢP: PHÁT HIỆN -> LÀM PHẲNG -> NHẬN DIỆN ONNX LPR
# =============================================================================

class FullALPRPipeline:
    def __init__(self, yolox_weights=None):
        self.detector = OnnxPlateDetector(weights_path=yolox_weights)
        # ENGINE DUY NHẤT: ONNX LPR (SdkInfer). VietOCR đã bị loại bỏ khỏi hệ thống.
        try:
            try:
                from core.onnx_lpr_engine import OnnxLprEngine
            except ImportError:
                from onnx_lpr_engine import OnnxLprEngine
            self.ocr = OnnxLprEngine()
        except Exception as e:
            raise RuntimeError(
                f"Không thể nạp OnnxLprEngine ({e}). Hệ thống cần onnxruntime + "
                f"trọng số trong models/ (plate_line.onnx, plate_rec.onnx, plate_rec.yml)."
            ) from e


    def process_image(self, image_input, deskew: bool = True) -> List[dict]:
        """
        Xử lý toàn diện 1 ảnh xe bất kỳ:
        1. Tìm vị trí biển số bằng YOLOX
        2. Cắt ảnh crop
        3. Làm phẳng và khử góc nghiêng (Deskew) nếu deskew=True
        4. Nhận diện chữ bằng ONNX LPR
        """
        if isinstance(image_input, (str, Path)):
            from utils.image_utils import imread_unicode
            img_bgr = imread_unicode(image_input)
        elif isinstance(image_input, np.ndarray):
            img_bgr = image_input
        elif isinstance(image_input, Image.Image):
            img_bgr = cv2.cvtColor(np.array(image_input), cv2.COLOR_RGB2BGR)
        else:
            raise ValueError("Đầu vào không hợp lệ!")

        H_img, W_img = img_bgr.shape[:2]
        detections = self.detector.detect(img_bgr)
        results = []

        for idx, det in enumerate(detections, 1):
            x1, y1, x2, y2 = det["bbox"]
            bw = x2 - x1
            bh = y2 - y1

            # Thêm viền an toàn (Adaptive Margin) 4% để tránh cắt sát chữ ngoài cùng
            pad_x = int(bw * 0.04)
            pad_y = int(bh * 0.04)
            mx1 = max(0, x1 - pad_x)
            my1 = max(0, y1 - pad_y)
            mx2 = min(W_img, x2 + pad_x)
            my2 = min(H_img, y2 + pad_y)

            raw_crop = img_bgr[my1:my2, mx1:mx2]
            if raw_crop.size == 0:
                raw_crop = img_bgr[y1:y2, x1:x2]
            if raw_crop.size == 0:
                continue

            # Nắn phẳng khử góc nghiêng
            if deskew:
                rectified_crop, deskew_meta = deskew_and_rectify(raw_crop)
            else:
                rectified_crop = raw_crop
                deskew_meta = {"method": "crop_only", "angle": 0.0, "rectified": False}

            # TIỀN XỬ LÝ CHUYÊN SÂU TRƯỚC KHI ĐƯA VÀO ONNX LPR:
            # - Tăng nét chữ (Unsharp mask)
            # - Cân bằng sáng thích ứng (CLAHE)
            # - Denoise nhẹ và chống vỡ hạt (Upscale nếu ảnh nhỏ)
            from utils.image_utils import preprocess_for_ocr
            enhanced_crop = preprocess_for_ocr(rectified_crop)

            # Chuyển BGR sang RGB cho ONNX LPR
            crop_rgb = cv2.cvtColor(enhanced_crop, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(crop_rgb)

            plate_text, ocr_conf = self.ocr.predict(pil_img)

            results.append({
                "index": idx,
                "bbox": det["bbox"],
                "detect_conf": det["confidence"],
                "deskew_method": deskew_meta["method"],
                "skew_angle": deskew_meta["angle"],
                "rectified": deskew_meta["rectified"],
                "raw_crop_bgr": raw_crop,
                "rectified_crop_bgr": rectified_crop,
                "enhanced_crop_bgr": enhanced_crop,
                "plate_text": plate_text,
                "ocr_conf": round(float(ocr_conf) * 100, 2)
            })

        return results


# =============================================================================
# DEMO TEST
# =============================================================================

def run_demo():
    print("=" * 70)
    print("CHẠY THỬ PIPELINE: ONNX PLATE DETECT -> DESKEW (LÀM PHẲNG) -> VIETOCR")
    print("=" * 70)

    pipeline = FullALPRPipeline()

    # Tìm 1 ảnh toàn cảnh xe mẫu trong dataset
    sample_dir = PROJECT_ROOT / "DATA_LICENSE_PLATE" / "license_plate_kaggle" / "valid" / "images"
    sample_images = list(sample_dir.glob("*.jpg")) if sample_dir.exists() else []
    if not sample_images:
        print("[CẢNH BÁO] Không tìm thấy ảnh xe toàn cảnh mẫu.")
        return

    test_img = sample_images[0]
    print(f"\n[TEST] Thử nghiệm với ảnh xe: {test_img.name}")
    results = pipeline.process_image(test_img)

    print(f"👉 Tìm thấy {len(results)} biển số trong ảnh:\n")
    for r in results:
        print(f"  Biển #{r['index']}:")
        print(f"    - Bounding Box : {r['bbox']} (Độ tin cậy phát hiện: {r['detect_conf']}%)")
        print(f"    - Khử nghiêng  : Phương pháp={r['deskew_method']} | Góc nghiêng={r['skew_angle']}°")
        print(f"    - Biển số đọc  : 👉 {r['plate_text']} 👈 (Độ tin cậy OCR: {r['ocr_conf']}%)")


if __name__ == "__main__":
    run_demo()
