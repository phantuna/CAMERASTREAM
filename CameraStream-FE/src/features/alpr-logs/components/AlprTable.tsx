import type { FC } from 'react';
import type { RealDetectionEvent } from '../types';
import {
  IconUser,
  IconEye,
  IconCamera,
  IconClock
} from '../../../components/SurveillanceIcons';
import { formatDetectionTime } from '../../../components/VehicleAccessPanel';

export interface AlprTableProps {
  detections: RealDetectionEvent[];
  onClickSnapshot: (detection: RealDetectionEvent) => void;
}

export const AlprTable: FC<AlprTableProps> = ({
  detections,
  onClickSnapshot
}) => {
  if (detections.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
        Không tìm thấy sự kiện phương tiện nào phù hợp với bộ lọc.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', backgroundColor: '#FFFFFF' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
        <thead>
          <tr style={{ backgroundColor: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
            <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '170px' }}>
              Biển Số Xe
            </th>
            <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '130px' }}>
              Phân Loại
            </th>
            <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '140px' }}>
              Làn / Cổng
            </th>
            <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: '160px' }}>
              Camera Giám Sát
            </th>
            <th style={{ padding: '12px 14px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: '160px' }}>
              Thời Gian Nhận Diện
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '120px', textAlign: 'right' }}>
              Thao Tác
            </th>
          </tr>
        </thead>
        <tbody>
          {detections.map((det, idx) => {
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
            const isOut = det.laneDirection === 'OUT';

            return (
              <tr
                key={`det-tbl-${det.id || 'item'}-${idx}`}
                style={{
                  borderBottom: '1px solid #F1F5F9',
                  backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC')}
              >
                {/* 1. Biển Số Xe */}
                <td style={{ padding: '10px 16px' }}>
                  {isPerson ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      backgroundColor: '#F5F3FF',
                      border: '1px solid #DDD6FE',
                      borderRadius: '6px',
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
                      padding: '5px 12px',
                      backgroundColor: '#EFF6FF',
                      border: '1.5px solid #93C5FD',
                      borderRadius: '6px',
                      color: '#1D4ED8',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '13.5px',
                      letterSpacing: '0.04em'
                    }}>
                      {det.plateNumber || 'CHƯA RÕ'}
                    </span>
                  )}
                </td>

                {/* 2. Phân Loại Phương Tiện */}
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: isPerson ? '#F5F3FF' : isMoto ? '#ECFDF5' : (isTruck ? '#FFF7ED' : '#EFF6FF'),
                    color: isPerson ? '#7C3AED' : isMoto ? '#059669' : (isTruck ? '#C2410C' : '#1D4ED8'),
                    border: `1px solid ${isPerson ? '#DDD6FE' : isMoto ? '#A7F3D0' : (isTruck ? '#FED7AA' : '#BFDBFE')}`
                  }}>
                    {isPerson ? 'NGƯỜI' : isMoto ? 'XE MÁY' : isTruck ? 'XE TẢI' : 'Ô TÔ'}
                  </span>
                </td>

                {/* 3. Làn / Cổng Ra Vào */}
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: isOut ? '#EFF6FF' : '#DCFCE7',
                    color: isOut ? '#1D4ED8' : '#15803D',
                    border: `1px solid ${isOut ? '#BFDBFE' : '#BBF7D0'}`
                  }}>
                    {isOut ? '🔵 CỔNG RA' : '🟢 CỔNG VÀO'}
                  </span>
                </td>

                {/* 4. Camera Giám Sát */}
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0F172A', fontWeight: 600 }}>
                    <IconCamera size={14} color="#0284C7" />
                    <span>{det.gateName || det.cameraName || (det.cameraId ? `Cam #${det.cameraId}` : 'Camera giám sát')}</span>
                  </div>
                </td>

                {/* 5. Thời Gian Nhận Diện */}
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#475569', fontSize: '12px' }}>
                    <IconClock size={13} color="#64748B" />
                    <span>{formatDetectionTime(det.detectedAt, det.timestamp)}</span>
                  </div>
                </td>

                {/* 6. Thao Tác (Xem Ảnh On-Demand) */}
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => onClickSnapshot(det)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 12px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      color: '#0284C7',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#EFF6FF';
                      e.currentTarget.style.borderColor = '#93C5FD';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF';
                      e.currentTarget.style.borderColor = '#CBD5E1';
                    }}
                    title="Xem chi tiết & ảnh chụp"
                  >
                    <IconEye size={13} color="#0284C7" />
                    <span>Xem Ảnh</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AlprTable;
