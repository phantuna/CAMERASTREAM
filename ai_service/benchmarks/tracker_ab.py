#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TRACKER A/B COMPARISON — LEGACY vs BYTETRACK (Component 4)
==========================================================
Đo 3 chỉ số theo kế hoạch, CHỈ CẦN NUMPY (không cần ONNX / psutil / video):
  (1) ID-Switch        : số track "ma" (ghost) mint nhầm cho 1 xe vật lý.
  (2) Tracking Latency : ms / detector-frame của association (mục tiêu < 1.5ms).
  (3) Duplicate Events : proxy = số ghost (mỗi ghost = 1 webhook sự kiện trùng).

Thiết kế module sâu:
  - Module này TỰ CHỨA (self-contained): chỉ phụ thuộc numpy + core/bytetrack_tracker.
    => Chạy độc lập:  python benchmarks/tracker_ab.py
  - benchmark_pipeline.py CHUYỂN GIAO (delegate) vào module này ở Stage 3, nên Stage 3
    không bị kéo theo các import nặng (psutil/onnx) của pipeline -> chạy được ngay cả
    khi máy chưa cài đủ stack GPU.

KỊCH BẢN PHÂN BIỆT: 1 xe chạy ngang màn hình, bị che khuất HOÀN TOÀN N detector-frame,
rồi tái xuất với detection ĐIỂM THẤP (conf 0.2) — worst case:
  - LEGACY (mirror TrackedPlate.predict_step): mất detection -> velocity bằng 0 -> box
    ĐÔNG CỨNG. Xe chạy thêm N frame đã trôi xa; khi tái xuất (conf 0.9) không còn
    IoU >= 0.15 với box đóng băng -> mint ID MỚI (ID-switch). Track cũ chết dần trong
    khi track mới đã sống -> 2 track cho 1 xe -> webhook trùng.
  - BYTETRACK (Kalman CV + Stage-2 low-conf gate): dự đoán chính xác vị trí sau N frame
    trống; detection conf 0.2 rơi đúng vùng dự đoán (IoU ~1.0 >= gate_low 0.10) ->
    RECOVERED, giữ nguyên Track ID -> không ghost.
Khe dịch chuyển = N * speed, chọn >= chiều rộng box (150px) để chắc chắn Legacy mất khớp.
"""

import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Cho phép chạy trực tiếp `python benchmarks/tracker_ab.py`:
_ROOT = Path(__file__).resolve().parents[1]
for _p in (_ROOT, _ROOT / "core"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

# bytetrack_tracker import LỚN (lazy) ở nơi dùng, để module này không bắt buộc
# có mặt bằng mọi giá khi mới import (phục vụ environment thiếu core/).
from bytetrack_tracker import ByteTrackTracker  # noqa: E402


def iou(a: List[float], b: List[float]) -> float:
    """IoU của 2 box [x1,y1,x2,y2]. Rỗng -> 0.0."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    iw = min(ax2, bx2) - max(ax1, bx1)
    ih = min(ay2, by2) - max(ay1, by1)
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return float(inter / union) if union > 0 else 0.0


class LegacyAssoc:
    """Mirror tối giản của _associate_legacy (video_alpr_processor.py:783).

    - Round 1: IoU >= 0.15 giữa box DỪNG YÊN của track và detection. Không Kalman:
      khi mất detection, TrackedPlate.predict_step() zero velocity -> vị trí ĐÔNG CỨNG
      (đúng hành vi legacy), nên mirror cũng dùng box đóng băng.
    - Track mất -> lost++; detection chưa ai nhận -> mint ID mới (ID-switch/ghost).
    - Vòng 2 (area/aspect, trần 30px) bị lược bỏ: kịch bản có khe tái xuất ~N*speed
      (>= 150px) vượt trần của cả vòng 1 lẫn vòng 2 -> kết luận ghost không đổi.
    """

    GATE = 0.15

    def __init__(self) -> None:
        self.tracks: Dict[int, Dict[str, Any]] = {}    # tid -> {"box": [..], "lost": int}
        self._counter = 0

    def update(self, dets: List[Dict[str, Any]]) -> List[int]:
        """Trả về danh sách track ID (int) mới mint ở detector-frame này."""
        pairs: List[Tuple[float, int, int]] = []
        for tid, trk in self.tracks.items():
            for di, d in enumerate(dets):
                if iou(trk["box"], d["box"]) >= self.GATE:
                    pairs.append((iou(trk["box"], d["box"]), tid, di))
        pairs.sort(key=lambda t: -t[0])

        used_det: set = set()
        matched_tid: set = set()
        for _v, tid, di in pairs:
            if di in used_det or tid in matched_tid:
                continue
            used_det.add(di)
            matched_tid.add(tid)
            self.tracks[tid]["box"] = list(dets[di]["box"])
            self.tracks[tid]["lost"] = 0

        for tid, trk in self.tracks.items():
            if tid not in matched_tid:
                trk["lost"] += 1

        new_minted: List[int] = []
        for di, d in enumerate(dets):
            if di in used_det:
                continue
            self._counter += 1
            self.tracks[self._counter] = {"box": list(d["box"]), "lost": 0}
            new_minted.append(self._counter)
        return new_minted

    def prune(self, max_lost: int = 16) -> None:
        for tid in [t for t, trk in self.tracks.items() if trk["lost"] > max_lost]:
            del self.tracks[tid]


class ByteAssoc:
    """Wrapper quanh ByteTrackTracker (thuật toán THẬT, không mirror).

    ID do wrapper mint tuần tự (giống processor: next_track_id chỉ tăng dần).
    ByteTrack Stage-2 (conf thấp, gate_low) + Kalman CV là thứ cứu track bị che
    khuất -> không mint ID mới -> giảm ID-switch/ghost so với Legacy.
    """

    def __init__(self) -> None:
        self.bt = ByteTrackTracker()
        self._tracks: Dict[int, int] = {}     # tid -> lost (state processor-side)
        self._next = 1

    def update(self, dets: List[Dict[str, Any]]) -> List[int]:
        current = [
            {"id": tid, "lost": st, "has_plate": True}
            for tid, st in self._tracks.items()
        ]
        plan = self.bt.update(
            [{"box": d["box"], "conf": d.get("conf", 0.9)} for d in dets],
            current,
        )

        for tid in list(plan["matched"]) + list(plan["recovered"]):
            self._tracks[tid] = 0
        for tid in plan["lost"]:
            if tid in self._tracks:
                self._tracks[tid] += 1
        for tid in plan["dead"]:
            self._tracks.pop(tid, None)
            self.bt.drop(tid)

        new_minted: List[int] = []
        for di in plan["new"]:
            tid = self._next
            self._next += 1
            self._tracks[tid] = 0
            self.bt.register(tid, dets[di]["box"], dets[di].get("conf", 0.9))
            new_minted.append(tid)
        return new_minted


def synthetic_episode(
    frames: int = 30,
    occl_from: int = 8,
    occl_len: int = 8,
    speed: float = 20.0,
) -> List[List[Dict[str, Any]]]:
    """1 xe chạy ngang màn hình, 1 detector-frame/tick, box dịch `speed` px/frame.

    - [occl_from, occl_from+occl_len): che khuất HOÀN TOÀN -> [] (không detection).
    - 3 frame ngay sau che khuất: detection tái xuất conf THẤP 0.2 (worst case).
    - Còn lại: conf 0.9.
    """
    dets: List[List[Dict[str, Any]]] = []
    x = 200.0
    for f in range(frames):
        box = [x, 300.0, x + 150.0, 360.0]
        if occl_from <= f < occl_from + occl_len:
            dets.append([])
        else:
            conf = 0.2 if (occl_from + occl_len <= f < occl_from + occl_len + 3) else 0.9
            dets.append([{"box": list(box), "conf": conf}])
        x += speed
    return dets


def run_tracker_ab(
    frames: int = 30,
    occl_from: int = 8,
    occl_len: int = 8,
    speed: float = 20.0,
    quiet: bool = False,
) -> Dict[str, Any]:
    """So Legacy vs ByteTrack trên cùng kịch bản. Trả dict 3 chỉ số + scenario + targets."""
    dets = synthetic_episode(frames=frames, occl_from=occl_from, occl_len=occl_len, speed=speed)

    n_frames = len(dets)

    def _bench(fn) -> float:
        """ms / DETECTOR-frame (không phải ms/episode): chia tổng thời gian cho
        tổng số detector-frame đã xử lý (n_run * n_frames)."""
        for _ in range(20):            # warmup
            fn()
        n_run = 500
        t0 = time.perf_counter()
        for _ in range(n_run):
            fn()
        return (time.perf_counter() - t0) * 1000.0 / (n_run * n_frames)

    def _legacy_work():
        a = LegacyAssoc()
        for fr in dets:
            a.update(fr)
            a.prune()

    def _byte_work():
        a = ByteAssoc()
        for fr in dets:
            a.update(fr)

    lat_legacy_ms = _bench(_legacy_work)
    lat_byte_ms = _bench(_byte_work)

    # 1 xe vật lý -> đúng 1 track (mint ở frame 0). Mỗi mint thêm = 1 ghost/ID-switch.
    legacy_mints = 0
    lg = LegacyAssoc()
    for fr in dets:
        legacy_mints += len(lg.update(fr))
        lg.prune()
    byte_mints = 0
    by = ByteAssoc()
    for fr in dets:
        byte_mints += len(by.update(fr))

    legacy_switch = max(0, legacy_mints - 1)
    byte_switch = max(0, byte_mints - 1)
    legacy_dup = legacy_switch
    byte_dup = byte_switch

    reduction = 0.0
    if legacy_switch > 0:
        reduction = (legacy_switch - byte_switch) / legacy_switch * 100.0

    if not quiet:
        print("\n" + "=" * 80)
        print("🚀 TRACKER A/B — LEGACY vs BYTETRACK (numpy-only)")
        print("=" * 80)
        print(f"\n  Kịch bản: xe chạy {frames} det-frame ({speed:.0f} px/frame), "
              f"che khuất HOÀN TOÀN {occl_len} frame (frame {occl_from}-{occl_from + occl_len - 1}), "
              f"tái xuất conf 0.2.")
        print(f"  {'Tracker':<12} | {'ID-Switch':<10} | {'Latency (ms)':<14} | {'Ghost/Dup':<10}")
        print("  " + "-" * 54)
        print(f"  {'Legacy':<12} | {legacy_switch:<10} | {lat_legacy_ms:<14.3f} | {legacy_dup:<10}")
        print(f"  {'ByteTrack':<12} | {byte_switch:<10} | {lat_byte_ms:<14.3f} | {byte_dup:<10}")
        print(f"\n  🌟 Giảm ID-switch (Legacy -> ByteTrack): {reduction:.0f}% "
              f"({'✅ Đạt >= 60%' if reduction >= 60.0 else '⚠️ Chưa đạt >= 60%'})")
        print(f"  🌟 Latency ByteTrack: {lat_byte_ms:.3f} ms/det-frame "
              f"({'✅ < 1.5ms' if lat_byte_ms < 1.5 else '⚠️ Vượt 1.5ms'}).")
        print(f"  🌟 Duplicate events: Legacy={legacy_dup} | ByteTrack={byte_dup} "
              f"({'✅ = 0' if byte_dup == 0 else '⚠️ Còn > 0'}).")

    return {
        "scenario": (f"xe chạy {frames} det-frame {speed:.0f}px/frame, che HOÀN TOÀN {occl_len} frame, "
                     f"tái xuất conf 0.2"),
        "legacy": {"id_switch": legacy_switch, "latency_ms": lat_legacy_ms, "dup_events": legacy_dup},
        "bytetrack": {"id_switch": byte_switch, "latency_ms": lat_byte_ms, "dup_events": byte_dup},
        "id_switch_reduction_pct": reduction,
        "targets_met": {
            "id_switch_ge_60pct": reduction >= 60.0,
            "latency_lt_1p5ms": lat_byte_ms < 1.5,
            "dup_events_zero": byte_dup == 0,
        },
    }


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="Tracker A/B (Legacy vs ByteTrack), numpy-only")
    p.add_argument("--frames", type=int, default=30)
    p.add_argument("--occl-from", type=int, default=8)
    p.add_argument("--occl-len", type=int, default=8)
    p.add_argument("--speed", type=float, default=20.0)
    a = p.parse_args()
    run_tracker_ab(frames=a.frames, occl_from=a.occl_from, occl_len=a.occl_len, speed=a.speed)
