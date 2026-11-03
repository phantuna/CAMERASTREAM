import { useState, useEffect, useRef, useMemo, useCallback, type FC } from 'react';
import { IconRefresh, IconUser } from '../../components/SurveillanceIcons';
import { useAiTracking } from '../../core/hooks/useAiTracking';

const FACE_AI_URL = (import.meta as any).env?.VITE_FACE_AI_URL || 'http://localhost:5001';

export interface FaceWallViewProps {
  apiBaseUrl: string;
}

interface WallCamera {
  id: number;
  name: string;
  webrtcUrl?: string;
  webrtcSubUrl?: string; // Nếu backend cung cấp luồng phụ cho lưới (nhẹ hơn nhiều)
}

const PAGE_SIZES = [4, 9, 16, 25];

interface TileProps {
  camera: WallCamera;
  index: number;
  onOpen: (cam: WallCamera) => void;
}

/** Một ô camera: chỉ kết nối WebRTC khi đang nằm trong màn hình, rời màn hình là ngắt ngay. */
const FaceWallTile: FC<TileProps> = ({ camera, index, onOpen }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const tracking = useAiTracking(FACE_AI_URL, camera.id, visible);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const url = camera.webrtcSubUrl || camera.webrtcUrl;
    if (!visible || !url) { setStatus('idle'); return; }

    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let stream: MediaStream | null = null;

    // Mở so le theo thứ tự ô để tránh 16-25 kết nối WebRTC cùng một nhịp
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setStatus('connecting');
      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.ontrack = (ev) => {
          if (cancelled || !videoRef.current || !ev.streams[0]) return;
          stream = ev.streams[0];
          videoRef.current.srcObject = stream;
          setStatus('live');
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await new Promise<void>((resolve) => {
          if (pc?.iceGatheringState === 'complete') return resolve();
          const t = setTimeout(resolve, 1200);
          pc?.addEventListener('icegatheringstatechange', () => {
            if (pc?.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
          });
        });
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp || offer.sdp
        });
        if (!res.ok) throw new Error(`WHEP ${res.status}`);
        if (!cancelled && pc) await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
      } catch (_) {
        if (!cancelled) setStatus('error');
      }
    }, (index % 8) * 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => { try { t.stop(); } catch (_) { /* noop */ } });
      if (videoRef.current) videoRef.current.srcObject = null;
      try { pc?.close(); } catch (_) { /* noop */ }
    };
  }, [visible, camera.webrtcUrl, camera.webrtcSubUrl, index]);

  const faceCount = tracking.tracks.length;

  return (
    <div
      ref={boxRef}
      onClick={() => onOpen(camera)}
      style={{
        position: 'relative', backgroundColor: '#020617', borderRadius: '10px', overflow: 'hidden',
        border: '1px solid #1E293B', aspectRatio: '16 / 9', cursor: 'pointer'
      }}
    >
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />

      <svg
        viewBox={`0 0 ${tracking.frameW} ${tracking.frameH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {tracking.tracks.map((t) => {
          const [x1, y1, x2, y2] = t.bbox;
          const known = t.known ?? !!t.personName;
          const color = known ? '#10B981' : '#EF4444';
          const sw = Math.max(3, tracking.frameW / 320);
          return <rect key={t.trackId} x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke={color} strokeWidth={sw} />;
        })}
      </svg>

      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, padding: '4px 8px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        background: 'linear-gradient(180deg, rgba(2,6,23,0.85), transparent)', fontSize: '11px', color: '#F1F5F9', fontWeight: 600
      }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>#{camera.id} {camera.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {faceCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#A78BFA' }}>
              <IconUser size={11} color="#A78BFA" />{faceCount}
            </span>
          )}
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            backgroundColor: status === 'live' ? '#10B981' : status === 'error' ? '#EF4444' : '#F59E0B'
          }} />
        </span>
      </div>

      {status !== 'live' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#64748B', fontSize: '11.5px', pointerEvents: 'none'
        }}>
          {status === 'error' ? 'Không kết nối được luồng' : status === 'connecting' ? 'Đang kết nối...' : 'Chờ hiển thị'}
        </div>
      )}
    </div>
  );
};

export const FaceWallView: FC<FaceWallViewProps> = ({ apiBaseUrl }) => {
  const [cameras, setCameras] = useState<WallCamera[]>([]);
  const [faceIds, setFaceIds] = useState<Set<number>>(new Set());
  const [onlyFace, setOnlyFace] = useState<boolean>(true);
  const [pageSize, setPageSize] = useState<number>(9);
  const [page, setPage] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [focus, setFocus] = useState<WallCamera | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const camJson = await (await fetch(`${apiBaseUrl}/api/cameras`)).json();
      setCameras(camJson?.data || []);
      const taskJson = await (await fetch(`${apiBaseUrl}/api/cameras/ai-tasks?aiType=FACE_RECOGNITION`)).json();
      const ids = new Set<number>();
      (taskJson?.data || []).forEach((t: any) => { if (t.cameraId && t.enabled !== false) ids.add(Number(t.cameraId)); });
      setFaceIds(ids);
    } catch (_) { /* giữ trạng thái cũ */ } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => { load(); }, [load]);

  const list = useMemo(
    () => (onlyFace ? cameras.filter((c) => faceIds.has(c.id)) : cameras),
    [cameras, faceIds, onlyFace]
  );
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = list.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const cols = Math.ceil(Math.sqrt(pageSize));

  useEffect(() => { setPage(0); }, [pageSize, onlyFace]);

  const btn = (active: boolean) => ({
    padding: '5px 11px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
    backgroundColor: active ? '#7C3AED' : '#E2E8F0', color: active ? '#FFF' : '#475569'
  } as const);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', boxSizing: 'border-box' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px',
        backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '10px 14px'
      }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
          Ma Trận Giám Sát Người
          <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 600, color: '#64748B' }}>
            {list.length} camera • trang {safePage + 1}/{pageCount}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button style={btn(onlyFace)} onClick={() => setOnlyFace(true)}>Camera FaceID</button>
          <button style={btn(!onlyFace)} onClick={() => setOnlyFace(false)}>Tất cả camera</button>
          <span style={{ width: '1px', height: '18px', backgroundColor: '#CBD5E1', margin: '0 4px' }} />
          {PAGE_SIZES.map((n) => (
            <button key={n} style={btn(pageSize === n)} onClick={() => setPageSize(n)}>{n} ô</button>
          ))}
          <span style={{ width: '1px', height: '18px', backgroundColor: '#CBD5E1', margin: '0 4px' }} />
          <button style={btn(false)} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Trước</button>
          <button style={btn(false)} disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Sau</button>
          <button style={{ ...btn(false), display: 'inline-flex', alignItems: 'center' }} onClick={load} title="Làm mới">
            <IconRefresh size={13} />
          </button>
        </div>
      </div>

      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: '8px', alignContent: 'start',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
      }}>
        {loading && list.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94A3B8' }}>Đang tải danh sách camera...</div>
        ) : pageItems.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
            Chưa có camera nào gán phân hệ FaceID. Chọn "Tất cả camera" hoặc gán camera trong Giám Sát Người Trực Tiếp.
          </div>
        ) : (
          pageItems.map((cam, i) => (
            <FaceWallTile key={cam.id} camera={cam} index={i} onOpen={setFocus} />
          ))
        )}
      </div>

      {focus && (
        <div
          onClick={() => setFocus(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: 'rgba(2,6,23,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(1200px, 96vw)' }}>
            <FaceWallTile camera={focus} index={0} onOpen={() => setFocus(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default FaceWallView;
