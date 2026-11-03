#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCR WORKER POOL + BENCHMARK (đa luồng nhận diện, dùng chung 1 ONNX engine)
===========================================================================
- 1 POOL THREAD GLOBAL dùng chung MỘT `OnnxLprEngine` (ONNX Runtime InferenceSession
  an toàn khi N thread gọi `session.run()` song song). Không nhân thêm engine ->
  không phình RAM/VRAM.
- ASYNC KHÔNG BLOCK: loop camera chỉ submit task OCR rồi return ngay; worker chạy
  ONNX OCR (nặng) trên thread riêng, ghi kết quả về per-track slot. Loop camera
  luôn chạy full 25-30 FPS dù có N xe.
- CAP THEO CORE (Q1): tổng số worker toàn hệ thống <= `AI_OCR_MAX_TOTAL`
  (mặc định = cores//2, vd 8 trên 16 core) -> không oversubscribe CPU.
- CPU -> GPU TỰ ĐỘNG (Q1): ONNX Runtime tự pick CUDAExecutionProvider nếu có;
  pool không can thiệp, chỉ giới hạn số OS thread inference.

MỞ RỘNG BẰNG ENV (3 env đã thống nhất):
- AI_OCR_MAX_TOTAL : số worker thread inference DÙNG CHUNG toàn hệ thống.
                    0 (MẶC ĐỊNH = TẮT async, chạy SYNC như cũ 100% an toàn).
                    >0 = bật pool, size = min(AI_OCR_MAX_TOTAL, cores//2).
- AI_OCR_WORKERS   : ceiling task pending per-camera cùng lúc (fairness: 1 camera
                    không được nuốt sạch pool làm các camera khác chết chờ).
                    Mặc định 4.
- AI_CPU_THREADS   : intra_op_num_threads của ONNX session (mặc định 2, xem onnx_lpr_engine.py).
"""

import os
import time
import threading
import queue
from typing import Any, Dict, Optional, Callable


def _cpu_count() -> int:
    return os.cpu_count() or 8


class OcrWorkerPool:
    """Pool thread dùng chung 1 ONNX engine, async (submit->worker->callback)."""

    def __init__(self, engine: Any, num_workers: int, per_cam_limit: int, name: str = "OcrPool", bench: Optional[Any] = None):
        self.engine = engine
        self.per_cam_limit = max(1, per_cam_limit)
        self.bench = bench
        self._stop = threading.Event()
        self._q: "queue.Queue[Optional[Dict[str, Any]]]" = queue.Queue()
        self._threads: list = []
        # Số task đang pending/chạy theo camera (fairness, chống 1 cam nuốt pool)
        self._cam_inflight: Dict[str, int] = {}
        self._inflight_lock = threading.Lock()
        for i in range(num_workers):
            t = threading.Thread(
                target=self._worker_loop,
                daemon=True,
                name=f"{name}-{i}",
            )
            t.start()
            self._threads.append(t)

    # -- điều phối ------------------------------------------------------------------
    def _worker_loop(self):
        while not self._stop.is_set():
            task = self._q.get()
            if task is None:  # poison pill
                break
            job = task["job"]
            cb = task["cb"]
            # Đo p95/p99 queue latency (Stage 2 mục 5 của benchmark_plan_50_cameras.md)
            enqueued_at = task.get("enqueued_at")
            if enqueued_at is not None and self.bench is not None:
                self.bench.tick("queue_latency", (time.perf_counter() - enqueued_at) * 1000.0)
            try:
                # `job` (deskew + enhance + ONNX, tự đo ocr_onnx) chạy TRÊN THREAD,
                # trả về kết quả bất kỳ; `cb(result)` là callback của caller.
                cb(job())
            except Exception:
                # 1 task lỗi không sập worker; vẫn gọi cb(None) để caller xử lý/đúng cờ.
                try:
                    cb(None)
                except Exception:
                    pass

    def submit(self, cam_key: str, job: Callable[[], Any], cb: Callable[[Any], None]) -> bool:
        """
        Giao JOB (đầu việc CPU/ONNX: deskew+enhance+OCR) cho pool, trả KẾT QUẢ qua callback
        không block caller. caller (loop camera) được rảnh hoàn toàn.
        - job: hàm không tham số, trả kết quả bất kỳ (thường tuple (plate, conf, meta)).
        - cb : (result) -> None; nhận None khi job lỗi.
        Trả về False nếu camera này đã đạt `per_cam_limit` job inflight -> caller BỎ frame này
        (đợi frame kế) để fair giữa các camera.
        """
        with self._inflight_lock:
            cur = self._cam_inflight.get(cam_key, 0)
            if cur >= self.per_cam_limit:
                return False
            self._cam_inflight[cam_key] = cur + 1

        def _wrapped_cb(result):
            try:
                cb(result)
            finally:
                with self._inflight_lock:
                    self._cam_inflight[cam_key] = max(0, self._cam_inflight.get(cam_key, 0) - 1)

        task = {"cam": cam_key, "job": job, "cb": _wrapped_cb, "enqueued_at": time.perf_counter()}
        try:
            self._q.put(task)
        except Exception:
            with self._inflight_lock:
                self._cam_inflight[cam_key] = max(0, self._cam_inflight.get(cam_key, 0) - 1)
        return True

    def stop(self, timeout: float = 2.0):
        self._stop.set()
        for _ in self._threads:
            self._q.put(None)
        deadline = time.time() + timeout
        for t in self._threads:
            t.join(max(0.0, deadline - time.time()))


# =============================================================================
# BENCHMARK 5 TẦNG (Q2: đo trước khi thread)
# T1: object_det | T2: plate_det | OCR: line+rec | DESKEW | SNAPSHOT(I/O)
# In p50/p95 mỗi N frame khi AI_BENCH=1.
# =============================================================================
class OcrBenchmark:
    __slots__ = ("enabled", "report_every", "counters", "_lock", "last_report")

    def __init__(self, report_every: int = 100):
        self.enabled = os.getenv("AI_BENCH", "0") in ("1", "true", "True")
        self.report_every = max(10, report_every)
        # stage -> list of ms
        self.counters: Dict[str, list] = {}
        self._lock = threading.Lock()
        self.last_report: float = 0.0

    def tick(self, stage: str, ms: float):
        if not self.enabled:
            return
        with self._lock:
            self.counters.setdefault(stage, []).append(ms)

    def report(self, frame_count: int):
        """Gọi từ thread loop camera mỗi frame; in p50/p95 mỗi cửa sổ khi AI_BENCH=1."""
        self._report(frame_count)

    def _report(self, frame_count: int):
        if not self.enabled or frame_count % self.report_every != 0:
            return
        now = time.time()
        # throttle 5s tránh spam log
        if now - self.last_report < 5.0:
            return
        self.last_report = now
        lines = []
        with self._lock:
            for stage in ("t1_objdet", "t2_platedet", "ocr_onnx", "deskew", "snapshot", "queue_latency"):
                arr = self.counters.get(stage, [])
                if not arr:
                    continue
                arr_sorted = sorted(arr)
                p50 = arr_sorted[len(arr_sorted) // 2]
                p95 = arr_sorted[min(len(arr_sorted) - 1, int(len(arr_sorted) * 0.95))]
                lines.append(f"{stage:13s} n={len(arr):4d} p50={p50:6.1f}ms p95={p95:6.1f}ms")
            # reset để theo dõi cửa sổ kế tiếp
            self.counters.clear()
        if lines:
            print(f"  📊 [BENCH] frame#{frame_count} " + " | ".join(lines))


# =============================================================================
# SINGLETON + khởi tạo theo env
# =============================================================================
_GLOBAL_POOL: Optional[OcrWorkerPool] = None
_POOL_LOCK = threading.Lock()
_POOL_BUILT_FOR: Optional[Any] = None  # engine hiện tại gắn với pool


def get_ocr_pool(engine: Any, bench: Optional[Any] = None) -> Optional[OcrWorkerPool]:
    """Trả về pool global (dùng chung 1 engine). None nếu AI_OCR_MAX_TOTAL=0 (chạy sync)."""
    global _GLOBAL_POOL, _POOL_BUILT_FOR
    max_total = int(os.getenv("AI_OCR_MAX_TOTAL", "0"))
    if max_total <= 0:
        return None
    # Khởi tạo số lượng worker thread xử lý song song đa biển theo AI_OCR_MAX_TOTAL
    size = max(2, max_total)
    # Chuẩn IV.2 Lớp 4 của benchmark_plan_50_cameras.md: per_cam_limit >= 8 để phục vụ burst 4-5 xe liên tiếp
    per_cam = max(8, int(os.getenv("AI_OCR_WORKERS", "8")))

    with _POOL_LOCK:
        # pool gắn với engine hiện tại; nếu engine đổi (khởi tạo lại) -> build mới
        if _GLOBAL_POOL is None or _POOL_BUILT_FOR is not engine:
            if _GLOBAL_POOL is not None:
                _GLOBAL_POOL.stop()
            _GLOBAL_POOL = OcrWorkerPool(engine, size, per_cam, bench=bench)
            _POOL_BUILT_FOR = engine
        elif bench is not None and _GLOBAL_POOL.bench is None:
            _GLOBAL_POOL.bench = bench
        return _GLOBAL_POOL


def pool_enabled() -> bool:
    return int(os.getenv("AI_OCR_MAX_TOTAL", "0")) > 0
