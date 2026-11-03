import { useState, useRef, useEffect, useMemo, type FC } from 'react';
import type { CameraDto } from '../../device-manager/types';
import type { CameraAiMetadata, ModuleMode } from '../types';
import { useAiTracking } from '../../../core/hooks/useAiTracking';
import {
  IconClose,
  IconTarget,
  IconPolygon,
  IconZoomIn,
  IconZoomOut,
  IconReset,
  IconArrowUp,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconCar,
  IconRefresh
} from '../../../components/SurveillanceIcons';
import { resolveWebRtcUrl, getBackendBaseUrl } from '../../../shared/utils/envConfig';

export interface SpotlightDrawerProps {
  camera: CameraDto | null;
  onClose: () => void;
  apiBaseUrl?: string;
  aiApiBaseUrl?: string;
  moduleMode?: ModuleMode;
  aiData?: CameraAiMetadata;
  detections?: any[];
  initialRoi?: [number, number][];
  onConfigureRoi?: (camera: CameraDto) => void;
  onSelectDetection?: (detection: any) => void;
}

export const SpotlightDrawer: FC<SpotlightDrawerProps> = ({
  camera,
  onClose,
  apiBaseUrl = getBackendBaseUrl(),
  aiApiBaseUrl = 'http://localhost:5000',
  moduleMode = 'VEHICLE',
  aiData,
  detections = [],
  initialRoi,
  onConfigureRoi,
  onSelectDetection
}) => {
  const [showAiOverlay, setShowAiOverlay] = useState<boolean>(true);
  const [ptzZoom, setPtzZoom] = useState<number>(1.0);
  const [spotlightFilter, setSpotlightFilter] = useState<'ALL' | 'CAR' | 'MOTO' | 'PERSON' | 'SAFETY'>('ALL');

  // Đăng ký trực tiếp luồng SSE AI cho camera này để cập nhật toạ độ bám biển số siêu mượt realtime
  const liveAi = useAiTracking(aiApiBaseUrl, camera?.id);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Kết nối WebRTC WHEP luồng chính khi camera mở ra
  useEffect(() => {
    if (!camera) return;

    let isCancelled = false;
    let activeStream: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;

    const connectMainStream = async () => {
      setLoading(true);
      setError(null);

      try {
        const targetUrl = resolveWebRtcUrl(camera.webrtcUrl);
        if (!targetUrl) {
          throw new Error('Camera không có URL luồng WebRTC');
        }

        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (!isCancelled && videoRef.current && event.streams[0]) {
            activeStream = event.streams[0];
            videoRef.current.srcObject = activeStream;
            setLoading(false);
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

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp || offer.sdp
        });

        if (!res.ok) {
          throw new Error(`MediaMTX WHEP code ${res.status}`);
        }

        const answerSdp = await res.text();
        if (!isCancelled && pc) {
          await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
          setLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.message || 'Lỗi kết nối luồng chính');
          setLoading(false);
        }
      }
    };

    connectMainStream();

    return () => {
      isCancelled = true;
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
  }, [camera]);

  // Điều khiển PTZ qua Spring Boot backend
  const handlePtz = async (action: string) => {
    if (!camera) return;
    try {
      await fetch(`${apiBaseUrl}/api/cameras/${camera.id}/ptz?action=${action}`, {
        method: 'POST'
      });
    } catch (e) {
      console.error('PTZ action failed:', e);
    }
  };

  // Lọc danh sách sự kiện nhận diện hiển thị ở cột bên phải
  const filteredDetections = useMemo(() => {
    return detections.filter((det) => {
      const matchCam = !det.cameraId || det.cameraId === camera?.id;
      if (!matchCam) return false;

      if (spotlightFilter === 'ALL') return true;
      const vType = (det.vehicleType || '').toUpperCase();
      const isPerson = Boolean(det.personName || det.note?.includes('Person') || vType === 'PERSON');
      const isSafety = Boolean(det.isViolation || det.note?.includes('Vi phạm') || det.module === 'SAFETY_PPE');

      if (spotlightFilter === 'CAR') return !isPerson && !isSafety && vType === 'CAR';
      if (spotlightFilter === 'MOTO') return !isPerson && !isSafety && (vType === 'MOTO' || vType === 'MOTORCYCLE' || vType === 'BIKE');
      if (spotlightFilter === 'PERSON') return isPerson;
      if (spotlightFilter === 'SAFETY') return isSafety;
      return true;
    });
  }, [detections, camera, spotlightFilter]);

  // Tải cấu hình vùng ảo ROI tĩnh nếu chưa có từ SSE stream hoặc props
  const [fetchedRoi, setFetchedRoi] = useState<[number, number][] | null>(null);

  useEffect(() => {
    if (!camera?.id) return;
    if (initialRoi && initialRoi.length >= 3) return;

    let isCancelled = false;
    fetch(`${aiApiBaseUrl}/api/roi-config`)
      .then((r) => r.json())
      .then((json) => {
        if (!isCancelled && json?.data?.cameras?.[camera.id]) {
          setFetchedRoi(json.data.cameras[camera.id]);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [camera?.id, aiApiBaseUrl, initialRoi]);

  // Đảm bảo ROI luôn tồn tại: liveAi.roi -> aiData.roi -> initialRoi -> fetchedRoi -> Default trapezoid
  const roi: [number, number][] = useMemo(() => {
    if (liveAi.roi && liveAi.roi.length >= 3) return liveAi.roi as any;
    if (aiData?.roi && aiData.roi.length >= 3) return aiData.roi;
    if (initialRoi && initialRoi.length >= 3) return initialRoi;
    if (fetchedRoi && fetchedRoi.length >= 3) return fetchedRoi;
    // Khung ảo hình thang chuẩn đón đầu phương tiện (đồng bộ với CameraTile ở Ma Trận)
    return [[0.15, 0.48], [0.85, 0.48], [0.92, 0.95], [0.08, 0.95]];
  }, [liveAi.roi, aiData?.roi, initialRoi, fetchedRoi]);

  if (!camera) return null;

  const tracks = (liveAi.tracks && liveAi.tracks.length > 0) ? (liveAi.tracks as any) : (aiData?.tracks || []);
  const isRoiActive = liveAi.activeInRoi || aiData?.activeInRoi || tracks.some((t: any) => t.inRoi);
  const frameDim = {
    w: liveAi.frameW || aiData?.frameDim?.w || 960,
    h: liveAi.frameH || aiData?.frameDim?.h || 540
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#111827',
          border: '2px solid #0284C7',
          borderRadius: '12px',
          width: '95vw',
          maxWidth: '1380px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 18px',
          backgroundColor: '#1E293B',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #334155'
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{camera.name} - LUỒNG CHÍNH FULL HD</span>
              <span style={{ backgroundColor: '#EF4444', color: '#FFF', padding: '1px 7px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
                MAIN WEBRTC
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
              IP: {camera.ipAddress}:{camera.rtspPort || 554} • Địa điểm: {camera.location || 'Chưa đặt'} • Độ trễ cực thấp: &lt; 0.2s
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Nút Bật/Tắt Bám Biển AI */}
            <button
              onClick={() => setShowAiOverlay(!showAiOverlay)}
              style={{
                background: showAiOverlay ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                border: `1px solid ${showAiOverlay ? '#22C55E' : '#475569'}`,
                color: showAiOverlay ? '#4ADE80' : '#94A3B8',
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
            >
              <IconTarget size={14} color={showAiOverlay ? '#4ADE80' : '#94A3B8'} />
              <span>Bám biển AI {tracks.length > 0 ? `(${tracks.length})` : ''}</span>
            </button>

            {/* Nút Cấu hình ROI */}
            {onConfigureRoi && (
              <button
                onClick={() => onConfigureRoi(camera)}
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
              >
                <IconPolygon size={14} color="#38BDF8" />
                <span>Cấu hình ROI</span>
              </button>
            )}

            {/* Nút đóng */}
            <button
              onClick={onClose}
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
                marginLeft: '4px'
              }}
              title="Đóng cửa sổ"
            >
              <IconClose size={16} color="#FFF" />
            </button>
          </div>
        </div>

        {/* Split View: Left 70% Video + Canvas AI, Right 30% Live Detections Feed */}
        <div style={{
          display: 'flex',
          flex: 1,
          minHeight: '480px',
          maxHeight: '76vh',
          overflow: 'hidden'
        }}>
          {/* CỘT TRÁI (70%): Video Player + Overlay + Footer PTZ */}
          <div style={{
            flex: '1 1 70%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1.5px solid #1E293B',
            backgroundColor: '#05070D',
            overflow: 'hidden'
          }}>
            {/* Video Body */}
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
              {loading && (
                <div style={{ position: 'absolute', color: '#38BDF8', fontSize: '14px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IconRefresh size={20} color="#38BDF8" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Đang kết nối luồng WebRTC từ MediaMTX...</span>
                </div>
              )}

              {error && (
                <div style={{ position: 'absolute', color: '#EF4444', fontSize: '13px', textAlign: 'center', zIndex: 10, padding: '20px' }}>
                  Không thể phát luồng trực tiếp: {error}
                </div>
              )}

              {/* Video container with zoom */}
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
                  ref={videoRef}
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

                {/* AI Overlay: Virtual ROI & Target Bounding Boxes */}
                {showAiOverlay && !loading && !error && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    zIndex: 3,
                    overflow: 'hidden'
                  }}>
                    {/* 1. Khung ROI */}
                    {roi.length >= 3 && (
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                      >
                        <polygon
                          points={roi.map(([rx, ry]: [number, number]) => `${(rx * 100).toFixed(2)},${(ry * 100).toFixed(2)}`).join(' ')}
                          fill={isRoiActive ? 'rgba(34, 197, 94, 0.14)' : 'rgba(56, 189, 248, 0.08)'}
                          stroke={isRoiActive ? '#22C55E' : '#38BDF8'}
                          strokeWidth="0.8"
                          strokeDasharray="2 1.5"
                        />
                      </svg>
                    )}

                    {/* 2. Bounding Boxes: Thân xe (vehicleBbox) và Biển số (bbox) */}
                    {tracks
                      .filter((trk: any) => {
                        const isPerson = Boolean(trk.personName || trk.module === 'FACE_ID' || trk.vehicleType === 'PERSON');
                        if (isPerson && moduleMode !== 'FACE') return false;
                        if (roi.length >= 3 && trk.inRoi === false) return false;
                        return true;
                      })
                      .map((trk: any) => {
                        const isSafety = Boolean(trk.isViolation);
                        const isPerson = Boolean(trk.personName || trk.module === 'FACE_ID' || trk.vehicleType === 'PERSON');
                        const hasPlate = Boolean(trk.plate && trk.plate.trim());
                        const vBox = trk.vehicleBbox;
                        const pBox = trk.bbox;

                        const rawType = isPerson
                          ? (trk.personName || 'PERSON')
                          : (trk.vehicleType === 'MOTO'
                            ? 'MOTO'
                            : (trk.vehicleType === 'TRUCK'
                              ? 'TRUCK'
                              : (trk.vehicleType === 'BUS' ? 'BUS' : 'CAR')));

                        const boxesToRender: { box: [number, number, number, number]; isPlate: boolean; color: string; badge: string }[] = [];

                        if (vBox) {
                          boxesToRender.push({
                            box: vBox,
                            isPlate: false,
                            color: isSafety ? '#EF4444' : (isPerson ? '#F59E0B' : '#00FF00'),
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
                              color: isSafety ? '#EF4444' : (isPerson ? '#F59E0B' : '#00FF00'),
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
                                    left: `${(b[0] / frameDim.w) * 100}%`,
                                    top: `${(b[1] / frameDim.h) * 100}%`,
                                    width: `${((b[2] - b[0]) / frameDim.w) * 100}%`,
                                    height: `${((b[3] - b[1]) / frameDim.h) * 100}%`,
                                    border: bItem.isPlate ? `2px solid ${bItem.color}` : `2px solid ${bItem.color}`,
                                    borderRadius: '2px',
                                    backgroundColor: bItem.isPlate ? 'rgba(56, 189, 248, 0.12)' : (isSafety ? 'rgba(239, 68, 68, 0.05)' : (isPerson ? 'rgba(245, 158, 11, 0.03)' : 'rgba(0, 255, 0, 0.02)')),
                                    boxShadow: bItem.isPlate ? '0 0 8px rgba(56, 189, 248, 0.6)' : (hasPlate ? '0 0 8px rgba(0, 255, 0, 0.5)' : 'none'),
                                    pointerEvents: 'none',
                                    zIndex: bItem.isPlate ? 9 : (hasPlate ? 8 : 5),
                                    willChange: 'left, top, width, height'
                                  }}
                                >
                                  <div style={{
                                    position: 'absolute',
                                    top: ((b[1] / frameDim.h) * 100) > 6 ? '-20px' : '2px',
                                    left: '-2px',
                                    background: 'rgba(0, 0, 0, 0.92)',
                                    border: `1px solid ${bItem.color}`,
                                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.65)',
                                    padding: '1px 6px',
                                    borderRadius: '2px',
                                    whiteSpace: 'nowrap',
                                    fontSize: '11.5px',
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                    fontWeight: 800,
                                    lineHeight: '16px',
                                    color: bItem.color,
                                    letterSpacing: '0.5px',
                                    zIndex: 10
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
              </div>
            </div>

            {/* Footer PTZ & Zoom Control Hub */}
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
              {/* Cụm điều khiển PTZ */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#0B0F17', padding: '3px 6px', borderRadius: '8px', border: '1px solid #1E293B' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginRight: '4px' }}>PTZ:</span>
                  <button onClick={() => handlePtz('UP')} style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} title="Lên">
                    <IconArrowUp size={13} color="#CBD5E1" />
                  </button>
                  <button onClick={() => handlePtz('DOWN')} style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} title="Xuống">
                    <IconArrowDown size={13} color="#CBD5E1" />
                  </button>
                  <button onClick={() => handlePtz('LEFT')} style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} title="Trái">
                    <IconArrowLeft size={13} color="#CBD5E1" />
                  </button>
                  <button onClick={() => handlePtz('RIGHT')} style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B', color: '#FFF', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }} title="Phải">
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
                    style={{ padding: '4px 8px', height: '28px', backgroundColor: '#1E293B', color: '#94A3B8', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Đặt lại 1x"
                  >
                    <IconReset size={11} color="#94A3B8" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI (30%): Detections Feed */}
          <div style={{
            flex: '0 0 30%',
            minWidth: '320px',
            backgroundColor: '#0F172A',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '12px 14px',
              backgroundColor: '#1E293B',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ color: '#FFF', fontWeight: 700, fontSize: '13px' }}>
                Lượt Nhận Diện Tại Camera Này
              </span>
              <span style={{ fontSize: '11px', color: '#38BDF8', fontWeight: 600 }}>
                {filteredDetections.length} lượt
              </span>
            </div>

            {/* Quick Filter Buttons */}
            <div style={{ display: 'flex', padding: '8px 10px', backgroundColor: '#0B0F17', gap: '4px', borderBottom: '1px solid #1E293B' }}>
              {[
                { id: 'ALL', label: 'Tất cả' },
                { id: 'CAR', label: 'Ô tô' },
                { id: 'MOTO', label: 'Xe máy' },
                ...(moduleMode === 'FACE' ? [{ id: 'PERSON', label: 'Người' }] : [])
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSpotlightFilter(b.id as any)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: spotlightFilter === b.id ? '#0284C7' : '#1E293B',
                    color: spotlightFilter === b.id ? '#FFF' : '#94A3B8'
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* Detections List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredDetections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748B', fontSize: '12px' }}>
                  Chưa có lượt nhận diện nào tại camera này
                </div>
              ) : (
                filteredDetections.map((det, idx) => (
                  <div
                    key={det.id || idx}
                    onClick={() => onSelectDetection?.(det)}
                    style={{
                      backgroundColor: '#1E293B',
                      borderRadius: '6px',
                      padding: '8px',
                      display: 'flex',
                      gap: '8px',
                      cursor: onSelectDetection ? 'pointer' : 'default',
                      border: '1px solid #334155'
                    }}
                  >
                    {det.plateCropUrl || det.snapshotUrl ? (
                      <img
                        src={det.plateCropUrl || det.snapshotUrl}
                        alt="Crop"
                        style={{ width: '60px', height: '40px', objectFit: 'cover', borderRadius: '4px', backgroundColor: '#000' }}
                      />
                    ) : (
                      <div style={{ width: '60px', height: '40px', backgroundColor: '#0B0F17', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconCar size={16} color="#64748B" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ color: '#38BDF8', fontWeight: 700, fontSize: '12px', fontFamily: 'monospace' }}>
                        {det.plateNumber || det.personName || 'ĐỐI TƯỢNG'}
                      </div>
                      <div style={{ color: '#94A3B8', fontSize: '10.5px', marginTop: '2px' }}>
                        {det.detectedAt ? new Date(det.detectedAt).toLocaleTimeString('vi-VN') : ''} • {det.confidence ? `${Math.round(det.confidence)}%` : '95%'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotlightDrawer;
