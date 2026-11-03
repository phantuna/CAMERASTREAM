import { useState, useEffect, useRef, useMemo, type FC } from 'react';
import {
  IconCamera,
  IconUser,
  IconSettings,
  IconCheck,
  IconRefresh,
  IconAlertTriangle
} from '../../components/SurveillanceIcons';
import { CameraAiConfigModal } from '../../components/CameraAiConfigModal';
import { RoiConfigModal } from '../../components/RoiConfigModal';
import type { SystemEvent } from '../../core/types';
import { useEventStream } from '../../core/websocket/useEventStream';
import { useAiTracking } from '../../core/hooks/useAiTracking';

// Địa chỉ AI service nhận diện người (cùng hợp đồng /tracking-events & /api/roi-config với AI xe)
const FACE_AI_URL = (import.meta as any).env?.VITE_FACE_AI_URL || 'http://localhost:5001';

export interface FaceLiveViewProps {
  apiBaseUrl: string;
}

interface CameraItem {
  id: number;
  name: string;
  ipAddress?: string;
  rtspPort?: number;
  location?: string;
  type?: string;
  webrtcUrl?: string;
  rtspSourceUrl?: string;
  rtspSubStreamUrl?: string;
}

export const FaceLiveView: FC<FaceLiveViewProps> = ({ apiBaseUrl }) => {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [faceCameraIds, setFaceCameraIds] = useState<Set<number>>(new Set());
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);
  const [isLoadingCameras, setIsLoadingCameras] = useState<boolean>(true);

  // WebRTC Stream State
  const [isConnectingStream, setIsConnectingStream] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // AI Config Modal State
  const [configuringCamera, setConfiguringCamera] = useState<CameraItem | null>(null);

  // Live Face Detections Feed
  const [liveDetections, setLiveDetections] = useState<SystemEvent[]>([]);
  const [filterOnlyCurrentCam, setFilterOnlyCurrentCam] = useState<boolean>(false);
  const { registerEventListener, isConnected } = useEventStream();
  const [showRoiModal, setShowRoiModal] = useState<boolean>(false);
  const faceTracking = useAiTracking(FACE_AI_URL, selectedCameraId);

  // 1. Tải danh sách Camera & Danh sách Camera đã được cấu hình cho Phân hệ Người (FaceID)
  const fetchCamerasAndConfigs = async () => {
    setIsLoadingCameras(true);
    try {
      // Tải danh sách tất cả camera
      const camRes = await fetch(`${apiBaseUrl}/api/cameras`);
      const camJson = await camRes.json();
      const camList: CameraItem[] = camJson?.data || [];
      setCameras(camList);

      // Tải danh sách camera có nhiệm vụ FACE_RECOGNITION
      const aiTaskRes = await fetch(`${apiBaseUrl}/api/cameras/ai-tasks?aiType=FACE_RECOGNITION`);
      const aiTaskJson = await aiTaskRes.json();
      const faceIds = new Set<number>();

      if (aiTaskJson?.data && Array.isArray(aiTaskJson.data)) {
        aiTaskJson.data.forEach((task: any) => {
          if (task.cameraId && task.enabled !== false) {
            faceIds.add(Number(task.cameraId));
          }
        });
      }

      setFaceCameraIds(faceIds);

      // Tự động chọn camera ưu tiên:
      // Ưu tiên 1: Camera đã được gán FaceID
      // Ưu tiên 2: Camera đầu tiên có sẵn
      if (camList.length > 0) {
        setSelectedCameraId((prev) => {
          if (prev && camList.some((c) => c.id === prev)) return prev;
          const firstFaceCam = camList.find((c) => faceIds.has(c.id));
          return firstFaceCam ? firstFaceCam.id : camList[0].id;
        });
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách camera cho FaceLiveView:', err);
    } finally {
      setIsLoadingCameras(false);
    }
  };

  useEffect(() => {
    fetchCamerasAndConfigs();
  }, [apiBaseUrl]);

  // Camera đang được chọn
  const selectedCamera = useMemo(() => {
    return cameras.find((c) => c.id === selectedCameraId) || null;
  }, [cameras, selectedCameraId]);

  const isCurrentCamConfiguredForFace = useMemo(() => {
    return selectedCameraId ? faceCameraIds.has(selectedCameraId) : false;
  }, [selectedCameraId, faceCameraIds]);

  // 2. KẾT NỐI WEBRTC WHEP STREAM CHO CAMERA ĐANG CHỌN (KHÔNG RÒ RỈ BỘ NHỚ)
  useEffect(() => {
    if (!selectedCamera || !selectedCamera.webrtcUrl) {
      setStreamError('Camera chưa có đường dẫn luồng phát trực tiếp (WebRTC WHEP)');
      setIsConnectingStream(false);
      return;
    }

    let isCancelled = false;
    let pc: RTCPeerConnection | null = null;
    let activeStream: MediaStream | null = null;

    setIsConnectingStream(true);
    setStreamError(null);

    const startWhepStream = async () => {
      try {
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
            setIsConnectingStream(false);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Đợi thu thập ứng viên ICE
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

        // Gửi SDP offer tới MediaMTX WHEP
        const res = await fetch(selectedCamera.webrtcUrl!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp || offer.sdp
        });

        if (!res.ok) {
          throw new Error(`MediaMTX WHEP phản hồi mã lỗi ${res.status}`);
        }

        const answerSdp = await res.text();
        if (!isCancelled && pc) {
          await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
          setIsConnectingStream(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setStreamError(err.message || 'Không thể kết nối luồng WebRTC thời gian thực');
          setIsConnectingStream(false);
        }
      }
    };

    startWhepStream();

    // DỌN DẸP TUYỆT ĐỐI KHI ĐỔI CAMERA HOẶC UNMOUNT (TRÁNH RÒ RỈ RAM)
    return () => {
      isCancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (_) { }
        });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (pc) {
        try {
          pc.close();
        } catch (_) { }
      }
      pcRef.current = null;
    };
  }, [selectedCamera]);

  // 3. LẮNG NGHE SỰ KIỆN FACE_RECOGNITION REALTIME
  useEffect(() => {
    const unsubscribe = registerEventListener('FACE_RECOGNITION', (event) => {
      setLiveDetections((prev) => [event, ...prev.slice(0, 29)]);
    });

    const loadRecent = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/v1/events?eventType=FACE_RECOGNITION&size=15`);
        const json = await res.json();
        if (json?.data?.content) {
          setLiveDetections(json.data.content);
        }
      } catch (_) { }
    };
    loadRecent();

    return unsubscribe;
  }, [apiBaseUrl, registerEventListener]);

  // Gán nhanh camera hiện tại cho Phân hệ Nhận diện Người
  const handleQuickAssignFace = async () => {
    if (!selectedCamera) return;
    try {
      // Lấy danh sách configs hiện tại của cam
      const res = await fetch(`${apiBaseUrl}/api/cameras/${selectedCamera.id}/ai-config`);
      const json = await res.json();
      const existingConfigs = json?.data || [];

      // Bật FACE_RECOGNITION
      const updated = existingConfigs.map((cfg: any) => {
        if (cfg.aiType === 'FACE_RECOGNITION') {
          return { ...cfg, enabled: true };
        }
        return cfg;
      });

      await fetch(`${apiBaseUrl}/api/cameras/${selectedCamera.id}/ai-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });

      setFaceCameraIds((prev) => new Set([...prev, selectedCamera.id]));
    } catch (e) {
      alert('Gán phân hệ người thất bại: ' + e);
    }
  };

  // Lọc sự kiện theo camera đang chọn nếu người dùng muốn
  const displayedDetections = useMemo(() => {
    if (!filterOnlyCurrentCam || !selectedCameraId) return liveDetections;
    return liveDetections.filter((evt) => {
      return (
        evt.cameraId === selectedCameraId ||
        (selectedCamera && evt.cameraName && evt.cameraName.toLowerCase().includes(selectedCamera.name.toLowerCase()))
      );
    });
  }, [liveDetections, filterOnlyCurrentCam, selectedCameraId, selectedCamera]);

  // Kiểm tra xem sự kiện mới nhất có thuộc camera đang xem không để hiển thị highlight
  const latestDetection = displayedDetections[0];

  return (
    <div style={{ display: 'flex', height: '100%', gap: '16px', padding: '16px', boxSizing: 'border-box' }}>
      {/* CỘT TRÁI: LIVE CAMERA STREAM VIEW */}
      <div style={{
        flex: 1,
        backgroundColor: '#0F172A',
        borderRadius: '14px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
        border: '1px solid #1E293B'
      }}>
        {/* Stream Top Control Bar */}
        <div style={{
          padding: '10px 16px',
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 10,
          gap: '12px'
        }}>
          {/* Bộ Chọn Luồng Camera Dành Riêng Cho Nhận Diện Người */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: 'rgba(124, 58, 237, 0.15)',
              border: '1px solid rgba(124, 58, 237, 0.35)',
              borderRadius: '8px'
            }}>
              <IconUser size={15} color="#A78BFA" />
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '12px' }}>
                Camera Giám Sát Người:
              </span>
            </div>

            {/* Dropdown Chọn Camera */}
            <select
              value={selectedCameraId || ''}
              onChange={(e) => setSelectedCameraId(Number(e.target.value))}
              disabled={isLoadingCameras || cameras.length === 0}
              style={{
                backgroundColor: '#1E293B',
                color: '#F8FAFC',
                border: '1.5px solid #334155',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: '220px'
              }}
            >
              {cameras.map((cam) => {
                const isFace = faceCameraIds.has(cam.id);
                return (
                  <option key={cam.id} value={cam.id}>
                    #{cam.id} - {cam.name} {isFace ? '[Phân Hệ FaceID]' : '[Chưa gán FaceID]'}
                  </option>
                );
              })}
            </select>

            {/* Phân Loại Badge: Nhận Diện Người vs Chưa Gán */}
            {selectedCamera && (
              isCurrentCamConfiguredForFace ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#34D399',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '4px 8px',
                  borderRadius: '6px'
                }}>
                  <IconCheck size={12} color="#34D399" />
                  Đang Gán FaceID
                </span>
              ) : (
                <button
                  onClick={handleQuickAssignFace}
                  title="Gán camera này vào phân hệ nhận diện người để AI kích hoạt mô hình FaceID"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: '#7C3AED',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <IconUser size={13} color="#FFF" />
                  + Gán Cho Nhận Diện Người
                </button>
              )
            )}
          </div>

          {/* Công Cụ Cấu Hình & Tải Lại */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '11px',
              color: '#94A3B8',
              fontFamily: 'monospace',
              backgroundColor: 'rgba(255,255,255,0.08)',
              padding: '4px 8px',
              borderRadius: '6px'
            }}>
              AI MODEL: YOLO-FACE + INSIGHTFACE
            </span>

            {selectedCamera && (
              <button
                onClick={() => setConfiguringCamera(selectedCamera)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#F8FAFC',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '5px 9px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Mở bảng cấu hình phân hệ & module AI cho camera này"
              >
                <IconSettings size={13} color="#F8FAFC" />
                <span>Cấu Hình Phân Hệ</span>
              </button>
            )}

            {selectedCamera && (
              <button
                onClick={() => setShowRoiModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#F8FAFC',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '5px 9px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Vẽ vùng ROI và vạch Tripwire cho nhận diện người"
              >
                <span>Vùng ROI / Tripwire</span>
              </button>
            )}

            <button
              onClick={fetchCamerasAndConfigs}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '4px'
              }}
              title="Làm mới danh sách camera"
            >
              <IconRefresh size={15} />
            </button>
          </div>
        </div>

        {/* Stream Video Live Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#020617',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Thẻ Video HTML5 Nhận Luồng WebRTC Thời Gian Thực */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: (streamError || !selectedCamera) ? 'none' : 'block'
            }}
          />

          {/* Overlay Đang Kết Nối Luồng */}
          {isConnectingStream && (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(2, 6, 23, 0.75)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              zIndex: 5
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                border: '3px solid rgba(124, 58, 237, 0.3)',
                borderTopColor: '#7C3AED',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <div style={{ color: '#E2E8F0', fontSize: '13px', fontWeight: 600 }}>
                Đang thiết lập luồng WebRTC thời gian thực cho Camera #{selectedCamera?.id}...
              </div>
            </div>
          )}

          {/* Thông Báo Lỗi Luồng Hoặc Chưa Có Camera */}
          {(!selectedCamera || streamError) && (
            <div style={{
              padding: '30px',
              textAlign: 'center',
              color: '#94A3B8',
              maxWidth: '460px',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <IconAlertTriangle size={36} color="#F59E0B" style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '6px' }}>
                {streamError || 'Chưa chọn camera nào để giám sát người'}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: 1.5, marginBottom: '16px' }}>
                Vui lòng chọn camera đã kết nối RTSP/ONVIF trong danh sách phía trên hoặc vào Cấu hình Thiết bị để kiểm tra luồng phát.
              </div>
              {selectedCamera && (
                <button
                  onClick={() => setSelectedCameraId(selectedCamera.id)}
                  style={{
                    padding: '7px 16px',
                    backgroundColor: '#0284C7',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Thử kết nối lại
                </button>
              )}
            </div>
          )}

          {/* Khung bám khuôn mặt realtime (SSE từ AI người) */}
          {selectedCamera && !isConnectingStream && !streamError && (
            <svg
              viewBox={`0 0 ${faceTracking.frameW} ${faceTracking.frameH}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}
            >
              {faceTracking.roi && faceTracking.roi.length >= 3 && (
                <polygon
                  points={faceTracking.roi.map(([x, y]) => `${x * faceTracking.frameW},${y * faceTracking.frameH}`).join(' ')}
                  fill="rgba(124,58,237,0.10)" stroke="#A78BFA" strokeWidth={Math.max(2, faceTracking.frameW / 640)} strokeDasharray="12 8"
                />
              )}
              {faceTracking.tripwire && faceTracking.tripwire.length === 2 && (
                <line
                  x1={faceTracking.tripwire[0][0] * faceTracking.frameW} y1={faceTracking.tripwire[0][1] * faceTracking.frameH}
                  x2={faceTracking.tripwire[1][0] * faceTracking.frameW} y2={faceTracking.tripwire[1][1] * faceTracking.frameH}
                  stroke="#F97316" strokeWidth={Math.max(3, faceTracking.frameW / 480)}
                />
              )}
              {faceTracking.tracks.map((t) => {
                const [x1, y1, x2, y2] = t.bbox;
                const known = t.known ?? !!t.personName;
                const color = known ? '#10B981' : '#EF4444';
                const text = `${t.personName || t.label || 'Người lạ'} ${Math.round((t.confidence || 0) * 100)}%`;
                const fs = Math.max(14, faceTracking.frameH / 45);
                return (
                  <g key={t.trackId}>
                    <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke={color} strokeWidth={Math.max(2, faceTracking.frameW / 640)} />
                    <rect x={x1} y={Math.max(0, y1 - fs * 1.5)} width={text.length * fs * 0.6 + 12} height={fs * 1.5} fill={color} />
                    <text x={x1 + 6} y={Math.max(fs, y1 - fs * 0.4)} fill="#FFFFFF" fontSize={fs} fontWeight="700">{text}</text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* AI Face Target Overlay Khi Có Dữ Liệu Realtime */}
          {selectedCamera && !isConnectingStream && !streamError && latestDetection && (
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1.5px solid #7C3AED',
              borderRadius: '10px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)',
              zIndex: 4
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                boxShadow: '0 0 8px #10B981'
              }} />
              <div>
                <div style={{ color: '#F8FAFC', fontSize: '12px', fontWeight: 700 }}>
                  Đang quét khuôn mặt: {latestDetection.payload?.personName || 'Người qua lại'}
                </div>
                <div style={{ color: '#94A3B8', fontSize: '10.5px' }}>
                  Độ khớp: {Math.round((latestDetection.confidence || 0.95) * 100)}% • Camera #{selectedCamera.id}
                </div>
              </div>
            </div>
          )}

          {/* Cảnh Báo Nếu Camera Này Chưa Được Gán Cho Phân Hệ Người */}
          {!isCurrentCamConfiguredForFace && selectedCamera && !isConnectingStream && (
            <div style={{
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              right: '16px',
              backgroundColor: 'rgba(30, 41, 59, 0.92)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IconAlertTriangle size={16} color="#F59E0B" />
                <span style={{ fontSize: '12px', color: '#F1F5F9' }}>
                  Camera này hiện <strong>chưa được phân loại cho Nhận diện Người</strong>. AI FaceID sẽ không ghi nhận nhật ký vào phân hệ này.
                </span>
              </div>
              <button
                onClick={handleQuickAssignFace}
                style={{
                  backgroundColor: '#7C3AED',
                  color: '#FFF',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Gán Ngay
              </button>
            </div>
          )}
        </div>

        {/* Bottom Diagnostics Bar */}
        <div style={{
          padding: '10px 16px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#94A3B8',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span>
              Camera: <strong>{selectedCamera ? `${selectedCamera.name} (${selectedCamera.ipAddress || '127.0.0.1'})` : 'Chưa chọn'}</strong>
            </span>
            <span>Giao thức: <strong>WHEP / WebRTC (Độ trễ &lt; 0.2s)</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#10B981' : '#EF4444'
              }} />
              <span>WebSocket Sự Kiện: {isConnected ? 'Đang hoạt động' : 'Mất kết nối'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* CỘT PHẢI: REALTIME DETECTED FACES FEED */}
      <div style={{
        width: '380px',
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
              Khuôn Mặt Vừa Nhận Diện
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Cập nhật tức thì từ luồng Camera AI
            </div>
          </div>

          <span style={{
            fontSize: '10.5px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: '#F5F3FF',
            color: '#7C3AED',
            border: '1px solid #DDD6FE'
          }}>
            {displayedDetections.length} Bản ghi
          </span>
        </div>

        {/* Bộ lọc hiển thị: Tất cả vs Chỉ Camera Này */}
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid #F1F5F9',
          backgroundColor: '#F8FAFC',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <button
            onClick={() => setFilterOnlyCurrentCam(false)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: !filterOnlyCurrentCam ? '#7C3AED' : '#E2E8F0',
              color: !filterOnlyCurrentCam ? '#FFF' : '#64748B',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Tất Cả Camera
          </button>

          <button
            onClick={() => setFilterOnlyCurrentCam(true)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: filterOnlyCurrentCam ? '#7C3AED' : '#E2E8F0',
              color: filterOnlyCurrentCam ? '#FFF' : '#64748B',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Chỉ Camera Đang Xem
          </button>
        </div>

        {/* Danh Sách Sự Kiện Nhận Diện Người */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayedDetections.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8' }}>
              <IconCamera size={28} color="#CBD5E1" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Đang chờ nhận diện...</div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                Khi có người đi qua camera giám sát người, thông tin sẽ hiện tại đây
              </div>
            </div>
          ) : (
            displayedDetections.map((item, idx) => {
              const name = item.payload?.personName || 'Người lạ / Khách';
              const code = item.payload?.employeeId;
              const isStranger = !code;

              return (
                <div
                  key={item.id || idx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: isStranger ? '#FEF2F2' : '#F8FAFC',
                    border: isStranger ? '1px solid #FECACA' : '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    backgroundColor: isStranger ? '#FEE2E2' : '#EDE9FE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isStranger ? '#DC2626' : '#7C3AED',
                    fontWeight: 700,
                    fontSize: '14px',
                    flexShrink: 0
                  }}>
                    {name.charAt(0)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name}
                      </span>
                      <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : 'Vừa xong'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '9.5px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        backgroundColor: isStranger ? '#FEE2E2' : '#DCFCE7',
                        color: isStranger ? '#DC2626' : '#15803D',
                        fontWeight: 600
                      }}>
                        {isStranger ? 'CẢNH BÁO: NGƯỜI LẠ' : `NV: ${code}`}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748B' }}>
                        Độ khớp: {Math.round((item.confidence || 0.96) * 100)}%
                      </span>
                      {item.cameraName && (
                        <span style={{ fontSize: '9.5px', color: '#94A3B8', fontFamily: 'monospace' }}>
                          • {item.cameraName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal Cấu Hình Phân Hệ & Module AI Nếu Người Dùng Mở */}
      {configuringCamera && (
        <CameraAiConfigModal
          apiBaseUrl={apiBaseUrl}
          camera={configuringCamera}
          onClose={() => setConfiguringCamera(null)}
          onSaved={() => {
            fetchCamerasAndConfigs();
            setConfiguringCamera(null);
          }}
        />
      )}

      {/* ROI / Tripwire cho AI nhận diện người (gọi AI service người) */}
      {showRoiModal && selectedCamera && (
        <RoiConfigModal
          isOpen={showRoiModal}
          onClose={() => setShowRoiModal(false)}
          camera={{ ...selectedCamera, webrtcUrl: selectedCamera.webrtcUrl || '' }}
          aiApiBaseUrl={FACE_AI_URL}
          onSaveSuccess={() => { /* AI người tự hot-reload, không cần làm gì thêm */ }}
        />
      )}
    </div>
  );
};

export default FaceLiveView;
