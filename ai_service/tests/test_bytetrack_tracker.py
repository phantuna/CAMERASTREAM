#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for bytetrack_tracker (two-stage gate + Kalman CV + lost/recovered).

Chạy:  python tests/test_bytetrack_tracker.py   (không cần pytest)
Chú ý: "frame" trong test = DETECTOR-frame (1 lần chạy detector), như processor.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT, ROOT / "core", ROOT / "utils"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from bytetrack_tracker import ByteTrackTracker  # noqa: E402


def _state(current):
    return [
        {"id": c["id"], "lost": c["lost"], "has_plate": c.get("has_plate", False)}
        for c in current
    ]


def test_basic_match_keeps_id():
    """Detections cao conf ở cùng vị trí -> matched, giữ ID (không new)."""
    t = ByteTrackTracker(high_conf=0.50, low_conf=0.15)
    box = [100.0, 200.0, 250.0, 260.0]
    t.register(1, box, 0.9)
    current = _state([{"id": 1, "lost": 0}])
    plan = t.update([{"box": box, "conf": 0.8}], current)
    assert 1 in plan["matched"], plan
    assert plan["new"] == [], plan


def test_lost_then_low_conf_recovers_same_id():
    """KHẢ NĂNG CỐ LÕI: xe bị che 5 detector-frame (lost), rồi detection ĐIỂM THẤP
    rơi vào vùng Kalman dự đoán -> RECOVERED giữ ID (không sinh track mới)."""
    t = ByteTrackTracker(high_conf=0.50, low_conf=0.15,
                         gate_high=0.20, gate_low=0.10,
                         max_lost_plate=16, max_lost_tent=4,
                         confirm_hits=3)
    base = [100.0, 200.0, 250.0, 260.0]
    t.register(1, base, 0.9)
    current = [{"id": 1, "lost": 0, "has_plate": True}]  # has_plate=True -> limit 16 (không bị dead sớm)
    for i in range(5):  # 5 detector-frame: không detection -> lost tăng
        plan = t.update([], current)
        assert 1 in plan["lost"], plan
        current[0]["lost"] = i + 1

    # Hiện lại ở đúng vị trí (Kalman CV đã giữ ~vị trí đứng yên), conf THẤP (0.2)
    current = [{"id": 1, "lost": 5, "has_plate": True}]
    plan = t.update([{"box": base, "conf": 0.2}], current)
    assert 1 in plan["recovered"], f"mong track 1 recovered, got: {plan}"
    assert plan["new"] == [], "không được sinh track mới khi đã recover"


def test_low_conf_does_not_match_healthy_track():
    """Two-stage đúng ý ByteTrack: detection ĐIỂM THẤP KHÔNG được gán cho track KHỎE
    (lost=0). Nó chỉ cứu track đã LOST. -> track khỏe sẽ LOST, det thành NEW."""
    t = ByteTrackTracker(high_conf=0.50, low_conf=0.15)
    base = [100.0, 200.0, 250.0, 260.0]
    t.register(1, base, 0.9)
    # Track đang KHỎE (lost=0), chỉ có detection điểm thấp ở vị trí đó
    plan = t.update([{"box": base, "conf": 0.2}],
                    _state([{"id": 1, "lost": 0}]))
    assert 1 not in plan["matched"], f"điểm thấp không được match track khỏe: {plan}"


def test_dead_after_lost_window():
    """Track mất quá lost_window -> DEAD (xóa), không cứu tiếp."""
    t = ByteTrackTracker(high_conf=0.50, low_conf=0.15,
                         max_lost_plate=16, max_lost_tent=4)
    base = [100.0, 200.0, 250.0, 260.0]
    t.register(7, base, 0.9)
    lost = 0
    dead = False
    for i in range(20):
        plan = t.update([], _state([{"id": 7, "lost": lost, "has_plate": True}]))
        if 7 in plan["dead"]:
            dead = True
            break
        lost += 1
    assert dead, "track đã đọc biển phải sống tới ~16 detector-frame rồi mới dead"


def test_new_track_minted_for_unmatched_high_conf():
    """Detection cao conf không track nào nhận -> NEW (processor sẽ mint ID)."""
    t = ByteTrackTracker(high_conf=0.50, low_conf=0.15)
    far = [500.0, 400.0, 650.0, 460.0]
    plan = t.update([{"box": far, "conf": 0.9}], _state([]))
    assert plan["new"] == [0], plan


def test_constant_velocity_straight_keeps_single_id():
    """Xe đi thẳng vận tốc không đổi (Constant Velocity): 1 track bám suốt, KHÔNG mint ID mới.
    Kalman CV học được vận tốc (~px/det-frame) -> predicted box chạy trước mượt."""
    t = ByteTrackTracker(high_conf=0.50, low_conf=0.15, gate_high=0.20)
    x = 100.0
    t.register(1, [x, 300.0, x + 150.0, 360.0], 0.9)
    current = [{"id": 1, "lost": 0, "has_plate": True}]
    for i in range(6):
        x += 50.0
        plan = t.update([{"box": [x, 300.0, x + 150.0, 360.0], "conf": 0.9}], current)
        assert 1 in plan["matched"], f"frame {i}: xe thẳng CV phải giữ ID: {plan}"
        assert plan["new"] == [], f"frame {i}: không được mint ID mới: {plan}"
    v = t.velocity(1)
    assert v is not None and v[0] > 20.0, f"Kalman phải học vx dương (~50px/f), got {v}"


def test_deceleration_car_still_keeps_same_id():
    """Xe giảm tốc (đi nhanh rồi chợt chậm lại/đứng): CV mô hình dự đoán thừa vài frame đầu,
    nhưng detection kế tiếp vẫn khớp -> track GIỮ NGUYÊN ID, không sinh ID mới (giảm ID-switch)."""
    t = ByteTrackTracker(high_conf=0.50, low_conf=0.15, gate_high=0.20)
    x = 100.0
    t.register(1, [x, 300.0, x + 150.0, 360.0], 0.9)
    current = [{"id": 1, "lost": 0, "has_plate": True}]
    # Giai đoạn nhanh: +60px/frame trong 4 frame
    for i in range(4):
        x += 60.0
        plan = t.update([{"box": [x, 300.0, x + 150.0, 360.0], "conf": 0.9}], current)
        assert 1 in plan["matched"], f"nhanh {i}: {plan}"
    # Giảm tốc: xe chậm dần, mỗi frame chỉ đi +5px (3 frame)
    for i in range(3):
        x += 5.0
        plan = t.update([{"box": [x, 300.0, x + 150.0, 360.0], "conf": 0.9}], current)
        assert 1 in plan["matched"], f"giảm tốc {i}: xe chậm lại vẫn phải giữ ID: {plan}"
        assert plan["new"] == []


def test_occluded_2_4_frames_then_low_conf_recovers():
    """Xe BỊ CHE KHUẤT 2-4 detector-frame (không có detection), rồi tái xuất với conf THẤP 0.2
    (che khuất/chói đèn/bụi). ByteTrack phải CỨU track cũ (recovered giữ ID) thay vì mint ID mới ->
    lịch sử bỏ phiếu biển không reset, không webhook trùng."""
    t = ByteTrackTracker(high_conf=0.50, low_conf=0.15, gate_high=0.20, gate_low=0.10,
                         max_lost_plate=16, max_lost_tent=4, confirm_hits=3)
    x = 100.0
    t.register(1, [x, 300.0, x + 150.0, 360.0], 0.9)
    current = [{"id": 1, "lost": 0, "has_plate": True}]
    # 3 frame thấy rõ, xe chạy +30px/frame
    for i in range(3):
        x += 30.0
        plan = t.update([{"box": [x, 300.0, x + 150.0, 360.0], "conf": 0.9}], current)
        assert 1 in plan["matched"], f"thấy rõ {i}: {plan}"
    # 4 frame bị che khuất: KHÔNG có detection (xe vẫn đi, x tăng)
    for i in range(4):
        x += 30.0
        plan = t.update([], current)
        assert 1 in plan["lost"], f"che khuất {i}: track phải rơi vào lost: {plan}"
        current[0]["lost"] = i + 1
    # Tái xuất đúng vị trí Kalman dự đoán, conf THẤP 0.2 -> RECOVERED giữ ID
    current = [{"id": 1, "lost": 4, "has_plate": True}]
    plan = t.update([{"box": [x, 300.0, x + 150.0, 360.0], "conf": 0.2}], current)
    assert 1 in plan["recovered"], f"mong track 1 recovered sau che khuất, got: {plan}"
    assert plan["new"] == [], "không được mint track mới khi đã recover"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {fn.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
