#!/usr/bin/env bash
# ============================================================================
# measure_baseline.sh — BƯỚC 0 của docs/optimization-runbook.md
# Ghi "điểm đo baseline" để so trước/sau của mọi bước tối ưu (1..4).
#
# Chạy khi: 1-5 camera + 1-5 operator đang xem (trạng thái thật), hệ đã chạy ~10 phút.
# Chạy:      bash bench/measure_baseline.sh [OUTPUT_FILE]
#             (default OUTPUT_FILE = bench/baseline_YYYYMMDD_HHMMSS.txt)
#
# Nguồn đo (cả 5 nhóm trong runbook):
#   1. CPU/RAM per-container   -> docker stats
#   2. Băng thông per-camera   -> MediaMTX metrics (:9998, cần `metrics: true`)
#   3. Độ trễ end-to-end       -> (đánh giá tay tại FE, script ghi placeholder + hướng dẫn)
#   4. Detection FPS / OCR p95 -> ai_service/benchmarks/benchmark_pipeline.py
#   5. Trạng thái camera       -> /api/cameras (đếm OFFLINE)
#
# LƯU Ý: Script này CHỈ ĐỌC (read-only), không đổi hoạt động hệ thống.
# ============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${1:-$REPO_ROOT/bench/baseline_${STAMP}.txt}"

# Endpoints (đọc từ deploy/ .env nếu có, fallback localhost)
AI_PORT="${AI_PORT:-5000}"
BE_PORT="${BE_PORT:-8080}"
MTX_PORT="${MTX_METRICS_PORT:-9998}"

log() { printf '\n==================== %s ====================\n' "$1"; }

: > "$OUT"   # init
record() { printf '%s\n' "$*" | tee -a "$OUT"; }

record "# BASELINE SNAPSHOT — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
record "# Runbook: docs/optimization-runbook.md (BƯỚC 0)"
record "# Ghi chú: số bên dưới là CHUẨN để so trước/sau các bước 1..4."

# ----------------------------------------------------------------------------
log "1. CPU / RAM per-container (docker stats)"
# ----------------------------------------------------------------------------
record "--- docker stats (2 mẫu cách nhau 5s) ---"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>&1 | tee -a "$OUT"
record ""
sleep 5
record "--- docker stats (mẫu 2) ---"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>&1 | tee -a "$OUT"

# ----------------------------------------------------------------------------
log "2. Băng thông + số reader per-camera (MediaMTX metrics :$MTX_PORT)"
# ----------------------------------------------------------------------------
# Cần bật `metrics: true` trong deploy/mediamtx.yml (kèm comment ở Bước 0 runbook).
# Nếu chưa bật, endpoint 404 -> ghi chú.
record "--- MediaMTX Prometheus metrics (reader count / stream size) ---"
if curl -fsS "http://localhost:${MTX_PORT}/metrics" 2>/dev/null | grep -E 'reader|stream' | head -n 60 | tee -a "$OUT"; then
  :
else
  record "(Chưa có metrics. Bật `metrics: true` trong deploy/mediamtx.yml, restart mediamtx, rồi chạy lại.)"
fi
record ""
record "Tổng outbound (per-camera + fan-out):"
record "  - Với 1 camera: ghi bandwidth baseline (MB/s) khi 1 operator xem."
record "  - VỚI N operator xem cùng 1 camera: ghi bandwidth -> thấy phần FAN-OUT (sẽ chặn ở BƯỚC 2)."
record "  (đo bằng tool mạng của host: `nmon`/`iftop`/Task Manager, hoặc docker stats NETWORK nếu có.)"

# ----------------------------------------------------------------------------
log "3. Độ trễ end-to-end (1-3s SLO) — đánh giá tay"
# ----------------------------------------------------------------------------
record "--- Hướng dẫn đo độ trễ (nôm-timestamp trên frame) ---"
record "  1) Bật hiển thị đồng hồ thực trên màn hình (hoặc dùng frame có timestamp)."
record "  2) Chụp/quay màn hình camera trên web lúc có người/dịch chuyển."
record "  3) Độ trễ = giờ trên khung hình (thật) -> giờ hiện tại. Lấy p50/p95."
record "  ĐÍCH (SLO): 1-3s. >3s = chưa đạt."

# ----------------------------------------------------------------------------
log "4. Detection FPS / OCR p95 (ai_service benchmark pipeline)"
# ----------------------------------------------------------------------------
record "--- Chạy benchmark pipeline (đọc FPS + OCR latency) ---"
record "  cd ai_service && python benchmarks/benchmark_pipeline.py"
record "  Ghi: detection FPS, OCR p50/p95 (ms), GPU active? = $AI_ONNX_GPU (default CPU)."
if [ -f "$REPO_ROOT/ai_service/benchmarks/benchmark_pipeline.py" ]; then
  record "  (File benchmark TRONg repo: ai_service/benchmarks/benchmark_pipeline.py)"
else
  record "  (!Không tìm thấy benchmark_pipeline.py — ghi FPS/OCR tay từ log ai_service.)"
fi

# ----------------------------------------------------------------------------
log "5. Trạng thái camera (đếm OFFLINE — chuẩn so BƯỚC 1)"
# ----------------------------------------------------------------------------
record "--- /api/cameras: số camera OFFLINE (OFFLINE giả = thật up nhưng báo OFFLINE) ---"
record "  Số OFFLINE giả hiện tại (điểm để BƯỚC 1 hạ về 0): "
# Tự động thử đọc từ backend (nếu backend reach được từ host):
if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://localhost:${BE_PORT}/api/cameras" 2>/dev/null \
    | python -c 'import sys,json
try:
    d=json.load(sys.stdin)
    cams=d.get("data") or d if isinstance(d,list) else (d.get("data") if isinstance(d,dict) else [])
    off=[c for c in cams if str(c.get("status","")).upper()=="OFFLINE"]
    print(f"  TOTAL={len(cams)}  OFFLINE={len(off)}  OFFLINE_GUIDES={[c.get(\"name\") for c in off]}")
except Exception as e:
    print(f"  (Không đọc được /api/cameras từ host: {e}. Ghi tay số camera OFFLINE.)")
' | tee -a "$OUT"
else
  record "  (Không có curl — ghi tay số camera OFFLINE.)"
fi

# ----------------------------------------------------------------------------
log "XONG"
# ----------------------------------------------------------------------------
record ""
record "# BASELINE hoàn tất -> $OUT"
record "# Tiếp theo: apply BƯỚC 1 (CameraHealthScheduler), đo lại, so file này."

printf '\n[OK] baseline ghi vào: %s\n' "$OUT"
