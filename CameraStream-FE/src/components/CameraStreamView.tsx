import { useEffect, useRef, useState, useCallback, type FC, type ChangeEvent } from 'react';
import VehicleAccessPanel from './VehicleAccessPanel';
import RoiConfigModal from './RoiConfigModal';
import { useAiTracking } from '../core/hooks/useAiTracking';
import { getBackendBaseUrl, getAiServiceBaseUrl } from '../shared/utils/envConfig';
import {
  IconCctv,
  IconSearch,
  IconClose,
  IconPolygon,
  IconPlus,
  IconRefresh,
  IconAlertTriangle,
  IconTarget,
  IconCopy,
  IconCheck
} from './SurveillanceIcons';

// Unified API Response
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  traceId?: string;
  devMessage?: string;
}

export interface CameraDto {
  id: number;
  name: string;
  ipAddress: string;
  onvifPort: number;
  rtspPort: number;
  username: string;
  streamPath: string;
  type: string;
  location: string;
  status: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';
  lastError?: string;
  rtspSourceUrl?: string;
  webrtcUrl: string;
  hlsUrl: string;
  rtspRelayUrl: string;
  snapshotApiUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnvifDiscoveryDevice {
  ipAddress: string;
  port: number;
  xAddrs: string;
  types: string;
}

interface CameraStreamProps {
  apiBaseUrl?: string; // Default: 'http://localhost:8080'
}

interface SingleCameraPlayerProps {
  key?: any;
  camera: CameraDto;
  apiBaseUrl: string;
  searchQuery?: string;
  onEdit?: (camera: CameraDto) => void;
  onDelete?: (id: number) => void;
}

interface HighlightMatchProps {
  text: string;
  query: string;
}

const HighlightMatch: FC<HighlightMatchProps> = ({ text, query }) => {
  if (!query || !query.trim() || !text) return <>{text}</>;
  const parts: string[] = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part: string, i: number) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: '#2563EB', color: '#FFFFFF', padding: '1px 4px', borderRadius: '3px' }}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

export const CameraCardSkeleton: FC = () => (
  <div style={{
    background: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid #E2E8F0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)'
  }}>
    <div style={{
      padding: '14px 18px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: '#F8FAFC',
      borderBottom: '1px solid #E2E8F0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '60%' }}>
        <div style={{ width: '130px', height: '16px', borderRadius: '6px', backgroundColor: '#E2E8F0' }} />
        <div style={{ width: '55px', height: '18px', borderRadius: '12px', backgroundColor: '#E2E8F0' }} />
      </div>
      <div style={{ width: '85px', height: '14px', borderRadius: '4px', backgroundColor: '#E2E8F0' }} />
    </div>

    <div style={{
      width: '100%',
      aspectRatio: '16 / 9',
      backgroundColor: '#0F172A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px'
    }}>
      <div style={{
        width: '38px',
        height: '38px',
        borderRadius: '50%',
        border: '3px solid rgba(2, 132, 199, 0.2)',
        borderTopColor: '#0284C7',
        animation: 'spin 1s linear infinite'
      }} />
      <span style={{ fontSize: '12px', color: '#94A3B8' }}>Đang chuẩn bị luồng trực tiếp...</span>
    </div>

    <div style={{
      padding: '12px 18px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: '#F8FAFC',
      borderTop: '1px solid #E2E8F0'
    }}>
      <div style={{ width: '70px', height: '12px', borderRadius: '4px', backgroundColor: '#E2E8F0' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ width: '65px', height: '28px', borderRadius: '6px', backgroundColor: '#1E293B' }} />
        <div style={{ width: '75px', height: '28px', borderRadius: '6px', backgroundColor: '#1E293B' }} />
      </div>
    </div>
  </div>
);

export const SingleCameraPlayer: FC<SingleCameraPlayerProps> = ({
  camera,
  apiBaseUrl,
  searchQuery = '',
  onEdit,
  onDelete
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDisconnected, setIsDisconnected] = useState<boolean>(false);
  const [hasActiveVideo, setHasActiveVideo] = useState<boolean>(false);
  const [retryCountdown, setRetryCountdown] = useState<number>(0);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [showPtz, setShowPtz] = useState<boolean>(false);
  const MAX_RETRIES = 5;

  // AI BÁM BIỂN SỐ REALTIME: Dùng Hub chung (Singleton) tránh mở nhiều EventSource làm spam request
  const liveAi = useAiTracking(getAiServiceBaseUrl(), camera.id);
  const aiTracks = liveAi.tracks;
  const aiFrameDim = { w: liveAi.frameW, h: liveAi.frameH };
  const [showAiOverlay, setShowAiOverlay] = useState<boolean>(true);
  const aiFps = liveAi.fps;
  const activeInRoi = liveAi.activeInRoi;
  const [roiNormalized, setRoiNormalized] = useState<[number, number][]>([
    [0.15, 0.48], [0.85, 0.48], [0.92, 0.95], [0.08, 0.95]
  ]);
  const aiConnected = liveAi.connected;
  const [showRoiModal, setShowRoiModal] = useState<boolean>(false);

  // Đồng bộ cấu hình ROI từ luồng AI khi có dữ liệu
  useEffect(() => {
    if (liveAi.roi && Array.isArray(liveAi.roi) && liveAi.roi.length >= 3) {
      setRoiNormalized(liveAi.roi);
    }
  }, [liveAi.roi]);

  const cleanupMedia = useCallback(() => {
    setHasActiveVideo(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
        try {
          track.stop();
        } catch (e) {
          // ignore
        }
      });
      streamRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch (e) {
        // ignore
      }
      pcRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startStream = useCallback(async () => {
    if (!camera.webrtcUrl) return;
    setLoading(true);
    setErrorMsg(null);

    cleanupMedia();

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setIsDisconnected(true);
          setErrorMsg('Tín hiệu WebRTC bị ngắt kết nối (Camera mất nguồn hoặc mất cáp mạng)');
        } else if (pc.connectionState === 'connected') {
          setIsDisconnected(false);
          setErrorMsg(null);
          setLoading(false);
          setRetryCount(0);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          setIsDisconnected(true);
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setIsDisconnected(false);
          setRetryCount(0);
        }
      };

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event: RTCTrackEvent) => {
        const stream = event.streams[0];
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasActiveVideo(true);
          setLoading(false);
          setIsDisconnected(false);
          setErrorMsg(null);
          setRetryCount(0);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Chờ thu thập ICE Candidates (MediaMTX WHEP yêu cầu non-trickle SDP hoặc timeout 1.5s)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }, 1500);
        const checkState = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timer);
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', checkState);
      });

      const sdpToSend = pc.localDescription?.sdp || offer.sdp;

      const response = await fetch(camera.webrtcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: sdpToSend,
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Chưa có luồng video từ Camera (MediaMTX 404: Kiểm tra lại IP, cổng RTSP hoặc nguồn camera)');
        }
        throw new Error(`MediaMTX WHEP trả về mã ${response.status}`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      setIsDisconnected(false);
      setRetryCount(0);
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi kết nối WebRTC');
      setIsDisconnected(true);
      setLoading(false);
    }
  }, [camera.webrtcUrl, cleanupMedia]);

  // Thoái lui hàm mũ (Exponential Backoff): 5s -> 10s -> 20s -> 40s -> 60s, tối đa 5 lần
  useEffect(() => {
    if (!isDisconnected && !errorMsg && hasActiveVideo) {
      setRetryCount(0);
      setRetryCountdown(0);
      return;
    }

    // Đạt số lần tối đa -> Dừng hẳn để chống spam API
    if (retryCount >= MAX_RETRIES) {
      setRetryCountdown(0);
      return;
    }

    const backoffSeconds = Math.min(60, 5 * Math.pow(2, retryCount));
    setRetryCountdown(backoffSeconds);

    const interval = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setRetryCount((c) => c + 1);
          startStream();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isDisconnected, errorMsg, camera.status, retryCount, startStream]);

  const handleManualRetry = () => {
    setRetryCount(0);
    setRetryCountdown(0);
    startStream();
  };

  useEffect(() => {
    startStream();
    return () => {
      cleanupMedia();
    };
  }, [startStream, cleanupMedia]);

  const handleSnapshot = () => {
    window.open(`${apiBaseUrl}${camera.snapshotApiUrl}`, '_blank');
  };

  const sendPtz = async (action: string) => {
    try {
      await fetch(`${apiBaseUrl}/api/cameras/${camera.id}/ptz?action=${action}`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('PTZ Error:', err);
    }
  };

  const isDown = (isDisconnected || Boolean(errorMsg && !loading) || camera.status === 'OFFLINE') && !hasActiveVideo;

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '14px',
      border: '1px solid #E2E8F0',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      transition: 'all 0.2s ease'
    }}>
      {/* Header */}
      <div style={{
        padding: '11px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#0F172A', fontWeight: 600, fontSize: '14px' }}>
            <HighlightMatch text={camera.name} query={searchQuery} />
          </span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            fontWeight: 500,
            backgroundColor: !isDown ? '#F0FDF4' : '#FEF2F2',
            color: !isDown ? '#166534' : '#991B1B',
            border: `1px solid ${!isDown ? '#BBF7D0' : '#FECACA'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: !isDown ? '#16A34A' : '#DC2626'
            }} />
            {!isDown ? 'ONLINE' : 'MẤT KẾT NỐI'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* NÚT BẬT / TẮT BÁM BIỂN SỐ AI */}
          <button
            onClick={() => setShowAiOverlay(!showAiOverlay)}
            style={{
              background: showAiOverlay ? '#F0F9FF' : '#FFFFFF',
              border: `1px solid ${showAiOverlay ? '#BAE6FD' : '#E2E8F0'}`,
              color: showAiOverlay ? '#0284C7' : '#475569',
              fontSize: '11.5px',
              padding: '4px 9px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
            title={aiConnected ? `AI đang trực tuyến (${aiFps} FPS). Bấm để ẩn/hiện khung bám biển.` : 'Đang chờ Python AI (port 5000)...'}
          >
            <IconTarget size={13} color={showAiOverlay ? '#0284C7' : '#64748B'} />
            <span>Bám biển AI</span>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: showAiOverlay ? (aiConnected ? '#16A34A' : '#0284C7') : '#94A3B8'
            }} />
          </button>

          {/* NÚT CẤU HÌNH KHUNG ẢO VIRTUAL ROI */}
          <button
            onClick={() => setShowRoiModal(true)}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#475569',
              fontSize: '11.5px',
              padding: '4px 9px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
            title="Cấu hình góc và vùng khung ảo nhận diện xe (ROI) cho Camera này hoặc tất cả camera"
          >
            <IconPolygon size={13} color="#64748B" />
            <span>Chỉnh ROI</span>
          </button>

          <span style={{
            color: '#64748B',
            fontSize: '11.5px',
            fontFamily: 'monospace',
            fontWeight: 500,
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            padding: '3px 7px',
            borderRadius: '6px'
          }}>
            <HighlightMatch text={`${camera.ipAddress}:${camera.onvifPort || 80}`} query={searchQuery} />
          </span>
        </div>
      </div>

      {/* Video Viewport */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        backgroundColor: '#05070D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          color: '#38BDF8',
          fontSize: '11px',
          fontFamily: 'monospace',
          padding: '4px 8px',
          borderRadius: '4px',
          zIndex: 2
        }}>
          <HighlightMatch text={camera.streamPath} query={searchQuery} /> | WebRTC (WHEP)
        </div>

        {/* AI RTSP Stream Link Quick Copy */}
        <button
          onClick={() => {
            navigator.clipboard.writeText(camera.rtspRelayUrl || `rtsp://localhost:8554/${camera.streamPath}`);
            alert(`Đã sao chép RTSP Relay cho Module AI:\n${camera.rtspRelayUrl || `rtsp://localhost:8554/${camera.streamPath}`}`);
          }}
          title="Bấm để sao chép link RTSP nội bộ dùng cho AI Python nhận diện"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.5)',
            color: '#34D399',
            fontSize: '11px',
            padding: '4px 9px',
            borderRadius: '6px',
            cursor: 'pointer',
            zIndex: 2,
            backdropFilter: 'blur(4px)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <IconCopy size={12} color="#34D399" />
          <span>Copy RTSP cho AI</span>
        </button>


        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />

        {/* LỚP PHỦ AI BÁM BIỂN SỐ SVG + HTML (DECOUPLED OVERLAY - ZERO LAG) */}
        {showAiOverlay && !isDown && !loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 3,
            overflow: 'hidden'
          }}>
            {/* 1. Vẽ Khung ảo Virtual ROI bằng SVG */}
            {roiNormalized.length >= 3 && (
              <>
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                >
                  <polygon
                    points={roiNormalized.map(([rx, ry]) => `${(rx * 100).toFixed(2)},${(ry * 100).toFixed(2)}`).join(' ')}
                    fill={activeInRoi ? 'rgba(34, 197, 94, 0.08)' : 'rgba(56, 189, 248, 0.05)'}
                    stroke={activeInRoi ? '#22C55E' : '#38BDF8'}
                    strokeWidth="0.6"
                    strokeDasharray="2 1.5"
                  />
                </svg>
                <div style={{
                  position: 'absolute',
                  left: `${roiNormalized[0][0] * 100}%`,
                  top: `${Math.max(2, roiNormalized[0][1] * 100 - 4.5)}%`,
                  background: activeInRoi ? 'rgba(34, 197, 94, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                  border: `1px solid ${activeInRoi ? '#22C55E' : '#38BDF8'}`,
                  borderRadius: '4px',
                  padding: '2px 6px',
                  color: activeInRoi ? '#4ADE80' : '#38BDF8',
                  fontSize: '10.5px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  backdropFilter: 'blur(4px)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.6)'
                }}>
                  {activeInRoi ? '● VÙNG NHẬN DIỆN XE (ROI) - PHÁT HIỆN XE' : '◌ VÙNG NHẬN DIỆN XE (ROI)'}
                </div>
              </>
            )}

            {/* 2. Vẽ từng khung xe / người đang bám chuẩn 1 Xe = 1 Khung Duy Nhất Kèm ID (#ID BIỂN_SỐ / #ID CAR) */}
            {aiTracks
              .filter((trk) => {
                if (roiNormalized && roiNormalized.length >= 3 && trk.inRoi === false) {
                  return false;
                }
                return true;
              })
              .map((trk) => {
                const box = trk.vehicleBbox || trk.bbox;
                if (!box) return null;
                const hasPlate = Boolean(trk.plate && trk.plate.trim());
                const isPerson = trk.vehicleType === 'PERSON' || Boolean(trk.personName);
                const rawType = isPerson
                  ? (trk.personName || 'PERSON')
                  : (trk.vehicleType === 'MOTO' ? 'MOTO' : (trk.vehicleType === 'TRUCK' ? 'TRUCK' : (trk.vehicleType === 'BUS' ? 'BUS' : 'CAR')));
                const boxColor = isPerson ? '#F59E0B' : '#00FF00';
                const badgeText = hasPlate ? `#${trk.trackId} ${trk.plate}` : `#${trk.trackId} ${rawType}`;

                return (
                  <div
                    key={trk.trackId}
                    style={{
                      position: 'absolute',
                      left: `${(box[0] / aiFrameDim.w) * 100}%`,
                      top: `${(box[1] / aiFrameDim.h) * 100}%`,
                      width: `${((box[2] - box[0]) / aiFrameDim.w) * 100}%`,
                      height: `${((box[3] - box[1]) / aiFrameDim.h) * 100}%`,
                      border: `2px solid ${boxColor}`,
                      borderRadius: '2px',
                      backgroundColor: isPerson ? 'rgba(245, 158, 11, 0.03)' : 'rgba(0, 255, 0, 0.02)',
                      boxShadow: hasPlate ? '0 0 8px rgba(0, 255, 0, 0.45)' : 'none',
                      pointerEvents: 'none',
                      willChange: 'left, top, width, height'
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: ((box[1] / aiFrameDim.h) * 100) > 6 ? '-18px' : '2px',
                      left: '-2px',
                      background: 'rgba(0, 0, 0, 0.92)',
                      border: `1px solid ${boxColor}`,
                      padding: '0 5px',
                      borderRadius: '2px',
                      fontSize: '11px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontWeight: 800,
                      lineHeight: '16px',
                      color: boxColor,
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap'
                    }}>
                      {badgeText}
                    </div>
                  </div>
                );
              })}

            {/* HUD AI Mini Status ở góc dưới */}
            {aiConnected && (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '10px',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '10.5px',
                fontFamily: 'monospace',
                color: '#38BDF8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22C55E' }} />
                <span>AI: {aiFps.toFixed(1)} FPS | {aiTracks.length} mục tiêu</span>
              </div>
            )}
          </div>
        )}

        {loading && !isDown && (
          <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: '#94A3B8', fontSize: '13px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              borderTopColor: '#3B82F6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <span>Đang nạp luồng WebRTC...</span>
          </div>
        )}

        {/* NO SIGNAL / MẤT TÍN HIỆU OVERLAY */}
        {isDown && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            textAlign: 'center',
            zIndex: 4
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '10px'
            }}>
              <IconAlertTriangle size={22} color="#F87171" />
            </div>
            <div style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '15px', letterSpacing: '0.2px' }}>
              MẤT TÍN HIỆU CAMERA (NO SIGNAL)
            </div>
            <div style={{ color: '#94A3B8', fontSize: '12.5px', marginTop: '5px', maxWidth: '85%', lineHeight: '1.5', fontWeight: 400 }}>
              {camera.lastError || errorMsg || `Không nhận được luồng hình ảnh từ ${camera.ipAddress}:${camera.rtspPort || 554}`}
            </div>
            {retryCount >= MAX_RETRIES ? (
              <div style={{ color: '#FBBF24', fontSize: '11.5px', marginTop: '8px', background: 'rgba(245, 158, 11, 0.12)', padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 500 }}>
                Đã tạm dừng tự động thử lại sau 5 lần thất bại để bảo vệ tài nguyên mạng.
              </div>
            ) : (
              <div style={{ color: '#64748B', fontSize: '11.5px', marginTop: '5px', fontWeight: 400 }}>
                Vui lòng kiểm tra nguồn điện, jack cắm hoặc cáp mạng LAN.
              </div>
            )}
            <button
              onClick={handleManualRetry}
              style={{
                marginTop: '14px',
                background: '#0284C7',
                color: '#FFF',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                transition: 'all 0.15s ease'
              }}
            >
              <IconRefresh size={13} color="#FFF" />
              <span>{retryCount >= MAX_RETRIES ? 'Thử kết nối lại thủ công' : `Kết nối lại ngay ${retryCountdown > 0 ? `(thử lần ${retryCount + 1}/${MAX_RETRIES} sau ${retryCountdown}s)` : ''}`}</span>
            </button>
          </div>
        )}

        {/* ONVIF PTZ Interactive D-Pad Overlay */}
        {showPtz && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            zIndex: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, marginBottom: '2px' }}>ONVIF PTZ</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 30px)', gridGap: '4px', justifyItems: 'center', alignItems: 'center' }}>
              <div />
              <button
                title="Quay lên"
                onMouseDown={() => sendPtz('UP')}
                onMouseUp={() => sendPtz('STOP')}
                style={{ width: '30px', height: '30px', borderRadius: '6px', background: '#1E293B', border: '1px solid #475569', color: '#FFF', cursor: 'pointer', fontSize: '12px' }}
              >▲</button>
              <div />
              
              <button
                title="Quay trái"
                onMouseDown={() => sendPtz('LEFT')}
                onMouseUp={() => sendPtz('STOP')}
                style={{ width: '30px', height: '30px', borderRadius: '6px', background: '#1E293B', border: '1px solid #475569', color: '#FFF', cursor: 'pointer', fontSize: '12px' }}
              >◀</button>
              <button
                title="Dừng"
                onClick={() => sendPtz('STOP')}
                style={{ width: '30px', height: '30px', borderRadius: '6px', background: '#EF4444', border: 'none', color: '#FFF', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
              >■</button>
              <button
                title="Quay phải"
                onMouseDown={() => sendPtz('RIGHT')}
                onMouseUp={() => sendPtz('STOP')}
                style={{ width: '30px', height: '30px', borderRadius: '6px', background: '#1E293B', border: '1px solid #475569', color: '#FFF', cursor: 'pointer', fontSize: '12px' }}
              >▶</button>
              
              <div />
              <button
                title="Quay xuống"
                onMouseDown={() => sendPtz('DOWN')}
                onMouseUp={() => sendPtz('STOP')}
                style={{ width: '30px', height: '30px', borderRadius: '6px', background: '#1E293B', border: '1px solid #475569', color: '#FFF', cursor: 'pointer', fontSize: '12px' }}
              >▼</button>
              <div />
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button
                title="Thu nhỏ"
                onMouseDown={() => sendPtz('ZOOM_OUT')}
                onMouseUp={() => sendPtz('STOP')}
                style={{ padding: '3px 8px', borderRadius: '4px', background: '#1E293B', border: '1px solid #475569', color: '#38BDF8', cursor: 'pointer', fontSize: '11px' }}
              >Zoom -</button>
              <button
                title="Phóng to"
                onMouseDown={() => sendPtz('ZOOM_IN')}
                onMouseUp={() => sendPtz('STOP')}
                style={{ padding: '3px 8px', borderRadius: '4px', background: '#1E293B', border: '1px solid #475569', color: '#38BDF8', cursor: 'pointer', fontSize: '11px' }}
              >Zoom +</button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        padding: '9px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#FFFFFF',
        borderTop: '1px solid #E2E8F0'
      }}>
        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
          {camera.location ? <HighlightMatch text={camera.location} query={searchQuery} /> : 'Độ trễ: < 0.2s'}
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setShowPtz(!showPtz)}
            style={{
              padding: '5px 10px',
              fontSize: '11.5px',
              background: showPtz ? '#0284C7' : '#FFFFFF',
              border: `1px solid ${showPtz ? '#0284C7' : '#E2E8F0'}`,
              color: showPtz ? '#FFFFFF' : '#475569',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
          >
            PTZ
          </button>
          <button
            onClick={handleSnapshot}
            style={{
              padding: '5px 10px',
              fontSize: '11.5px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#475569',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
          >
            Chụp hình
          </button>
          <button
            onClick={startStream}
            style={{
              padding: '5px 11px',
              fontSize: '11.5px',
              background: '#0284C7',
              border: '1px solid #0284C7',
              color: '#FFF',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
              boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
              transition: 'all 0.15s ease'
            }}
          >
            Kết nối lại
          </button>
          {onEdit && (
            <button
              onClick={() => onEdit(camera)}
              style={{
                padding: '5px 10px',
                fontSize: '11.5px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#475569',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease'
              }}
              title="Sửa thông tin camera"
            >
              Sửa
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(camera.id)}
              style={{
                padding: '5px 10px',
                fontSize: '11.5px',
                background: '#FFFFFF',
                border: '1px solid #FEE2E2',
                color: '#DC2626',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease'
              }}
              title="Xóa camera"
            >
              Xóa
            </button>
          )}
        </div>
      </div>

      {/* Modal Cấu Hình Vùng Khung Ảo ROI */}
      <RoiConfigModal
        isOpen={showRoiModal}
        onClose={() => setShowRoiModal(false)}
        camera={camera}
        initialRoi={roiNormalized}
        onSaveSuccess={(newRoi) => {
          setRoiNormalized(newRoi);
        }}
      />
    </div>
  );
};

export const CameraStreamView: FC<CameraStreamProps> = ({ apiBaseUrl = getBackendBaseUrl() }) => {
  const [cameras, setCameras] = useState<CameraDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoiCamera, setSelectedRoiCamera] = useState<CameraDto | null>(null);

  // Search State Machine
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modal State for Discovery and Adding Camera
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<OnvifDiscoveryDevice[]>([]);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newCam, setNewCam] = useState({
    name: '',
    ipAddress: '',
    onvifPort: 80,
    username: 'admin',
    password: '',
    streamPath: '',
    rtspSourceUrl: '',
    location: ''
  });

  // Edit Camera Modal State
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editCam, setEditCam] = useState<{
    id: number;
    name: string;
    ipAddress: string;
    onvifPort: number;
    rtspPort: number;
    username: string;
    password: string;
    location: string;
    type: string;
    rtspSourceUrl: string;
    streamPath: string;
  } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadCameras = useCallback(async (query: string = '') => {
    try {
      if (!query.trim()) {
        setIsLoading(true);
      } else {
        setIsSearching(true);
      }
      setError(null);

      const endpoint = query.trim()
        ? `${apiBaseUrl}/api/cameras?search=${encodeURIComponent(query.trim())}`
        : `${apiBaseUrl}/api/cameras`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse<CameraDto[]> = await res.json();
      if (json && json.code === 200) {
        setCameras(json.data || []);
      } else {
        throw new Error(json.message || 'Lỗi lấy danh sách camera');
      }
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối Backend');
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCameras(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, loadCameras]);

  const handleDeleteCamera = async (id: number) => {
    if (!window.confirm('Bạn có chắc muốn xóa camera này?')) return;
    try {
      await fetch(`${apiBaseUrl}/api/cameras/${id}`, { method: 'DELETE' });
      loadCameras(searchQuery);
    } catch (err: any) {
      alert('Lỗi xóa camera: ' + err.message);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  // ONVIF Discovery
  const handleDiscover = async () => {
    setIsDiscovering(true);
    setDiscoveredDevices([]);
    try {
      const res = await fetch(`${apiBaseUrl}/api/cameras/discover?timeoutMs=3000`, { method: 'POST' });
      const json = await res.json();
      if (json && json.data && json.data.length > 0) {
        setDiscoveredDevices(json.data);
      } else {
        alert('Không tìm thấy thiết bị ONVIF phát gói tin tự động trong mạng LAN.\n\nNguyên nhân thường gặp:\n1. Camera chưa bật tính năng ONVIF trong trang quản trị camera.\n2. Máy tính có nhiều card mạng ảo (WSL/Hyper-V).\n\nBạn hãy bấm nút "Thêm Camera" và nhập trực tiếp địa chỉ IP của camera (ví dụ 192.168.1.xxx) để kết nối ngay nhé!');
      }
    } catch (e: any) {
      alert('Lỗi quét ONVIF: ' + e.message);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSelectDiscovered = (d: OnvifDiscoveryDevice) => {
    setNewCam({
      ...newCam,
      name: `Camera ${d.ipAddress}`,
      ipAddress: d.ipAddress,
      onvifPort: d.port || 80,
      streamPath: `cam_${d.ipAddress.replaceAll('.', '_')}`,
      rtspSourceUrl: '' // Để trống để hệ thống ONVIF tự động phân giải đúng URL kèm xác thực
    });
    setShowAddModal(true);
  };

  const handleCreateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newCam,
        streamPath: newCam.streamPath.trim() || `cam_${newCam.ipAddress.replaceAll('.', '_')}` || `cam_${Date.now()}`
      };
      const res = await fetch(`${apiBaseUrl}/api/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json && json.code === 200) {
        setShowAddModal(false);
        setNewCam({ name: '', ipAddress: '', onvifPort: 80, username: 'admin', password: '', streamPath: '', rtspSourceUrl: '', location: '' });
        loadCameras(searchQuery);
      } else {
        alert('Lỗi thêm camera: ' + (json.message || 'Thất bại'));
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleOpenEdit = (cam: CameraDto) => {
    setEditCam({
      id: cam.id,
      name: cam.name,
      ipAddress: cam.ipAddress,
      onvifPort: cam.onvifPort || 80,
      rtspPort: cam.rtspPort || 554,
      username: cam.username || 'admin',
      password: '',
      location: cam.location || '',
      type: cam.type || 'IN_GATE',
      rtspSourceUrl: cam.rtspSourceUrl || '',
      streamPath: cam.streamPath
    });
    setShowEditModal(true);
  };

  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const handleUpdateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCam || isUpdating) return;
    setIsUpdating(true);
    try {
      const payload: any = {
        name: editCam.name,
        ipAddress: editCam.ipAddress,
        onvifPort: editCam.onvifPort,
        rtspPort: editCam.rtspPort,
        username: editCam.username,
        location: editCam.location,
        type: editCam.type
      };
      if (editCam.password) {
        payload.password = editCam.password;
      }
      if (editCam.rtspSourceUrl && editCam.rtspSourceUrl.trim()) {
        payload.rtspSourceUrl = editCam.rtspSourceUrl.trim();
      }

      const res = await fetch(`${apiBaseUrl}/api/cameras/${editCam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => null);

      if (res.ok || (json && (json.code === 200 || json.success))) {
        setShowEditModal(false);
        setEditCam(null);
        await loadCameras(searchQuery);
      } else {
        alert('Lỗi cập nhật camera: ' + (json?.message || `HTTP ${res.status}`));
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#F8FAFC', minHeight: '100vh', color: '#0F172A', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1200px) {
          .split-dashboard-container {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0284C7, #06B6D4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)'
          }}>
            <IconCctv size={24} color="#FFF" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.3px', color: '#0F172A' }}>
              Hệ Thống Giám Sát Camera & ONVIF
            </h1>
            <p style={{ color: '#334155', fontSize: '13px', margin: '4px 0 0 0', fontWeight: 600 }}>
              WebRTC Stream (MediaMTX) • Tự động dò tìm ONVIF LAN
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Complete Search Flow */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            minWidth: '270px',
            background: '#FFFFFF',
            border: '1.5px solid #CBD5E1',
            borderRadius: '10px',
            padding: '0 12px'
          }}>
            <span style={{ color: '#475569', display: 'flex', alignItems: 'center', marginRight: '8px' }}>
              {isSearching ? (
                <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '2px solid rgba(2, 132, 199, 0.3)', borderTopColor: '#0284C7', animation: 'spin 0.8s linear infinite' }} />
              ) : (
                <IconSearch size={15} color="#475569" />
              )}
            </span>

            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm camera... (Ctrl+K)"
              style={{
                width: '100%',
                padding: '9px 0',
                background: 'transparent',
                border: 'none',
                color: '#0F172A',
                fontSize: '13px',
                fontWeight: 600,
                outline: 'none'
              }}
            />

            {searchQuery && (
              <button
                onClick={handleClearSearch}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Xóa tìm kiếm"
              >
                <IconClose size={14} color="#475569" />
              </button>
            )}

            {!searchQuery && (
              <kbd style={{
                background: '#F1F5F9',
                color: '#334155',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10.5px',
                fontWeight: 700,
                border: '1px solid #CBD5E1'
              }}>
                Ctrl+K
              </kbd>
            )}
          </div>

          <button
            onClick={handleDiscover}
            disabled={isDiscovering}
            style={{
              padding: '8px 14px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#0284C7',
              borderRadius: '8px',
              cursor: isDiscovering ? 'not-allowed' : 'pointer',
              fontSize: '12.5px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <IconRefresh size={14} color="#0284C7" style={{ animation: isDiscovering ? 'spin 1s linear infinite' : 'none' }} />
            <span>{isDiscovering ? 'Đang quét...' : 'Quét ONVIF LAN'}</span>
          </button>

          {cameras.length > 0 && (
            <button
              onClick={() => setSelectedRoiCamera(cameras[0])}
              style={{
                padding: '8px 14px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#475569',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12.5px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              title="Cấu hình khung ảo nhận diện ROI áp dụng chung hoặc cho từng camera"
            >
              <IconPolygon size={14} color="#64748B" />
              <span>Cấu hình Khung ảo ROI</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '8px 15px',
              backgroundColor: '#0284C7',
              border: '1px solid #0284C7',
              color: '#FFF',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
              transition: 'all 0.15s ease'
            }}
          >
            <IconPlus size={14} color="#FFF" />
            <span>Thêm Camera</span>
          </button>
        </div>
      </div>

      {/* Offline Cameras Alert Banner */}
      {cameras.some(c => c.status === 'OFFLINE') && (
        <div style={{
          backgroundColor: '#FEF2F2',
          border: '1px solid #FEE2E2',
          borderRadius: '10px',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <IconAlertTriangle size={20} color="#DC2626" />
            <div>
              <div style={{ fontWeight: 600, color: '#991B1B', fontSize: '13.5px' }}>
                CẢNH BÁO MẤT TÍN HIỆU CAMERA
              </div>
              <div style={{ color: '#7F1D1D', fontSize: '12.5px', marginTop: '2px', fontWeight: 400 }}>
                Phát hiện {cameras.filter(c => c.status === 'OFFLINE').length} camera mất kết nối hoặc không truyền luồng video: {' '}
                <strong style={{ color: '#991B1B', fontWeight: 600 }}>{cameras.filter(c => c.status === 'OFFLINE').map(c => c.name).join(', ')}</strong>. Vui lòng kiểm tra nguồn điện hoặc cáp mạng LAN.
              </div>
            </div>
          </div>
          <button
            onClick={() => loadCameras(searchQuery)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              backgroundColor: '#FFFFFF',
              color: '#B91C1C',
              border: '1px solid #FECACA',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
          >
            <IconRefresh size={13} color="#B91C1C" />
            <span>Kiểm tra lại ngay</span>
          </button>
        </div>
      )}

      {/* Discovered Cameras Bar */}
      {discoveredDevices.length > 0 && (
        <div style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px'
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '13.5px', color: '#0284C7', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <IconCheck size={16} color="#0284C7" />
            <span>Đã tìm thấy {discoveredDevices.length} thiết bị ONVIF trong mạng LAN:</span>
          </h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {discoveredDevices.map((d, idx) => (
              <div key={idx} style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                padding: '6px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12.5px',
                color: '#334155'
              }}>
                <span><strong>{d.ipAddress}</strong>:{d.port}</span>
                <button
                  onClick={() => handleSelectDiscovered(d)}
                  style={{
                    padding: '3px 8px',
                    backgroundColor: '#0284C7',
                    border: 'none',
                    color: '#FFF',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  Kết nối ngay
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px',
          color: '#F87171',
          marginBottom: '20px',
          fontSize: '13.5px'
        }}>
          Lỗi: {error}
        </div>
      )}

      {/* Split Dashboard: Trái = Camera Stream trực tiếp, Phải = Thống kê & Lịch sử xe vào ra */}
      <div
        className="split-dashboard-container"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(380px, 1fr)',
          gap: '24px',
          alignItems: 'start'
        }}
      >
        {/* CỘT TRÁI: Luồng Camera Trực Tiếp */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconCctv size={16} color="#0284C7" />
              <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#1E293B' }}>
                Luồng Giám Sát Trực Tiếp ({cameras.length})
              </span>
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: '#F0FDF4',
                color: '#166534',
                border: '1px solid #BBF7D0',
                fontWeight: 500
              }}>
                WebRTC Low-Latency
              </span>
            </div>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
              MediaMTX WHEP Engine
            </span>
          </div>

          {isLoading ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
              gap: '20px'
            }}>
              <CameraCardSkeleton />
              <CameraCardSkeleton />
            </div>
          ) : cameras.length === 0 ? (
            <div style={{
              padding: '60px 24px',
              textAlign: 'center',
              backgroundColor: '#FFFFFF',
              border: '1px dashed #CBD5E1',
              borderRadius: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                <IconCctv size={48} color="#94A3B8" />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>
                {searchQuery
                  ? `Không tìm thấy camera nào khớp với "${searchQuery}"`
                  : 'Chưa có camera nào trong hệ thống'}
              </h3>
              <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto 16px auto' }}>
                Bấm "Quét ONVIF LAN" hoặc "Thêm Camera" để nạp camera xem trực tiếp.
              </p>
            </div>
          ) : (

            <div style={{
              display: 'grid',
              gridTemplateColumns: cameras.length > 1 ? 'repeat(auto-fit, minmax(380px, 1fr))' : '1fr',
              gap: '20px'
            }}>
              {cameras.map((camera: CameraDto) => (
                <SingleCameraPlayer
                  key={camera.id}
                  camera={camera}
                  apiBaseUrl={apiBaseUrl}
                  searchQuery={searchQuery}
                  onEdit={handleOpenEdit}
                  onDelete={handleDeleteCamera}
                />
              ))}
            </div>
          )}
        </div>

        {/* CỘT PHẢI: Thống kê & Lịch sử xe vào ra (Sẵn sàng kết nối AI Training) */}
        <div style={{ minWidth: 0, position: 'sticky', top: '24px' }}>
          <VehicleAccessPanel />
        </div>
      </div>

      {/* Add Camera Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#131B2E',
            border: '1px solid #23314E',
            borderRadius: '16px',
            padding: '24px',
            width: '460px',
            maxWidth: '90%'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0' }}>Thêm Camera Mới</h2>
            <form onSubmit={handleCreateCamera}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94A3B8' }}>Tên Camera</label>
                  <input
                    type="text"
                    required
                    value={newCam.name}
                    onChange={e => setNewCam({ ...newCam, name: e.target.value })}
                    placeholder="VD: Cổng vào 1"
                    style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>IP Camera</label>
                    <input
                      type="text"
                      required
                      value={newCam.ipAddress}
                      onChange={e => setNewCam({ ...newCam, ipAddress: e.target.value })}
                      placeholder="192.168.1.xxx"
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                  <div style={{ width: '100px' }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Cổng ONVIF</label>
                    <input
                      type="number"
                      value={newCam.onvifPort}
                      onChange={e => setNewCam({ ...newCam, onvifPort: parseInt(e.target.value) || 80 })}
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Tài khoản ONVIF</label>
                    <input
                      type="text"
                      value={newCam.username}
                      onChange={e => setNewCam({ ...newCam, username: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Mật khẩu</label>
                    <input
                      type="password"
                      value={newCam.password}
                      onChange={e => setNewCam({ ...newCam, password: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94A3B8' }}>Đường dẫn Stream MediaMTX (Tên định danh, tự sinh nếu để trống)</label>
                  <input
                    type="text"
                    value={newCam.streamPath}
                    onChange={e => setNewCam({ ...newCam, streamPath: e.target.value })}
                    placeholder="VD: cong_1 (hoặc để trống tự sinh)"
                    style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94A3B8' }}>RTSP URL nguồn (Tự sinh qua ONVIF nếu để trống)</label>
                  <input
                    type="text"
                    value={newCam.rtspSourceUrl}
                    onChange={e => setNewCam({ ...newCam, rtspSourceUrl: e.target.value })}
                    placeholder="Để trống để ONVIF tự tìm (hoặc gõ rtsp://admin:pass@ip:554/Streaming/Channels/101)"
                    style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #334155', color: '#94A3B8', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', background: '#2563EB', border: 'none', color: '#FFF', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Lưu & Kết nối
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Camera Modal */}
      {showEditModal && editCam && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#131B2E',
            border: '1px solid #0284C7',
            borderRadius: '16px',
            padding: '24px',
            width: '460px',
            maxWidth: '90%',
            boxShadow: '0 8px 32px rgba(2, 132, 199, 0.25)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: '#38BDF8' }}>Chỉnh sửa Camera</h2>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 16px 0' }}>Stream Path: <code style={{ color: '#38BDF8' }}>{editCam.streamPath}</code> (ID: {editCam.id})</p>
            <form onSubmit={handleUpdateCamera}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94A3B8' }}>Tên Camera</label>
                  <input
                    type="text"
                    required
                    value={editCam.name}
                    onChange={e => setEditCam({ ...editCam, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>IP Camera</label>
                    <input
                      type="text"
                      required
                      value={editCam.ipAddress}
                      onChange={e => setEditCam({ ...editCam, ipAddress: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Cổng ONVIF</label>
                    <input
                      type="number"
                      value={editCam.onvifPort}
                      onChange={e => setEditCam({ ...editCam, onvifPort: parseInt(e.target.value) || 80 })}
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Cổng RTSP</label>
                    <input
                      type="number"
                      value={editCam.rtspPort}
                      onChange={e => setEditCam({ ...editCam, rtspPort: parseInt(e.target.value) || 554 })}
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Tài khoản</label>
                    <input
                      type="text"
                      value={editCam.username}
                      onChange={e => setEditCam({ ...editCam, username: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Mật khẩu mới (để trống nếu không đổi)</label>
                    <input
                      type="password"
                      value={editCam.password}
                      onChange={e => setEditCam({ ...editCam, password: e.target.value })}
                      placeholder="••••••••"
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Vị trí</label>
                    <input
                      type="text"
                      value={editCam.location}
                      onChange={e => setEditCam({ ...editCam, location: e.target.value })}
                      placeholder="VD: Cổng chính, Kho A..."
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    />
                  </div>
                  <div style={{ width: '120px' }}>
                    <label style={{ fontSize: '12px', color: '#94A3B8' }}>Loại camera</label>
                    <select
                      value={editCam.type}
                      onChange={e => setEditCam({ ...editCam, type: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                    >
                      <option value="IN_GATE">Cổng vào</option>
                      <option value="OUT_GATE">Cổng ra</option>
                      <option value="SURVEILLANCE">Giám sát</option>
                      <option value="PARKING">Bãi đỗ</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94A3B8' }}>RTSP URL nguồn tuỳ chỉnh (để trống để tự phân giải)</label>
                  <input
                    type="text"
                    value={editCam.rtspSourceUrl}
                    onChange={e => setEditCam({ ...editCam, rtspSourceUrl: e.target.value })}
                    placeholder="VD: rtsp://admin:pass@192.168.1.61:554/Streaming/Channels/101"
                    style={{ width: '100%', padding: '8px 10px', background: '#1E293B', border: '1px solid #334155', borderRadius: '6px', color: '#FFF' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={isUpdating}
                  style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #334155', color: '#94A3B8', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  style={{
                    padding: '8px 16px',
                    background: isUpdating ? '#475569' : '#0284C7',
                    border: 'none',
                    color: '#FFF',
                    borderRadius: '6px',
                    cursor: isUpdating ? 'not-allowed' : 'pointer',
                    fontWeight: 600
                  }}
                >
                  {isUpdating ? 'Đang lưu & kết nối...' : 'Lưu Cập Nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cấu Hình Khung Ảo ROI Toàn Hệ Thống */}
      {selectedRoiCamera && (
        <RoiConfigModal
          isOpen={true}
          onClose={() => setSelectedRoiCamera(null)}
          camera={selectedRoiCamera}
          onSaveSuccess={() => {
            // Cấu hình đã được lưu và áp dụng
          }}
        />
      )}
    </div>
  );
};

export default CameraStreamView;
