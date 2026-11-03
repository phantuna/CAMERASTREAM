import { useState, useEffect, useRef, useMemo, useCallback, type FC, type ChangeEvent } from 'react';
import { formatDetectionTime } from './VehicleAccessPanel';
import RoiConfigModal from './RoiConfigModal';
import CameraAiConfigModal from './CameraAiConfigModal';
import HistoryFilterBar, { type HistoryTimeFilter } from './HistoryFilterBar';
import {
  downloadExcelFromApi,
  exportDataToExcel,
  validateDateRange
} from '../shared/utils/excelExporter';
import { getBackendBaseUrl, getAiServiceBaseUrl } from '../shared/utils/envConfig';
import {
  IconCamera,
  IconCctv,
  IconTarget,
  IconPolygon,
  IconZoomIn,
  IconZoomOut,
  IconReset,
  IconSnapshot,
  IconDownload,
  IconSearch,
  IconClose,
  IconGrid,
  IconTable,
  IconEye,
  IconTrash,
  IconEdit,
  IconPlus,
  IconUpload,
  IconFileSpreadsheet,
  IconRefresh,
  IconMaximize,
  IconChevronLeft,
  IconChevronRight,
  IconCar,
  IconMoto,
  IconTruck,
  IconUser,
  IconArrowUp,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconFilter,
  IconCalendar,
  IconCheck,
  IconMapPin,
  IconFlame,
  IconHardHat,
  IconShield
} from './SurveillanceIcons';
import { resolveImageUrl } from '../shared/utils/imageUrl';
import SnapshotImage from '../shared/components/SnapshotImage';

// AI BÁM BIỂN SỐ REALTIME CHO SPOTLIGHT MAIN STREAM (SSE METADATA TỪ PYTHON)
export interface SpotlightAiTrackItem {
  trackId: number;
  bbox: [number, number, number, number];
  vehicleBbox?: [number, number, number, number] | null;
  plate?: string;
  confidence: number;
  inRoi?: boolean;
  module?: 'ALPR' | 'FACE_ID' | 'SAFETY_PPE' | 'FIRE_DETECT' | string;
  type?: string;
  label?: string;
  personName?: string;
  vehicleType?: 'CAR' | 'MOTO' | 'TRUCK' | 'PERSON' | string;
  color?: string;
  isViolation?: boolean;
}

export interface CameraAiMetadata {
  tracks: SpotlightAiTrackItem[];
  roi?: [number, number][];
  activeInRoi?: boolean;
  fps?: number;
  frameDim?: { w: number; h: number };
}

// ========================================================
// CAMERA DTO FROM SPRING BOOT DATABASE
// ========================================================
export interface CameraDto {
  id: number;
  name: string;
  ipAddress: string;
  onvifPort?: number;
  rtspPort?: number;
  username?: string;
  streamPath: string;
  type: string;
  location: string; // Vị trí / Khu vực lưu trong Database
  status: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';
  lastError?: string;
  rtspSourceUrl?: string;
  rtspSubStreamUrl?: string;
  webrtcUrl: string;
  hlsUrl: string;
  rtspRelayUrl: string;
  snapshotApiUrl: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RealDetectionEvent {
  id: string;
  cameraId?: number;
  cameraName?: string;
  plateNumber?: string;
  vehicleType?: 'CAR' | 'MOTO' | 'TRUCK' | 'BUS';
  confidence?: number;
  snapshotUrl?: string;
  plateCropUrl?: string;
  timestamp?: string;
  location?: string;
  detectedAt?: string;
  gateName?: string;
  gateType?: string;
  status?: string;
  ticketCode?: string;
  note?: string;
}

export interface SurveillanceProps {
  apiBaseUrl?: string;
  activeTabOverride?: 'WALL' | 'DETECTION_LOGS' | 'LOCATION_MANAGER';
  hideHeaderTabs?: boolean;
  moduleMode?: 'VEHICLE' | 'FACE' | 'SAFETY' | 'ALL';
  aiType?: 'VEHICLE_ANPR' | 'FACE_RECOGNITION' | 'ALL' | string;
  aiSseUrl?: string;
  aiApiBaseUrl?: string;
  moduleTitle?: string;
  themeColor?: string;
}

// ========================================================
// SEARCH FLOW HELPER: HIGHLIGHT MATCH TEXT (SKILL SEARCH-FLOW)
// ========================================================
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

// ========================================================
// SKELETON LOADING (SKILL SKELETON-LOADING / UI FIX #03)
// ========================================================
export const VideoWallSkeleton: FC<{ cols: number; rows: number }> = ({ cols, rows }) => {
  const total = cols * rows;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: '10px',
        backgroundColor: '#070B11',
        padding: '10px',
        borderRadius: '8px',
        border: '1px solid #1E293B',
        width: '100%'
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'relative',
            backgroundColor: '#0F172A',
            borderRadius: '6px',
            border: '1px solid #1E293B',
            aspectRatio: '16 / 9',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '10px'
          }}
        >
          {/* Top badges shimmer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <div style={{ width: '55px', height: '16px', borderRadius: '4px', backgroundColor: '#1E293B', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
          </div>

          {/* Center icon placeholder */}
          <div style={{ alignSelf: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#1E293B', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />

          {/* Bottom title shimmer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: '60%', height: '14px', borderRadius: '4px', backgroundColor: '#1E293B', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
            <div style={{ width: '25px', height: '12px', borderRadius: '4px', backgroundColor: '#1E293B', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton: FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div style={{ border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
    <div style={{ backgroundColor: '#0B0F17', padding: '12px', display: 'flex', gap: '10px', borderBottom: '2px solid #334155' }}>
      <div style={{ width: '40px', height: '14px', backgroundColor: '#1E293B', borderRadius: '4px' }} />
      <div style={{ flex: 1, height: '14px', backgroundColor: '#1E293B', borderRadius: '4px' }} />
      <div style={{ flex: 1, height: '14px', backgroundColor: '#1E293B', borderRadius: '4px' }} />
      <div style={{ width: '120px', height: '14px', backgroundColor: '#1E293B', borderRadius: '4px' }} />
      <div style={{ width: '80px', height: '14px', backgroundColor: '#1E293B', borderRadius: '4px' }} />
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} style={{ padding: '12px', display: 'flex', gap: '10px', borderBottom: '1px solid #283242', backgroundColor: '#131A24' }}>
        <div style={{ width: '40px', height: '16px', backgroundColor: '#1E293B', borderRadius: '4px', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
        <div style={{ flex: 1, height: '16px', backgroundColor: '#1E293B', borderRadius: '4px', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
        <div style={{ flex: 1, height: '16px', backgroundColor: '#1E293B', borderRadius: '4px', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
        <div style={{ width: '120px', height: '16px', backgroundColor: '#1E293B', borderRadius: '4px', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
        <div style={{ width: '80px', height: '16px', backgroundColor: '#1E293B', borderRadius: '4px', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
      </div>
    ))}
  </div>
);

// ========================================================
// REAL CAMERA PLAYER CELL (OPTIMIZED FOR MEMORY LEAKS & LCP)
// ========================================================
interface RealCameraGridCellProps {
  camera: CameraDto;
  apiBaseUrl?: string;
  onClick: (cam: CameraDto) => void;
  searchQuery?: string;
  isLcpCandidate?: boolean;
  aiData?: CameraAiMetadata;
  moduleMode?: 'VEHICLE' | 'FACE' | 'SAFETY' | 'ALL';
}

const RealCameraGridCell: FC<RealCameraGridCellProps> = ({
  camera,
  onClick,
  searchQuery = '',
  aiData,
  moduleMode = 'VEHICLE'
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisibleInViewport, setIsVisibleInViewport] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [isWebRtcConnected, setIsWebRtcConnected] = useState(false);
  const [webRtcError, setWebRtcError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);

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
  useEffect(() => {
    if (!isVisibleInViewport || !camera.webrtcUrl) {
      return;
    }

    let pc: RTCPeerConnection | null = null;
    let isCancelled = false;
    let activeStream: MediaStream | null = null;
    setIsConnecting(true);

    const connectWebRtc = async () => {
      try {
        setWebRtcError(null);
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (!isCancelled && event.streams[0]) {
            activeStream = event.streams[0];
            if (videoRef.current) {
              videoRef.current.srcObject = activeStream;
            }
            setIsWebRtcConnected(true);
            setIsConnecting(false);
            setWebRtcError(null);
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

        const res = await fetch(camera.webrtcUrl, {
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
          setWebRtcError(err.message || 'Lỗi kết nối luồng');
          setIsWebRtcConnected(false);
          setIsConnecting(false);
        }
      }
    };

    connectWebRtc();

    return () => {
      isCancelled = true;
      setIsWebRtcConnected(false);
      // DỪNG TẤT CẢ AUDIO/VIDEO TRACKS ĐỂ GIẢI PHÓNG PHẦN CỨNG DECODER KHỎI BỘ NHỚ RAM
      if (activeStream) {
        activeStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {
            // ignore
          }
        });
        activeStream = null;
      }
      if (pc) {
        try {
          pc.getSenders?.().forEach((s) => s.track?.stop());
          pc.getReceivers?.().forEach((r) => r.track?.stop());
          pc.close();
        } catch (e) {
          // ignore
        }
        pcRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isVisibleInViewport, camera.webrtcUrl]);

  // Chỉ coi là Offline khi thực sự không kết nối được WebRTC VÀ camera báo lỗi
  const isActuallyOffline = !isWebRtcConnected && !isConnecting && (camera.status === 'OFFLINE' || Boolean(webRtcError));

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
      {isWebRtcConnected && aiData && (
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 2,
          overflow: 'hidden'
        }}>
          {/* Vẽ Khung ảo Virtual ROI bằng SVG */}
          {aiData.roi && aiData.roi.length >= 3 && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            >
              <polygon
                points={aiData.roi.map(([rx, ry]) => `${(rx * 100).toFixed(2)},${(ry * 100).toFixed(2)}`).join(' ')}
                fill={aiData.activeInRoi ? 'rgba(34, 197, 94, 0.14)' : 'rgba(56, 189, 248, 0.05)'}
                stroke={aiData.activeInRoi ? '#22C55E' : '#38BDF8'}
                strokeWidth="0.8"
                strokeDasharray="2 1.5"
              />
            </svg>
          )}

          {/* Vẽ Bounding Box & Nhãn (Hỗ trợ Đa Phân Hệ: Biển Số Xe, Khuôn Mặt Người, Cảnh Báo An Toàn) */}
          {aiData.tracks && aiData.tracks
            .filter((trk) => {
              const isPerson = Boolean(trk.personName || trk.module === 'FACE_ID' || (trk as any).vehicleType === 'PERSON');
              if (isPerson && moduleMode !== 'FACE') return false;
              // ADR 0003: Chỉ vẽ khung cho xe khi thực sự nằm trong vùng ROI
              if (aiData.roi && aiData.roi.length >= 3 && (trk as any).inRoi === false) {
                return false;
              }
              return true;
            })
            .map((trk) => {
              const dimW = aiData.frameDim?.w || 1920;
              const dimH = aiData.frameDim?.h || 1080;
              const box = trk.vehicleBbox || trk.bbox;
              if (!box) return null;
              const [bx1, by1, bx2, by2] = box;
              const leftPct = (bx1 / dimW) * 100;
              const topPct = (by1 / dimH) * 100;
              const widthPct = ((bx2 - bx1) / dimW) * 100;
              const heightPct = ((by2 - by1) / dimH) * 100;

              const isPerson = Boolean(trk.personName || trk.module === 'FACE_ID' || moduleMode === 'FACE');
              const hasPlate = Boolean(trk.plate && trk.plate.trim());
              const rawType = (trk as any).vehicleType === 'MOTO'
                ? 'MOTO'
                : ((trk as any).vehicleType === 'TRUCK' ? 'TRUCK' : ((trk as any).vehicleType === 'BUS' ? 'BUS' : 'CAR'));

              const isInRoi = (trk as any).inRoi !== false;
              let borderColor = hasPlate ? '#00FF00' : (isInRoi ? '#22C55E' : '#38BDF8');
              let labelText = hasPlate ? `#${trk.trackId} ${trk.plate}` : (isInRoi ? `#${trk.trackId} ${rawType}` : `#${trk.trackId} ${rawType} (TIẾN VÀO)`);
              let labelColor = hasPlate ? '#00FF00' : (isInRoi ? '#22C55E' : '#38BDF8');

              if (isPerson) {
                const isKnown = Boolean(trk.personName || (trk as any).known);
                borderColor = isKnown ? '#10B981' : '#EF4444';
                labelText = `#${trk.trackId} ${trk.personName || (isKnown ? 'Nhân viên' : 'Người lạ')}`;
                labelColor = isKnown ? '#34D399' : '#F87171';
              }

              const shadowGlow = hasPlate ? '0 0 8px rgba(0, 255, 0, 0.55)' : (isInRoi ? 'none' : '0 0 6px rgba(56, 189, 248, 0.45)');

              return (
                <div
                  key={trk.trackId}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: '2px',
                    boxShadow: shadowGlow,
                    willChange: 'left, top, width, height'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 2px)',
                    left: 0,
                    background: 'rgba(0, 0, 0, 0.92)',
                    border: `1px solid ${borderColor}`,
                    padding: '1px 5px',
                    borderRadius: '2px',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '9.5px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
                  }}>
                    <span style={{ color: labelColor, fontWeight: 800 }}>
                      {labelText}
                    </span>
                    <span style={{ color: '#E2E8F0', fontSize: '9px', fontWeight: 600 }}>
                      {Math.round(trk.confidence > 1 ? trk.confidence : trk.confidence * 100)}%
                    </span>
                  </div>
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
            {isActuallyOffline ? <IconCctv size={26} color="#EF4444" /> : <IconCamera size={26} color="#38BDF8" />}
          </span>
          <span style={{ fontSize: '11.5px', fontWeight: 600 }}>
            {isActuallyOffline ? 'Camera Mất Tín Hiệu' : 'Đang kết nối luồng MediaMTX...'}
          </span>
          <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>
            {camera.ipAddress}:{camera.rtspPort || 554}
          </span>
          {isActuallyOffline && webRtcError && (
            <span style={{ fontSize: '9.5px', color: '#F87171', maxWidth: '240px' }}>
              ({webRtcError})
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

// ========================================================
// MAIN SURVEILLANCE COMPONENT (LẤY 100% DATA TỪ DATABASE)
// ========================================================
export const SurveillanceSystem: FC<SurveillanceProps> = ({
  apiBaseUrl = getBackendBaseUrl(),
  activeTabOverride,
  hideHeaderTabs: _hideHeaderTabs = false,
  moduleMode = 'VEHICLE',
  aiType,
  aiSseUrl,
  aiApiBaseUrl,
  moduleTitle: _moduleTitle,
  themeColor: _themeColor = '#0284C7'
}) => {
  const effectiveAiApiBaseUrl = aiApiBaseUrl || (moduleMode === 'FACE' ? 'http://localhost:5001' : getAiServiceBaseUrl());
  const effectiveSseUrl = aiSseUrl || `${effectiveAiApiBaseUrl}/tracking-events`;
  const effectiveAiType = aiType || (moduleMode === 'FACE' ? 'FACE_RECOGNITION' : (moduleMode === 'SAFETY' ? 'SAFETY_PPE' : 'VEHICLE_ANPR'));

  // Navigation tabs
  const [internalActiveTab] = useState<'WALL' | 'DETECTION_LOGS' | 'LOCATION_MANAGER'>('WALL');
  const activeTab = activeTabOverride || internalActiveTab;
  const showTools = true;

  // REAL DATA FROM DATABASE
  const [cameras, setCameras] = useState<CameraDto[]>([]);
  const [cameraAiModulesMap, setCameraAiModulesMap] = useState<Record<number, string[]>>({});
  const [aiFilter, setAiFilter] = useState<string>(effectiveAiType === 'ALL' ? 'ALL' : effectiveAiType);
  const [isLoadingCameras, setIsLoadingCameras] = useState<boolean>(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // REAL DETECTIONS FROM AI SERVICE
  const [realDetections, setRealDetections] = useState<RealDetectionEvent[]>([]);

  // Filter states
  const [selectedArea, setSelectedArea] = useState<string>('ALL');

  // COMPLETE SEARCH FLOW (IDLE -> TYPING -> LOADING -> RESULTS)
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K để focus tìm kiếm
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

  // Debounce 300ms theo chuẩn Search Flow
  useEffect(() => {
    if (!searchInput.trim()) {
      setDebouncedSearch('');
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Grid config
  const [gridCols, setGridCols] = useState<number>(3);
  const [gridRows, setGridRows] = useState<number>(3);
  const [tempCols, setTempCols] = useState<number>(3);
  const [tempRows, setTempRows] = useState<number>(3);

  // Spotlight Main Stream
  const [spotlightCamera, setSpotlightCamera] = useState<CameraDto | null>(null);
  const spotlightVideoRef = useRef<HTMLVideoElement>(null);
  const spotlightPcRef = useRef<RTCPeerConnection | null>(null);
  const [spotlightLoading, setSpotlightLoading] = useState<boolean>(false);
  const [spotlightError, setSpotlightError] = useState<string | null>(null);
  const [ptzZoom, setPtzZoom] = useState<number>(1);

  // Hệ thống AI Tracking & Virtual ROI tập trung (áp dụng cho cả Luồng Phụ & Luồng Chính)
  const [aiByCamera, setAiByCamera] = useState<Record<number, CameraAiMetadata>>({});
  const [aiConnected, setAiConnected] = useState<boolean>(false);
  const [showSpotlightAi, setShowSpotlightAi] = useState<boolean>(true);
  const [showSpotlightRoiModal, setShowSpotlightRoiModal] = useState<boolean>(false);

  // Dữ liệu AI thời gian thực của Camera đang mở Spotlight
  const currentSpotlightAi = spotlightCamera ? aiByCamera[spotlightCamera.id] : undefined;
  const spotlightTracks = currentSpotlightAi?.tracks || [];
  const spotlightRoi = currentSpotlightAi?.roi || [
    [0.15, 0.48], [0.85, 0.48], [0.92, 0.95], [0.08, 0.95]
  ];
  const spotlightActiveInRoi = Boolean(currentSpotlightAi?.activeInRoi);
  const spotlightAiFps = currentSpotlightAi?.fps || 0;
  const spotlightFrameDim = currentSpotlightAi?.frameDim || { w: 1920, h: 1080 };
  const spotlightAiConnected = aiConnected;

  // Danh sách sự kiện chụp thực tế của Camera đang mở Spotlight (V2.0 Standard)
  const cameraSpotlightDetections = useMemo(() => {
    if (!spotlightCamera) return [];
    return realDetections.filter((det) => {
      if (det.cameraId && det.cameraId === spotlightCamera.id) return true;
      if (det.cameraName && spotlightCamera.name && det.cameraName.toLowerCase().includes(spotlightCamera.name.toLowerCase())) return true;
      if (spotlightCamera.id === 39) return true;
      return false;
    });
  }, [realDetections, spotlightCamera]);

  // Bộ lọc phân loại nhanh cho Spotlight Sidebar: Tất cả | Ô tô | Xe máy | Người | An Toàn
  const [spotlightFilter, setSpotlightFilter] = useState<'ALL' | 'CAR' | 'MOTO' | 'PERSON' | 'SAFETY'>('ALL');

  const filteredSpotlightDetections = useMemo(() => {
    if (spotlightFilter === 'ALL') return cameraSpotlightDetections;
    if (spotlightFilter === 'CAR') return cameraSpotlightDetections.filter((d) => !d.note?.includes('Person') && !d.note?.includes('Vi phạm') && (d.vehicleType === 'CAR' || !d.vehicleType || d.vehicleType === 'TRUCK'));
    if (spotlightFilter === 'MOTO') return cameraSpotlightDetections.filter((d) => d.vehicleType === 'MOTO');
    if (spotlightFilter === 'PERSON') return cameraSpotlightDetections.filter((d) => (d as any).personName || d.note?.includes('Person') || d.gateName?.includes('Đi bộ'));
    if (spotlightFilter === 'SAFETY') return cameraSpotlightDetections.filter((d) => (d as any).isViolation || d.note?.includes('Vi phạm') || d.note?.includes('bảo hộ') || (d as any).module === 'SAFETY_PPE' || (d as any).module === 'FIRE_DETECT');
    return cameraSpotlightDetections;
  }, [cameraSpotlightDetections, spotlightFilter]);

  // Modals state
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showAddEditModal, setShowAddEditModal] = useState<boolean>(false);
  const [editingCamera, setEditingCamera] = useState<Partial<CameraDto> | null>(null);
  const [aiConfigCamera, setAiConfigCamera] = useState<CameraDto | null>(null);
  const [isSavingDb, setIsSavingDb] = useState<boolean>(false);

  // Excel / CSV Import State
  const [importMode, setImportMode] = useState<'FILE' | 'PASTE'>('FILE');
  const [pastedText, setPastedText] = useState<string>('');
  const [importPreviewList, setImportPreviewList] = useState<any[]>([]);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Quản lý hình ảnh và bản ghi nhận diện xe (Tab 3: ALPR Detection Logs - Bộ lọc Ngày Giờ HistoryFilterBar)
  const [detectionTimeFilter, setDetectionTimeFilter] = useState<HistoryTimeFilter>({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    startTime: '00:00',
    endTime: '23:59',
    searchQuery: '',
    categoryFilter: 'ALL'
  });
  const [detectionPage, setDetectionPage] = useState<number>(1);
  const [detectionPageSize, setDetectionPageSize] = useState<number>(12);
  const [detectionViewMode, setDetectionViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const [selectedDetection, setSelectedDetection] = useState<RealDetectionEvent | null>(null);

  // Tổng hợp số liệu thống kê thời gian thực: Ô tô, Xe máy, Kiểm soát Người
  const kpiStats = useMemo(() => {
    let cars = 0;
    let motos = 0;
    let persons = 0;
    let totalConf = 0;

    realDetections.forEach((d) => {
      const vType = (d.vehicleType || '').toUpperCase();
      const isPerson = Boolean((d as any).personName || d.note?.includes('Person') || vType === 'PERSON' || (d as any).module === 'FACE_ID' || (d as any).eventType === 'FACE_RECOGNITION');
      if (isPerson) {
        persons++;
      } else if (vType === 'MOTO' || vType === 'MOTORCYCLE' || vType === 'BIKE') {
        motos++;
      } else {
        cars++;
      }
      totalConf += (d.confidence || 92);
    });

    const avgConf = realDetections.length > 0 ? (totalConf / realDetections.length).toFixed(1) : '98.5';
    return {
      total: realDetections.length,
      cars,
      motos,
      persons,
      avgConf
    };
  }, [realDetections]);

  // Lọc danh sách sự kiện theo Ngày, Tháng, Năm, Giờ, Phút, Biển số và Loại phương tiện
  const filteredDetections = useMemo(() => {
    return realDetections.filter((det) => {
      // 1. Lọc theo mốc thời gian Ngày - Giờ
      if (detectionTimeFilter) {
        const rawTime = det.detectedAt || det.timestamp;
        if (rawTime) {
          const dObj = new Date(rawTime);
          if (!isNaN(dObj.getTime())) {
            const y = dObj.getFullYear();
            const m = String(dObj.getMonth() + 1).padStart(2, '0');
            const d = String(dObj.getDate()).padStart(2, '0');
            const detDate = `${y}-${m}-${d}`;
            const h = String(dObj.getHours()).padStart(2, '0');
            const min = String(dObj.getMinutes()).padStart(2, '0');
            const detTime = `${h}:${min}`;

            if (detectionTimeFilter.startDate && detDate < detectionTimeFilter.startDate) return false;
            if (detectionTimeFilter.endDate && detDate > detectionTimeFilter.endDate) return false;
            if (detectionTimeFilter.startTime && detTime < detectionTimeFilter.startTime) return false;
            if (detectionTimeFilter.endTime && detTime > detectionTimeFilter.endTime) return false;
          }
        }
      }

      // 2. Lọc theo từ khóa tìm kiếm (biển số, tên người, camera, cổng)
      const query = (detectionTimeFilter.searchQuery || '').toLowerCase();
      const matchSearch = !query ||
        (det.plateNumber && det.plateNumber.toLowerCase().includes(query)) ||
        (Boolean((det as any).personName && (det as any).personName.toLowerCase().includes(query))) ||
        (det.gateName && det.gateName.toLowerCase().includes(query)) ||
        (det.cameraName && det.cameraName.toLowerCase().includes(query));

      if (!matchSearch) return false;

      // 3. Lọc theo danh mục đối tượng: Tất cả | Ô tô | Xe máy | Xe tải | Người
      const isPerson = Boolean((det as any).personName || det.note?.includes('Person') || (det.vehicleType || '').toUpperCase() === 'PERSON' || (det as any).module === 'FACE_ID' || (det as any).eventType === 'FACE_RECOGNITION');
      const cat = detectionTimeFilter.categoryFilter;

      if (cat === 'CAR') return !isPerson && (det.vehicleType === 'CAR' || !det.vehicleType);
      if (cat === 'MOTO') return !isPerson && det.vehicleType === 'MOTO';
      if (cat === 'TRUCK') return !isPerson && det.vehicleType === 'TRUCK';
      if (cat === 'PERSON') return isPerson;

      return true;
    });
  }, [realDetections, detectionTimeFilter]);

  // Phân trang sự kiện
  const totalDetectionPages = Math.max(1, Math.ceil(filteredDetections.length / detectionPageSize));
  const paginatedDetections = useMemo(() => {
    const start = (detectionPage - 1) * detectionPageSize;
    return filteredDetections.slice(start, start + detectionPageSize);
  }, [filteredDetections, detectionPage, detectionPageSize]);

  useEffect(() => {
    setDetectionPage(1);
  }, [detectionTimeFilter, detectionPageSize]);

  // Tải ảnh xuống máy
  const handleDownloadImage = async (dataUrl: string, filename: string) => {
    try {
      // Ảnh giờ là URL http (đã lưu ra file), không phải data URL.
      // Với URL cross-origin, thuộc tính `download` bị browser bỏ qua -> phải
      // tải về dạng blob rồi mới tạo object URL để ép tải xuống.
      if (!dataUrl.startsWith('data:')) {
        const res = await fetch(dataUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        try {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } finally {
          // Thu hồi sau khi trình duyệt bắt đầu tải
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        }
        return;
      }

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Lỗi khi tải ảnh:', e);
    }
  };

  // ========================================================
  // 1. TẢI DỮ LIỆU CAMERA THẬT TỪ DATABASE SPRING BOOT (GET /api/cameras)
  // ========================================================
  const loadCamerasFromDb = useCallback(async () => {
    try {
      setIsLoadingCameras(true);
      setDbError(null);

      const res = await fetch(`${apiBaseUrl}/api/cameras`);
      if (!res.ok) {
        throw new Error(`Mã lỗi HTTP ${res.status}: Không thể kết nối Backend Server ${apiBaseUrl}`);
      }

      const json = await res.json();
      if (json && json.data && Array.isArray(json.data)) {
        const cams: CameraDto[] = json.data;
        setCameras(cams);

        // Nạp song song cấu hình Module AI (ANPR, FaceID, Hàng rào) cho từng camera
        Promise.all(
          cams.map((c: any) =>
            fetch(`${apiBaseUrl}/api/cameras/${c.id}/ai-config`)
              .then((r) => r.json())
              .then((resAi) => {
                const activeMods = resAi?.data
                  ? resAi.data.filter((item: any) => item.enabled).map((item: any) => item.aiType)
                  : (c.activeAiModules || []);
                return {
                  cameraId: c.id,
                  activeModules: activeMods
                };
              })
              .catch(() => ({
                cameraId: c.id,
                activeModules: c.activeAiModules || []
              }))
          )
        ).then((results) => {
          const map: Record<number, string[]> = {};
          results.forEach((r) => {
            map[r.cameraId] = r.activeModules;
          });
          setCameraAiModulesMap(map);
        });
      } else {
        setCameras([]);
      }
    } catch (err: any) {
      setDbError(err.message || 'Lỗi kết nối cơ sở dữ liệu');
      setCameras([]);
    } finally {
      setIsLoadingCameras(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    loadCamerasFromDb();
  }, [loadCamerasFromDb]);

  // ========================================================
  // 2. TẢI LƯỢT XE NHẬN DIỆN THỰC TẾ TỪ SPRING BOOT EVENT HUB
  // ========================================================
  const fetchDetections = useCallback(async () => {
    try {
      const eventType = moduleMode === 'FACE' ? 'FACE_RECOGNITION' : 'VEHICLE_ANPR';
      // Nguồn chính: Spring Boot Event Hub — ảnh đã lưu ra file, trả URL tuyệt đối.
      const res = await fetch(`${apiBaseUrl}/api/v1/events?eventType=${eventType}&size=100`);
      if (res.ok) {
        const json = await res.json();
        const items = json?.data?.content || [];
        const mapped: RealDetectionEvent[] = items.map((ev: any) => ({
          id: ev.id,
          plateNumber: ev.payload?.personName || ev.payload?.plateNumber || 'Người lạ',
          vehicleType: ev.payload?.employeeId
            ? `NV: ${ev.payload.employeeId}`
            : (moduleMode === 'FACE'
              ? (ev.severity === 'WARNING' ? 'NGƯỜI LẠ' : 'KHÁCH')
              : (ev.payload?.vehicleType || 'CAR')),
          confidence: ev.confidence ? Math.round(ev.confidence * 100) : 95,
          snapshotUrl: resolveImageUrl(ev.snapshotUrl, apiBaseUrl),
          plateCropUrl: resolveImageUrl(ev.payload?.plateCropUrl || ev.snapshotUrl, apiBaseUrl),
          detectedAt: ev.createdAt || ev.detectedAt,
          gateName: ev.cameraName || `Camera #${ev.cameraId}`,
          status: ev.severity === 'WARNING' ? 'CẢNH BÁO' : 'HỢP LỆ'
        }));
        setRealDetections(mapped);
        return;
      }
    } catch {
      // Backend chưa sẵn sàng — thử AI service
    }

    // Fallback: AI service Python
    try {
      const res = await fetch(`${effectiveAiApiBaseUrl}/api/detections`);
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.data)) {
          setRealDetections(
            json.data.slice(0, 100).map((item: any) => ({
              ...item,
              snapshotUrl: resolveImageUrl(item.snapshotUrl),
              plateCropUrl: resolveImageUrl(item.plateCropUrl)
            }))
          );
        }
      }
    } catch {
      // AI service chưa bật hoặc chưa có dữ liệu
    }
  }, [apiBaseUrl, effectiveAiApiBaseUrl, moduleMode]);

  useEffect(() => {
    fetchDetections();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchDetections();
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchDetections]);

  // Xuất Excel danh sách nhận diện phương tiện & người chuẩn hóa (kế thừa pattern HPticket)
  const handleExportAlprExcel = async () => {
    // 1. Kiểm tra validation ngày tháng
    const dateErr = validateDateRange(detectionTimeFilter.startDate, detectionTimeFilter.endDate);
    if (dateErr) {
      throw new Error(dateErr);
    }

    // 2. Thử gọi API Backend nếu có endpoint xuất
    try {
      await downloadExcelFromApi(
        apiBaseUrl,
        '/api/v1/alpr/logs/export',
        {
          fromDate: detectionTimeFilter.startDate,
          toDate: detectionTimeFilter.endDate,
          category: detectionTimeFilter.categoryFilter !== 'ALL' ? detectionTimeFilter.categoryFilter : undefined,
          search: detectionTimeFilter.searchQuery || undefined
        },
        `Bao_Cao_Nhan_Dien_Phuong_Tien_${detectionTimeFilter.startDate}_${detectionTimeFilter.endDate}.xlsx`
      );
    } catch (apiErr: any) {
      // 3. Fallback: Nếu backend chưa có endpoint /export, xuất client-side từ dữ liệu filteredDetections
      console.warn('Backend chưa có /api/v1/alpr/logs/export, fallback xuất client-side:', apiErr?.message);

      if (filteredDetections.length === 0) {
        throw new Error('Không có bản ghi nào phù hợp với bộ lọc để xuất.');
      }

      exportDataToExcel({
        fileName: `Bao_Cao_Nhan_Dien_Xe_${detectionTimeFilter.startDate}_${detectionTimeFilter.endDate}.xls`,
        reportTitle: 'BÁO CÁO LỊCH SỬ NHẬN DIỆN PHƯƠNG TIỆN (ALPR)',
        subtitle: `Thời gian: ${detectionTimeFilter.startDate} đến ${detectionTimeFilter.endDate} | Phân loại: ${detectionTimeFilter.categoryFilter} | Tổng: ${filteredDetections.length} lượt`,
        columns: [
          { header: 'STT', width: 45, render: (_, i) => i + 1 },
          { header: 'Mã sự kiện', key: 'id', width: 90 },
          {
            header: 'Biển số / Định danh',
            width: 140,
            render: (d) => d.plateNumber || (d as any).personName || 'Không xác định'
          },
          {
            header: 'Loại phương tiện / Đối tượng',
            width: 130,
            render: (d) => {
              const vType = (d.vehicleType || '').toUpperCase();
              if ((d as any).personName || d.note?.includes('Person') || vType === 'PERSON') return 'Người (FaceID)';
              if (vType === 'CAR') return 'Ô tô';
              if (vType === 'MOTO' || vType === 'MOTORCYCLE' || vType === 'BIKE') return 'Xe máy';
              if (vType === 'TRUCK') return 'Xe tải';
              return 'Khác';
            }
          },
          {
            header: 'Độ tin cậy AI',
            width: 95,
            render: (d) => `${d.confidence ? Math.round(d.confidence) : 95}%`
          },
          {
            header: 'Thời gian nhận diện',
            width: 150,
            render: (d) => {
              const t = d.detectedAt || d.timestamp;
              return t ? new Date(t).toLocaleString('vi-VN') : '';
            }
          },
          {
            header: 'Cổng / Camera giám sát',
            width: 160,
            render: (d) => d.cameraName || d.gateName || 'Camera Cổng'
          },
          {
            header: 'Trạng thái',
            width: 100,
            render: (d) => ((d as any).isViolation ? 'Cảnh báo vi phạm' : 'Hợp lệ')
          }
        ],
        data: filteredDetections
      });
    }
  };

  // Danh sách các Địa điểm / Khu vực rút trích động từ Database
  const distinctAreas = useMemo(() => {
    const set = new Set<string>();
    cameras.forEach((c) => {
      if (c.location && c.location.trim()) {
        set.add(c.location.trim());
      }
    });
    return Array.from(set);
  }, [cameras]);

  // Lọc camera theo Địa điểm đã chọn, Từ khóa tìm kiếm debounced và Phân hệ AI
  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      const matchArea = selectedArea === 'ALL' || cam.location === selectedArea;
      const matchSearch =
        !debouncedSearch ||
        cam.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        cam.ipAddress.includes(debouncedSearch) ||
        (cam.location && cam.location.toLowerCase().includes(debouncedSearch.toLowerCase()));

      const mods = cameraAiModulesMap[cam.id] || [];
      const matchAi = moduleMode === 'ALL' || aiFilter !== 'ALL'
        ? (aiFilter === 'ALL' ? true : (aiFilter === 'NONE' ? mods.length === 0 : mods.includes(aiFilter)))
        : (moduleMode === 'FACE' ? (mods.includes('FACE_RECOGNITION') || cameras.length <= 4) : true);

      return matchArea && matchSearch && matchAi;
    });
  }, [cameras, selectedArea, debouncedSearch, moduleMode, aiFilter, cameraAiModulesMap]);

  // Tính số ô ma trận hiển thị
  const gridSlots = useMemo(() => {
    const total = gridCols * gridRows;
    return filteredCameras.slice(0, total);
  }, [filteredCameras, gridCols, gridRows]);

  // Thống kê phân loại số lượng camera theo từng Module AI
  const aiStats = useMemo(() => {
    let anprCount = 0;
    let faceCount = 0;
    let roiCount = 0;
    let noneCount = 0;
    cameras.forEach((c) => {
      const mods = cameraAiModulesMap[c.id] || [];
      if (mods.length === 0) noneCount++;
      if (mods.includes('VEHICLE_ANPR')) anprCount++;
      if (mods.includes('FACE_RECOGNITION')) faceCount++;
      if (mods.includes('INTRUSION_ROI')) roiCount++;
    });
    return { anprCount, faceCount, roiCount, noneCount };
  }, [cameras, cameraAiModulesMap]);

  // Lọc danh sách Camera trong tab Quản Lý Thiết Bị theo Module AI đã chọn
  const filteredManageCameras = useMemo(() => {
    return cameras.filter((c) => {
      const mods = cameraAiModulesMap[c.id] || [];
      if (aiFilter === 'ALL') return true;
      if (aiFilter === 'NONE') return mods.length === 0;
      return mods.includes(aiFilter);
    });
  }, [cameras, cameraAiModulesMap, aiFilter]);

  // ========================================================
  // 3. WEBRTC CHO SPOTLIGHT MAIN STREAM (LUỒNG CHÍNH FULL HD)
  // GIẢI PHÓNG TOÀN BỘ TRACKS ĐỂ TRÁNH RÒ RỈ BỘ NHỚ
  // ========================================================
  useEffect(() => {
    if (!spotlightCamera || !spotlightCamera.webrtcUrl) return;

    setSpotlightLoading(true);
    setSpotlightError(null);
    let pc: RTCPeerConnection | null = null;
    let isCancelled = false;
    let activeStream: MediaStream | null = null;

    const connectMainStream = async () => {
      try {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        spotlightPcRef.current = pc;

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (!isCancelled && spotlightVideoRef.current && event.streams[0]) {
            activeStream = event.streams[0];
            spotlightVideoRef.current.srcObject = activeStream;
            setSpotlightLoading(false);
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
          }, 1500);
          const checkState = () => {
            if (pc?.iceGatheringState === 'complete') {
              clearTimeout(t);
              pc?.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc?.addEventListener('icegatheringstatechange', checkState);
        });

        const res = await fetch(spotlightCamera.webrtcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp || offer.sdp
        });

        if (!res.ok) {
          throw new Error(`MediaMTX WHEP trả về mã ${res.status}`);
        }

        const answerSdp = await res.text();
        if (!isCancelled && pc) {
          await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
          setSpotlightLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setSpotlightError(err.message || 'Lỗi kết nối WebRTC luồng chính');
          setSpotlightLoading(false);
        }
      }
    };

    connectMainStream();

    return () => {
      isCancelled = true;
      // Dừng media tracks để giải phóng RAM
      if (activeStream) {
        activeStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {
            // ignore
          }
        });
        activeStream = null;
      }
      if (pc) {
        try {
          pc.getSenders?.().forEach((s) => s.track?.stop());
          pc.getReceivers?.().forEach((r) => r.track?.stop());
          pc.close();
        } catch (e) {
          // ignore
        }
        spotlightPcRef.current = null;
      }
      if (spotlightVideoRef.current) {
        spotlightVideoRef.current.srcObject = null;
      }
    };
  }, [spotlightCamera]);

  // ========================================================
  // 3.1. KẾT NỐI WEBSOCKET / SSE TOÀN HỆ THỐNG ĐỂ LẤY TOẠ ĐỘ AI TRACKS & ROI
  // ========================================================
  useEffect(() => {
    let ws: WebSocket | null = null;
    let es: EventSource | null = null;
    let retryTimer: any = null;
    let isCancelled = false;

    // Tải cấu hình ROI ban đầu từ AI Service cho toàn bộ camera
    const fetchRoiConfig = async () => {
      try {
        const res = await fetch(`${effectiveAiApiBaseUrl}/api/roi-config`);
        if (res.ok) {
          const json = await res.json();
          if (!isCancelled && json && json.data) {
            const camerasRoi = json.data.cameras || {};
            setAiByCamera((prev) => {
              const updated = { ...prev };
              Object.keys(camerasRoi).forEach((cidStr) => {
                const cid = Number(cidStr);
                if (Array.isArray(camerasRoi[cidStr])) {
                  updated[cid] = {
                    ...(updated[cid] || { tracks: [] }),
                    roi: camerasRoi[cidStr]
                  };
                }
              });
              return updated;
            });
          }
        }
      } catch (e) {
        // ignore
      }
    };

    fetchRoiConfig();

    let pendingTrackingBatch: any = null;
    let rafTrackingId: number | null = null;

    const flushTrackingUpdate = () => {
      rafTrackingId = null;
      if (isCancelled || !pendingTrackingBatch) return;
      const data = pendingTrackingBatch;
      pendingTrackingBatch = null;

      setAiByCamera((prev) => {
        const updated = { ...prev };
        if (data.cameras && typeof data.cameras === 'object') {
          Object.entries(data.cameras).forEach(([cidStr, camData]: [string, any]) => {
            const cid = Number(cidStr);
            const camObj = camData || {};
            updated[cid] = {
              tracks: Array.isArray(camObj.tracks) ? camObj.tracks : (prev[cid]?.tracks || []),
              roi: Array.isArray(camObj.roi) ? camObj.roi : (prev[cid]?.roi || [[0.15, 0.48], [0.85, 0.48], [0.92, 0.95], [0.08, 0.95]]),
              activeInRoi: Boolean(camObj.activeInRoi),
              fps: camObj.fps || 0,
              frameDim: camObj.frameWidth && camObj.frameHeight ? { w: camObj.frameWidth, h: camObj.frameHeight } : (prev[cid]?.frameDim || { w: 1920, h: 1080 })
            };
          });
        } else if (data.cameraId !== undefined) {
          const cid = Number(data.cameraId);
          updated[cid] = {
            tracks: Array.isArray(data.tracks) ? data.tracks : (prev[cid]?.tracks || []),
            roi: Array.isArray(data.roi) ? data.roi : prev[cid]?.roi || [[0.15, 0.48], [0.85, 0.48], [0.92, 0.95], [0.08, 0.95]],
            activeInRoi: Boolean(data.activeInRoi),
            fps: data.fps || 0,
            frameDim: data.frameWidth && data.frameHeight ? { w: data.frameWidth, h: data.frameHeight } : (prev[cid]?.frameDim || { w: 1920, h: 1080 })
          };
        }
        return updated;
      });
    };

    const handleTrackingPayload = (data: any) => {
      if (!data || typeof data !== 'object') return;
      if (!isCancelled) setAiConnected(true);
      pendingTrackingBatch = data;
      if (rafTrackingId === null) {
        rafTrackingId = requestAnimationFrame(flushTrackingUpdate);
      }
    };

    const connectTracking = () => {
      if (isCancelled) return;
      try {
        // Ưu tiên 1: Kết nối WebSocket Hub /ws/tracking (chuẩn 50 camera)
        const wsProto = effectiveAiApiBaseUrl.startsWith('https') ? 'wss:' : 'ws:';
        const cleanHost = effectiveAiApiBaseUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProto}//${cleanHost}/ws/tracking`;

        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          if (!isCancelled) {
            setAiConnected(true);
            const activeCams = (cameras || []).map((c) => c.id).filter(Boolean);
            if (activeCams.length > 0) {
              try {
                ws?.send(JSON.stringify({ action: 'subscribe', camera_ids: activeCams }));
              } catch (_) {}
            }
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleTrackingPayload(data);
          } catch (_) {}
        };

        ws.onerror = () => {
          // Fallback sang SSE nếu WebSocket gặp lỗi
          if (!es && !isCancelled) {
            try {
              es = new EventSource(effectiveSseUrl);
              es.onopen = () => { if (!isCancelled) setAiConnected(true); };
              es.onmessage = (e) => {
                try {
                  const data = JSON.parse(e.data);
                  handleTrackingPayload(data);
                } catch (_) {}
              };
              es.onerror = () => {
                if (!isCancelled) {
                  setAiConnected(false);
                  es?.close();
                  es = null;
                  retryTimer = setTimeout(connectTracking, 3000);
                }
              };
            } catch (_) {}
          }
        };

        ws.onclose = () => {
          if (!isCancelled) {
            setAiConnected(false);
            ws = null;
            if (!retryTimer && !es) {
              retryTimer = setTimeout(connectTracking, 3000);
            }
          }
        };
      } catch (_) {
        if (!isCancelled) retryTimer = setTimeout(connectTracking, 4000);
      }
    };

    connectTracking();

    return () => {
      isCancelled = true;
      if (ws) {
        try { ws.close(); } catch (_) {}
        ws = null;
      }
      if (es) {
        try { es.close(); } catch (_) {}
        es = null;
      }
      if (retryTimer) clearTimeout(retryTimer);
      if (rafTrackingId !== null) cancelAnimationFrame(rafTrackingId);
    };
  }, [effectiveAiApiBaseUrl, effectiveSseUrl, cameras]);

  // Điều khiển PTZ gọi trực tiếp Backend Spring Boot
  const handlePtz = async (action: string) => {
    if (!spotlightCamera) return;
    try {
      await fetch(`${apiBaseUrl}/api/cameras/${spotlightCamera.id}/ptz?action=${action}`, {
        method: 'POST'
      });
    } catch (e) {
      console.error(e);
    }
  };

  // ========================================================
  // 4. THAO TÁC CƠ SỞ DỮ LIỆU: CẬP NHẬT ĐỊA ĐIỂM (PUT /api/cameras/{id})
  // ========================================================
  const handleUpdateCameraToDb = async (camId: number, updatedFields: Partial<CameraDto>) => {
    const existing = cameras.find((c) => c.id === camId);
    if (!existing) return;

    try {
      const payload = {
        name: updatedFields.name !== undefined ? updatedFields.name : existing.name,
        ipAddress: updatedFields.ipAddress !== undefined ? updatedFields.ipAddress : existing.ipAddress,
        location: updatedFields.location !== undefined ? updatedFields.location : existing.location,
        onvifPort: updatedFields.onvifPort !== undefined ? updatedFields.onvifPort : (existing.onvifPort || 80),
        rtspPort: updatedFields.rtspPort !== undefined ? updatedFields.rtspPort : (existing.rtspPort || 554),
        type: updatedFields.type !== undefined ? updatedFields.type : (existing.type || 'SURVEILLANCE')
      };

      const res = await fetch(`${apiBaseUrl}/api/cameras/${camId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json && json.data) {
        setCameras((prev) => prev.map((c) => (c.id === camId ? json.data : c)));
      } else {
        loadCamerasFromDb();
      }
    } catch (err: any) {
      alert(`Lỗi cập nhật Camera ID #${camId} vào Database: ` + err.message);
    }
  };

  // ========================================================
  // 5. THAO TÁC CƠ SỞ DỮ LIỆU: XÓA CAMERA (DELETE /api/cameras/{id})
  // ========================================================
  const handleDeleteCameraFromDb = async (camId: number) => {
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA camera ID #${camId} khỏi Cơ Sở Dữ Liệu?`)) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/cameras/${camId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCameras((prev) => prev.filter((c) => c.id !== camId));
      alert(`Đã xóa thành công camera ID #${camId} khỏi Database.`);
    } catch (err: any) {
      alert(`Lỗi xóa camera khỏi Database: ` + err.message);
    }
  };

  // ========================================================
  // 6. THAO TÁC CƠ SỞ DỮ LIỆU: THÊM CAMERA MỚI (POST /api/cameras)
  // ========================================================
  const handleSaveAddEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCamera) return;

    try {
      setIsSavingDb(true);

      if (editingCamera.id) {
        // Cập nhật vào DB
        await handleUpdateCameraToDb(editingCamera.id, editingCamera);
      } else {
        // Thêm mới vào DB
        const payload = {
          name: editingCamera.name || 'Camera Mới',
          ipAddress: editingCamera.ipAddress || '192.168.1.100',
          location: editingCamera.location || 'Khu vực chưa phân loại',
          onvifPort: editingCamera.onvifPort || 80,
          rtspPort: editingCamera.rtspPort || 554,
          type: editingCamera.type || 'SURVEILLANCE'
        };

        const res = await fetch(`${apiBaseUrl}/api/cameras`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await loadCamerasFromDb();
        alert('Đã lưu camera mới vào Cơ Sở Dữ Liệu thành công!');
      }

      setShowAddEditModal(false);
      setEditingCamera(null);
    } catch (err: any) {
      alert('Lỗi lưu vào Database: ' + err.message);
    } finally {
      setIsSavingDb(false);
    }
  };

  // ========================================================
  // 7. IMPORT HÀNG LOẠT VÀO DATABASE TỪ FILE EXCEL / CSV
  // ========================================================
  const parseRawText = (raw: string) => {
    if (!raw || !raw.trim()) return [];
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return [];

    let delimiter = ',';
    if (lines[0].includes('\t')) delimiter = '\t';
    else if (lines[0].includes(';') && !lines[0].includes(',')) delimiter = ';';

    const parseLine = (line: string): string[] => {
      if (delimiter === '\t') {
        return line.split('\t').map((c) => c.replace(/^["']|["']$/g, '').trim());
      }
      const pattern = new RegExp(`(?:^|${delimiter})(?:"([^"]*)"|([^"${delimiter}]*))`, 'g');
      const cells: string[] = [];
      let match;
      while ((match = pattern.exec(line)) !== null) {
        cells.push((match[1] !== undefined ? match[1] : match[2] || '').trim());
      }
      return cells;
    };

    const firstCells = parseLine(lines[0]).map((c) => c.toLowerCase());
    const isHeader = firstCells.some((c) => c.includes('tên') || c.includes('name') || c.includes('ip') || c.includes('địa điểm') || c.includes('location'));

    let nameIdx = -1;
    let ipIdx = -1;
    let rtspIdx = -1;
    let onvifIdx = -1;
    let locIdx = -1;
    let userIdx = -1;
    let passIdx = -1;
    let typeIdx = -1;
    let rtspUrlIdx = -1;

    if (isHeader) {
      firstCells.forEach((c, idx) => {
        if (c.includes('tên') || c.includes('name')) nameIdx = idx;
        else if (c.includes('ip')) ipIdx = idx;
        else if (c.includes('onvif')) onvifIdx = idx;
        else if ((c.includes('rtsp') || c.includes('cổng')) && !c.includes('luồng') && !c.includes('url')) rtspIdx = idx;
        else if (c.includes('địa điểm') || c.includes('khu vực') || c.includes('location')) locIdx = idx;
        else if (c.includes('tài khoản') || c.includes('user') || c.includes('acc')) userIdx = idx;
        else if (c.includes('mật khẩu') || c.includes('pass') || c.includes('pwd')) passIdx = idx;
        else if (c.includes('loại') || c.includes('type')) typeIdx = idx;
        else if (c.includes('luồng') || c.includes('url') || c.includes('source')) rtspUrlIdx = idx;
      });
    }

    const dataLines = isHeader ? lines.slice(1) : lines;

    return dataLines.map((line) => {
      const c = parseLine(line);
      const cameraType = typeIdx !== -1 && c[typeIdx] ? c[typeIdx].trim().toUpperCase() : 'IN_GATE';
      const onvifPort = onvifIdx !== -1 && c[onvifIdx] ? parseInt(c[onvifIdx], 10) || 80 : 80;
      if (nameIdx !== -1 && ipIdx !== -1) {
        return {
          name: c[nameIdx] || 'Camera Import',
          ipAddress: c[ipIdx] || '192.168.1.1',
          location: locIdx !== -1 ? (c[locIdx] || '') : '',
          rtspPort: rtspIdx !== -1 && c[rtspIdx] ? parseInt(c[rtspIdx], 10) || 554 : 554,
          onvifPort,
          type: cameraType,
          username: userIdx !== -1 ? (c[userIdx] || '') : '',
          password: passIdx !== -1 ? (c[passIdx] || '') : '',
          rtspUrl: rtspUrlIdx !== -1 ? (c[rtspUrlIdx] || '') : ''
        };
      }
      if (c.length >= 7) {
        return {
          name: c[0] || 'Camera Import',
          ipAddress: c[1] || '192.168.1.1',
          location: c[4] || '',
          rtspPort: c[2] ? parseInt(c[2], 10) || 554 : 554,
          onvifPort: c[3] ? parseInt(c[3], 10) || 80 : 80,
          type: c[5] ? c[5].trim().toUpperCase() : 'IN_GATE',
          username: c[6] || '',
          password: c[7] || '',
          rtspUrl: c[8] || ''
        };
      }
      return {
        name: c[0] || 'Camera Import',
        ipAddress: c[1] || '192.168.1.1',
        location: c[2] || 'Vị trí giám sát',
        rtspPort: c[3] ? parseInt(c[3], 10) : 554,
        onvifPort: 80,
        type: 'IN_GATE'
      };
    }).filter((item) => Boolean(item.name && item.ipAddress));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseRawText(text);
        if (parsed.length === 0) {
          setImportError('Không tìm thấy dữ liệu camera hợp lệ trong file.');
          return;
        }
        setImportPreviewList(parsed);
      } catch (err: any) {
        setImportError('Lỗi đọc file: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handlePasteParse = () => {
    setImportError(null);
    const parsed = parseRawText(pastedText);
    if (parsed.length === 0) {
      setImportError('Dữ liệu dán chưa đúng định dạng bảng.');
      return;
    }
    setImportPreviewList(parsed);
  };

  const handleExecuteImportToDb = async () => {
    if (importPreviewList.length === 0) return;

    setImportProgress({ current: 0, total: importPreviewList.length });
    let successCount = 0;

    for (let i = 0; i < importPreviewList.length; i++) {
      const item = importPreviewList[i];
      setImportProgress({ current: i + 1, total: importPreviewList.length });

      try {
        const res = await fetch(`${apiBaseUrl}/api/cameras`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            ipAddress: item.ipAddress,
            location: item.location || '',
            onvifPort: item.onvifPort || 80,
            rtspPort: item.rtspPort || 554,
            type: item.type || 'IN_GATE'
          })
        });

        if (res.ok) {
          successCount++;
        }
      } catch (e) {
        console.error('Import error row', i, e);
      }
    }

    setImportProgress(null);
    setShowImportModal(false);
    setImportPreviewList([]);
    setPastedText('');

    await loadCamerasFromDb();
    alert(`Đã lưu thành công ${successCount}/${importPreviewList.length} camera vào Cơ Sở Dữ Liệu!`);
  };

  const downloadTemplate = () => {
    const headers = [
      'Tên Camera (*)',
      'Địa Chỉ IP (*)',
      'Cổng RTSP',
      'Cổng ONVIF',
      'Địa Điểm / Khu Vực',
      'Tài Khoản',
      'Mật Khẩu',
      'Phân Loại Luồng (Type)',
      'Luồng RTSP Nguồn (Tùy chọn)'
    ];
    const sample = [
      [
        'Camera Cổng Vào 01',
        '192.168.1.101',
        '554',
        '80',
        'Cổng Chính - Làn Xe Vào',
        'admin',
        'Admin@123',
        'IN_GATE',
        'rtsp://admin:Admin@123@192.168.1.101:554/Streaming/Channels/101'
      ],
      [
        'Camera Cổng Ra 02',
        '192.168.1.102',
        '554',
        '80',
        'Cổng Phụ - Làn Xe Ra',
        'admin',
        'Admin@123',
        'OUT_GATE',
        ''
      ],
      [
        'Camera Toàn Cảnh Sân Bãi',
        '192.168.1.103',
        '554',
        '80',
        'Bãi Đỗ Xe Trung Tâm',
        'admin',
        'Admin@123',
        'OVERVIEW',
        ''
      ]
    ];
    const csvContent = '\uFEFF' + [headers.join(','), ...sample.map((r) => r.map((c) => `"${c}"`).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau_danh_sach_camera_db.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', color: '#0F172A', fontFamily: 'Segoe UI, Roboto, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Global CSS for Animations */}
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.25; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>



      {/* Thông báo lỗi kết nối DB nếu có */}
      {dbError && (
        <div style={{
          padding: '10px 20px',
          backgroundColor: '#FEF2F2',
          borderBottom: '1px solid #FECACA',
          color: '#DC2626',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Lỗi kết nối Cơ Sở Dữ Liệu: {dbError}</span>
          <button onClick={loadCamerasFromDb} style={{ padding: '3px 8px', backgroundColor: '#DC2626', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Thử lại
          </button>
        </div>
      )}

      {/* 2. FILTER TOOLBAR (BỘ LỌC ĐỊA ĐIỂM & CHUẨN SEARCH FLOW - DÀNH RIÊNG CHO MA TRẬN CAMERA) */}
      {showTools && activeTab === 'WALL' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '10px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center'
        }}>
          {/* Lọc địa điểm */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <IconFilter size={14} color="#0284C7" />
              Lọc Địa Điểm:
            </span>

            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                color: '#0F172A',
                padding: '6px 10px',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none'
              }}
            >
              <option value="ALL">Tất cả địa điểm ({cameras.length} camera)</option>
              {distinctAreas.map((loc) => (
                <option key={loc} value={loc}>
                  {loc} ({cameras.filter((c) => c.location === loc).length} camera)
                </option>
              ))}
            </select>
          </div>

          {/* Ô TÌM KIẾM CHUẨN SEARCH-FLOW (IDLE -> TYPING -> LOADING -> RESULTS) */}
          <div style={{ flex: 1, minWidth: '240px', maxWidth: '420px', position: 'relative', display: 'flex', alignItems: 'center' }}>
            {/* Loading spinner hoặc Icon Search */}
            <span style={{ position: 'absolute', left: '10px', color: '#94A3B8', fontSize: '13px', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              {isSearching ? (
                <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '2px solid rgba(2, 132, 199, 0.3)', borderTopColor: '#0284C7', animation: 'spin 0.8s linear infinite' }} />
              ) : (
                <IconSearch size={14} color="#64748B" />
              )}
            </span>

            <input
              ref={searchInputRef}
              type="text"
              placeholder="Tìm theo tên camera, IP, địa điểm... (Ctrl+K)"
              value={searchInput}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 32px 7px 32px',
                backgroundColor: '#F8FAFC',
                border: searchInput ? '1px solid #0284C7' : '1px solid #CBD5E1',
                borderRadius: '7px',
                color: '#0F172A',
                fontSize: '12px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />

            {/* Nút X xóa 1 chạm khi có text */}
            {searchInput ? (
              <button
                onClick={() => {
                  setSearchInput('');
                  searchInputRef.current?.focus();
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Xóa tìm kiếm"
              >
                <IconClose size={13} color="#94A3B8" />
              </button>
            ) : (
              <kbd style={{
                position: 'absolute',
                right: '8px',
                backgroundColor: '#F1F5F9',
                color: '#64748B',
                borderRadius: '4px',
                padding: '2px 5px',
                fontSize: '10px',
                border: '1px solid #E2E8F0',
                pointerEvents: 'none'
              }}>
                Ctrl+K
              </kbd>
            )}
          </div>

          {/* Cấu hình cột x hàng ma trận */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748B' }}>Lưới hiển thị:</span>
            <input
              type="number"
              min={1}
              max={6}
              value={tempCols}
              onChange={(e) => setTempCols(Number(e.target.value))}
              style={{ width: '45px', padding: '4px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', borderRadius: '6px', textAlign: 'center', fontWeight: 700 }}
            />
            <span style={{ color: '#94A3B8' }}>x</span>
            <input
              type="number"
              min={1}
              max={6}
              value={tempRows}
              onChange={(e) => setTempRows(Number(e.target.value))}
              style={{ width: '45px', padding: '4px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', borderRadius: '6px', textAlign: 'center', fontWeight: 700 }}
            />
            <button
              onClick={() => {
                setGridCols(tempCols);
                setGridRows(tempRows);
              }}
              style={{ padding: '5px 12px', backgroundColor: '#0284C7', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
            >
              Áp dụng
            </button>
          </div>

          {/* Quick Actions: Làm mới DB & Import Excel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <button
              onClick={loadCamerasFromDb}
              disabled={isLoadingCameras}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#0284C7',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isLoadingCameras ? 'not-allowed' : 'pointer'
              }}
              title="Tải lại danh sách camera từ Database"
            >
              <IconRefresh size={13} color="#0284C7" style={{ animation: isLoadingCameras ? 'spin 1s linear infinite' : 'none' }} />
              <span>{isLoadingCameras ? 'Đang tải...' : 'Làm mới DB'}</span>
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#0284C7',
                color: '#FFF',
                border: 'none',
                borderRadius: '7px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
              }}
              title="Import danh sách camera từ file Excel / CSV"
            >
              <IconUpload size={14} color="#FFF" />
              <span>Import Excel</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. NỘI DUNG CHÍNH */}
      <main style={{ flex: 1, padding: '14px', overflowY: 'auto' }}>
        {/* TAB 1: MA TRẬN CAMERA THẬT TỪ DB */}
        {activeTab === 'WALL' && (
          <div>
            {isLoadingCameras ? (
              // SKELETON LOADING THAY VÌ SPINNER (SKILL SKELETON-LOADING)
              <VideoWallSkeleton cols={gridCols} rows={gridRows} />
            ) : filteredCameras.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: '#181F2B',
                borderRadius: '8px',
                border: '1px dashed #334155',
                color: '#94A3B8'
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                  <IconCctv size={52} color="#475569" />
                </div>
                <h3 style={{ color: '#F1F5F9', marginBottom: '6px' }}>
                  {debouncedSearch
                    ? `Không tìm thấy camera nào phù hợp với "${debouncedSearch}"`
                    : 'Chưa Có Camera Nào Trong Cơ Sở Dữ Liệu'}
                </h3>
                <p style={{ fontSize: '13px', maxWidth: '500px', margin: '0 auto 20px auto' }}>
                  {debouncedSearch
                    ? 'Hãy thử kiểm tra lại lỗi chính tả hoặc tìm theo địa chỉ IP / địa điểm khác.'
                    : 'Hệ thống không sử dụng dữ liệu ảo. Hãy bấm thêm camera hoặc nhập danh sách camera từ file Excel để lưu trực tiếp vào DB PostgreSQL!'}
                </p>
                {debouncedSearch ? (
                  <button
                    onClick={() => setSearchInput('')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      backgroundColor: '#0284C7',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <IconClose size={13} color="#FFF" />
                    <span>Xóa bộ lọc tìm kiếm</span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button
                      onClick={() => {
                        setEditingCamera({
                          name: '',
                          ipAddress: '192.168.1.',
                          location: 'Cổng chính',
                          rtspPort: 554
                        });
                        setShowAddEditModal(true);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        backgroundColor: '#10B981',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <IconPlus size={15} color="#FFF" />
                      <span>Thêm Camera Vào DB</span>
                    </button>
                    <button
                      onClick={() => setShowImportModal(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        backgroundColor: '#0284C7',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <IconUpload size={15} color="#FFF" />
                      <span>Nhập Danh Sách Từ File Excel</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                gap: '12px',
                backgroundColor: '#FFFFFF',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                {gridSlots.map((cam, idx) => (
                  <RealCameraGridCell
                    key={cam.id}
                    camera={cam}
                    apiBaseUrl={apiBaseUrl}
                    onClick={(c) => setSpotlightCamera(c)}
                    searchQuery={debouncedSearch}
                    isLcpCandidate={idx === 0} // Tối ưu LCP cho ô đầu tiên
                    aiData={aiByCamera[cam.id]}
                    moduleMode={moduleMode}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: QUẢN LÝ ĐỊA ĐIỂM & CHỈNH SỬA DB TRỰC TIẾP (LIGHT THEME) */}
        {/* TAB 2: QUẢN LÝ THIẾT BỊ CAMERA & PHÂN LOẠI AI (ENTERPRISE DASHBOARD THEME) */}
        {activeTab === 'LOCATION_MANAGER' && (
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '20px 24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* 1. Header Toolbar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              paddingBottom: '14px',
              borderBottom: '1px solid #F1F5F9'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IconCctv size={19} color="#0284C7" />
                    <span>Danh Sách Thiết Bị Camera</span>
                  </h2>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#0284C7',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BAE6FD',
                    padding: '2px 8px',
                    borderRadius: '12px'
                  }}>
                    {cameras.length} camera trong DB
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
                  Quản lý thông số RTSP, luồng phụ Sub-stream và gán Module AI chuyên dụng cho từng camera
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setEditingCamera({
                      name: '',
                      ipAddress: '192.168.1.',
                      location: '',
                      rtspPort: 554
                    });
                    setShowAddEditModal(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(2, 132, 199, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <IconPlus size={14} color="#FFF" />
                  <span>Thêm Camera Mới</span>
                </button>

                <button
                  onClick={() => setShowImportModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <IconUpload size={14} color="#475569" />
                  <span>Nhập Excel</span>
                </button>

                <button
                  onClick={downloadTemplate}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    color: '#64748B',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Tải file mẫu Excel"
                >
                  <IconFileSpreadsheet size={14} color="#64748B" />
                  <span>File Mẫu</span>
                </button>

                <button
                  onClick={loadCamerasFromDb}
                  disabled={isLoadingCameras}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#0284C7',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isLoadingCameras ? 'not-allowed' : 'pointer'
                  }}
                  title="Tải lại danh sách camera từ Database"
                >
                  <IconRefresh size={14} color="#0284C7" style={{ animation: isLoadingCameras ? 'spin 1s linear infinite' : 'none' }} />
                  <span>{isLoadingCameras ? 'Đang tải...' : 'Làm mới DB'}</span>
                </button>
              </div>
            </div>

            {/* 2. Modern Segmented AI Filter Control */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#F1F5F9',
              padding: '3px',
              borderRadius: '8px',
              width: 'fit-content'
            }}>
              {[
                { id: 'ALL', label: 'Tất Cả', count: cameras.length, icon: IconGrid },
                { id: 'VEHICLE_ANPR', label: 'Camera Xe (ALPR)', count: aiStats.anprCount, icon: IconCar },
                { id: 'FACE_RECOGNITION', label: 'Camera Người (FaceID)', count: aiStats.faceCount, icon: IconUser },
                { id: 'INTRUSION_ROI', label: 'Camera An Ninh (ROI)', count: aiStats.roiCount, icon: IconShield },
                { id: 'NONE', label: 'Chưa Gán AI', count: aiStats.noneCount, icon: IconCamera }
              ].map((tab) => {
                const isActive = aiFilter === tab.id;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setAiFilter(tab.id as any)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      border: 'none',
                      backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                      color: isActive ? '#0284C7' : '#64748B',
                      boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <TabIcon size={14} color={isActive ? '#0284C7' : '#64748B'} />
                    <span>{tab.label}</span>
                    <span style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '10px',
                      backgroundColor: isActive ? '#EFF6FF' : '#E2E8F0',
                      color: isActive ? '#0284C7' : '#64748B'
                    }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 3. Harmonious Data Table */}
            {isLoadingCameras ? (
              <TableSkeleton rows={5} />
            ) : (
              <div style={{
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                overflowX: 'auto',
                backgroundColor: '#FFFFFF'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#F8FAFC',
                      color: '#475569',
                      borderBottom: '1px solid #E2E8F0',
                      fontSize: '12px',
                      fontWeight: 700
                    }}>
                      <th style={{ padding: '10px 10px', width: '44px', textAlign: 'center', whiteSpace: 'nowrap' }}>ID</th>
                      <th style={{ padding: '10px 12px', minWidth: '140px' }}>Camera & Vị Trí</th>
                      <th style={{ padding: '10px 12px', minWidth: '130px', whiteSpace: 'nowrap' }}>Địa Chỉ IP & Cổng</th>
                      <th style={{ padding: '10px 12px', minWidth: '140px' }}>Module AI Gán Cho Cam</th>
                      <th style={{ padding: '10px 10px', width: '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>Trạng Thái</th>
                      <th style={{
                        padding: '10px 12px',
                        width: '210px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        right: 0,
                        zIndex: 2,
                        backgroundColor: '#F8FAFC',
                        boxShadow: '-3px 0 8px rgba(15, 23, 42, 0.04)'
                      }}>Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredManageCameras.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '36px 20px', color: '#94A3B8' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                            <IconSearch size={28} color="#CBD5E1" />
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                            {cameras.length === 0
                              ? 'Chưa có camera nào trong cơ sở dữ liệu.'
                              : 'Không có camera nào phù hợp với bộ lọc này.'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px' }}>
                            {cameras.length === 0 ? 'Bấm nút "Thêm Camera Mới" ở góc trên để tạo camera đầu tiên.' : 'Hãy chọn tab phân loại khác để xem danh sách.'}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredManageCameras.map((c, idx) => {
                        const activeModules = cameraAiModulesMap[c.id] || [];
                        const isAiStreaming = Boolean(aiByCamera[c.id]);
                        const isOnline = c.status === 'ONLINE' || isAiStreaming;

                        return (
                          <tr
                            key={c.id}
                            style={{
                              borderBottom: '1px solid #F1F5F9',
                              backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                              transition: 'background-color 0.15s ease'
                            }}
                          >
                            {/* 1. ID */}
                            <td style={{ padding: '12px 14px', textAlign: 'center', color: '#64748B', fontFamily: 'monospace', fontWeight: 600 }}>
                              #{c.id}
                            </td>

                            {/* 2. Camera Name & Location */}
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '13px' }}>
                                {c.name}
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <IconMapPin size={13} color="#64748B" />
                                <span>{c.location || 'Chưa đặt địa điểm'}</span>
                              </div>
                            </td>

                            {/* 3. IP & Ports */}
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A', fontSize: '12.5px' }}>
                                {c.ipAddress}:{c.rtspPort || 554}
                              </div>
                              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                                ONVIF :{c.onvifPort || 80} • {c.username || 'admin'}
                              </div>
                            </td>

                            {/* 4. Active AI Modules & Status */}
                            <td style={{ padding: '12px 14px' }}>
                              {activeModules.length === 0 ? (
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#94A3B8',
                                  backgroundColor: '#F8FAFC',
                                  padding: '3px 9px',
                                  borderRadius: '6px',
                                  border: '1px dashed #CBD5E1',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
                                  <span>Đã Tắt AI (Chưa Gán)</span>
                                </span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                                    {activeModules.map((mod) => {
                                      const isVehicle = mod === 'VEHICLE_ANPR';
                                      const isFace = mod === 'FACE_RECOGNITION';
                                      const isRoi = mod === 'INTRUSION_ROI';
                                      const isPpe = mod === 'SAFETY_PPE';
                                      const isFire = mod === 'FIRE_DETECT';

                                      const label = isVehicle ? 'Nhận diện Xe (ALPR)'
                                        : isFace ? 'Nhận diện Người (FaceID)'
                                          : isPpe ? 'Mũ Bảo Hộ'
                                            : isFire ? 'Báo Cháy'
                                              : 'Hàng Rào (ROI)';

                                      const color = isVehicle ? '#059669' : isFace ? '#7C3AED' : isFire ? '#DC2626' : isPpe ? '#EA580C' : '#0284C7';
                                      const bg = isVehicle ? '#ECFDF5' : isFace ? '#F5F3FF' : isFire ? '#FEF2F2' : isPpe ? '#FFF7ED' : '#EFF6FF';
                                      const border = isVehicle ? '#A7F3D0' : isFace ? '#DDD6FE' : isFire ? '#FECACA' : isPpe ? '#FED7AA' : '#BAE6FD';

                                      return (
                                        <span
                                          key={mod}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '10.5px',
                                            fontWeight: 700,
                                            padding: '3px 7px',
                                            borderRadius: '4px',
                                            backgroundColor: bg,
                                            color: color,
                                            border: `1px solid ${border}`
                                          }}
                                        >
                                          {isVehicle && <IconCar size={11} color={color} />}
                                          {isFace && <IconUser size={11} color={color} />}
                                          {isRoi && <IconShield size={11} color={color} />}
                                          {isPpe && <IconHardHat size={11} color={color} />}
                                          {isFire && <IconFlame size={11} color={color} />}
                                          <span>{label}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                                    <span>Đang hoạt động ({activeModules.length} module AI)</span>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* 5. Status */}
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 9px',
                                borderRadius: '12px',
                                backgroundColor: isOnline ? '#ECFDF5' : '#FEF2F2',
                                color: isOnline ? '#059669' : '#DC2626',
                                border: `1px solid ${isOnline ? '#A7F3D0' : '#FECACA'}`
                              }}>
                                <span style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  backgroundColor: isOnline ? '#10B981' : '#EF4444'
                                }} />
                                <span>{isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
                              </span>
                            </td>

                            {/* 6. Cohesive Action Buttons */}
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center' }}>
                                {/* Nút Xem Live */}
                                <button
                                  onClick={() => setSpotlightCamera(c)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '5px 9px',
                                    backgroundColor: '#0284C7',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    transition: 'background-color 0.15s ease'
                                  }}
                                  title="Xem luồng trực tiếp Main Stream Full HD"
                                >
                                  <IconMaximize size={12} color="#FFF" />
                                  <span>Live</span>
                                </button>

                                {/* Nút Gán Module AI */}
                                <button
                                  onClick={() => setAiConfigCamera(c)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '5px 9px',
                                    backgroundColor: '#F5F3FF',
                                    border: '1px solid #DDD6FE',
                                    color: '#7C3AED',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    transition: 'all 0.15s ease'
                                  }}
                                  title="Cấu hình & gán Module AI (Biển số xe, Khuôn mặt, Hàng rào)"
                                >
                                  <IconCamera size={12} color="#7C3AED" />
                                  <span>Gán AI</span>
                                </button>

                                {/* Nút Sửa Thông Tin Camera */}
                                <button
                                  onClick={() => {
                                    setEditingCamera({
                                      id: c.id,
                                      name: c.name,
                                      ipAddress: c.ipAddress,
                                      location: c.location || '',
                                      rtspPort: c.rtspPort || 554,
                                      onvifPort: c.onvifPort || 80,
                                      username: c.username || 'admin',
                                      type: c.type || 'SURVEILLANCE'
                                    });
                                    setShowAddEditModal(true);
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '5px 9px',
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #CBD5E1',
                                    color: '#334155',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    transition: 'all 0.15s ease'
                                  }}
                                  title="Chỉnh sửa thông tin camera"
                                >
                                  <IconEdit size={12} color="#475569" />
                                  <span>Sửa</span>
                                </button>

                                {/* Nút Xóa Camera */}
                                <button
                                  onClick={() => handleDeleteCameraFromDb(c.id)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '5px 8px',
                                    backgroundColor: '#FEF2F2',
                                    border: '1px solid #FECACA',
                                    color: '#DC2626',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    transition: 'all 0.15s ease'
                                  }}
                                  title="Xóa camera khỏi cơ sở dữ liệu"
                                >
                                  <IconTrash size={12} color="#DC2626" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Hint footer */}
            <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#0284C7', fontWeight: 600 }}>Hướng dẫn:</span>
              <span>Bấm nút <strong>Gán AI</strong> để bật/tắt nhận diện Biển số (ANPR), FaceID hoặc Hàng rào ảo cho từng camera cụ thể; bấm <strong>Sửa</strong> để thay đổi IP, tài khoản kết nối.</span>
            </div>
          </div>
        )}

        {/* TAB 3: QUẢN LÝ HÌNH ẢNH & SỰ KIỆN NHẬN DIỆN THỰC TẾ (ALPR LOGS) */}
        {activeTab === 'DETECTION_LOGS' && (
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {/* THỐNG KÊ TỔNG QUAN PHƯƠNG TIỆN & NGƯỜI (TOP KPI CARDS) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '14px',
              marginBottom: '20px'
            }}>
              {/* Card 1: Ô Tô */}
              <div
                onClick={() => setDetectionTimeFilter((prev) => ({ ...prev, categoryFilter: prev.categoryFilter === 'CAR' ? 'ALL' : 'CAR' }))}
                style={{
                  backgroundColor: detectionTimeFilter.categoryFilter === 'CAR' ? '#EFF6FF' : '#F8FAFC',
                  border: `1.5px solid ${detectionTimeFilter.categoryFilter === 'CAR' ? '#2563EB' : '#E2E8F0'}`,
                  borderRadius: '10px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: detectionTimeFilter.categoryFilter === 'CAR' ? '0 4px 12px rgba(37,99,235,0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Ô Tô Vào / Ra
                  </span>
                  <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center' }}>
                    <IconCar size={16} color="#1D4ED8" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                    {kpiStats.cars}
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>lượt xe</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  Sedan, SUV, Bán tải & Xe tải
                </div>
              </div>

              {/* Card 2: Xe Máy */}
              <div
                onClick={() => setDetectionTimeFilter((prev) => ({ ...prev, categoryFilter: prev.categoryFilter === 'MOTO' ? 'ALL' : 'MOTO' }))}
                style={{
                  backgroundColor: detectionTimeFilter.categoryFilter === 'MOTO' ? '#ECFDF5' : '#F8FAFC',
                  border: `1.5px solid ${detectionTimeFilter.categoryFilter === 'MOTO' ? '#059669' : '#E2E8F0'}`,
                  borderRadius: '10px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: detectionTimeFilter.categoryFilter === 'MOTO' ? '0 4px 12px rgba(5,150,105,0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Xe Máy Vào / Ra
                  </span>
                  <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center' }}>
                    <IconMoto size={16} color="#059669" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                    {kpiStats.motos}
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>lượt xe</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  Xe máy 2 bánh & Xe điện
                </div>
              </div>

              {/* Card 3: Kiểm Soát Người */}
              <div
                onClick={() => setDetectionTimeFilter((prev) => ({ ...prev, categoryFilter: prev.categoryFilter === 'PERSON' ? 'ALL' : 'PERSON' }))}
                style={{
                  backgroundColor: detectionTimeFilter.categoryFilter === 'PERSON' ? '#F5F3FF' : '#F8FAFC',
                  border: `1.5px solid ${detectionTimeFilter.categoryFilter === 'PERSON' ? '#7C3AED' : '#E2E8F0'}`,
                  borderRadius: '10px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: detectionTimeFilter.categoryFilter === 'PERSON' ? '0 4px 12px rgba(124,58,237,0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Kiểm Soát Người
                  </span>
                  <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#EDE9FE', display: 'flex', alignItems: 'center' }}>
                    <IconUser size={16} color="#7C3AED" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                    {kpiStats.persons}
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>lượt người</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  FaceID, Khách & Nhân viên
                </div>
              </div>
            </div>

            {/* COMPONENT BỘ LỌC THỜI GIAN DÙNG CHUNG (HistoryFilterBar) */}
            <HistoryFilterBar
              title="Lọc Lịch Sử Nhận Diện Phương Tiện"
              themeColor="#0284C7"
              searchPlaceholder="Tìm theo biển số, cổng vào, camera..."
              onRefresh={fetchDetections}
              onFilterChange={setDetectionTimeFilter}
              onExport={handleExportAlprExcel}
              exportButtonText="Xuất Excel"
              categoryOptions={[
                { value: 'ALL', label: 'Tất cả' },
                { value: 'CAR', label: 'Ô tô' },
                { value: 'MOTO', label: 'Xe máy' },
                { value: 'TRUCK', label: 'Xe tải' },
                { value: 'PERSON', label: 'Người (FaceID)' }
              ]}
              extraActions={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={detectionPageSize}
                    onChange={(e) => setDetectionPageSize(Number(e.target.value))}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: '7px',
                      color: '#0F172A',
                      fontSize: '12px',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value={12}>12 / trang</option>
                    <option value={24}>24 / trang</option>
                    <option value={48}>48 / trang</option>
                  </select>

                  <div style={{ display: 'flex', border: '1px solid #CBD5E1', borderRadius: '7px', overflow: 'hidden' }}>
                    <button
                      onClick={() => setDetectionViewMode('GRID')}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: detectionViewMode === 'GRID' ? '#0284C7' : '#F8FAFC',
                        color: detectionViewMode === 'GRID' ? '#FFF' : '#475569',
                        border: 'none',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Chế độ Lưới"
                    >
                      <IconGrid size={13} color={detectionViewMode === 'GRID' ? '#FFF' : '#64748B'} />
                      <span>Lưới</span>
                    </button>
                    <button
                      onClick={() => setDetectionViewMode('TABLE')}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: detectionViewMode === 'TABLE' ? '#0284C7' : '#F8FAFC',
                        color: detectionViewMode === 'TABLE' ? '#FFF' : '#475569',
                        border: 'none',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Chế độ Bảng"
                    >
                      <IconTable size={13} color={detectionViewMode === 'TABLE' ? '#FFF' : '#64748B'} />
                      <span>Bảng</span>
                    </button>
                  </div>
                </div>
              }
            />

            {/* Nội dung danh sách sự kiện */}
            {filteredDetections.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748B' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                  <IconSearch size={44} color="#CBD5E1" />
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  {detectionTimeFilter.searchQuery ? 'Không tìm thấy lượt xe nào khớp với từ khóa' : 'Không có sự kiện nhận diện nào trong khoảng thời gian đã chọn'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                  {detectionTimeFilter.searchQuery ? 'Hãy thử xóa từ khóa tìm kiếm hoặc chọn lọc loại xe khác.' : 'Hãy thử chọn mốc "Hôm nay", "7 ngày" hoặc "Tất cả" trên thanh bộ lọc thời gian.'}
                </div>
              </div>
            ) : detectionViewMode === 'GRID' ? (
              /* CHẾ ĐỘ 1: LƯỚI THẺ ẢNH (GRID CARDS) */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '14px' }}>
                {paginatedDetections.map((det, idx) => {
                  const confPct = det.confidence ? Math.round(det.confidence) : 92;
                  const isHighConf = confPct >= 85;
                  const isPerson = Boolean((det as any).personName || det.note?.includes('Person') || (det.vehicleType || '').toUpperCase() === 'PERSON' || (det as any).module === 'FACE_ID' || (det as any).eventType === 'FACE_RECOGNITION');
                  const isMoto = !isPerson && det.vehicleType === 'MOTO';
                  const isTruck = !isPerson && det.vehicleType === 'TRUCK';
                  const personName = (det as any).personName;

                  return (
                    <div
                      key={`det-grid-${det.id || 'item'}-${idx}`}
                      onClick={() => setSelectedDetection(det)}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: isPerson ? '1.5px solid #DDD6FE' : isMoto ? '1.5px solid #A7F3D0' : '1px solid #E2E8F0',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = isPerson ? '#7C3AED' : isMoto ? '#059669' : '#0284C7';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = isPerson
                          ? '0 8px 20px rgba(124, 58, 237, 0.16)'
                          : isMoto
                            ? '0 8px 20px rgba(5, 150, 105, 0.16)'
                            : '0 8px 20px rgba(2, 132, 199, 0.16)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = isPerson ? '#DDD6FE' : isMoto ? '#A7F3D0' : '#E2E8F0';
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
                      }}
                    >
                      {/* Vùng Ảnh Toàn Cảnh hoặc Ảnh Cắt Cận Cảnh Biển Số */}
                      {(() => {
                        const hasSnapshot = Boolean(det.snapshotUrl && det.snapshotUrl.trim());
                        const hasCrop = Boolean(det.plateCropUrl && det.plateCropUrl.trim());
                        const heroImg = hasSnapshot ? det.snapshotUrl : (hasCrop ? det.plateCropUrl : null);
                        const isCropHero = !hasSnapshot && hasCrop;

                        return (
                          <div style={{ position: 'relative', width: '100%', height: '140px', backgroundColor: '#0F172A', overflow: 'hidden' }}>
                            {heroImg ? (
                              <img
                                src={heroImg}
                                alt={isCropHero ? (isPerson ? 'Ảnh khuôn mặt' : 'Ảnh cắt biển số') : 'Ảnh toàn cảnh'}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: isCropHero ? 'contain' : 'cover',
                                  backgroundColor: '#0F172A',
                                  display: 'block'
                                }}
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '11px' }}>
                                Không có hình ảnh
                              </div>
                            )}

                            {/* Nhãn nhận biết: ẢNH CẮT BIỂN SỐ khi không có ảnh toàn cảnh */}
                            {isCropHero && (
                              <div style={{
                                position: 'absolute',
                                bottom: '6px',
                                left: '6px',
                                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                                color: isPerson ? '#C4B5FD' : '#38BDF8',
                                border: `1px solid ${isPerson ? 'rgba(167, 139, 250, 0.5)' : 'rgba(56, 189, 248, 0.5)'}`,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                backdropFilter: 'blur(4px)',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                                <span>{isPerson ? 'ẢNH KHUÔN MẶT' : 'ẢNH CẮT BIỂN SỐ'}</span>
                              </div>
                            )}

                            {/* Badge loại đối tượng (Top-Left) */}
                            <div style={{
                              position: 'absolute',
                              top: '6px',
                              left: '6px',
                              backgroundColor: isPerson
                                ? 'rgba(124, 58, 237, 0.92)'
                                : isMoto
                                  ? 'rgba(16, 185, 129, 0.92)'
                                  : isTruck
                                    ? 'rgba(234, 88, 12, 0.92)'
                                    : 'rgba(2, 132, 199, 0.92)',
                              color: '#FFF',
                              padding: '3px 7px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backdropFilter: 'blur(4px)',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              <span>{isPerson ? 'NGƯỜI' : isMoto ? 'XE MÁY' : isTruck ? 'XE TẢI' : 'Ô TÔ'}</span>
                            </div>

                            {/* Badge độ tin cậy (Top-Right) */}
                            <div style={{
                              position: 'absolute',
                              top: '6px',
                              right: '6px',
                              backgroundColor: isHighConf ? 'rgba(34, 197, 94, 0.9)' : 'rgba(245, 158, 11, 0.9)',
                              color: '#FFF',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <IconTarget size={11} color="#FFF" />
                              <span>{confPct}%</span>
                            </div>

                            {/* Thumbnail Ảnh Cắt (Plate hoặc Face Crop Overlay) - chỉ hiện góc khi đã có ảnh toàn cảnh làm nền */}
                            {hasSnapshot && hasCrop && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: '6px',
                                  right: '6px',
                                  padding: '2px',
                                  backgroundColor: 'rgba(255, 255, 255, 0.92)',
                                  border: `1.5px solid ${isPerson ? '#7C3AED' : isMoto ? '#059669' : '#0284C7'}`,
                                  borderRadius: '4px',
                                  maxWidth: '85px',
                                  maxHeight: '42px',
                                  overflow: 'hidden',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                                }}
                                title={isPerson ? 'Ảnh nhận diện khuôn mặt' : 'Ảnh cắt cận cảnh biển số'}
                              >
                                <SnapshotImage
                                  src={det.plateCropUrl}
                                  alt="Crop"
                                  fallbackText="—"
                                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Thông tin biển số hoặc họ tên và camera */}
                      <div style={{ padding: '10px 12px' }}>
                        {/* Biển số / Tên người */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isPerson ? '#F5F3FF' : '#EFF6FF',
                          border: `1px solid ${isPerson ? '#DDD6FE' : '#BFDBFE'}`,
                          borderRadius: '6px',
                          padding: '5px 8px',
                          color: isPerson ? '#7C3AED' : '#1D4ED8',
                          fontSize: '14px',
                          fontWeight: 800,
                          fontFamily: isPerson ? 'inherit' : 'monospace',
                          letterSpacing: isPerson ? 'normal' : '0.8px',
                          marginBottom: '8px'
                        }}>
                          {isPerson ? (personName || det.plateNumber || 'NGƯỜI ĐI BỘ') : (det.plateNumber || 'CHƯA RÕ BIỂN')}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748B' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '125px' }}>
                            <IconCamera size={11} color="#94A3B8" />
                            <span style={{ color: '#334155', fontWeight: 500 }}>{det.gateName || det.cameraName || (det.cameraId ? `Camera #${det.cameraId}` : 'Cổng chính')}</span>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748B' }}>
                            <IconCalendar size={11} color="#94A3B8" />
                            <span>{formatDetectionTime(det.detectedAt, det.timestamp)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            ) : (
              /* CHẾ ĐỘ 2: BẢNG CHI TIẾT (TABLE VIEW) */
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', color: '#475569', borderBottom: '2px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 12px', width: '90px' }}>Ảnh Cắt</th>
                      <th style={{ padding: '10px 12px', width: '100px' }}>Ảnh Toàn Cảnh</th>
                      <th style={{ padding: '10px 12px', minWidth: '140px' }}>Đối Tượng / Biển Số</th>
                      <th style={{ padding: '10px 12px', width: '110px' }}>Phân Loại</th>
                      <th style={{ padding: '10px 12px', width: '80px' }}>Độ Tin Cậy</th>
                      <th style={{ padding: '10px 12px', minWidth: '140px' }}>Camera / Vị Trí</th>
                      <th style={{ padding: '10px 12px', minWidth: '140px' }}>Thời Gian</th>
                      <th style={{ padding: '10px 12px', width: '100px', textAlign: 'center' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDetections.map((det, idx) => {
                      const isPerson = Boolean((det as any).personName || det.note?.includes('Person') || (det.vehicleType || '').toUpperCase() === 'PERSON' || (det as any).module === 'FACE_ID' || (det as any).eventType === 'FACE_RECOGNITION');
                      const personName = (det as any).personName;
                      const isMoto = !isPerson && det.vehicleType === 'MOTO';
                      const isTruck = !isPerson && det.vehicleType === 'TRUCK';

                      return (
                        <tr key={`det-tbl-${det.id || 'item'}-${idx}`} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                          {/* Ảnh Cắt */}
                          <td style={{ padding: '6px 12px' }}>
                            {det.plateCropUrl ? (
                              <SnapshotImage
                                src={det.plateCropUrl}
                                alt="Crop"
                                fallbackText="—"
                                onClick={() => setSelectedDetection(det)}
                                style={{ width: '70px', height: '34px', objectFit: 'contain', backgroundColor: '#F1F5F9', border: `1px solid ${isPerson ? '#DDD6FE' : '#CBD5E1'}`, borderRadius: '4px', cursor: 'pointer' }}
                              />
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '10px' }}>-</span>
                            )}
                          </td>

                          {/* Ảnh Toàn Cảnh */}
                          <td style={{ padding: '6px 12px' }}>
                            {det.snapshotUrl ? (
                              <SnapshotImage
                                src={det.snapshotUrl}
                                alt="Snapshot"
                                fallbackText="—"
                                onClick={() => setSelectedDetection(det)}
                                style={{ width: '70px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '1px solid #E2E8F0' }}
                              />
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '10px' }}>-</span>
                            )}
                          </td>

                          {/* Đối Tượng / Biển Số */}
                          <td style={{ padding: '8px 12px' }}>
                            {isPerson ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                backgroundColor: '#F5F3FF',
                                border: '1px solid #DDD6FE',
                                borderRadius: '4px',
                                color: '#7C3AED',
                                fontWeight: 700,
                                fontSize: '12px'
                              }}>
                                <IconUser size={13} color="#7C3AED" />
                                <span>{personName || det.plateNumber || 'Người đi bộ'}</span>
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                backgroundColor: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                borderRadius: '4px',
                                color: '#1D4ED8',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '13px'
                              }}>
                                {det.plateNumber || 'CHƯA RÕ'}
                              </span>
                            )}
                          </td>

                          {/* Phân loại */}
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: isPerson ? '#F5F3FF' : isMoto ? '#ECFDF5' : (isTruck ? '#FFF7ED' : '#EFF6FF'),
                              color: isPerson ? '#7C3AED' : isMoto ? '#059669' : (isTruck ? '#C2410C' : '#1D4ED8'),
                              border: `1px solid ${isPerson ? '#DDD6FE' : isMoto ? '#A7F3D0' : (isTruck ? '#FED7AA' : '#BFDBFE')}`
                            }}>
                              {isPerson ? (
                                <>
                                  <IconUser size={12} />
                                  <span>NGƯỜI</span>
                                </>
                              ) : isMoto ? (
                                <>
                                  <IconMoto size={12} />
                                  <span>MOTO</span>
                                </>
                              ) : isTruck ? (
                                <>
                                  <IconTruck size={12} />
                                  <span>TRUCK</span>
                                </>
                              ) : (
                                <>
                                  <IconCar size={12} />
                                  <span>CAR</span>
                                </>
                              )}
                            </span>
                          </td>

                          {/* Độ tin cậy */}
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: (det.confidence || 90) >= 85 ? '#16A34A' : '#D97706' }}>
                            {det.confidence ? Math.round(det.confidence) : 92}%
                          </td>

                          {/* Camera */}
                          <td style={{ padding: '8px 12px', color: '#334155', fontWeight: 500 }}>
                            {det.gateName || det.cameraName || (det.cameraId ? `Camera #${det.cameraId}` : 'Cổng chính')}
                          </td>

                          {/* Thời gian */}
                          <td style={{ padding: '8px 12px', color: '#64748B' }}>
                            {formatDetectionTime(det.detectedAt, det.timestamp)}
                          </td>

                          {/* Thao tác */}
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              onClick={() => setSelectedDetection(det)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 10px',
                                backgroundColor: '#0284C7',
                                color: '#FFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              <IconEye size={12} color="#FFF" />
                              <span>Chi tiết</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* THANH PHÂN TRANG (PAGINATION BAR) */}
            {filteredDetections.length > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #E2E8F0'
              }}>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Hiển thị{' '}
                  <strong style={{ color: '#0F172A' }}>
                    {(detectionPage - 1) * detectionPageSize + 1} - {Math.min(detectionPage * detectionPageSize, filteredDetections.length)}
                  </strong>{' '}
                  trên tổng số <strong style={{ color: '#0284C7' }}>{filteredDetections.length}</strong> sự kiện
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={() => setDetectionPage((p) => Math.max(1, p - 1))}
                    disabled={detectionPage <= 1}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 11px',
                      backgroundColor: detectionPage <= 1 ? '#F1F5F9' : '#FFFFFF',
                      color: detectionPage <= 1 ? '#94A3B8' : '#334155',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: detectionPage <= 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <IconChevronLeft size={13} />
                    <span>Trước</span>
                  </button>

                  {/* Danh sách các số trang */}
                  {Array.from({ length: totalDetectionPages }).slice(0, 7).map((_, i) => {
                    const pageNum = i + 1;
                    const isActive = detectionPage === pageNum;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setDetectionPage(pageNum)}
                        style={{
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isActive ? '#0284C7' : '#FFFFFF',
                          color: isActive ? '#FFF' : '#334155',
                          border: `1px solid ${isActive ? '#0284C7' : '#CBD5E1'}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: isActive ? 700 : 400,
                          cursor: 'pointer'
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  {totalDetectionPages > 7 && (
                    <span style={{ color: '#64748B', fontSize: '12px', padding: '0 4px' }}>...</span>
                  )}

                  <button
                    onClick={() => setDetectionPage((p) => Math.min(totalDetectionPages, p + 1))}
                    disabled={detectionPage >= totalDetectionPages}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 11px',
                      backgroundColor: detectionPage >= totalDetectionPages ? '#F1F5F9' : '#FFFFFF',
                      color: detectionPage >= totalDetectionPages ? '#94A3B8' : '#334155',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: detectionPage >= totalDetectionPages ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <span>Sau</span>
                    <IconChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* MODAL PHÓNG TO LUỒNG CHÍNH FULL HD (MAIN STREAM WEBRTC) */}
      {spotlightCamera && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '2px solid #0284C7',
            borderRadius: '12px',
            width: '95vw',
            maxWidth: '1380px',
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ padding: '12px 18px', backgroundColor: '#1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{spotlightCamera.name} - LUỒNG CHÍNH FULL HD</span>
                  <span style={{ backgroundColor: '#EF4444', color: '#FFF', padding: '1px 7px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
                    MAIN WEBRTC
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
                  IP: {spotlightCamera.ipAddress}:{spotlightCamera.rtspPort || 554} • Địa điểm: {spotlightCamera.location || 'Chưa đặt'} • Độ trễ cực thấp: &lt; 0.2s
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* NÚT BẬT/TẮT BÁM BIỂN AI */}
                <button
                  onClick={() => setShowSpotlightAi(!showSpotlightAi)}
                  style={{
                    background: showSpotlightAi ? (spotlightAiConnected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(56, 189, 248, 0.2)') : 'rgba(100, 116, 139, 0.2)',
                    border: `1px solid ${showSpotlightAi ? (spotlightAiConnected ? '#22C55E' : '#38BDF8') : '#475569'}`,
                    color: showSpotlightAi ? (spotlightAiConnected ? '#4ADE80' : '#7DD3FC') : '#94A3B8',
                    fontSize: '11.5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    transition: 'all 0.2s ease'
                  }}
                  title={spotlightAiConnected ? `AI đang trực tuyến (${spotlightAiFps} FPS). Bấm để bật/tắt hiển thị bám biển số.` : 'Đang kết nối Python AI...'}
                >
                  <IconTarget size={14} color={showSpotlightAi ? (spotlightAiConnected ? '#4ADE80' : '#7DD3FC') : '#94A3B8'} />
                  <span>Bám biển AI</span>
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: showSpotlightAi ? (spotlightAiConnected ? '#22C55E' : '#38BDF8') : '#64748B',
                    boxShadow: showSpotlightAi && spotlightAiConnected ? '0 0 8px #22C55E' : 'none'
                  }} />
                  {spotlightAiConnected && spotlightAiFps > 0 && (
                    <span style={{ fontSize: '10.5px', opacity: 0.9, fontFamily: 'monospace' }}>
                      {spotlightAiFps} FPS
                    </span>
                  )}
                </button>

                {/* NÚT CẤU HÌNH KHUNG ẢO VIRTUAL ROI */}
                <button
                  onClick={() => setShowSpotlightRoiModal(true)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    color: '#38BDF8',
                    fontSize: '11.5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    transition: 'all 0.2s ease'
                  }}
                  title="Cấu hình góc và vùng khung ảo nhận diện xe (ROI) cho Camera này"
                >
                  <IconPolygon size={14} color="#38BDF8" />
                  <span>Cấu hình ROI</span>
                </button>

                {/* Nút đóng modal */}
                <button
                  onClick={() => {
                    setSpotlightCamera(null);
                    setPtzZoom(1);
                  }}
                  style={{
                    backgroundColor: '#DC2626',
                    border: 'none',
                    color: '#FFF',
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: '4px',
                    transition: 'all 0.15s ease'
                  }}
                  title="Đóng cửa sổ phóng to"
                >
                  <IconClose size={16} color="#FFF" />
                </button>
              </div>

            </div>

            {/* Split View: Left 70% Video + Canvas AI, Right 30% Live Snapshot Events Feed (V2.0 Standard) */}
            <div style={{
              display: 'flex',
              flex: 1,
              minHeight: '480px',
              maxHeight: '76vh',
              overflow: 'hidden'
            }}>
              {/* LEFT COLUMN (70%): Video Player + Overlay + Footer PTZ */}
              <div style={{
                flex: '1 1 70%',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1.5px solid #1E293B',
                backgroundColor: '#05070D',
                overflow: 'hidden'
              }}>
                {/* Video Body & Zoom Container */}
                <div style={{
                  position: 'relative',
                  flex: 1,
                  backgroundColor: '#05070D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '380px',
                  padding: '10px',
                  overflow: 'hidden'
                }}>
                  {spotlightLoading && (
                    <div style={{ position: 'absolute', color: '#38BDF8', fontSize: '14px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>⏳ Đang kết nối luồng WebRTC tốc độ cao từ MediaMTX...</span>
                    </div>
                  )}

                  {spotlightError && (
                    <div style={{ position: 'absolute', color: '#EF4444', fontSize: '13px', textAlign: 'center', zIndex: 10, padding: '20px' }}>
                      Không thể phát luồng trực tiếp: {spotlightError}
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                        Hãy kiểm tra nguồn camera hoặc kết nối RTSP của camera này.
                      </div>
                    </div>
                  )}

                  {/* Khung Zoom đồng bộ 1:1 cho cả Video lẫn Bounding Box AI & Virtual ROI (Không bị cắt chân ROI) */}
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 'calc((66vh) * 16 / 9)',
                    maxHeight: '66vh',
                    aspectRatio: '16 / 9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${ptzZoom})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease-out'
                  }}>
                    <video
                      ref={spotlightVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: 'block'
                      }}
                    />


                    {/* LỚP PHỦ AI BÁM BIỂN SỐ SVG + HTML (DECOUPLED OVERLAY - ZERO LAG) */}
                    {showSpotlightAi && !spotlightLoading && !spotlightError && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        zIndex: 3,
                        overflow: 'hidden'
                      }}>
                        {/* 1. Vẽ Khung ảo Virtual ROI bằng SVG */}
                        {spotlightRoi.length >= 3 && (
                          <>
                            <svg
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                            >
                              <polygon
                                points={spotlightRoi.map(([rx, ry]) => `${(rx * 100).toFixed(2)},${(ry * 100).toFixed(2)}`).join(' ')}
                                fill={spotlightActiveInRoi ? 'rgba(34, 197, 94, 0.12)' : 'rgba(56, 189, 248, 0.08)'}
                                stroke={spotlightActiveInRoi ? '#22C55E' : '#38BDF8'}
                                strokeWidth="0.6"
                                strokeDasharray="2 1.5"
                              />
                            </svg>
                            <div style={{
                              position: 'absolute',
                              left: `${spotlightRoi[0][0] * 100}%`,
                              top: `${Math.max(2, spotlightRoi[0][1] * 100 - 4.5)}%`,
                              background: spotlightActiveInRoi ? 'rgba(34, 197, 94, 0.25)' : 'rgba(56, 189, 248, 0.25)',
                              border: `1px solid ${spotlightActiveInRoi ? '#22C55E' : '#38BDF8'}`,
                              borderRadius: '4px',
                              padding: '2px 8px',
                              color: spotlightActiveInRoi ? '#4ADE80' : '#38BDF8',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              letterSpacing: '0.5px',
                              backdropFilter: 'blur(4px)',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.6)'
                            }}>
                              {spotlightActiveInRoi ? '● VÙNG NHẬN DIỆN XE (ROI) - ĐÃ PHÁT HIỆN XE' : '◌ VÙNG NHẬN DIỆN XE (ROI)'}
                            </div>
                          </>
                        )}

                        {/* 2. Vẽ từng khung xe / biển số / khuôn mặt / vi phạm an toàn đang bám (V2.0 Decoupled Client Canvas/SVG) */}
                        {spotlightTracks
                          .filter((trk) => {
                            const isPerson = Boolean(trk.module === 'FACE_ID' || trk.personName || trk.vehicleType === 'PERSON');
                            if (isPerson && moduleMode !== 'FACE') return false;
                            // Bám khung mọi vật thể trong camera, khi vào ROI sẽ chuyển trạng thái đón xe
                            return true;
                          })
                          .map((trk) => {
                            const box = trk.vehicleBbox || trk.bbox;
                            if (!box) return null;
                            const [bx1, by1, bx2, by2] = box;
                            const leftPct = (bx1 / spotlightFrameDim.w) * 100;
                            const topPct = (by1 / spotlightFrameDim.h) * 100;
                            const widthPct = ((bx2 - bx1) / spotlightFrameDim.w) * 100;
                            const heightPct = ((by2 - by1) / spotlightFrameDim.h) * 100;

                            const isSafety = Boolean(trk.isViolation || trk.module === 'SAFETY_PPE' || trk.module === 'FIRE_DETECT');
                            const isPerson = Boolean(trk.module === 'FACE_ID' || trk.personName);
                            const isMoto = trk.vehicleType === 'MOTO';
                            const hasPlate = Boolean(trk.plate && trk.plate.trim());

                            let borderColor = '#94A3B8';
                            let shadowGlow = '0 0 8px rgba(148, 163, 184, 0.45)';
                            let labelText = 'MỤC TIÊU';
                            let labelBg = 'rgba(15, 23, 42, 0.88)';
                            let labelColor = '#38BDF8';

                            if (isSafety) {
                              borderColor = '#EF4444';
                              shadowGlow = '0 0 16px rgba(239, 68, 68, 0.85)';
                              labelText = trk.label || (trk.module === 'FIRE_DETECT' ? 'PHÁT HIỆN LỬA / KHÓI' : 'KHÔNG MŨ BẢO HỘ');
                              labelBg = 'rgba(239, 68, 68, 0.9)';
                              labelColor = '#FFFFFF';
                            } else if (isPerson) {
                              borderColor = trk.personName ? '#06B6D4' : '#F59E0B';
                              shadowGlow = '0 0 16px rgba(6, 182, 212, 0.7)';
                              labelText = trk.personName ? trk.personName : 'Khách lạ';
                              labelBg = 'rgba(15, 23, 42, 0.95)';
                              labelColor = '#67E8F9';
                            } else if (isMoto) {
                              borderColor = '#00FF00';
                              shadowGlow = hasPlate ? '0 0 10px rgba(0, 255, 0, 0.6)' : 'none';
                              labelText = hasPlate ? `#${trk.trackId} ${trk.plate}` : `#${trk.trackId} MOTO`;
                              labelBg = 'rgba(0, 0, 0, 0.90)';
                              labelColor = '#00FF00';
                            } else {
                              borderColor = '#00FF00';
                              shadowGlow = hasPlate ? '0 0 10px rgba(0, 255, 0, 0.6)' : 'none';
                              const rawType = trk.vehicleType === 'TRUCK' ? 'TRUCK' : (trk.vehicleType === 'BUS' ? 'BUS' : 'CAR');
                              labelText = hasPlate ? `#${trk.trackId} ${trk.plate}` : `#${trk.trackId} ${rawType}`;
                              labelBg = 'rgba(0, 0, 0, 0.90)';
                              labelColor = '#00FF00';
                            }

                            return (
                              <div
                                key={trk.trackId}
                                style={{
                                  position: 'absolute',
                                  left: `${leftPct}%`,
                                  top: `${topPct}%`,
                                  width: `${widthPct}%`,
                                  height: `${heightPct}%`,
                                  border: `1.5px solid ${borderColor}`,
                                  borderRadius: '2px',
                                  boxShadow: shadowGlow,
                                  pointerEvents: 'none',
                                  willChange: 'left, top, width, height'
                                }}
                              >
                                {/* 4 Góc Target Crosshairs */}
                                <div style={{ position: 'absolute', top: -2, left: -2, width: 8, height: 8, borderTop: `3px solid ${borderColor}`, borderLeft: `3px solid ${borderColor}` }} />
                                <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderTop: `3px solid ${borderColor}`, borderRight: `3px solid ${borderColor}` }} />
                                <div style={{ position: 'absolute', bottom: -2, left: -2, width: 8, height: 8, borderBottom: `3px solid ${borderColor}`, borderLeft: `3px solid ${borderColor}` }} />
                                <div style={{ position: 'absolute', bottom: -2, right: -2, width: 8, height: 8, borderBottom: `3px solid ${borderColor}`, borderRight: `3px solid ${borderColor}` }} />

                                {/* Nhãn thông tin đối tượng và độ tin cậy */}
                                <div style={{
                                  position: 'absolute',
                                  bottom: 'calc(100% + 4px)',
                                  left: 0,
                                  background: labelBg,
                                  border: `1px solid ${borderColor}`,
                                  backdropFilter: 'blur(4px)',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  whiteSpace: 'nowrap',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.6)'
                                }}>
                                  <span style={{ color: isSafety ? '#FEE2E2' : '#94A3B8', fontSize: '10.5px', fontFamily: 'monospace' }}>
                                    #{trk.trackId}
                                  </span>
                                  {isSafety && <IconShield size={12} color={labelColor} />}
                                  {isPerson && <IconUser size={12} color={labelColor} />}
                                  <span style={{
                                    color: labelColor,
                                    fontWeight: 700,
                                    fontSize: '12.5px',
                                    fontFamily: isPerson ? 'inherit' : 'monospace',
                                    letterSpacing: isPerson ? 'normal' : '0.5px'
                                  }}>
                                    {labelText}
                                  </span>
                                  <span style={{
                                    background: isSafety ? 'rgba(0,0,0,0.3)' : hasPlate ? 'rgba(34, 197, 94, 0.25)' : 'rgba(56, 189, 248, 0.25)',
                                    color: isSafety ? '#FFF' : hasPlate ? '#86EFAC' : '#7DD3FC',
                                    fontSize: '10.5px',
                                    fontWeight: 600,
                                    padding: '1px 5px',
                                    borderRadius: '3px'
                                  }}>
                                    {trk.confidence.toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            );
                          })}

                        {/* HUD AI Mini Status ở góc dưới */}
                        {spotlightAiConnected && (
                          <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            right: '12px',
                            background: 'rgba(15, 23, 42, 0.88)',
                            backdropFilter: 'blur(6px)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: '#38BDF8',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                          }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
                            <span>AI ENGINE: {spotlightAiFps > 0 ? `${spotlightAiFps} FPS` : 'HOẠT ĐỘNG'}</span>
                            <span>•</span>
                            <span style={{ color: spotlightActiveInRoi ? '#4ADE80' : '#94A3B8' }}>
                              {spotlightActiveInRoi ? 'XE TRONG VÙNG ROI' : 'ĐANG QUAN SÁT'}
                            </span>
                            {ptzZoom > 1 && (
                              <>
                                <span>•</span>
                                <span style={{ color: '#F59E0B' }}>ZOOM {ptzZoom.toFixed(1)}x</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer PTZ & Snapshot Control Hub */}
                <div style={{
                  padding: '10px 18px',
                  backgroundColor: '#111827',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid #1E293B',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  {/* Cụm điều khiển PTZ & Zoom */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* D-Pad Controller */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#0B0F17', padding: '3px 6px', borderRadius: '8px', border: '1px solid #1E293B' }}>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginRight: '4px' }}>PTZ:</span>
                      <button
                        onClick={() => handlePtz('UP')}
                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.1s' }}
                        title="Xoay camera lên trên"
                      >
                        <IconArrowUp size={13} color="#CBD5E1" />
                      </button>
                      <button
                        onClick={() => handlePtz('DOWN')}
                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.1s' }}
                        title="Xoay camera xuống dưới"
                      >
                        <IconArrowDown size={13} color="#CBD5E1" />
                      </button>
                      <button
                        onClick={() => handlePtz('LEFT')}
                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.1s' }}
                        title="Xoay camera sang trái"
                      >
                        <IconArrowLeft size={13} color="#CBD5E1" />
                      </button>
                      <button
                        onClick={() => handlePtz('RIGHT')}
                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.1s' }}
                        title="Xoay camera sang phải"
                      >
                        <IconArrowRight size={13} color="#CBD5E1" />
                      </button>
                    </div>

                    {/* Digital Stepper Zoom */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#0B0F17', padding: '3px 6px', borderRadius: '8px', border: '1px solid #1E293B' }}>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginRight: '4px' }}>Zoom:</span>
                      <button
                        onClick={() => setPtzZoom((z) => Math.max(1.0, Number((z - 0.25).toFixed(2))))}
                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0284C7', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        title="Thu nhỏ (-0.25x)"
                      >
                        <IconZoomOut size={13} color="#FFF" />
                      </button>
                      <span style={{ minWidth: '46px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#38BDF8', fontFamily: 'monospace' }}>
                        {ptzZoom.toFixed(2)}x
                      </span>
                      <button
                        onClick={() => setPtzZoom((z) => Math.min(3.0, Number((z + 0.25).toFixed(2))))}
                        style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0284C7', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        title="Phóng to (+0.25x)"
                      >
                        <IconZoomIn size={13} color="#FFF" />
                      </button>
                      <button
                        onClick={() => setPtzZoom(1)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#1E293B', border: '1px solid #334155', color: '#94A3B8', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, marginLeft: '4px' }}
                        title="Đặt lại mức thu phóng ban đầu"
                      >
                        <IconReset size={11} color="#94A3B8" />
                        <span>1.0x</span>
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons: Xem & Tải Snapshot */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => handleDownloadImage(
                        `${apiBaseUrl}${spotlightCamera.snapshotApiUrl || `/api/cameras/${spotlightCamera.id}/snapshot`}`,
                        `snapshot_camera_${spotlightCamera.id}_${Date.now()}.jpg`
                      )}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 13px',
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        color: '#38BDF8',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Tải ảnh chụp độ phân giải gốc của camera về máy tính"
                    >
                      <IconDownload size={14} color="#38BDF8" />
                      <span>Tải Snapshot</span>
                    </button>

                    <button
                      onClick={() => window.open(`${apiBaseUrl}${spotlightCamera.snapshotApiUrl || `/api/cameras/${spotlightCamera.id}/snapshot`}`, '_blank')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        backgroundColor: '#0284C7',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
                        transition: 'all 0.15s ease'
                      }}
                      title="Mở ảnh snapshot độ phân giải cao trong tab mới"
                    >
                      <IconSnapshot size={14} color="#FFF" />
                      <span>Xem Snapshot HD</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN (30%): Live Snapshot Cards Feed (V2.0 Standard) */}
              <div style={{
                width: '340px',
                flexShrink: 0,
                backgroundColor: '#0F172A',
                display: 'flex',
                flexDirection: 'column',
                borderLeft: '1px solid #1E293B'
              }}>
                {/* Sidebar Header */}
                <div style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid #1E293B',
                  backgroundColor: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <IconCamera size={14} color="#38BDF8" /> ẢNH CHỤP SỰ KIỆN AI
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: '#0284C7',
                      color: '#FFF',
                      padding: '1px 7px',
                      borderRadius: '10px'
                    }}>
                      {filteredSpotlightDetections.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#22C55E', fontWeight: 700 }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
                    <span>Realtime Feed</span>
                  </div>
                </div>

                {/* Bộ Lọc Nhanh Phân Loại: Tất cả | Ô tô | Xe máy | Người | An Toàn (V2.0 Standard) */}
                <div style={{
                  display: 'flex',
                  padding: '8px 10px',
                  backgroundColor: '#0B0F17',
                  borderBottom: '1px solid #1E293B',
                  gap: '4px'
                }}>
                  {[
                    { id: 'ALL', label: 'Tất cả', icon: null },
                    { id: 'CAR', label: 'Ô tô', icon: <IconCar size={11} /> },
                    { id: 'MOTO', label: 'Xe máy', icon: <IconMoto size={11} /> },
                    { id: 'PERSON', label: 'Người', icon: <IconUser size={11} /> },
                    { id: 'SAFETY', label: 'An toàn', icon: <IconShield size={11} /> }
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => setSpotlightFilter(btn.id as any)}
                      style={{
                        flex: 1,
                        padding: '5px 4px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        backgroundColor: spotlightFilter === btn.id ? (btn.id === 'SAFETY' ? '#DC2626' : '#0284C7') : '#1E293B',
                        color: spotlightFilter === btn.id ? '#FFFFFF' : '#94A3B8',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {btn.icon}
                      <span>{btn.label}</span>
                    </button>
                  ))}
                </div>

                {/* Cards List */}
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  {filteredSpotlightDetections.length === 0 ? (
                    <div style={{
                      padding: '40px 14px',
                      textAlign: 'center',
                      color: '#64748B',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <IconTarget size={28} color="#475569" />
                      <span style={{ fontWeight: 600, color: '#94A3B8' }}>
                        {spotlightFilter === 'CAR' ? 'Chưa có xe Ô tô nào đi qua...' : spotlightFilter === 'MOTO' ? 'Chưa có Xe máy nào đi qua...' : spotlightFilter === 'PERSON' ? 'Chưa ghi nhận lượt người nào...' : spotlightFilter === 'SAFETY' ? 'Không có cảnh báo an toàn nào!' : 'Đang chờ đối tượng đi vào vùng nhận diện...'}
                      </span>
                      <span style={{ fontSize: '10.5px', color: '#475569', lineHeight: 1.4 }}>
                        Khi đối tượng xuất hiện và chốt nhận diện, ảnh crop cận cảnh sẽ lập tức xuất hiện tại đây.
                      </span>
                    </div>
                  ) : (
                    filteredSpotlightDetections.map((det, idx) => {
                      const hasPlate = Boolean(det.plateNumber && det.plateNumber.trim());
                      const cropImg = det.plateCropUrl || det.snapshotUrl;
                      const isSafety = Boolean((det as any).isViolation || det.note?.includes('Vi phạm') || det.note?.includes('bảo hộ') || (det as any).module === 'SAFETY_PPE' || (det as any).module === 'FIRE_DETECT');
                      const isPerson = !isSafety && Boolean((det as any).personName || det.note?.includes('Person'));
                      const isMoto = !isSafety && !isPerson && det.vehicleType === 'MOTO';

                      return (
                        <div
                          key={`spotlight-det-${det.id || 'item'}-${idx}`}
                          style={{
                            backgroundColor: isSafety ? '#1C1318' : '#1E293B',
                            border: isSafety
                              ? '1.5px solid #EF4444'
                              : isPerson
                                ? '1.5px solid #7C3AED'
                                : isMoto
                                  ? '1.5px solid #D97706'
                                  : '1.5px solid #0284C7',
                            borderRadius: '8px',
                            padding: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            boxShadow: isSafety ? '0 2px 12px rgba(239, 68, 68, 0.25)' : '0 2px 8px rgba(0,0,0,0.3)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {/* Image Crop */}
                          {cropImg && (
                            <div
                              onClick={() => setSelectedDetection(det)}
                              style={{
                                width: '100%',
                                height: '56px',
                                backgroundColor: '#090D16',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                border: `1px solid ${isSafety ? '#7F1D1D' : '#334155'}`
                              }}
                              title="Bấm để xem ảnh toàn cảnh phóng to"
                            >
                              <img
                                src={cropImg}
                                alt="Ảnh trích xuất AI"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  objectFit: 'contain'
                                }}
                                loading="lazy"
                              />
                            </div>
                          )}

                          {/* Data Row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{
                                fontSize: '14.5px',
                                fontWeight: 800,
                                color: isSafety ? '#FCA5A5' : isPerson ? '#DDD6FE' : isMoto ? '#FBBF24' : '#4ADE80',
                                fontFamily: isPerson || isSafety ? 'inherit' : 'monospace',
                                letterSpacing: isPerson || isSafety ? 'normal' : '0.5px'
                              }}>
                                {isSafety
                                  ? ((det as any).label || det.note || 'CẢNH BÁO AN TOÀN')
                                  : isPerson
                                    ? ((det as any).personName || 'Nguyễn Văn A')
                                    : hasPlate
                                      ? det.plateNumber
                                      : 'MỤC TIÊU NHẬN DIỆN'}
                              </div>
                              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                  fontWeight: 600,
                                  color: isSafety ? '#F87171' : isPerson ? '#A78BFA' : isMoto ? '#FBBF24' : '#38BDF8',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}>
                                  {isSafety ? <IconShield size={11} color="#F87171" /> : isPerson ? <IconUser size={11} color="#A78BFA" /> : isMoto ? <IconMoto size={11} color="#FBBF24" /> : <IconCar size={11} color="#38BDF8" />}
                                  <span>{isSafety ? 'Vi phạm PPE' : isPerson ? 'Nhân viên' : isMoto ? 'Xe máy' : 'Ô tô'}</span>
                                </span>
                                <span>•</span>
                                <span>{det.detectedAt ? new Date(det.detectedAt).toLocaleTimeString('vi-VN') : 'Vừa xong'}</span>
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 800,
                                backgroundColor: isSafety ? 'rgba(239, 68, 68, 0.25)' : isPerson ? 'rgba(124, 58, 237, 0.2)' : isMoto ? 'rgba(217, 119, 6, 0.2)' : 'rgba(34, 197, 94, 0.18)',
                                color: isSafety ? '#FCA5A5' : isPerson ? '#C4B5FD' : isMoto ? '#FBBF24' : '#4ADE80',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                border: `1px solid ${isSafety ? 'rgba(239, 68, 68, 0.5)' : isPerson ? 'rgba(124, 58, 237, 0.4)' : isMoto ? 'rgba(217, 119, 6, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`
                              }}>
                                {det.confidence ? `${Math.round(det.confidence)}%` : '96%'}
                              </span>
                            </div>
                          </div>

                          {/* Specialized Action Buttons (V2.0 Standard Section 3) */}
                          {isSafety ? (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                              <button
                                onClick={() => alert(`Đã ghi nhận xác nhận vi phạm cho sự kiện #${det.id}`)}
                                style={{
                                  flex: 1,
                                  padding: '5px 4px',
                                  backgroundColor: '#DC2626',
                                  color: '#FFF',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px'
                                }}
                              >
                                <IconCheck size={12} color="#FFF" />
                                <span>Xác nhận vi phạm</span>
                              </button>
                              <button
                                onClick={() => alert(`Đã đánh dấu báo động giả cho sự kiện #${det.id}`)}
                                style={{
                                  flex: 1,
                                  padding: '5px 4px',
                                  backgroundColor: '#334155',
                                  color: '#CBD5E1',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px'
                                }}
                              >
                                <IconClose size={12} color="#CBD5E1" />
                                <span>Báo động giả</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSelectedDetection(det)}
                              style={{
                                width: '100%',
                                padding: '5px',
                                backgroundColor: '#0F172A',
                                border: '1px solid #334155',
                                color: '#38BDF8',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                transition: 'all 0.12s'
                              }}
                            >
                              <IconSearch size={12} color="#38BDF8" />
                              <span>Xem ảnh toàn cảnh</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CẤU HÌNH VÙNG KHUNG ẢO (VIRTUAL ROI) CHO SPOTLIGHT CAMERA */}
      {showSpotlightRoiModal && spotlightCamera && (
        <RoiConfigModal
          isOpen={showSpotlightRoiModal}
          onClose={() => setShowSpotlightRoiModal(false)}
          camera={spotlightCamera}
          initialRoi={spotlightRoi}
          onSaveSuccess={(newRoi) => {
            setAiByCamera((prev) => ({
              ...prev,
              [spotlightCamera.id]: {
                ...(prev[spotlightCamera.id] || { tracks: [] }),
                roi: newRoi
              }
            }));
          }}
          aiApiBaseUrl={effectiveAiApiBaseUrl}
        />
      )}

      {/* MODAL SOI CHI TIẾT SỰ KIỆN & TẢI ẢNH (INSPECTOR LIGHTBOX) */}
      {selectedDetection && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '12px',
            width: '92vw',
            maxWidth: '960px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)'
          }}>
            {/* Header */}
            {(() => {
              const isPerson = Boolean((selectedDetection as any).personName || selectedDetection.note?.includes('Person') || (selectedDetection.vehicleType || '').toUpperCase() === 'PERSON' || (selectedDetection as any).module === 'FACE_ID' || (selectedDetection as any).eventType === 'FACE_RECOGNITION');
              const personName = (selectedDetection as any).personName;
              const isMoto = !isPerson && selectedDetection.vehicleType === 'MOTO';
              const isTruck = !isPerson && selectedDetection.vehicleType === 'TRUCK';

              return (
                <>
                  <div style={{ padding: '14px 20px', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <IconSnapshot size={18} color="#0284C7" />
                        <span>{isPerson ? 'Chi Tiết Kiểm Soát Người & Nhận Diện Khuôn Mặt' : 'Chi Tiết Sự Kiện Nhận Diện Xe & Biển Số'}</span>
                        <span style={{
                          backgroundColor: isPerson ? '#F5F3FF' : '#EFF6FF',
                          border: `1px solid ${isPerson ? '#DDD6FE' : '#BFDBFE'}`,
                          color: isPerson ? '#7C3AED' : '#1D4ED8',
                          padding: '2px 10px',
                          borderRadius: '6px',
                          fontFamily: isPerson ? 'inherit' : 'monospace',
                          fontWeight: 800,
                          letterSpacing: isPerson ? 'normal' : '0.8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          {isPerson && <IconUser size={14} color="#7C3AED" />}
                          <span>{isPerson ? (personName || selectedDetection.plateNumber || 'Người đi bộ') : (selectedDetection.plateNumber || 'CHƯA RÕ BIỂN')}</span>
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                        Mã bản ghi: {selectedDetection.id} • Thời gian: {formatDetectionTime(selectedDetection.detectedAt, selectedDetection.timestamp)}
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedDetection(null)}
                      style={{
                        backgroundColor: '#EF4444',
                        border: 'none',
                        color: '#FFF',
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                      title="Đóng cửa sổ chi tiết"
                    >
                      <IconClose size={16} color="#FFF" />
                    </button>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '20px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '20px' }}>
                    {/* Cột trái: Ảnh Toàn Cảnh */}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <IconCamera size={14} color="#0284C7" />
                          <span>Ảnh Toàn Cảnh (Snapshot)</span>
                        </span>
                        {selectedDetection.snapshotUrl && (
                          <button
                            onClick={() => handleDownloadImage(selectedDetection.snapshotUrl!, `snapshot_${selectedDetection.plateNumber || 'target'}.jpg`)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '5px 12px',
                              backgroundColor: '#0284C7',
                              color: '#FFF',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            <IconDownload size={13} color="#FFF" />
                            <span>Tải Ảnh Gốc</span>
                          </button>
                        )}
                      </div>
                      <div style={{ backgroundColor: '#0F172A', borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedDetection.snapshotUrl ? (
                          <SnapshotImage
                            src={selectedDetection.snapshotUrl}
                            alt="Full Snapshot"
                            fallbackText="Không có ảnh snapshot"
                            style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block' }}
                          />
                        ) : (
                          <span style={{ color: '#94A3B8' }}>Không có ảnh snapshot</span>
                        )}
                      </div>
                    </div>

                    {/* Cột phải: Ảnh Cắt Biển Số / Mặt & Thông Số AI */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Ảnh cắt */}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <IconTarget size={14} color={isPerson ? '#7C3AED' : '#16A34A'} />
                            <span>{isPerson ? 'Ảnh Cắt Khuôn Mặt (Face Crop)' : 'Ảnh Cắt Cận Cảnh Biển Số (VietOCR)'}</span>
                          </span>
                          {selectedDetection.plateCropUrl && (
                            <button
                              onClick={() => handleDownloadImage(selectedDetection.plateCropUrl!, `crop_${selectedDetection.plateNumber || 'crop'}.jpg`)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '5px 12px',
                                backgroundColor: isPerson ? '#7C3AED' : '#10B981',
                                color: '#FFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              <IconDownload size={13} color="#FFF" />
                              <span>Tải Ảnh Cắt</span>
                            </button>
                          )}
                        </div>
                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '12px', border: `1.5px solid ${isPerson ? '#7C3AED' : '#0284C7'}`, textAlign: 'center', minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selectedDetection.plateCropUrl ? (
                            <SnapshotImage
                              src={selectedDetection.plateCropUrl}
                              alt="Crop"
                              fallbackText={isPerson ? 'Chưa có ảnh cắt khuôn mặt' : 'Chưa có ảnh cắt biển số'}
                              style={{ maxHeight: '90px', maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                            />
                          ) : (
                            <span style={{ color: '#94A3B8', fontSize: '12px' }}>{isPerson ? 'Chưa có ảnh cắt khuôn mặt' : 'Chưa có ảnh cắt biển số'}</span>
                          )}
                        </div>
                      </div>

                      {/* Bảng thông số chi tiết */}
                      <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '14px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0284C7', marginBottom: '10px' }}>
                          THÔNG SỐ NHẬN DIỆN AI
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                          <div>
                            <span style={{ color: '#64748B' }}>{isPerson ? 'Họ tên đối tượng:' : 'Biển số nhận diện:'}</span>
                            <div style={{ fontWeight: 800, color: isPerson ? '#7C3AED' : '#1D4ED8', fontSize: '15px', fontFamily: isPerson ? 'inherit' : 'monospace', marginTop: '2px' }}>
                              {isPerson ? (personName || selectedDetection.plateNumber || 'Người đi bộ') : (selectedDetection.plateNumber || 'CHƯA RÕ')}
                            </div>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Độ tin cậy:</span>
                            <div style={{ fontWeight: 700, color: '#16A34A', fontSize: '14px', marginTop: '2px' }}>
                              {selectedDetection.confidence ? Math.round(selectedDetection.confidence) : 92}%
                            </div>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Phân loại đối tượng:</span>
                            <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              {isPerson ? (
                                <>
                                  <IconUser size={13} color="#7C3AED" />
                                  <span>Người / FaceID</span>
                                </>
                              ) : isMoto ? (
                                <>
                                  <IconMoto size={13} color="#059669" />
                                  <span>Xe Máy</span>
                                </>
                              ) : isTruck ? (
                                <>
                                  <IconTruck size={13} color="#C2410C" />
                                  <span>Xe Tải</span>
                                </>
                              ) : (
                                <>
                                  <IconCar size={13} color="#0284C7" />
                                  <span>Xe Ô Tô</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Camera ghi hình:</span>
                            <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                              {selectedDetection.gateName || selectedDetection.cameraName || (selectedDetection.cameraId ? `Camera #${selectedDetection.cameraId}` : 'Cổng chính')}
                            </div>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Trạng thái vé / Thẻ:</span>
                            <div style={{ fontWeight: 600, color: '#16A34A', marginTop: '2px' }}>
                              {selectedDetection.status || 'HỢP LỆ'}
                            </div>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Mã định danh (Code):</span>
                            <div style={{ fontFamily: 'monospace', color: '#D97706', fontWeight: 600, marginTop: '2px' }}>
                              {selectedDetection.ticketCode || 'ID-AUTO'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Footer */}
            <div style={{ padding: '12px 20px', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0' }}>
              <button
                onClick={() => setSelectedDetection(null)}
                style={{ padding: '7px 18px', backgroundColor: '#E2E8F0', color: '#334155', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}



      {/* MODAL IMPORT EXCEL HÀNG LOẠT VÀO DATABASE */}
      {showImportModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#1E242E',
            border: '2px solid #0284C7',
            borderRadius: '12px',
            width: '90vw',
            maxWidth: '800px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '14px 20px', backgroundColor: '#11161D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IconUpload size={17} color="#38BDF8" />
                <span>Nhập Danh Sách Camera & Địa Điểm Vào Database PostgreSQL</span>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px'
                }}
                title="Đóng cửa sổ"
              >
                <IconClose size={16} color="#94A3B8" />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button
                  onClick={() => setImportMode('FILE')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    backgroundColor: importMode === 'FILE' ? '#0284C7' : '#11161D',
                    color: '#FFF',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px'
                  }}
                >
                  <IconFileSpreadsheet size={15} color="#FFF" />
                  <span>Tải Lên File Excel (.csv, .xlsx)</span>
                </button>
                <button
                  onClick={() => setImportMode('PASTE')}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    backgroundColor: importMode === 'PASTE' ? '#0284C7' : '#11161D',
                    color: '#FFF',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px'
                  }}
                >
                  <IconTable size={15} color="#FFF" />
                  <span>Dán Bảng Tính (Ctrl + V)</span>
                </button>
              </div>

              {importMode === 'FILE' ? (
                <div style={{ border: '2px dashed #0284C7', borderRadius: '8px', padding: '24px', textAlign: 'center', backgroundColor: 'rgba(2, 132, 199, 0.05)' }}>
                  <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} id="import-file" style={{ display: 'none' }} />
                  <label htmlFor="import-file" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#0284C7', color: '#FFF', padding: '9px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                    <IconUpload size={15} color="#FFF" />
                    <span>Chọn file CSV / Excel từ máy tính</span>
                  </label>
                  <div style={{ marginTop: '10px' }}>
                    <button onClick={downloadTemplate} style={{ background: 'none', border: 'none', color: '#38BDF8', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' }}>
                      Tải file mẫu tại đây
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    rows={5}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Quét chọn các dòng trong Excel -> Bấm Ctrl + C -> Dán vào đây..."
                    style={{ width: '100%', padding: '10px', backgroundColor: '#11161D', border: '1px solid #334155', color: '#FFF', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}
                  />
                  <div style={{ textAlign: 'right', marginTop: '6px' }}>
                    <button onClick={handlePasteParse} style={{ padding: '6px 14px', backgroundColor: '#0284C7', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                      Phân Tích
                    </button>
                  </div>
                </div>
              )}

              {importError && (
                <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#F87171', borderRadius: '4px', fontSize: '12px' }}>
                  {importError}
                </div>
              )}

              {/* Bảng Preview */}
              {importPreviewList.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#34D399', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <IconCheck size={15} color="#34D399" />
                    <span>Sẵn sàng lưu {importPreviewList.length} camera vào Database:</span>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #334155', borderRadius: '4px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                      <thead style={{ backgroundColor: '#0B0F17', color: '#94A3B8' }}>
                        <tr>
                          <th style={{ padding: '6px 10px' }}>STT</th>
                          <th style={{ padding: '6px 10px' }}>Tên Camera</th>
                          <th style={{ padding: '6px 10px' }}>IP</th>
                          <th style={{ padding: '6px 10px' }}>Địa Điểm (Location)</th>
                          <th style={{ padding: '6px 10px' }}>Cổng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewList.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #283242' }}>
                            <td style={{ padding: '6px 10px' }}>{idx + 1}</td>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{item.name}</td>
                            <td style={{ padding: '6px 10px', color: '#FDE047', fontFamily: 'monospace' }}>{item.ipAddress}</td>
                            <td style={{ padding: '6px 10px', color: '#38BDF8' }}>{item.location}</td>
                            <td style={{ padding: '6px 10px' }}>{item.rtspPort}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importProgress && (
                <div style={{ marginTop: '16px', textAlign: 'center', color: '#38BDF8', fontSize: '13px', fontWeight: 600 }}>
                  Đang lưu dữ liệu vào Database: {importProgress.current} / {importProgress.total} camera...
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', backgroundColor: '#11161D', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowImportModal(false)}
                disabled={Boolean(importProgress)}
                style={{ padding: '6px 14px', backgroundColor: '#334155', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Hủy
              </button>
              <button
                onClick={handleExecuteImportToDb}
                disabled={importPreviewList.length === 0 || Boolean(importProgress)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 18px',
                  backgroundColor: importPreviewList.length > 0 ? '#10B981' : '#475569',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: importPreviewList.length > 0 ? 'pointer' : 'not-allowed'
                }}
              >
                <IconCheck size={14} color="#FFF" />
                <span>Xác Nhận Lưu {importPreviewList.length} Camera Vào Database</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÊM / SỬA CAMERA VÀO DATABASE (LIGHT THEME) */}
      {showAddEditModal && editingCamera && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1.5px solid #CBD5E1',
            borderRadius: '16px',
            width: '90vw',
            maxWidth: '520px',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)'
          }}>
            <div style={{ padding: '16px 20px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0F172A', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editingCamera.id ? (
                  <>
                    <IconEdit size={18} color="#0284C7" />
                    <span>Cấu Hình & Sửa Camera DB (#{editingCamera.id})</span>
                  </>
                ) : (
                  <>
                    <IconPlus size={18} color="#059669" />
                    <span>Thêm Camera Mới Vào Database</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setShowAddEditModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px'
                }}
                title="Đóng cửa sổ"
              >
                <IconClose size={18} color="#475569" />
              </button>
            </div>

            <form onSubmit={handleSaveAddEditModal} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>Tên Camera (*)</label>
                <input
                  type="text"
                  required
                  value={editingCamera.name || ''}
                  onChange={(e) => setEditingCamera({ ...editingCamera, name: e.target.value })}
                  placeholder="VD: Camera Cổng Chính 01"
                  style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>Địa Chỉ IP (*)</label>
                <input
                  type="text"
                  required
                  value={editingCamera.ipAddress || ''}
                  onChange={(e) => setEditingCamera({ ...editingCamera, ipAddress: e.target.value })}
                  placeholder="192.168.1.100"
                  style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', fontFamily: 'monospace', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>Địa Điểm / Khu Vực (Location)</label>
                <input
                  type="text"
                  value={editingCamera.location || ''}
                  onChange={(e) => setEditingCamera({ ...editingCamera, location: e.target.value })}
                  placeholder="VD: Ngã tư Trần Phú, Cổng chính..."
                  style={{ width: '100%', padding: '9px 12px', backgroundColor: '#EFF6FF', border: '1.5px solid #93C5FD', color: '#1D4ED8', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>Cổng RTSP</label>
                  <input
                    type="number"
                    value={editingCamera.rtspPort || 554}
                    onChange={(e) => setEditingCamera({ ...editingCamera, rtspPort: parseInt(e.target.value, 10) || 554 })}
                    style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>Cổng ONVIF</label>
                  <input
                    type="number"
                    value={editingCamera.onvifPort || 80}
                    onChange={(e) => setEditingCamera({ ...editingCamera, onvifPort: parseInt(e.target.value, 10) || 80 })}
                    style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
                  Luồng Phụ RTSP Sub-stream (Dành riêng cho AI)
                </label>
                <input
                  type="text"
                  value={editingCamera.rtspSubStreamUrl || ''}
                  onChange={(e) => setEditingCamera({ ...editingCamera, rtspSubStreamUrl: e.target.value })}
                  placeholder="VD: rtsp://192.168.1.100:554/subStream/1"
                  style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', fontFamily: 'monospace', borderRadius: '8px', fontSize: '12px', outline: 'none' }}
                />
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '3px', display: 'block' }}>
                  Luồng phụ độ phân giải thấp (640x360 hoặc 720p) giúp giải nén siêu nhẹ, tiết kiệm 80% RAM/GPU.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F1F5F9',
                    border: '1.5px solid #CBD5E1',
                    color: '#334155',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: 700
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingDb}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 20px',
                    backgroundColor: '#0284C7',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: isSavingDb ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)'
                  }}
                >
                  <IconCheck size={14} color="#FFF" />
                  <span>{isSavingDb ? 'Đang lưu DB...' : 'Lưu Vào Database'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL CẤU HÌNH MODULE AI & SUB-STREAM CHO CAMERA */}
      {aiConfigCamera && (
        <CameraAiConfigModal
          apiBaseUrl={apiBaseUrl}
          camera={aiConfigCamera}
          onClose={() => setAiConfigCamera(null)}
          onSaved={loadCamerasFromDb}
        />
      )}
    </div>
  );
};

export default SurveillanceSystem;
