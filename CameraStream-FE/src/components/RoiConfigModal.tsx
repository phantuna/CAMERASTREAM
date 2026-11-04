import { useState, useRef, useEffect, useCallback, type FC, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  IconPolygon,
  IconClose,
  IconReset,
  IconEdit,
  IconCheck,
  IconCar,
  IconPlus,
  IconTrash,
  IconCamera
} from './SurveillanceIcons';
import { getAiServiceBaseUrl, getBackendBaseUrl } from '../shared/utils/envConfig';

export interface RoiPoint {
  x: number; // 0.0 -> 1.0
  y: number; // 0.0 -> 1.0
}

export type RoiCameraTarget = {
  id: number;
  name: string;
  webrtcUrl: string;
  ipAddress?: string;
  streamPath?: string;
  [key: string]: any;
};

interface RoiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  camera: RoiCameraTarget;
  initialRoi?: [number, number][];
  onSaveSuccess: (savedRoi: [number, number][], applyAll: boolean) => void;
  aiApiBaseUrl?: string;
}

// 3 Mẫu thiết lập sẵn thông dụng và chuẩn xác nhất cho thực tế
const STANDARD_PRESETS = [
  {
    id: 'road',
    name: 'Lòng Đường (Mặc định)',
    desc: 'Hình thang uốn theo làn đường xe di chuyển',
    icon: IconCar,
    roi: [[0.05, 0.35], [0.65, 0.35], [0.95, 0.95], [0.05, 0.95]] as [number, number][]
  },
  {
    id: 'gate',
    name: 'Cổng Vào / Barie',
    desc: 'Vùng đón đầu xe sát cổng soát vé',
    icon: IconPolygon,
    roi: [[0.20, 0.50], [0.80, 0.50], [0.90, 0.95], [0.10, 0.95]] as [number, number][]
  },
  {
    id: 'fullscreen',
    name: 'Toàn Khung Hình',
    desc: 'Bắt biển số trên toàn bộ tầm nhìn camera',
    icon: IconPolygon,
    roi: [[0.01, 0.01], [0.99, 0.01], [0.99, 0.99], [0.01, 0.99]] as [number, number][]
  }
];

export const RoiConfigModal: FC<RoiConfigModalProps> = ({
  isOpen,
  onClose,
  camera,
  initialRoi,
  onSaveSuccess,
  aiApiBaseUrl
}) => {
  const effectiveAiUrl = aiApiBaseUrl || getAiServiceBaseUrl();

  const [points, setPoints] = useState<[number, number][]>([
    [0.15, 0.45], [0.85, 0.45], [0.95, 0.95], [0.05, 0.95]
  ]);
  const [applyAll, setApplyAll] = useState<boolean>(false);
  const [activeDraggingIdx, setActiveDraggingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isVideoLive, setIsVideoLive] = useState<boolean>(false);
  const [snapshotTime, setSnapshotTime] = useState<number>(() => Date.now());
  const [snapshotFailed, setSnapshotFailed] = useState<boolean>(false);

  // Chế độ vẽ nhanh bằng cách nhấn giữ và kéo chuột (Click & Drag Box)
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Tùy chọn nâng cao (thu gọn mặc định để giao diện sáng sạch, không rối mắt)
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [tripwireEnabled, setTripwireEnabled] = useState<boolean>(false);
  const [tripwire, setTripwire] = useState<[number, number][]>([[0.1, 0.65], [0.9, 0.65]]);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const initializedRef = useRef<boolean>(false);

  // Nạp toạ độ khởi tạo khi mở Modal
  useEffect(() => {
    if (isOpen) {
      setSnapshotFailed(false);
      setSnapshotTime(Date.now());
      if (!initializedRef.current) {
        initializedRef.current = true;
        if (initialRoi && initialRoi.length >= 3) {
          setPoints(initialRoi.map(([x, y]) => [Number(x), Number(y)]));
        } else {
          // 1. Thử tải ROI từ CSDL Backend trước (GET /api/cameras/{id}/ai-config)
          const backendUrl = getBackendBaseUrl();
          fetch(`${backendUrl}/api/cameras/${camera.id}/ai-config`)
            .then(res => res.json())
            .then(resData => {
              const configs = resData?.data || [];
              const anprConfig = configs.find((c: any) => c.aiType === 'VEHICLE_ANPR' || c.aiType === 'INTRUSION_ROI') || configs[0];
              if (anprConfig && anprConfig.roiCoordinates) {
                try {
                  const parsed = JSON.parse(anprConfig.roiCoordinates);
                  if (Array.isArray(parsed) && parsed.length >= 3) {
                    setPoints(parsed.map(([x, y]: number[]) => [Number(x), Number(y)]));
                    return;
                  }
                } catch {
                  // Fallback tiếp
                }
              }
              // 2. Nếu trong DB chưa có toạ độ, tải từ file cấu hình của AI Service
              fetch(`${effectiveAiUrl}/api/roi-config`)
                .then(res => res.json())
                .then(aiData => {
                  if (aiData && aiData.data) {
                    const camIdStr = String(camera.id);
                    if (aiData.data.cameras && aiData.data.cameras[camIdStr]) {
                      setPoints(aiData.data.cameras[camIdStr]);
                    } else if (aiData.data.default) {
                      setPoints(aiData.data.default);
                    }
                  }
                })
                .catch(() => {});
            })
            .catch(() => {
              fetch(`${effectiveAiUrl}/api/roi-config`)
                .then(res => res.json())
                .then(aiData => {
                  if (aiData && aiData.data) {
                    const camIdStr = String(camera.id);
                    if (aiData.data.cameras && aiData.data.cameras[camIdStr]) {
                      setPoints(aiData.data.cameras[camIdStr]);
                    } else if (aiData.data.default) {
                      setPoints(aiData.data.default);
                    }
                  }
                })
                .catch(() => {});
            });
        }
        setNotification(null);
        setIsDrawingMode(false);
        setDragStart(null);

        // Nạp vạch Tripwire đã lưu (nếu có)
        fetch(`${effectiveAiUrl}/api/roi-config`)
          .then(res => res.json())
          .then(resData => {
            const tws = resData?.data?.tripwires || {};
            const tw = tws[String(camera.id)] || tws['default'];
            if (Array.isArray(tw) && tw.length === 2) {
              setTripwire(tw.map(([x, y]: number[]) => [Number(x), Number(y)] as [number, number]));
              setTripwireEnabled(true);
            } else {
              setTripwireEnabled(false);
            }
          })
          .catch(() => {});
      }
    } else {
      initializedRef.current = false;
    }
  }, [isOpen, camera.id, effectiveAiUrl]);

  // Kết nối WebRTC WHEP xem video trực tiếp
  useEffect(() => {
    if (!isOpen || !camera.webrtcUrl) return;

    let pc: RTCPeerConnection | null = null;
    let stream: MediaStream | null = null;

    const setupStream = async () => {
      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          stream = event.streams[0];
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise<void>(resolve => {
          if (pc?.iceGatheringState === 'complete') resolve();
          else {
            const check = () => {
              if (pc?.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
              }
            };
            pc?.addEventListener('icegatheringstatechange', check);
            setTimeout(() => {
              pc?.removeEventListener('icegatheringstatechange', check);
              resolve();
            }, 1500);
          }
        });

        const resp = await fetch(camera.webrtcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp || ''
        });

        if (resp.ok) {
          const answerSdp = await resp.text();
          await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
        }
      } catch (err) {
        // Bỏ qua lỗi kết nối WHEP nếu dùng ảnh chụp
      }
    };

    setupStream();

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (pc) pc.close();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [isOpen, camera.webrtcUrl]);

  // Cập nhật toạ độ khi kéo thả điểm
  const updatePointFromPointer = useCallback((clientX: number, clientY: number, pointIdx: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const rawX = (clientX - rect.left) / rect.width;
    const rawY = (clientY - rect.top) / rect.height;

    const clampedX = Math.max(0.01, Math.min(0.99, Number(rawX.toFixed(3))));
    const clampedY = Math.max(0.01, Math.min(0.99, Number(rawY.toFixed(3))));

    if (pointIdx >= 100) {
      setTripwire(prev => {
        const copy = [...prev] as [number, number][];
        copy[pointIdx - 100] = [clampedX, clampedY];
        return copy;
      });
      return;
    }
    setPoints(prev => {
      const copy = [...prev] as [number, number][];
      copy[pointIdx] = [clampedX, clampedY];
      return copy;
    });
  }, []);

  // Xử lý chế độ kéo chuột vẽ khung hình chữ nhật mới
  const handleContainerMouseDown = (e: ReactMouseEvent) => {
    if (!isDrawingMode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startX = Math.max(0.01, Math.min(0.99, Number(((e.clientX - rect.left) / rect.width).toFixed(3))));
    const startY = Math.max(0.01, Math.min(0.99, Number(((e.clientY - rect.top) / rect.height).toFixed(3))));

    setDragStart({ x: startX, y: startY });
    setPoints([[startX, startY], [startX, startY], [startX, startY], [startX, startY]]);
  };

  const handleContainerMouseMove = (e: ReactMouseEvent) => {
    if (!isDrawingMode || !dragStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const curX = Math.max(0.01, Math.min(0.99, Number(((e.clientX - rect.left) / rect.width).toFixed(3))));
    const curY = Math.max(0.01, Math.min(0.99, Number(((e.clientY - rect.top) / rect.height).toFixed(3))));

    const x1 = Math.min(dragStart.x, curX);
    const x2 = Math.max(dragStart.x, curX);
    const y1 = Math.min(dragStart.y, curY);
    const y2 = Math.max(dragStart.y, curY);

    setPoints([
      [x1, y1], // Trên - Trái
      [x2, y1], // Trên - Phải
      [x2, y2], // Dưới - Phải
      [x1, y2]  // Dưới - Trái
    ]);
  };

  const handleContainerMouseUp = () => {
    if (isDrawingMode && dragStart) {
      setDragStart(null);
      setIsDrawingMode(false);
      setNotification({
        type: 'success',
        text: 'Đã vẽ xong khung vùng nhận diện mới! Bạn có thể kéo thả 4 điểm góc để tinh chỉnh thêm.'
      });
    }
  };

  // Mouse drag handlers cho từng điểm
  const handleMouseDown = (idx: number, e: ReactMouseEvent) => {
    if (isDrawingMode) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveDraggingIdx(idx);
  };

  const handleTouchStart = (idx: number, e: ReactTouchEvent) => {
    if (isDrawingMode) return;
    e.stopPropagation();
    setActiveDraggingIdx(idx);
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: globalThis.MouseEvent) => {
      if (activeDraggingIdx !== null) {
        updatePointFromPointer(e.clientX, e.clientY, activeDraggingIdx);
      }
    };

    const handleWindowMouseUp = () => {
      if (activeDraggingIdx !== null) {
        setActiveDraggingIdx(null);
      }
    };

    const handleWindowTouchMove = (e: globalThis.TouchEvent) => {
      if (activeDraggingIdx !== null && e.touches.length > 0) {
        updatePointFromPointer(e.touches[0].clientX, e.touches[0].clientY, activeDraggingIdx);
      }
    };

    const handleWindowTouchEnd = () => {
      if (activeDraggingIdx !== null) {
        setActiveDraggingIdx(null);
      }
    };

    if (activeDraggingIdx !== null) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
      window.addEventListener('touchend', handleWindowTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowTouchEnd);
    };
  }, [activeDraggingIdx, updatePointFromPointer]);

  // Thêm / Bớt góc cho trường hợp khúc cua phức tạp
  const handleAddPoint = () => {
    let maxLenSq = 0;
    let bestIdx = 0;
    for (let i = 0; i < points.length; i++) {
      const nextIdx = (i + 1) % points.length;
      const dx = points[nextIdx][0] - points[i][0];
      const dy = points[nextIdx][1] - points[i][1];
      const lenSq = dx * dx + dy * dy;
      if (lenSq > maxLenSq) {
        maxLenSq = lenSq;
        bestIdx = i;
      }
    }
    const nextIdx = (bestIdx + 1) % points.length;
    const midX = Number(((points[bestIdx][0] + points[nextIdx][0]) / 2).toFixed(3));
    const midY = Number(((points[bestIdx][1] + points[nextIdx][1]) / 2).toFixed(3));
    const newPoints = [...points];
    newPoints.splice(bestIdx + 1, 0, [midX, midY]);
    setPoints(newPoints);
    setNotification({
      type: 'success',
      text: `Đã thêm điểm góc mới (tổng: ${newPoints.length} điểm). Hãy kéo điểm để căn chỉnh vị trí.`
    });
  };

  const handleRemovePoint = () => {
    if (points.length <= 3) {
      setNotification({
        type: 'error',
        text: 'Vùng nhận diện cần tối thiểu 3 điểm góc để tạo thành hình khép kín!'
      });
      return;
    }
    setPoints(prev => prev.slice(0, prev.length - 1));
    setNotification({
      type: 'success',
      text: `Đã bớt điểm góc. Vùng nhận diện hiện có ${points.length - 1} điểm góc.`
    });
  };

  // Áp dụng Preset
  const handleApplyPreset = (presetRoi: [number, number][]) => {
    setPoints(presetRoi);
    setIsDrawingMode(false);
    setNotification({
      type: 'success',
      text: 'Đã nạp mẫu vùng nhận diện. Bạn có thể kéo thả để tinh chỉnh hoặc bấm "Lưu Cấu Hình".'
    });
  };

  // Lưu cấu hình xuống CSDL Backend PostgreSQL & Đồng bộ sang AI Service
  const handleSave = async () => {
    setSaving(true);
    setNotification(null);

    const roiString = JSON.stringify(points);
    const backendUrl = getBackendBaseUrl();
    let savedToDb = false;
    let dbErrorMsg = '';

    // BƯỚC 1: LƯU VÀO CƠ SỞ DỮ LIỆU POSTGRESQL (SPRING BOOT BACKEND)
    try {
      if (applyAll) {
        // Tải danh sách tất cả camera để cập nhật hàng loạt
        const allCamsRes = await fetch(`${backendUrl}/api/cameras`);
        if (allCamsRes.ok) {
          const allCamsJson = await allCamsRes.json();
          const cams: any[] = allCamsJson?.data || [];
          await Promise.all(cams.map(async (c) => {
            try {
              const cfgRes = await fetch(`${backendUrl}/api/cameras/${c.id}/ai-config`);
              let cfgs = (await cfgRes.json())?.data || [];
              let anpr = cfgs.find((item: any) => item.aiType === 'VEHICLE_ANPR');
              if (!anpr) {
                anpr = {
                  cameraId: c.id,
                  aiType: 'VEHICLE_ANPR',
                  enabled: true,
                  inferenceFps: 15,
                  confidenceThreshold: 0.8,
                  roiCoordinates: roiString,
                  notes: 'Vùng ROI áp dụng toàn hệ thống'
                };
                cfgs.push(anpr);
              } else {
                anpr.roiCoordinates = roiString;
              }
              await fetch(`${backendUrl}/api/cameras/${c.id}/ai-config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cfgs)
              });
            } catch {}
          }));
          savedToDb = true;
        } else {
          const allErr = await allCamsRes.json().catch(() => null);
          dbErrorMsg = allErr?.message || `CSDL trả về HTTP ${allCamsRes.status}`;
        }
      } else {
        // Cập nhật cho riêng camera hiện tại
        const cfgRes = await fetch(`${backendUrl}/api/cameras/${camera.id}/ai-config`);
        if (cfgRes.ok) {
          const cfgJson = await cfgRes.json();
          let cfgs = cfgJson?.data || [];
          let anpr = cfgs.find((item: any) => item.aiType === 'VEHICLE_ANPR');
          if (!anpr) {
            anpr = {
              cameraId: camera.id,
              aiType: 'VEHICLE_ANPR',
              enabled: true,
              inferenceFps: 15,
              confidenceThreshold: 0.8,
              roiCoordinates: roiString,
              notes: 'Vùng ROI camera ' + camera.name
            };
            cfgs.push(anpr);
          } else {
            anpr.roiCoordinates = roiString;
          }
          const putRes = await fetch(`${backendUrl}/api/cameras/${camera.id}/ai-config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfgs)
          });
          if (putRes.ok) {
            savedToDb = true;
          } else {
            const putErr = await putRes.json().catch(() => null);
            dbErrorMsg = putErr?.message || `CSDL trả về HTTP ${putRes.status}`;
          }
        } else {
          const cfgErr = await cfgRes.json().catch(() => null);
          dbErrorMsg = cfgErr?.message || `CSDL trả về HTTP ${cfgRes.status}`;
        }
      }
    } catch (err: any) {
      dbErrorMsg = err.message || 'Không kết nối được CSDL Backend';
    }

    // BƯỚC 2: ĐỒNG BỘ SANG AI SERVICE (NẾU AI SERVICE ĐANG CHẠY)
    const payload = {
      cameraId: applyAll ? null : camera.id,
      applyAll: applyAll,
      roi: points,
      tripwire: tripwireEnabled ? tripwire : []
    };

    let aiSynced = false;
    try {
      const resp = await fetch(`${effectiveAiUrl}/api/roi-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        aiSynced = true;
      }
    } catch {
      // AI service có thể chưa bật, không coi là lỗi nếu đã lưu vào CSDL
    }

    // ĐÁNH GIÁ KẾT QUẢ
    if (savedToDb || aiSynced) {
      setNotification({
        type: 'success',
        text: applyAll
          ? (savedToDb && !aiSynced
              ? 'Đã lưu cấu hình ROI cho TẤT CẢ Camera vào CSDL thành công! (Sẽ tự áp dụng khi AI khởi động).'
              : 'Đã lưu và áp dụng vùng nhận diện cho TẤT CẢ Camera thành công!')
          : (savedToDb && !aiSynced
              ? `Đã lưu cấu hình ROI cho Camera ${camera.name} vào CSDL thành công!`
              : `Đã lưu cấu hình vùng nhận diện riêng cho Camera ${camera.name} thành công!`)
      });

      onSaveSuccess(points, applyAll);

      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setNotification({
        type: 'error',
        text: `Lỗi lưu cấu hình: ${dbErrorMsg || 'Không kết nối được tới Backend CSDL'}. Vui lòng thử lại.`
      });
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '92vw',
          maxWidth: '1060px',
          maxHeight: '94vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* 1. Header (Light Theme Chuẩn Giao Diện Hệ Thống) */}
        <div style={{
          padding: '16px 24px',
          backgroundColor: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284C7'
            }}>
              <IconPolygon size={20} color="#0284C7" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Cấu Hình Vùng Nhận Diện Xe (ROI)</span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#0284C7',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BAE6FD',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {camera.name} (#{camera.id})
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>
                Kéo 4 điểm góc để khoanh vùng lòng đường hoặc khu vực cửa cổng cần đọc biển số
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            title="Đóng cửa sổ"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* 2. Body Nội Dung */}
        <div style={{
          padding: '16px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          backgroundColor: '#FFFFFF'
        }}>
          {/* Thông báo Alert */}
          {notification && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              background: notification.type === 'success' ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${notification.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
              color: notification.type === 'success' ? '#15803D' : '#B91C1C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{notification.text}</span>
              <button
                type="button"
                onClick={() => setNotification(null)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Thanh Công Cụ Nhanh (Presets & Vẽ Khung) */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '8px 12px'
          }}>
            {/* 3 Mẫu nhanh 1-Click */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                Mẫu nhanh:
              </span>
              {STANDARD_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset.roi)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#1E293B',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                  title={preset.desc}
                >
                  <preset.icon size={14} color="#0284C7" />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>

            {/* Thao tác Vẽ Khung / Thêm bớt điểm */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsDrawingMode(!isDrawingMode);
                  setNotification({
                    type: 'success',
                    text: isDrawingMode
                      ? 'Đã tắt chế độ vẽ nhanh. Bạn có thể kéo thả các điểm tròn để chỉnh vùng.'
                      : 'Chế độ vẽ nhanh: Hãy nhấn giữ chuột trái trên video và kéo thành khung chữ nhật.'
                  });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  backgroundColor: isDrawingMode ? '#0284C7' : '#EFF6FF',
                  border: `1px solid ${isDrawingMode ? '#0284C7' : '#BAE6FD'}`,
                  color: isDrawingMode ? '#FFFFFF' : '#0284C7',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Nhấn chuột và kéo thả trực tiếp trên video để tạo khung nhanh"
              >
                <IconEdit size={14} color={isDrawingMode ? '#FFFFFF' : '#0284C7'} />
                <span>{isDrawingMode ? 'Đang Kéo Vẽ...' : '✎ Vẽ Khung Mới'}</span>
              </button>

              <button
                type="button"
                onClick={handleAddPoint}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer'
                }}
                title="Thêm một điểm góc để uốn theo khúc cua"
              >
                <IconPlus size={13} color="#475569" />
                <span>Thêm góc</span>
              </button>

              <button
                type="button"
                onClick={handleRemovePoint}
                disabled={points.length <= 3}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  backgroundColor: points.length <= 3 ? '#F1F5F9' : '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: points.length <= 3 ? '#94A3B8' : '#EF4444',
                  cursor: points.length <= 3 ? 'not-allowed' : 'pointer'
                }}
                title="Bớt góc (tối thiểu 3 góc)"
              >
                <IconTrash size={13} color={points.length <= 3 ? '#94A3B8' : '#EF4444'} />
                <span>Bớt góc</span>
              </button>
            </div>
          </div>

          {/* Hướng dẫn 1 câu ngắn gọn */}
          <div style={{
            backgroundColor: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: '8px',
            padding: '7px 14px',
            fontSize: '12px',
            color: '#0369A1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>
              💡 <strong>Cách chỉnh:</strong> Dùng chuột kéo các chấm tròn màu xanh <strong>(1, 2, 3, 4)</strong> để bao trọn làn đường, hoặc bấm <strong>"✎ Vẽ Khung Mới"</strong> rồi kéo chuột trực tiếp trên video.
            </span>
            <span style={{ fontWeight: 700, color: '#0284C7', whiteSpace: 'nowrap', marginLeft: '10px' }}>
              {points.length} Điểm Góc
            </span>
          </div>

          {/* Khung Bao Ngoài Căn Giữa 16:9 Chuẩn (Đảm bảo 100% không bị méo hay sinh dải viền thừa 2 bên) */}
          <div style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0F172A',
            borderRadius: '12px',
            padding: '10px',
            border: '1px solid #CBD5E1'
          }}>
            <div
              ref={containerRef}
              onMouseDown={handleContainerMouseDown}
              onMouseMove={handleContainerMouseMove}
              onMouseUp={handleContainerMouseUp}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '860px',
                aspectRatio: '16 / 9',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#000000',
                border: `2px solid ${isDrawingMode ? '#0284C7' : '#38BDF8'}`,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                userSelect: 'none',
                touchAction: 'none',
                cursor: isDrawingMode ? 'crosshair' : 'default',
                flexShrink: 0
              }}
            >
              {/* 1. Ảnh Hiện Trường Chụp Gần Nhất (Phủ khít 100% khung hình video) */}
              {!snapshotFailed && (
                <img
                  src={camera.snapshotApiUrl ? camera.snapshotApiUrl : `${getBackendBaseUrl()}/api/cameras/${camera.id}/snapshot?t=${snapshotTime}`}
                  alt={`Ảnh mẫu hiện trường camera ${camera.name}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    display: 'block',
                    zIndex: 0
                  }}
                  onError={() => {
                    setSnapshotFailed(true);
                  }}
                />
              )}

              {/* Placeholder khi chưa nạp được ảnh */}
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0F172A',
                color: '#94A3B8',
                gap: '8px',
                zIndex: -1
              }}>
                <IconCamera size={34} color="#64748B" />
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#E2E8F0' }}>
                  Đang nạp góc quay camera...
                </span>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Bạn vẫn có thể kéo các điểm góc (1, 2, 3, 4) hoặc chọn Mẫu nhanh
                </span>
              </div>

              {/* 2. Video Luồng Trực Tiếp (Phủ khít 100% khung hình video) */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onPlaying={() => setIsVideoLive(true)}
                onPause={() => setIsVideoLive(false)}
                onError={() => setIsVideoLive(false)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  display: 'block',
                  zIndex: 1,
                  opacity: isVideoLive ? 1 : 0,
                  transition: 'opacity 0.25s ease'
                }}
              />

              {/* SVG Polygon Vẽ Vùng ROI */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 2
                }}
              >
                <defs>
                  <linearGradient id="roiLightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0284C7" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#0369A1" stopOpacity="0.14" />
                  </linearGradient>
                </defs>
                <polygon
                  points={points.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(' ')}
                  fill="url(#roiLightGradient)"
                  stroke="#0284C7"
                  strokeWidth="1.2"
                  strokeDasharray="4 2.5"
                />

                {/* Vạch ảo Tripwire nâng cao (nếu bật) */}
                {tripwireEnabled && tripwire.length === 2 && (
                  <line
                    x1={tripwire[0][0] * 100} y1={tripwire[0][1] * 100}
                    x2={tripwire[1][0] * 100} y2={tripwire[1][1] * 100}
                    stroke="#EA580C"
                    strokeWidth="1.5"
                  />
                )}
              </svg>

              {/* 2 đầu mút Tripwire (nếu bật) */}
              {tripwireEnabled && tripwire.map(([tx, ty], i) => (
                <div
                  key={`tw-${i}`}
                  onMouseDown={(e) => handleMouseDown(100 + i, e)}
                  onTouchStart={(e) => handleTouchStart(100 + i, e)}
                  style={{
                    position: 'absolute',
                    left: `${tx * 100}%`,
                    top: `${ty * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '22px',
                    height: '22px',
                    borderRadius: '4px',
                    backgroundColor: '#EA580C',
                    border: '2px solid #FFFFFF',
                    cursor: activeDraggingIdx === 100 + i ? 'grabbing' : 'grab',
                    zIndex: 11,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                  }}
                  title={`Kéo đầu vạch cắt #${i + 1}`}
                />
              ))}

              {/* 4 Chấm Tròn Kéo Thả (Handles) To Rõ, Trực Quan */}
              {!isDrawingMode && points.map(([px, py], idx) => {
                const isDragging = activeDraggingIdx === idx;
                const pointNumber = idx + 1;

                return (
                  <div
                    key={idx}
                    onMouseDown={(e) => handleMouseDown(idx, e)}
                    onTouchStart={(e) => handleTouchStart(idx, e)}
                    style={{
                      position: 'absolute',
                      left: `${px * 100}%`,
                      top: `${py * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      width: isDragging ? '32px' : '26px',
                      height: isDragging ? '32px' : '26px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      border: '3px solid #0284C7',
                      boxShadow: isDragging
                        ? '0 0 16px rgba(2, 132, 199, 0.9), 0 2px 8px rgba(0,0,0,0.4)'
                        : '0 2px 8px rgba(0, 0, 0, 0.35)',
                      cursor: isDragging ? 'grabbing' : 'grab',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '11px',
                      color: '#0284C7',
                      transition: isDragging ? 'none' : 'transform 0.15s ease, width 0.15s ease, height 0.15s ease'
                    }}
                    title={`Điểm góc #${pointNumber} - Nhấn giữ để kéo`}
                  >
                    {pointNumber}
                  </div>
                );
              })}

              {/* Badge Thông Báo Nguồn Hình Ảnh */}
              <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                border: `1px solid ${isVideoLive ? '#0284C7' : '#F59E0B'}`,
                color: '#0F172A',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                backdropFilter: 'blur(4px)',
                zIndex: 3,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isVideoLive ? '#10B981' : '#F59E0B'
                }} />
                <span>
                  {isVideoLive ? 'Luồng WebRTC Trực Tiếp' : 'Ảnh Góc Quay Gần Nhất (Để Căn Chỉnh Vùng)'}
                </span>
              </div>
            </div>
          </div>

          {/* Phạm Vi Áp Dụng (Light Card Gọn Gàng) */}
          <div style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
              Phạm Vi Áp Dụng:
            </span>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                color: !applyAll ? '#0284C7' : '#475569',
                fontWeight: !applyAll ? 600 : 400
              }}>
                <input
                  type="radio"
                  name="roiScope"
                  checked={!applyAll}
                  onChange={() => setApplyAll(false)}
                  style={{ accentColor: '#0284C7' }}
                />
                <span>Chỉ áp dụng riêng cho camera này (<strong>{camera.name}</strong>)</span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                color: applyAll ? '#059669' : '#475569',
                fontWeight: applyAll ? 600 : 400
              }}>
                <input
                  type="radio"
                  name="roiScope"
                  checked={applyAll}
                  onChange={() => setApplyAll(true)}
                  style={{ accentColor: '#059669' }}
                />
                <span>Đồng bộ cho <strong>TẤT CẢ Camera</strong> trong hệ thống</span>
              </label>
            </div>
          </div>

          {/* Mục Cấu Hình Nâng Cao (Thu Gọn / Accordion) */}
          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '6px' }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{showAdvanced ? '▼ Thu gọn cấu hình nâng cao' : '▶ Tùy chọn nâng cao (Vạch cắt Tripwire, Toạ độ %)'}</span>
            </button>

            {showAdvanced && (
              <div style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={tripwireEnabled}
                    onChange={(e) => setTripwireEnabled(e.target.checked)}
                    style={{ accentColor: '#EA580C' }}
                  />
                  <span>Bật vạch cắt Tripwire màu cam (Chỉ chốt biển số khi xe đi cắt qua vạch)</span>
                </label>

                {/* Tọa độ số */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                  {points.map(([px, py], pIdx) => (
                    <div key={pIdx} style={{ fontSize: '11px', color: '#64748B', backgroundColor: '#FFFFFF', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                      Điểm #{pIdx + 1}: X=<strong>{Math.round(px * 100)}%</strong>, Y=<strong>{Math.round(py * 100)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Footer Actions (Light Theme Gọn Gàng) */}
        <div style={{
          padding: '14px 24px',
          backgroundColor: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <button
            type="button"
            onClick={() => handleApplyPreset(STANDARD_PRESETS[0].roi)}
            style={{
              padding: '8px 14px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#475569',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <IconReset size={14} color="#64748B" />
            <span>Khôi phục mặc định</span>
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                border: '1px solid #CBD5E1',
                color: '#475569',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 22px',
                backgroundColor: saving ? '#94A3B8' : '#0284C7',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '8px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)',
                transition: 'all 0.15s'
              }}
            >
              <IconCheck size={15} color="#FFFFFF" />
              <span>{saving ? 'Đang lưu...' : 'Lưu Cấu Hình'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RoiConfigModal;
