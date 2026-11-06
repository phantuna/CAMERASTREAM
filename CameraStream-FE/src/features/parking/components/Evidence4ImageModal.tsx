import { useState, type FC } from 'react';
import type { ParkingSessionDto } from '../types/parking.types';
import { resolveImageUrl } from '../../../shared/utils/imageUrl';
import { SnapshotImage } from '../../../shared/components/SnapshotImage';

export interface Evidence4ImageModalProps {
  session: ParkingSessionDto | null;
  onClose: () => void;
}

export const Evidence4ImageModal: FC<Evidence4ImageModalProps> = ({ session, onClose }) => {
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);

  if (!session) return null;

  const inOverview = session.inOverviewImagePath ? resolveImageUrl(session.inOverviewImagePath) : undefined;
  const inPlate = session.inPlateImagePath ? resolveImageUrl(session.inPlateImagePath) : undefined;
  const outOverview = session.outOverviewImagePath ? resolveImageUrl(session.outOverviewImagePath) : undefined;
  const outPlate = session.outPlateImagePath ? resolveImageUrl(session.outPlateImagePath) : undefined;

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'ACTIVE':
        return (
          <span style={{
            background: '#EFF6FF',
            color: '#1D4ED8',
            border: '1px solid #BFDBFE',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600
          }}>
            ĐANG TRONG BÃI
          </span>
        );
      case 'COMPLETED':
        return (
          <span style={{
            background: '#ECFDF5',
            color: '#047857',
            border: '1px solid #A7F3D0',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600
          }}>
            ĐÃ HOÀN THÀNH
          </span>
        );
      case 'UNMATCHED_OUT':
        return (
          <span style={{
            background: '#FFFBEB',
            color: '#B45309',
            border: '1px solid #FDE68A',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600
          }}>
            RA KHÔNG KHỚP
          </span>
        );
      default:
        return (
          <span style={{
            background: '#F1F5F9',
            color: '#475569',
            border: '1px solid #CBD5E1',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11
          }}>
            {st}
          </span>
        );
    }
  };

  const getVehicleBadge = (vType: string) => {
    switch (vType) {
      case 'CAR': return 'Ô tô';
      case 'BIKE': return 'Xe máy';
      case 'TRUCK': return 'Xe tải';
      default: return 'Phương tiện';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(3px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '18px',
                fontWeight: 700,
                color: '#1D4ED8',
                backgroundColor: '#EFF6FF',
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid #BFDBFE'
              }}
            >
              {session.plateNumber}
            </span>
            <span style={{
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: '#F1F5F9',
              color: '#334155',
              border: '1px solid #E2E8F0'
            }}>
              {getVehicleBadge(session.vehicleType)}
            </span>
            {getStatusBadge(session.status)}
            {session.durationFormatted && (
              <span
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#1D4ED8',
                  border: '1px solid #BFDBFE',
                  fontSize: '12px',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}
              >
                Thời gian đỗ: <strong>{session.durationFormatted}</strong>
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content - 4-Image Grid */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, backgroundColor: '#FFFFFF' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '20px'
            }}
          >
            {/* 1. Làn Vào - Toàn Cảnh */}
            <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0284C7' }}>Làn Vào - Toàn Cảnh</span>
                <span style={{ fontSize: '11px', color: '#64748B' }}>{session.inLaneName || 'Làn Vào'}</span>
              </div>
              <div
                style={{ height: '200px', backgroundColor: '#F1F5F9', borderRadius: '6px', overflow: 'hidden', border: '1px solid #CBD5E1', cursor: inOverview ? 'zoom-in' : 'default' }}
                onClick={() => inOverview && setZoomedImage({ url: inOverview, title: `Làn Vào - Toàn Cảnh (${session.plateNumber})` })}
              >
                <SnapshotImage src={inOverview} alt="Làn vào toàn cảnh" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748B' }}>
                Giờ vào: <strong style={{ color: '#0F172A' }}>{session.inTime || '---'}</strong>
              </div>
            </div>

            {/* 2. Làn Vào - Biển Số */}
            <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0284C7' }}>Làn Vào - Biển Số</span>
                <span style={{ fontSize: '11px', color: '#64748B' }}>ALPR In</span>
              </div>
              <div
                style={{ height: '200px', backgroundColor: '#F1F5F9', borderRadius: '6px', overflow: 'hidden', border: '1px solid #CBD5E1', cursor: inPlate ? 'zoom-in' : 'default' }}
                onClick={() => inPlate && setZoomedImage({ url: inPlate, title: `Làn Vào - Biển Số (${session.plateNumber})` })}
              >
                <SnapshotImage src={inPlate} alt="Làn vào biển số" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748B' }}>
                Biển số quét: <strong style={{ color: '#0284C7' }}>{session.plateNumber}</strong>
              </div>
            </div>

            {/* 3. Làn Ra - Toàn Cảnh */}
            <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#059669' }}>Làn Ra - Toàn Cảnh</span>
                <span style={{ fontSize: '11px', color: '#64748B' }}>{session.outLaneName || 'Làn Ra'}</span>
              </div>
              <div
                style={{ height: '200px', backgroundColor: '#F1F5F9', borderRadius: '6px', overflow: 'hidden', border: '1px solid #CBD5E1', cursor: outOverview ? 'zoom-in' : 'default' }}
                onClick={() => outOverview && setZoomedImage({ url: outOverview, title: `Làn Ra - Toàn Cảnh (${session.plateNumber})` })}
              >
                <SnapshotImage src={outOverview} alt="Làn ra toàn cảnh" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748B' }}>
                Giờ ra: <strong style={{ color: '#0F172A' }}>{session.outTime || 'Chưa ra'}</strong>
              </div>
            </div>

            {/* 4. Làn Ra - Biển Số */}
            <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#059669' }}>Làn Ra - Biển Số</span>
                <span style={{ fontSize: '11px', color: '#64748B' }}>ALPR Out</span>
              </div>
              <div
                style={{ height: '200px', backgroundColor: '#F1F5F9', borderRadius: '6px', overflow: 'hidden', border: '1px solid #CBD5E1', cursor: outPlate ? 'zoom-in' : 'default' }}
                onClick={() => outPlate && setZoomedImage({ url: outPlate, title: `Làn Ra - Biển Số (${session.plateNumber})` })}
              >
                <SnapshotImage src={outPlate} alt="Làn ra biển số" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748B' }}>
                Biển số quét: <strong style={{ color: '#059669' }}>{session.outTime ? session.plateNumber : '---'}</strong>
              </div>
            </div>
          </div>

          {/* Metadata information card */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              fontSize: '13px',
              border: '1px solid #E2E8F0'
            }}
          >
            <div>
              <span style={{ color: '#64748B' }}>Công ty / Đơn vị:</span>{' '}
              <strong style={{ color: '#0F172A' }}>{session.companyName || 'Khách vãng lai'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748B' }}>Phòng ban:</span>{' '}
              <strong style={{ color: '#0F172A' }}>{session.departmentName || '---'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748B' }}>Nhà thầu:</span>{' '}
              <strong style={{ color: '#0F172A' }}>{session.contractorName || '---'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748B' }}>Ghi chú:</span>{' '}
              <span style={{ color: '#334155' }}>{session.notes || 'Không có ghi chú'}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#F8FAFC'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#334155',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Fullscreen Zoom overlay */}
      {zoomedImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setZoomedImage(null)}
        >
          <div style={{ color: '#FFFFFF', fontSize: '15px', marginBottom: '12px', fontWeight: 600 }}>
            {zoomedImage.title} (Nhấp chuột vào bất cứ đâu để đóng)
          </div>
          <img
            src={zoomedImage.url}
            alt={zoomedImage.title}
            style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
          />
        </div>
      )}
    </div>
  );
};
export default Evidence4ImageModal;
