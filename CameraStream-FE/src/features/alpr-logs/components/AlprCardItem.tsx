import type { FC } from 'react';
import type { RealDetectionEvent } from '../types';
import {
  IconCamera,
  IconCalendar,
  IconEye,
  IconMapPin
} from '../../../components/SurveillanceIcons';
import { formatDetectionTime } from '../../../components/VehicleAccessPanel';

export interface AlprCardItemProps {
  detection: RealDetectionEvent;
  onClickSnapshot: (detection: RealDetectionEvent) => void;
}

export const AlprCardItem: FC<AlprCardItemProps> = ({
  detection: det,
  onClickSnapshot
}) => {
  const isPerson = Boolean(
    (det as any).personName ||
    det.note?.includes('Person') ||
    (det.vehicleType || '').toUpperCase() === 'PERSON' ||
    (det as any).module === 'FACE_ID' ||
    (det as any).eventType === 'FACE_RECOGNITION'
  );
  const personName = (det as any).personName;
  const isMoto = !isPerson && det.vehicleType === 'MOTO';
  const isTruck = !isPerson && det.vehicleType === 'TRUCK';

  const gateDisplay = det.gateName || (det.laneId ? `Làn ${det.laneId}` : null) || det.location || 'Cổng kiểm soát';
  const cameraDisplay = det.cameraName || (det.cameraId ? `Camera #${det.cameraId}` : 'Camera giám sát');

  return (
    <div
      onClick={() => onClickSnapshot(det)}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: `1.5px solid ${isPerson ? '#E9D5FF' : isMoto ? '#A7F3D0' : isTruck ? '#FED7AA' : '#BAE6FD'}`,
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '14px 16px',
        minHeight: '190px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isPerson ? '#7C3AED' : isMoto ? '#059669' : isTruck ? '#EA580C' : '#0284C7';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isPerson ? '#E9D5FF' : isMoto ? '#A7F3D0' : isTruck ? '#FED7AA' : '#BAE6FD';
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.05)';
      }}
    >
      {/* 1. Header Row: Loại Xe & Làn Cổng (Không tải ảnh, không hiện % độ tin cậy) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        {/* Badge Loại Phương Tiện */}
        <div style={{
          backgroundColor: isPerson ? '#EDE9FE' : isMoto ? '#D1FAE5' : isTruck ? '#FFEDD5' : '#E0F2FE',
          color: isPerson ? '#6D28D9' : isMoto ? '#047857' : isTruck ? '#C2410C' : '#0369A1',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center'
        }}>
          {isPerson ? 'NGƯỜI' : isMoto ? 'XE MÁY' : isTruck ? 'XE TẢI' : 'Ô TÔ'}
        </div>

        {/* Badge Vị Trí / Cổng */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#475569',
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          padding: '3px 8px',
          borderRadius: '6px',
          maxWidth: '130px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          <IconMapPin size={11} color="#64748B" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{gateDisplay}</span>
        </div>
      </div>

      {/* 2. Biển Số Xe Hiển Thị To & Đậm Nét (Phong cách Biển Số Thông Minh) */}
      <div style={{
        backgroundColor: isPerson ? '#FAF5FF' : '#F0F9FF',
        border: `2px solid ${isPerson ? '#C4B5FD' : '#7DD3FC'}`,
        borderRadius: '8px',
        padding: '10px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '12px'
      }}>
        <span style={{
          fontSize: '19px',
          fontWeight: 900,
          color: isPerson ? '#5B21B6' : '#0369A1',
          fontFamily: isPerson ? 'inherit' : "'Roboto Mono', 'SF Pro Display', monospace",
          letterSpacing: isPerson ? 'normal' : '1.5px',
          textTransform: 'uppercase'
        }}>
          {isPerson ? (personName || det.plateNumber || 'NGƯỜI ĐI BỘ') : (det.plateNumber || 'CHƯA RÕ BIỂN')}
        </span>
      </div>

      {/* 3. Thông Tin Chi Tiết (Thời gian, Camera) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px', color: '#64748B', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <IconCalendar size={13} color="#94A3B8" />
            <span style={{ color: '#64748B' }}>Thời gian:</span>
          </span>
          <span style={{ color: '#0F172A', fontWeight: 600, fontFamily: 'monospace' }}>
            {formatDetectionTime(det.detectedAt, det.timestamp)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <IconCamera size={13} color="#94A3B8" />
            <span style={{ color: '#64748B' }}>Camera:</span>
          </span>
          <span style={{ color: '#334155', fontWeight: 600, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cameraDisplay}>
            {cameraDisplay}
          </span>
        </div>
      </div>

      {/* 4. Nút Xem Chi Tiết / Ảnh Chụp (Tải ảnh theo nhu cầu - Lazy Load on Click) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClickSnapshot(det);
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '8px 12px',
          backgroundColor: '#F8FAFC',
          border: '1px solid #CBD5E1',
          borderRadius: '7px',
          fontSize: '11.5px',
          fontWeight: 700,
          color: '#0284C7',
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#0284C7';
          e.currentTarget.style.color = '#FFFFFF';
          e.currentTarget.style.borderColor = '#0284C7';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#F8FAFC';
          e.currentTarget.style.color = '#0284C7';
          e.currentTarget.style.borderColor = '#CBD5E1';
        }}
      >
        <IconEye size={14} />
        <span>Xem Ảnh Chụp & Chi Tiết</span>
      </button>
    </div>
  );
};

export default AlprCardItem;
