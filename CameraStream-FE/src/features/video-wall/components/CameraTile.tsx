import { useState, useRef, useEffect, memo, type FC } from 'react';
import type { CameraDto } from '../../device-manager/types';
import type { CameraAiMetadata, ModuleMode } from '../types';
import {
  IconCamera,
  IconCctv,
  IconMaximize
} from '../../../components/SurveillanceIcons';
import { resolveWebRtcUrl, getAiServiceBaseUrl } from '../../../shared/utils/envConfig';
import { useAiTracking } from '../../../core/hooks/useAiTracking';

interface HighlightMatchProps {
  text: string;
  query: string;
}

const HighlightMatch: FC<HighlightMatchProps> = ({ text, query }) => {
  if (!query || !query.trim() || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: '#0284C7', color: '#FFFFFF', padding: '1px 3px', borderRadius: '3px' }}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

// RECONNECT BỊ HẠN CHẾ (BƯỚC 1 runbook): exponential backoff 5s → 60s, tối đa 5 lần
// (mirror pattern retry có sẵn trong CameraStreamView.tsx)
const WHEP_RETRY_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

export interface CameraTileProps {
  camera: CameraDto;
  onClick: (cam: CameraDto) => void;
  searchQuery?: string;
  isLcpCandidate?: boolean;
  aiData?: CameraAiMetadata;
  moduleMode?: ModuleMode;
  aiApiBaseUrl?: string;
}

export const CameraTile: FC<CameraTileProps> = ({
  camera,
  onClick,
  searchQuery = '',
  aiData,
  moduleMode = 'VEHICLE',
  aiApiBaseUrl
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisibleInViewport, setIsVisibleInViewport] = useState(true);

  // TỐI ƯU CỰC ĐẠI THEO CHUẨN UI-UX:
  // Độc lập hóa luồng bám toạ độ AI vào từng CameraTile riêng biệt.
  // Khi xe chạy ở Cam 1, CHỈ Cam 1 re-render, toàn bộ 15 ô còn lại & VideoWallView KHÔNG bị re-render!
  const trackingState = useAiTracking(
    aiApiBaseUrl || getAiServiceBaseUrl(),
    camera.id,
    isVisibleInViewport
  );

  const effectiveAiData: CameraAiMetadata = aiData || {
    tracks: trackingState.tracks as any,
    roi: trackingState.roi || [[0.15, 0.48], [0.85, 0.48], [0.92, 0.95], [0.08, 0.95]],
    activeInRoi: trackingState.activeInRoi || trackingState.tracks.some((t: any) => t.inRoi),
    fps: trackingState.fps || 0,
    frameDim: { w: trackingState.frameW, h: trackingState.frameH }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [isWebRtcConnected, setIsWebRtcConnected] = useState(false);
  const [webRtcError, setWebRtcError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  // Chênh lệch với isConnecting: isConnecting = lần gọi WHEP đầu tiên; isReconnecting = đang chạy vòng tự nối lại sau khi luồng bị đứt (placeholder "đang nối lại").
  const [isReconnecting, setIsReconnecting] = useState(false);

  // 1. INTERSECTION OBSERVER: Chỉ nạp và giải mã luồng khi ô camera nằm trong màn hình nhìn thấy (Tránh rò rỉ RAM)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsVisibleInViewport(entry.isIntersecting);
      },
      { rootMargin: '120px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 2. KẾT NỐI WEBRTC TRỰC TIẾP CHO LUỒNG PHỤ (SUB-STREAM ECO QUA WHEP MEDIAMTX)
  //    BƯỚC 1 runbook: thêm listener onconnectionstatechange + auto-reconnect (backoff)
  //    để camera rứt trong khi đang xem KHÔNG để lại frame chết.
  useEffect(() => {
    const targetUrl = resolveWebRtcUrl(camera.webrtcUrl);
    if (!isVisibleInViewport || !targetUrl) {
      return;
    }

    let pc: RTCPeerConnection | null = null;
    let isCancelled = false;
    let activeStream: MediaStream | null = null;
    let retryTimer: number | null = null;
    let retryCount = 0; // chỉ increment khi luồng ĐÃ connect rồi bị đứt (không đếm lần đầu)

    const closeCurrentPc = () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => {
          try { track.stop(); } catch { /* ignore */ }
        });
        activeStream = null;
      }
      if (pc) {
        try {
          pc.getSenders?.().forEach((s) => s.track?.stop());
          pc.getReceivers?.().forEach((r) => r.track?.stop());
          pc.onconnectionstatechange = null; // detach listener trước khi close
          pc.oniceconnectionstatechange = null;
          pc.close();
        } catch { /* ignore */ }
        pc = null;
        pcRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsWebRtcConnected(false);
    };

    const scheduleReconnect = (reason: string) => {
      if (isCancelled) return;
      retryCount += 1;
      if (retryCount > WHEP_RETRY_BACKOFF_MS.length) {
        // Vượt trần: dừng thử lại, hiện OFFLINE (không spin vô hạn nếu MediaMTX/camera thật sự chết)
        setIsReconnecting(false);
        setIsConnecting(false);
        setWebRtcError(reason || 'Không nối lại được luồng');
        return;
      }
      const delay = WHEP_RETRY_BACKOFF_MS[retryCount - 1];
      setIsReconnecting(true);
      retryTimer = window.setTimeout(() => {
        if (isCancelled) return;
        void attemptConnect();
      }, delay);
    };

    const attemptConnect = async () => {
      try {
        closeCurrentPc();
        setWebRtcError(null);

        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        pc.addTransceiver('video', { direction: 'recvonly' });

        // LÖ HỔNG MỚI (BƯỚC 1): stream đang chạy mà MediaMTX/camera bị đứt ->
        // trước đây không có listener nào -> isWebRtcConnected vẫn true -> frame chết.
        pc.onconnectionstatechange = () => {
          const st = pc?.connectionState;
          if (st === 'connected' || st === 'disconnected') {
            if (st === 'connected') {
              // Phục hồi / kết nối lần đầu thành công -> hủy các timer retry còn treo
              if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
              setIsReconnecting(false);
            } else if (st === 'disconnected') {
              // 'disconnected' (chưa 'failed'): ICE thường tự recover, để nó chạy thêm
              // trước khi bắt buộc tạo peer connection mới.
            }
          } else if (st === 'failed' || st === 'closed') {
            // Chết thật -> hủy pc hiện tại, tạo pc mới theo backoff.
            closeCurrentPc();
            scheduleReconnect('Mất kết nối MediaMTX WebRTC');
          }
        };
        pc.oniceconnectionstatechange = () => {
          if (pc?.iceConnectionState === 'failed') {
            closeCurrentPc();
            scheduleReconnect('ICE kết nối thất bại');
          }
        };

        pc.ontrack = (event) => {
          if (!isCancelled && event.streams[0]) {
            activeStream = event.streams[0];
            if (videoRef.current) {
              videoRef.current.srcObject = activeStream;
            }
            setIsWebRtcConnected(true);
            setIsConnecting(false);
            setIsReconnecting(false);
            setWebRtcError(null);
            // Reset bộ đếm backoff khi đã connect thành công 1 lần
            retryCount = 0;
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise<void>((resolve) => {
          if (pc?.iceGatheringState === 'complete') {
            resolve();
            return;
          }
          const t = setTimeout(() => {
            pc?.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }, 1200);
          const checkState = () => {
            if (pc?.iceGatheringState === 'complete') {
              clearTimeout(t);
              pc?.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc?.addEventListener('icegatheringstatechange', checkState);
        });

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp || offer.sdp
        });

        if (res.ok) {
          const answerSdp = await res.text();
          if (!isCancelled && pc) {
            await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
          }
        } else {
          throw new Error(`MediaMTX WHEP code ${res.status}`);
        }
      } catch (err: any) {
        if (!isCancelled) {
          closeCurrentPc();
          scheduleReconnect(err?.message || 'Lỗi kết nối luồng');
        }
      }
    };

    setIsConnecting(true);
    void attemptConnect();

    return () => {
      isCancelled = true;
      if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
      closeCurrentPc();
      setIsReconnecting(false);
      setIsWebRtcConnected(false);
    };
  }, [isVisibleInViewport, camera.webrtcUrl]);

  // BƯỚC 1: "OFFLINE – đang nối lại..." = đang trong vòng tự retry (isReconnecting),
  // khác với isConnecting (lần gọi WHEP đầu tiên chưa từng connect).
  const isReconnectingNow = isReconnecting;
  // OFFLINE thật sự (đỏ, "Mất Tín Hiệu") chỉ khi: chưa stream + không phải lần connect đầu
  // + không đang retry (đã thử hết backoff) + (camera OFFLINE theo backend LẠI webRtcError).
  const isActuallyOffline = !isWebRtcConnected && !isConnecting && !isReconnectingNow && (camera.status === 'OFFLINE' || Boolean(webRtcError));

  return (
    <div
      ref={containerRef}
      onClick={() => onClick(camera)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        backgroundColor: '#0A0E17',
        border: isHovered ? '2px solid #0284C7' : '1px solid #E2E8F0',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        aspectRatio: '16 / 9',
        boxShadow: isHovered ? '0 4px 14px rgba(2, 132, 199, 0.25)' : '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'all 0.2s ease',
        userSelect: 'none'
      }}
      title={`Nhấp chuột để mở rộng & xem Luồng Chính Full HD của ${camera.name}`}
    >
      {/* 1. Video WebRTC Live Sub-Stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: isWebRtcConnected ? 'block' : 'none'
        }}
      />

      {/* 1.1 Lớp phủ AI Bám Biển Số & Virtual ROI Cho Luồng Phụ (Sub-Stream) */}
      {isWebRtcConnected && effectiveAiData && (camera.activeAiModules ? camera.activeAiModules.length > 0 : true) && (
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 2,
          overflow: 'hidden'
        }}>
          {/* Vẽ Khung ảo Virtual ROI bằng SVG */}
          {effectiveAiData.roi && effectiveAiData.roi.length >= 3 && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            >
              <polygon
                points={effectiveAiData.roi.map(([rx, ry]) => `${(rx * 100).toFixed(2)},${(ry * 100).toFixed(2)}`).join(' ')}
                fill={effectiveAiData.activeInRoi ? 'rgba(34, 197, 94, 0.14)' : 'rgba(56, 189, 248, 0.05)'}
                stroke={effectiveAiData.activeInRoi ? '#22C55E' : '#38BDF8'}
                strokeWidth="0.8"
                strokeDasharray="2 1.5"
              />
            </svg>
          )}

          {/* Vẽ Bounding Box & Nhãn: Thân xe (vehicleBbox) và Biển số (bbox) */}
          {effectiveAiData.tracks && effectiveAiData.tracks
            .filter((trk) => {
              const isPerson = Boolean(trk.personName || trk.module === 'FACE_ID' || trk.vehicleType === 'PERSON');
              if (isPerson && moduleMode !== 'FACE') return false;
              if (effectiveAiData.roi && effectiveAiData.roi.length >= 3 && trk.inRoi === false) return false;
              return true;
            })
            .map((trk) => {
              const dimW = effectiveAiData.frameDim?.w || 960;
              const dimH = effectiveAiData.frameDim?.h || 540;
              const vBox = trk.vehicleBbox;
              const pBox = trk.bbox;
              const hasPlate = Boolean(trk.plate && trk.plate.trim());
              const isPerson = trk.vehicleType === 'PERSON' || Boolean(trk.personName);
              const rawType = isPerson
                ? (trk.personName || 'PERSON')
                : (trk.vehicleType === 'MOTO' ? 'MOTO' : (trk.vehicleType === 'TRUCK' ? 'TRUCK' : (trk.vehicleType === 'BUS' ? 'BUS' : 'CAR')));

              const boxesToRender: { box: [number, number, number, number]; isPlate: boolean; color: string; badge: string }[] = [];

              if (vBox) {
                boxesToRender.push({
                  box: vBox,
                  isPlate: false,
                  color: isPerson ? '#F59E0B' : '#00FF00',
                  badge: hasPlate ? `#${trk.trackId} ${trk.plate} (${rawType})` : `#${trk.trackId} ${rawType}`
                });
              }

              if (pBox && (!vBox || pBox[0] !== vBox[0] || pBox[1] !== vBox[1])) {
                boxesToRender.push({
                  box: pBox,
                  isPlate: true,
                  color: '#38BDF8',
                  badge: hasPlate ? trk.plate! : 'BIỂN SỐ'
                });
              }

              if (boxesToRender.length === 0 && (vBox || pBox)) {
                const fallbackBox = vBox || pBox;
                if (fallbackBox) {
                  boxesToRender.push({
                    box: fallbackBox,
                    isPlate: hasPlate,
                    color: isPerson ? '#F59E0B' : '#00FF00',
                    badge: hasPlate ? `#${trk.trackId} ${trk.plate}` : `#${trk.trackId} ${rawType}`
                  });
                }
              }

              return (
                <div key={trk.trackId}>
                  {boxesToRender.map((bItem, bIdx) => {
                    const b = bItem.box;
                    return (
                      <div
                        key={`${trk.trackId}-${bIdx}`}
                        style={{
                          position: 'absolute',
                          left: `${(b[0] / dimW) * 100}%`,
                          top: `${(b[1] / dimH) * 100}%`,
                          width: `${((b[2] - b[0]) / dimW) * 100}%`,
                          height: `${((b[3] - b[1]) / dimH) * 100}%`,
                          border: bItem.isPlate ? `2px solid ${bItem.color}` : `1.5px solid ${bItem.color}`,
                          borderRadius: '2px',
                          backgroundColor: bItem.isPlate ? 'rgba(56, 189, 248, 0.12)' : (isPerson ? 'rgba(245, 158, 11, 0.03)' : 'rgba(0, 255, 0, 0.02)'),
                          boxShadow: bItem.isPlate ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none',
                          pointerEvents: 'none',
                          willChange: 'left, top, width, height'
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          top: ((b[1] / dimH) * 100) > 6 ? '-16px' : '2px',
                          left: '-1.5px',
                          background: 'rgba(0, 0, 0, 0.92)',
                          border: `1px solid ${bItem.color}`,
                          padding: '0 4px',
                          borderRadius: '2px',
                          fontSize: '10px',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontWeight: 800,
                          lineHeight: '15px',
                          color: bItem.color,
                          letterSpacing: '0.5px',
                          whiteSpace: 'nowrap'
                        }}>
                          {bItem.badge}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </div>
      )}

      {/* 2. Màn hình chờ hoặc Mất tín hiệu */}
      {!isWebRtcConnected && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0F172A',
          color: isActuallyOffline ? '#EF4444' : '#38BDF8',
          gap: '6px',
          padding: '12px',
          textAlign: 'center'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isActuallyOffline
              ? <IconCctv size={26} color="#EF4444" />
              : isReconnectingNow
                ? <IconCctv size={26} color="#F59E0B" />
                : <IconCamera size={26} color="#38BDF8" />}
          </span>
          <span style={{ fontSize: '11.5px', fontWeight: 600 }}>
            {isActuallyOffline
              ? 'Camera Mất Tín Hiệu'
              : isReconnectingNow
                ? 'OFFLINE – Đang nối lại...'
                : 'Đang kết nối luồng MediaMTX...'}
          </span>
          <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>
            {camera.ipAddress}:{camera.rtspPort || 554}
          </span>
          {isActuallyOffline && webRtcError && (
            <span style={{ fontSize: '9.5px', color: '#F87171', maxWidth: '240px' }}>
              ({webRtcError})
            </span>
          )}
          {isReconnectingNow && (
            <span style={{ fontSize: '9.5px', color: '#F59E0B', maxWidth: '240px' }}>
              (tự động thử lại trong vài giây)
            </span>
          )}
        </div>
      )}

      {/* Thanh thông tin dưới cùng có highlight từ khóa tìm kiếm */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '4px 8px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '11px',
        color: '#F1F5F9'
      }}>
        <div style={{ maxWidth: '75%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ fontWeight: 600 }}>
            <HighlightMatch text={camera.name} query={searchQuery} />
          </span>
          {camera.location && (
            <span style={{ fontSize: '10px', color: '#94A3B8', marginLeft: '6px' }}>
              (<HighlightMatch text={camera.location} query={searchQuery} />)
            </span>
          )}
        </div>
        <span style={{ fontSize: '10px', color: '#38BDF8', fontFamily: 'monospace' }}>
          #{camera.id}
        </span>
      </div>

      {isHovered && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(14, 165, 233, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <div style={{
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            border: '1px solid #38BDF8',
            color: '#38BDF8',
            padding: '5px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <IconMaximize size={12} /> Xem Luồng Chính Full HD
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(CameraTile);
