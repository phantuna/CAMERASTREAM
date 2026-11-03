import { useState, useEffect, type FC } from 'react';
import {
  IconClose,
  IconCheck,
  IconCar,
  IconShield,
  IconUser,
  IconAlertTriangle
} from './SurveillanceIcons';

export interface CameraAiPipelineItem {
  id?: number;
  cameraId: number;
  aiType: 'VEHICLE_ANPR' | 'FACE_RECOGNITION' | 'INTRUSION_ROI' | string;
  enabled: boolean;
  inferenceFps: number;
  confidenceThreshold: number;
  roiCoordinates?: string;
  notes?: string;
}

interface CameraAiConfigModalProps {
  apiBaseUrl: string;
  camera: {
    id: number;
    name: string;
    ipAddress?: string;
    rtspSourceUrl?: string;
    rtspSubStreamUrl?: string;
    type?: string;
  };
  onClose: () => void;
  onSaved?: () => void;
}

export const CameraAiConfigModal: FC<CameraAiConfigModalProps> = ({
  apiBaseUrl,
  camera,
  onClose,
  onSaved
}) => {
  const [pipelines, setPipelines] = useState<CameraAiPipelineItem[]>([]);
  const [subStreamUrl, setSubStreamUrl] = useState<string>(camera.rtspSubStreamUrl || '');
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    const fetchConfigs = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/api/cameras/${camera.id}/ai-config`);
        const json = await res.json();
        if (!isCancelled && json?.data && Array.isArray(json.data)) {
          // Tôn trọng 100% cấu hình từ CSDL Backend (kể cả khi người dùng chủ động tắt toàn bộ)
          setPipelines(json.data);
        }
      } catch (err) {
        if (!isCancelled) console.warn('Lỗi tải cấu hình AI camera:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchConfigs();
    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, camera.id, camera.type, camera.name]);

  const handleToggle = (aiType: string) => {
    setPipelines((prev) =>
      prev.map((p) => (p.aiType === aiType ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const handleFpsChange = (aiType: string, fps: number) => {
    setPipelines((prev) =>
      prev.map((p) => (p.aiType === aiType ? { ...p, inferenceFps: fps } : p))
    );
  };

  const handleConfidenceChange = (aiType: string, conf: number) => {
    setPipelines((prev) =>
      prev.map((p) => (p.aiType === aiType ? { ...p, confidenceThreshold: conf } : p))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Cập nhật rtspSubStreamUrl của Camera nếu có thay đổi
      if (subStreamUrl !== (camera.rtspSubStreamUrl || '')) {
        await fetch(`${apiBaseUrl}/api/cameras/${camera.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: camera.name,
            ipAddress: camera.ipAddress,
            rtspSubStreamUrl: subStreamUrl
          })
        });
      }

      // 2. Cập nhật danh sách AI Pipelines
      await fetch(`${apiBaseUrl}/api/cameras/${camera.id}/ai-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipelines)
      });

      setSaveSuccess(true);
      setTimeout(() => {
        if (onSaved) onSaved();
        onClose();
      }, 700);
    } catch (err) {
      alert('Lưu cấu hình AI thất bại: ' + err);
    } finally {
      setIsSaving(false);
    }
  };

  const getAiMeta = (aiType: string) => {
    switch (aiType) {
      case 'VEHICLE_ANPR':
        return {
          title: 'Nhận Diện Biển Số Xe (ALPR)',
          desc: 'Tự động quét biển số, bóc tách ký tự và gửi về Phân hệ Xe',
          icon: IconCar,
          color: '#10B981',
          bg: '#ECFDF5',
          border: '#A7F3D0'
        };
      case 'FACE_RECOGNITION':
        return {
          title: 'Nhận Diện Khuôn Mặt (FaceID)',
          desc: 'Quét khuôn mặt, so khớp nhân sự và gửi về Phân hệ Người',
          icon: IconUser,
          color: '#7C3AED',
          bg: '#F5F3FF',
          border: '#DDD6FE'
        };
      case 'SAFETY_PPE':
        return {
          title: 'An Toàn Lao Động & Mũ Bảo Hộ (PPE)',
          desc: 'Phát hiện công nhân không đội mũ/áo bảo hộ trong công trường/nhà máy',
          icon: IconAlertTriangle,
          color: '#EA580C',
          bg: '#FFF7ED',
          border: '#FED7AA'
        };
      case 'FIRE_DETECT':
        return {
          title: 'Cảnh Báo Cháy & Khói Sớm (Fire & Smoke)',
          desc: 'Phát hiện ngọn lửa hoặc đám khói bất thường, kích hoạt báo động',
          icon: IconAlertTriangle,
          color: '#DC2626',
          bg: '#FEF2F2',
          border: '#FECACA'
        };
      case 'INTRUSION_ROI':
      default:
        return {
          title: 'Hàng Rào Ảo & Cảnh Báo Xâm Nhập',
          desc: 'Phát hiện chuyển động vượt ranh giới hoặc khu vực cấm',
          icon: IconShield,
          color: '#0284C7',
          bg: '#EFF6FF',
          border: '#BAE6FD'
        };
    }
  };

  // Xác định chế độ đang bật hiện tại của Camera
  const anprEnabled = pipelines.find(p => p.aiType === 'VEHICLE_ANPR')?.enabled || false;
  const faceEnabled = pipelines.find(p => p.aiType === 'FACE_RECOGNITION')?.enabled || false;
  const securityEnabled = pipelines.find(p => p.aiType === 'INTRUSION_ROI' || p.aiType === 'SAFETY_PPE' || p.aiType === 'FIRE_DETECT')?.enabled || false;

  const currentMode = (anprEnabled && !faceEnabled && !securityEnabled)
    ? 'VEHICLE'
    : (!anprEnabled && faceEnabled && !securityEnabled)
      ? 'PERSON'
      : (!anprEnabled && !faceEnabled && securityEnabled)
        ? 'SECURITY'
        : (anprEnabled || faceEnabled || securityEnabled)
          ? 'MULTI'
          : 'NONE';

  const selectMainPurpose = (purpose: 'VEHICLE' | 'PERSON' | 'SECURITY' | 'ALL' | 'OFF') => {
    setPipelines(prev => prev.map(p => {
      if (purpose === 'OFF') {
        return { ...p, enabled: false };
      } else if (purpose === 'VEHICLE') {
        return { ...p, enabled: p.aiType === 'VEHICLE_ANPR' };
      } else if (purpose === 'PERSON') {
        return { ...p, enabled: p.aiType === 'FACE_RECOGNITION' };
      } else if (purpose === 'SECURITY') {
        return { ...p, enabled: p.aiType === 'INTRUSION_ROI' || p.aiType === 'SAFETY_PPE' || p.aiType === 'FIRE_DETECT' };
      } else if (purpose === 'ALL') {
        return { ...p, enabled: true };
      }
      return p;
    }));
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        width: '90vw',
        maxWidth: '620px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
        border: '1.5px solid #CBD5E1'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
              Cấu Hình Module AI cho Camera #{camera.id}
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748B' }}>
              Thiết bị: <strong style={{ color: '#0F172A' }}>{camera.name}</strong> ({camera.ipAddress || '127.0.0.1'})
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* MỤC ĐÍCH HOẠT ĐỘNG CHÍNH CỦA CAMERA */}
          <div style={{
            backgroundColor: '#F8FAFC',
            border: '1.5px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Chọn Phân Hệ Nhận Diện Của Camera:</span>
              </div>
              <button
                type="button"
                onClick={() => selectMainPurpose('OFF')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: currentMode === 'NONE' ? '1.5px solid #EF4444' : '1px solid #CBD5E1',
                  backgroundColor: currentMode === 'NONE' ? '#FEF2F2' : '#FFFFFF',
                  color: currentMode === 'NONE' ? '#DC2626' : '#64748B',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
                title="Tắt toàn bộ tiến trình AI trên camera này để giải phóng 100% CPU"
              >
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: currentMode === 'NONE' ? '#EF4444' : '#94A3B8'
                }} />
                <span>{currentMode === 'NONE' ? '● Đã Tắt Toàn Bộ AI' : 'Tắt Hết AI'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {/* Option 1: Xe */}
              <div
                onClick={() => selectMainPurpose('VEHICLE')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `2px solid ${currentMode === 'VEHICLE' ? '#10B981' : '#E2E8F0'}`,
                  backgroundColor: currentMode === 'VEHICLE' ? '#ECFDF5' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: currentMode === 'VEHICLE' ? '0 3px 10px rgba(16, 185, 129, 0.2)' : 'none',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: currentMode === 'VEHICLE' ? '#10B981' : '#F1F5F9' }}>
                      <IconCar size={16} color={currentMode === 'VEHICLE' ? '#FFF' : '#64748B'} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: currentMode === 'VEHICLE' ? '#065F46' : '#0F172A' }}>
                      Nhận Diện Xe (ALPR)
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: currentMode === 'VEHICLE' ? '#059669' : '#CBD5E1'
                  }}>
                    {currentMode === 'VEHICLE' ? '● ĐANG CHỌN' : '○'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: currentMode === 'VEHICLE' ? '#047857' : '#64748B' }}>
                  Gán camera cho Phân hệ Xe: Quét biển số ô tô, xe máy, kiểm soát barie ra/vào.
                </div>
              </div>

              {/* Option 2: Người */}
              <div
                onClick={() => selectMainPurpose('PERSON')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `2px solid ${currentMode === 'PERSON' ? '#7C3AED' : '#E2E8F0'}`,
                  backgroundColor: currentMode === 'PERSON' ? '#F5F3FF' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: currentMode === 'PERSON' ? '0 3px 10px rgba(124, 58, 237, 0.2)' : 'none',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: currentMode === 'PERSON' ? '#7C3AED' : '#F1F5F9' }}>
                      <IconUser size={16} color={currentMode === 'PERSON' ? '#FFF' : '#64748B'} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: currentMode === 'PERSON' ? '#5B21B6' : '#0F172A' }}>
                      Nhận Diện Người (FaceID)
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: currentMode === 'PERSON' ? '#7C3AED' : '#CBD5E1'
                  }}>
                    {currentMode === 'PERSON' ? '● ĐANG CHỌN' : '○'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: currentMode === 'PERSON' ? '#6D28D9' : '#64748B' }}>
                  Gán camera cho Phân hệ Người: Quét khuôn mặt, nhận diện nhân sự & điểm danh.
                </div>
              </div>

              {/* Option 3: An ninh */}
              <div
                onClick={() => selectMainPurpose('SECURITY')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `2px solid ${currentMode === 'SECURITY' ? '#0284C7' : '#E2E8F0'}`,
                  backgroundColor: currentMode === 'SECURITY' ? '#EFF6FF' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: currentMode === 'SECURITY' ? '0 3px 10px rgba(2, 132, 199, 0.2)' : 'none',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: currentMode === 'SECURITY' ? '#0284C7' : '#F1F5F9' }}>
                      <IconShield size={16} color={currentMode === 'SECURITY' ? '#FFF' : '#64748B'} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: currentMode === 'SECURITY' ? '#075985' : '#0F172A' }}>
                      An Ninh & Hàng Rào
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: currentMode === 'SECURITY' ? '#0284C7' : '#CBD5E1'
                  }}>
                    {currentMode === 'SECURITY' ? '● ĐANG CHỌN' : '○'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: currentMode === 'SECURITY' ? '#0369A1' : '#64748B' }}>
                  Gán cho Giám sát an ninh: Hàng rào ảo ROI, mũ bảo hộ PPE & cảnh báo khói lửa.
                </div>
              </div>

              {/* Option 4: Đa nhiệm */}
              <div
                onClick={() => selectMainPurpose('ALL')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `2px solid ${currentMode === 'MULTI' ? '#D97706' : '#E2E8F0'}`,
                  backgroundColor: currentMode === 'MULTI' ? '#FFFBEB' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: currentMode === 'MULTI' ? '0 3px 10px rgba(217, 119, 6, 0.2)' : 'none',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ padding: '5px', borderRadius: '6px', backgroundColor: currentMode === 'MULTI' ? '#D97706' : '#F1F5F9' }}>
                      <IconCheck size={16} color={currentMode === 'MULTI' ? '#FFF' : '#64748B'} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: currentMode === 'MULTI' ? '#92400E' : '#0F172A' }}>
                      Đa Nhiệm (Xe + Người)
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: currentMode === 'MULTI' ? '#D97706' : '#CBD5E1'
                  }}>
                    {currentMode === 'MULTI' ? '● ĐANG CHỌN' : '○'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: currentMode === 'MULTI' ? '#B45309' : '#64748B' }}>
                  Chạy song song cả nhận diện Biển số xe và nhận diện Khuôn mặt người.
                </div>
              </div>
            </div>
          </div>
          {/* Sub-stream Section */}
          <div style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                Luồng Phụ RTSP Sub-stream (Tối ưu cho AI)
              </label>
              <span style={{ fontSize: '10.5px', color: '#059669', fontWeight: 700, backgroundColor: '#DCFCE7', padding: '1px 6px', borderRadius: '4px' }}>
                TIẾT KIỆM 80% RAM
              </span>
            </div>
            <input
              type="text"
              value={subStreamUrl}
              onChange={(e) => setSubStreamUrl(e.target.value)}
              placeholder="VD: rtsp://admin:pass@192.168.1.100:554/Streaming/Channels/102"
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1.5px solid #CBD5E1',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#0F172A',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box'
              }}
            />
            <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748B' }}>
              Luồng phụ độ phân giải thấp (640x360 hoặc 720p) giúp giải nén siêu nhẹ, giảm tải hoàn toàn cho GPU/CPU.
            </p>
          </div>

          {/* AI Pipelines */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                Các Phân Hệ AI Áp Dụng Cho Camera Này:
              </div>
              <div style={{ fontSize: '11px', color: '#059669', backgroundColor: '#ECFDF5', padding: '3px 8px', borderRadius: '6px', border: '1px solid #A7F3D0', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                <span>Đồng bộ theo thời gian thực</span>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px' }}>
                Đang tải cấu hình AI...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pipelines.map((item) => {
                  const meta = getAiMeta(item.aiType);
                  const Icon = meta.icon;

                  return (
                    <div
                      key={item.aiType}
                      style={{
                        border: item.enabled ? `1.5px solid ${meta.border}` : '1.5px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '14px',
                        backgroundColor: item.enabled ? meta.bg : '#FAFAFA',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Top: Icon + Title + Switch */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '9px',
                            backgroundColor: item.enabled ? '#FFFFFF' : '#F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: item.enabled ? meta.color : '#94A3B8',
                            boxShadow: item.enabled ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
                          }}>
                            <Icon size={19} color={item.enabled ? meta.color : '#94A3B8'} />
                          </div>
                          <div>
                            <div style={{ fontSize: '13.5px', fontWeight: 800, color: item.enabled ? '#0F172A' : '#64748B' }}>
                              {meta.title}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
                              {meta.desc}
                            </div>
                          </div>
                        </div>

                        {/* Toggle Button với Status rõ ràng */}
                        <button
                          type="button"
                          onClick={() => handleToggle(item.aiType)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            border: item.enabled ? `1.5px solid ${meta.color}` : '1.5px solid #CBD5E1',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            backgroundColor: item.enabled ? meta.color : '#F1F5F9',
                            color: item.enabled ? '#FFFFFF' : '#64748B',
                            boxShadow: item.enabled ? `0 2px 6px ${meta.color}40` : 'none',
                            transition: 'all 0.15s ease',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: item.enabled ? '#FFFFFF' : '#94A3B8'
                          }} />
                          <span>{item.enabled ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
                        </button>
                      </div>

                      {/* Expanded Options when Enabled */}
                      {item.enabled && (
                        <div style={{
                          marginTop: '12px',
                          paddingTop: '12px',
                          borderTop: `1px solid ${meta.border}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}>
                          {/* FPS Slider */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 700, color: '#334155' }}>
                                Tần suất xử lý AI (Frame Skipping):
                              </span>
                              <span style={{ fontWeight: 800, color: meta.color }}>
                                {item.inferenceFps} FPS
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="15"
                              value={item.inferenceFps}
                              onChange={(e) => handleFpsChange(item.aiType, parseInt(e.target.value, 10))}
                              style={{ width: '100%', accentColor: meta.color }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94A3B8' }}>
                              <span>1 FPS (Siêu nhẹ)</span>
                              <span>6 FPS (Khuyên dùng)</span>
                              <span>15 FPS (Tối đa)</span>
                            </div>
                          </div>

                          {/* Confidence */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 700, color: '#334155' }}>
                                Ngưỡng tin cậy (Confidence):
                              </span>
                              <span style={{ fontWeight: 800, color: meta.color }}>
                                {Math.round(item.confidenceThreshold * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="50"
                              max="99"
                              value={Math.round(item.confidenceThreshold * 100)}
                              onChange={(e) => handleConfidenceChange(item.aiType, parseInt(e.target.value, 10) / 100)}
                              style={{ width: '100%', accentColor: meta.color }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1.5px solid #CBD5E1',
              color: '#475569',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Hủy
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || loading}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              backgroundColor: saveSuccess ? '#059669' : '#0284C7',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
            }}
          >
            {saveSuccess ? (
              <>
                <IconCheck size={16} />
                <span>Đã Lưu!</span>
              </>
            ) : isSaving ? (
              <span>Đang lưu...</span>
            ) : (
              <span>Lưu Cấu Hình AI</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraAiConfigModal;
