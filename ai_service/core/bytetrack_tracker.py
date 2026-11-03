#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
BYTETRACK-STYLE TWO-STAGE VEHICLE/PLATE TRACKER (thuần NumPy, không phụ thuộc ngoài)
=====================================================================================
Thay thế association ad-hoc (round-1 IoU + round-2 area/aspect) bằng:
  1. Kalman constant-velocity 8-D [cx, cy, w, h, vx, vy, vw, vh]
     -> BBOX DỰ ĐOÁN thực sự (khắc phục ID-switch khi xe trượt giữa 2 detector-frame).
  2. Two-Stage Gate (ByteTrack):
     - Giai đoạn 1: detection ĐIỂM CAO (conf >= high) gán cho MỌI track.
     - Giai đoạn 2: detection ĐIỂM THẤP (low <= conf < high) CHỈ gán cho track
       đang MẤT (short-term lost) -> cứu track bị che khuất, giữ ID, không webhook trùng.
  3. Lost / Recovered: track mất detection trong cửa sổ (max_lost_frames) vẫn giữ
     ID; detection rơi vào vùng dự đoán thì phục hồi (recovered) thay vì sinh track mới.

PHILOSOPHY TỔNG (kèm video_alpr_processor.py, chạy SONG SONG, an toàn):
  - Module này CHỈ lo association + prediction. Mọi state biển/event/OCR/cooldown
    vẫn nằm trong TrackedPlate; processor là bên "áp dụng" kế hoạch (plan).
  - ID: per-camera (do processor mint next_track_id); tracker chỉ giữ Kalman per-id.
  - Bật/tắt qua env AI_TRACKER=legacy|bytetrack (mặc định legacy = hành vi cũ 100%).

Tất cả "frame" ở đây = DETECTOR-FRAME (frame chạy detector), khớp cách đếm
frames_lost hiện có trong processor.
"""

import os
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Ngưỡng (tune bằng env; hạ HIGH_CONF xuống 0.20 để bắt ngay xe phóng nhanh ở frame đầu tiên)
# ---------------------------------------------------------------------------
HIGH_CONF = float(os.getenv("AI_TRACKER_HIGH_CONF", "0.20"))   # conf detection "cao" (bắt ngay từ frame 1)
LOW_CONF = float(os.getenv("AI_TRACKER_LOW_CONF", "0.12"))     # conf detection "thấp" (min)
GATE_HIGH = float(os.getenv("AI_TRACKER_GATE_HIGH", "0.10"))   # IoU min cho matching điểm cao
GATE_LOW = float(os.getenv("AI_TRACKER_GATE_LOW", "0.05"))    # IoU min cho matching điểm thấp (cứu track mất)
MAX_LOST_PLATE = int(os.getenv("AI_TRACKER_MAX_LOST_PLATE", "4"))   # track CÓ biển: xóa sau 4 frame mất dấu để giải phóng ID
MAX_LOST_TENT = int(os.getenv("AI_TRACKER_MAX_LOST_TENT", "2"))     # track CHƯA đọc biển: xóa sau 2 frame mất dấu
CONFIRM_HITS = int(os.getenv("AI_TRACKER_CONFIRM_HITS", "1"))       # xác nhận ngay từ hit đầu cho xe đi nhanh


# ---------------------------------------------------------------------------
# Helper hình học (self-contained, không phụ dụng code khác)
# ---------------------------------------------------------------------------
def box_to_state(bbox: List[float]) -> List[float]:
    """[x1, y1, x2, y2] -> [cx, cy, w, h] (đoạn đầu của state Kalman)."""
    x1, y1, x2, y2 = bbox
    w = max(1.0, x2 - x1)
    h = max(1.0, y2 - y1)
    return [(x1 + x2) / 2.0, (y1 + y2) / 2.0, w, h]


def state_to_box(xywh: List[float]) -> List[float]:
    """[cx, cy, w, h] -> [x1, y1, x2, y2] (rộng, luôn dương)."""
    cx, cy, w, h = xywh
    w = max(1.0, w)
    h = max(1.0, h)
    return [cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0]


def box_iou(a: List[float], b: List[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    iw = min(ax2, bx2) - max(ax1, bx1)
    ih = min(ay2, by2) - max(ay1, by1)
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    ua = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    ub = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = ua + ub - inter
    return float(inter / union) if union > 0 else 0.0


class _KCV:
    """Kalman filter Constant-Velocity 8-D [cx,cy,w,h,vx,vy,vv,wh]."""

    __slots__ = ("x", "P")

    def __init__(self, cx: float, cy: float, w: float, h: float) -> None:
        self.x = np.array([cx, cy, w, h, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)
        # Phương sai ban đầu: vị trí/w/h vừa phải, vận tốc chưa biết (rộng).
        pos_var = 25.0 ** 2
        vel_var = 50.0 ** 2
        self.P = np.diag(np.array([pos_var] * 4 + [vel_var] * 4))

    # Ma trận mô hình (tĩnh, dùng chung)
    _F = np.eye(8, dtype=np.float64)
    for _i in range(4):
        _F[_i, _i + 4] = 1.0
    # H: observation 4-D (cx, cy, w, h) lấy thẳng từ 4 trạng thái đầu -> CHUẨN, không phải khối 1.
    _H = np.zeros((4, 8), dtype=np.float64)
    _H[np.arange(4), np.arange(4)] = 1.0

    def predict(self) -> List[float]:
        F, H = _KCV._F, _KCV._H
        self.x = F @ self.x
        # Q: process noise nhẹ lên vận tốc
        Q = np.diag(np.array([0.0, 0.0, 0.0, 0.0, 2.0, 2.0, 2.0, 2.0]))
        self.P = F @ self.P @ F.T + Q
        return state_to_box(self.x[:4].tolist())

    def update(self, meas: List[float]) -> None:
        F, H = _KCV._F, _KCV._H
        R = np.diag(np.array([15.0, 15.0, 15.0, 15.0]))
        S = H @ self.P @ H.T + R                     # 4x4
        K = self.P @ H.T @ np.linalg.inv(S)         # 8x4
        innov = np.array(meas) - H @ self.x
        self.x = self.x + K @ innov
        I_KH = np.eye(8) - K @ H
        self.P = I_KH @ self.P


class _Rec:
    """Trạng thái nội bộ của 1 track trong tracker (dùng kèm TrackedPlate)."""

    __slots__ = ("kalman", "hits", "lost", "confirmed", "last_pred", "last_conf")

    def __init__(self, bbox: List[float]) -> None:
        cx, cy, w, h = box_to_state(bbox)
        self.kalman = _KCV(cx, cy, w, h)
        self.hits = 0
        self.lost = 0
        self.confirmed = False
        self.last_pred: List[float] = state_to_box(self.kalman.x[:4].tolist())
        self.last_conf = 0.0


class ByteTrackTracker:
    """Two-stage ByteTrack + Kalman CV. Chỉ association + prediction, không giữ state nghiệp vụ."""

    def __init__(
        self,
        high_conf: Optional[float] = None,
        low_conf: Optional[float] = None,
        gate_high: Optional[float] = None,
        gate_low: Optional[float] = None,
        max_lost_plate: Optional[int] = None,
        max_lost_tent: Optional[int] = None,
        confirm_hits: Optional[int] = None,
    ) -> None:
        self.high = HIGH_CONF if high_conf is None else high_conf
        self.low = LOW_CONF if low_conf is None else low_conf
        self.gate_high = GATE_HIGH if gate_high is None else gate_high
        self.gate_low = GATE_LOW if gate_low is None else gate_low
        self.max_lost_plate = MAX_LOST_PLATE if max_lost_plate is None else max_lost_plate
        self.max_lost_tent = MAX_LOST_TENT if max_lost_tent is None else max_lost_tent
        self.confirm_hits = CONFIRM_HITS if confirm_hits is None else confirm_hits
        self._rec: Dict[Any, _Rec] = {}

    # -- vòng đời ------------------------------------------------------------
    def register(self, tid: Any, bbox: List[float], conf: float = 0.0) -> None:
        if tid not in self._rec:
            self._rec[tid] = _Rec(bbox)
        self._rec[tid].kalman.update(box_to_state(bbox))
        self._rec[tid].last_conf = conf

    def drop(self, tid: Any) -> None:
        self._rec.pop(tid, None)

    def predicted_box(self, tid: Any) -> Optional[List[float]]:
        r = self._rec.get(tid)
        return None if r is None else r.last_pred

    def predict_step(self, tid: Any) -> Optional[List[float]]:
        """Bước dự đoán Kalman cho frame skip để hộp bám di chuyển mượt mà liên tục."""
        r = self._rec.get(tid)
        if r is None:
            return None
        r.last_pred = r.kalman.predict()
        return r.last_pred

    def velocity(self, tid: Any) -> Optional[Tuple[float, float]]:
        """Vận tốc Kalman (px/detector-frame) của track, hoặc None nếu chưa theo."""
        r = self._rec.get(tid)
        if r is None:
            return None
        return (float(r.kalman.x[4]), float(r.kalman.x[5]))

    # -- matching ------------------------------------------------------------
    @staticmethod
    def _greedy(pairs: List[Tuple[float, int, int]], used_dets: Set[int]) -> Dict[int, int]:
        """Chọn cặp (iou, track_id, det_idx) tốt nhất, 1-1, loại trùng det đã dùng."""
        pairs.sort(key=lambda t: -t[0])
        out: Dict[int, int] = {}
        used_t: Set[int] = set()
        for iou, tid, di in pairs:
            if di in used_dets or di in out.values():
                continue
            if tid in used_t:
                continue
            out[tid] = di
            used_t.add(tid)
        return out

    def update(
        self,
        dets: List[Dict[str, Any]],
        current: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        dets    : [{ "box": [x1,y1,x2,y2], "conf": float, "idx": int }, ...]
        current : [{ "id": int, "lost": int, "has_plate": bool, "confirmed": bool }, ...]
                   (đọc state track trong processor)
        -> plan: matched {id:det_idx}, recovered {id:det_idx}, new [det_idx],
                 lost [id], dead [id]
        """
        # Bước 0: dự đoán Kalman cho MỌI track đang theo (predicted box).
        for tid, r in self._rec.items():
            r.last_pred = r.kalman.predict()

        high: List[Dict[str, Any]] = []
        low: List[Dict[str, Any]] = []
        for i, d in enumerate(dets):
            c = float(d.get("conf", 0.0))
            d = dict(d, idx=i, conf=c)
            if c >= self.high:
                high.append(d)
            elif c >= self.low:
                low.append(d)

        # Giai đoạn 1: detection CAO vs MỌI track (predicted box + khoảng cách tâm cho xe phóng nhanh)
        pairs1: List[Tuple[float, int, int]] = []
        for c in current:
            tid = c["id"]
            r = self._rec.get(tid)
            if r is None:
                continue
            pbox = r.last_pred
            pcx = (pbox[0] + pbox[2]) / 2.0
            pcy = (pbox[1] + pbox[3]) / 2.0
            pw = max(1.0, pbox[2] - pbox[0])
            for d in high:
                dbox = d["box"]
                iou = box_iou(pbox, dbox)
                if iou >= self.gate_high:
                    pairs1.append((iou + 0.5, tid, d["idx"]))
                else:
                    # Xe đi nhanh nhảy vọt qua chiều rộng biển số làm IoU = 0:
                    # Khớp theo khoảng cách tâm (< 180px hoặc 3.5 lần bề rộng biển)
                    dcx = (dbox[0] + dbox[2]) / 2.0
                    dcy = (dbox[1] + dbox[3]) / 2.0
                    dw = max(1.0, dbox[2] - dbox[0])
                    dist = ((pcx - dcx) ** 2 + (pcy - dcy) ** 2) ** 0.5
                    max_jump = max(160.0, max(pw, dw) * 3.5)
                    if dist < max_jump and (0.45 <= (dw / pw) <= 2.2):
                        dist_score = max(0.05, 0.45 * (1.0 - dist / max_jump))
                        pairs1.append((dist_score, tid, d["idx"]))
        matched = self._greedy(pairs1, used_dets=set())

        # Giai đoạn 2: detection THẤP vs track MẤT, chưa matched ở GD1
        used_dets = set(matched.values())
        lost_ids = [c["id"] for c in current if c["lost"] > 0 and c["id"] not in matched]
        pairs2: List[Tuple[float, int, int]] = []
        for tid in lost_ids:
            r = self._rec.get(tid)
            if r is None:
                continue
            pbox = r.last_pred
            for d in low:
                if d["idx"] in used_dets:
                    continue
                iou = box_iou(pbox, d["box"])
                if iou >= self.gate_low:
                    pairs2.append((iou, tid, d["idx"]))
        recovered = self._greedy(pairs2, used_dets)
        used_dets |= set(recovered.values())

        # Cập nhật Kalman cho track đã match/recover (nạp measurement thật).
        for tid in set(matched) | set(recovered):
            di = matched.get(tid)
            if di is None:
                di = recovered.get(tid)
            if di is None:
                continue
            d = dets[di]
            r = self._rec.get(tid)
            if r is None:
                continue
            r.kalman.update(box_to_state(d["box"]))
            r.hits += 1
            r.lost = 0
            r.last_conf = float(d.get("conf", 0.0))
            if r.hits >= self.confirm_hits:
                r.confirmed = True

        # new: detection CAO không ai nhận -> track mới (processor mint id)
        new = [d["idx"] for d in high if d["idx"] not in used_dets]

        # lost: track chưa match gì -> increment lost (processor tự cộng)
        all_matched = set(matched) | set(recovered)
        lost = [c["id"] for c in current if c["id"] not in all_matched]

        # dead: track mất quá cửa sổ -> xóa
        dead: List[int] = []
        for c in current:
            tid = c["id"]
            if tid in all_matched:
                continue
            limit = self.max_lost_plate if (c.get("has_plate") or c.get("confirmed")) else self.max_lost_tent
            if c["lost"] + 1 > limit:
                dead.append(tid)
        for tid in dead:
            self._rec.pop(tid, None)

        return {
            "matched": matched,
            "recovered": recovered,
            "new": new,
            "lost": [l for l in lost if l not in dead],
            "dead": dead,
        }


# ---------------------------------------------------------------------------
# Tiện ích để video_alpr_processor gọi gọn
# ---------------------------------------------------------------------------
def dets_from_plate_detections(valid_detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Chuyển valid_detections (plate det) -> đầu vào tracker.
    confidence = conf detection plate (0..1). vehicle_conf (nếu có) giữ nguyên
    trong dict để caller dùng, nhưng stage split dùng conf plate."""
    out = []
    for d in valid_detections:
        out.append({
            "box": [float(x) for x in d["bbox"]],
            "conf": float(d.get("confidence", 0.0)),
            "vehicle_conf": float(d.get("vehicle_conf", 0.0)),
        })
    return out
