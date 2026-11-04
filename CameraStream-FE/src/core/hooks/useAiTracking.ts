import { useEffect, useState } from 'react';

/** Một đối tượng đang được AI bám (xe / khuôn mặt) – dùng chung cho mọi module AI. */
export interface AiTrack {
  trackId: number;
  bbox: [number, number, number, number]; // x1,y1,x2,y2 theo pixel của khung hình AI
  vehicleBbox?: [number, number, number, number] | null;
  vehicleType?: string;
  label?: string; // Biển số hoặc tên người
  plate?: string;
  personName?: string;
  confidence: number;
  inRoi?: boolean;
  crossed?: boolean;
  known?: boolean; // Mặt: đã nhận ra người quen
  isViolation?: boolean;
  module?: string;
}

export interface AiTrackingState {
  tracks: AiTrack[];
  frameW: number;
  frameH: number;
  fps: number;
  roi: [number, number][] | null;
  tripwire: [number, number][] | null;
  activeInRoi: boolean;
  connected: boolean;
}

const EMPTY_STATE: AiTrackingState = {
  tracks: [], frameW: 960, frameH: 540, fps: 0, roi: null, tripwire: null, activeInRoi: false, connected: false
};

type Listener = (s: AiTrackingState) => void;

/**
 * HUB BÁM TOẠ ĐỘ AI TẬP TRUNG (WEBSOCKET HUB + VIEWPORT SUBSCRIPTION):
 * - Toàn bộ ứng dụng chỉ mở DUY NHẤT 1 kết nối WebSocket tới AI Service (/ws/tracking).
 * - Cơ chế Đăng ký theo Viewport: Chỉ nhận toạ độ của những camera đang thực sự hiển thị trên màn hình.
 * - Giải phóng hoàn toàn băng thông mạng khi chạy 50 camera (0% spam tin rác khi vắng xe).
 * - Tự động Fallback sang SSE nếu mạng không hỗ trợ WebSocket.
 */
class AiTrackingHub {
  private ws: WebSocket | null = null;
  private es: EventSource | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private states = new Map<number, AiTrackingState>();
  private listeners = new Map<number, Set<Listener>>();
  private connected = false;
  private refCount = 0;
  private baseUrl: string;

  // TỐI ƯU HIỆU NĂNG 60 FPS: RAF Batching (Gom frame tracking theo nhịp màn hình)
  private pendingCams = new Set<number>();
  private rafId: number | null = null;

  // Watchdog chống đơ khung: không nhận payload mới > 1.0s thì xoá khung đang hiển thị (chỉ lớp UI)
  private lastPayloadAt = new Map<number, number>();
  private staleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private startStaleWatchdog() {
    if (this.staleTimer) return;
    this.staleTimer = setInterval(() => {
      const now = Date.now();
      this.lastPayloadAt.forEach((ts, camId) => {
        if (now - ts <= 1000) return;
        const st = this.states.get(camId);
        if (st && st.tracks.length > 0) {
          this.states.set(camId, { ...st, tracks: [], activeInRoi: false });
          this.emit(camId);
        }
        this.lastPayloadAt.delete(camId);
      });
    }, 400);
  }

  private emit(cameraId: number) {
    if ((this.states.get(cameraId)?.tracks.length || 0) > 0) this.lastPayloadAt.set(cameraId, Date.now());
    else this.lastPayloadAt.delete(cameraId);
    this.pendingCams.add(cameraId);
    if (this.rafId === null && typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(() => {
        this.flushPendingEmits();
      });
    }
  }

  private flushPendingEmits() {
    this.rafId = null;
    const camsToFlush = Array.from(this.pendingCams);
    this.pendingCams.clear();
    for (const camId of camsToFlush) {
      const st = this.states.get(camId) || EMPTY_STATE;
      this.listeners.get(camId)?.forEach((fn) => fn(st));
    }
  }

  private setConnected(v: boolean) {
    this.connected = v;
    this.listeners.forEach((_, camId) => {
      const prev = this.states.get(camId) || EMPTY_STATE;
      const next = { ...prev, connected: v, tracks: v ? prev.tracks : [] };
      this.states.set(camId, next);
      this.emit(camId);
    });
  }

  private syncSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const activeIds = Array.from(this.listeners.keys()).filter((cid) => (this.listeners.get(cid)?.size || 0) > 0);
    try {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        camera_ids: activeIds
      }));
    } catch (_) {}
  }

  private handlePayload(d: any) {
    if (!d || typeof d !== 'object') return;

    // Trường hợp 1: Payload gửi dictionary theo từng camera { cameras: { "39": { ... } } }
    if (d.cameras && typeof d.cameras === 'object') {
      Object.entries(d.cameras).forEach(([cidStr, camData]: [string, any]) => {
        const camId = Number(cidStr);
        if (!this.listeners.has(camId)) return;
        const prev = this.states.get(camId) || EMPTY_STATE;
        const camObj = camData || {};
        const camTracks = Array.isArray(camObj.tracks)
          ? camObj.tracks
          : (Array.isArray(d.tracks) ? d.tracks.filter((t: any) => Number(t.cameraId) === camId) : []);

        this.states.set(camId, {
          connected: true,
          tracks: camTracks,
          frameW: camObj.frameWidth || prev.frameW,
          frameH: camObj.frameHeight || prev.frameH,
          fps: camObj.fps !== undefined ? camObj.fps : prev.fps,
          roi: Array.isArray(camObj.roi) ? camObj.roi : prev.roi,
          tripwire: camObj.tripwire !== undefined ? camObj.tripwire : prev.tripwire,
          activeInRoi: camObj.activeInRoi !== undefined ? Boolean(camObj.activeInRoi) : false
        });
        this.emit(camId);
      });
      return;
    }

    // Trường hợp 2: Payload gửi trực tiếp cho 1 cameraId cụ thể
    if (d.cameraId !== undefined) {
      const camId = Number(d.cameraId);
      if (this.listeners.has(camId)) {
        const prev = this.states.get(camId) || EMPTY_STATE;
        this.states.set(camId, {
          connected: true,
          tracks: Array.isArray(d.tracks) ? d.tracks : prev.tracks,
          frameW: d.frameWidth || prev.frameW,
          frameH: d.frameHeight || prev.frameH,
          fps: d.fps !== undefined ? d.fps : prev.fps,
          roi: Array.isArray(d.roi) ? d.roi : prev.roi,
          tripwire: d.tripwire !== undefined ? d.tripwire : prev.tripwire,
          activeInRoi: d.activeInRoi !== undefined ? Boolean(d.activeInRoi) : prev.activeInRoi
        });
        this.emit(camId);
      }
      return;
    }

    // Trường hợp 3: Top-level tracks gộp chung
    if (Array.isArray(d.tracks)) {
      this.listeners.forEach((_, camId) => {
        const camTracks = d.tracks.filter((t: any) => !t.cameraId || Number(t.cameraId) === camId);
        const prev = this.states.get(camId) || EMPTY_STATE;
        this.states.set(camId, {
          ...prev,
          connected: true,
          tracks: camTracks,
          frameW: d.frameWidth || prev.frameW,
          frameH: d.frameHeight || prev.frameH
        });
        this.emit(camId);
      });
    }
  }

  private connect() {
    this.startStaleWatchdog();
    if (this.ws || this.es || this.refCount === 0) return;

    // 1. ƯU TIÊN SỐ 1: Kết nối WebSocket Hub có Viewport Subscription
    const wsProto = this.baseUrl.startsWith('https') ? 'wss:' : 'ws:';
    const cleanHost = this.baseUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}//${cleanHost}/ws/tracking`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.setConnected(true);
        this.syncSubscriptions();
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ action: 'ping' }));
            } catch (_) {}
          }
        }, 12000);
      };

      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          this.handlePayload(d);
        } catch (_) {}
      };

      ws.onerror = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        this.fallbackToSse();
      };

      ws.onclose = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        this.setConnected(false);
        this.ws = null;
        if (this.refCount > 0 && !this.retry && !this.es) {
          this.retry = setTimeout(() => this.connect(), 3000);
        }
      };
    } catch (_) {
      this.fallbackToSse();
    }
  }

  private fallbackToSse() {
    if (this.es) return;
    try {
      this.ws?.close();
      this.ws = null;
    } catch (_) {}

    try {
      const es = new EventSource(`${this.baseUrl}/tracking-events`);
      this.es = es;
      es.onopen = () => this.setConnected(true);
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          this.handlePayload(d);
        } catch (_) {}
      };
      es.onerror = () => {
        this.setConnected(false);
        es.close();
        this.es = null;
        if (this.refCount > 0 && !this.retry) {
          this.retry = setTimeout(() => this.connect(), 3000);
        }
      };
    } catch (_) {}
  }

  subscribe(cameraId: number, fn: Listener): () => void {
    if (!this.listeners.has(cameraId)) this.listeners.set(cameraId, new Set());
    this.listeners.get(cameraId)!.add(fn);
    this.refCount++;
    fn(this.states.get(cameraId) || { ...EMPTY_STATE, connected: this.connected });
    this.connect();
    this.syncSubscriptions();

    return () => {
      const set = this.listeners.get(cameraId);
      set?.delete(fn);
      if (set && set.size === 0) {
        this.listeners.delete(cameraId);
        this.states.delete(cameraId);
      }
      this.refCount--;
      this.syncSubscriptions();
      if (this.refCount <= 0) {
        this.refCount = 0;
        if (this.retry) clearTimeout(this.retry);
        this.retry = null;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        if (this.staleTimer) clearInterval(this.staleTimer);
        this.staleTimer = null;
        this.lastPayloadAt.clear();
        if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
        this.pendingCams.clear();
        try { this.ws?.close(); } catch (_) {}
        this.ws = null;
        try { this.es?.close(); } catch (_) {}
        this.es = null;
        this.connected = false;
      }
    };
  }
}

const hubs = new Map<string, AiTrackingHub>();
export const getHub = (baseUrl: string) => {
  let h = hubs.get(baseUrl);
  if (!h) { h = new AiTrackingHub(baseUrl); hubs.set(baseUrl, h); }
  return h;
};

/**
 * Hook dùng chung: kết nối tới 1 AI service bất kỳ (xe: :5000, mặt: :5001)
 * theo cùng hợp đồng `/tracking-events`. Nhiều hook cùng baseUrl dùng chung 1 kết nối.
 * Truyền enabled=false (ô ngoài màn hình) để tạm ngừng nhận dữ liệu.
 */
export function useAiTracking(
  baseUrl: string,
  cameraId: number | null | undefined,
  enabled: boolean = true
): AiTrackingState {
  const [state, setState] = useState<AiTrackingState>(EMPTY_STATE);

  useEffect(() => {
    if (cameraId === null || cameraId === undefined || !enabled) {
      setState(EMPTY_STATE);
      return;
    }
    return getHub(baseUrl).subscribe(Number(cameraId), setState);
  }, [baseUrl, cameraId, enabled]);

  return state;
}
