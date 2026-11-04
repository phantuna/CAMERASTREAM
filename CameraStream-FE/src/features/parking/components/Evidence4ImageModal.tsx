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
        return <span style={{ background: '#0284c7', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 12 }}>ĐANG TRONG BÃI</span>;
      case 'COMPLETED':
        return <span style={{ background: '#10b981', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 12 }}>ĐÃ HOÀN THÀNH</span>;
      case 'UNMATCHED_OUT':
        return <span style={{ background: '#f59e0b', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 12 }}>RA KHÔNG KHỚP VÀO</span>;
      default:
        return <span style={{ background: '#64748b', color: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 12 }}>{st}</span>;
    }
  };

  const getVehicleBadge = (vType: string) => {
    switch (vType) {
      case 'CAR': return '🚗 Ô tô';
      case 'BIKE': return '🏍️ Xe máy';
      case 'TRUCK': return '🚚 Xe tải';
      default: return '🚙 Phương tiện';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#1e293b'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '20px',
                fontWeight: 700,
                color: '#38bdf8',
                backgroundColor: '#0f172a',
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid #0284c7'
              }}
            >
              {session.plateNumber}
            </span>
            <span style={{ color: '#cbd5e1', fontSize: '14px', fontWeight: 500 }}>
              {getVehicleBadge(session.vehicleType)}
            </span>
            {getStatusBadge(session.status)}
            {session.durationFormatted && (
              <span
                style={{
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  fontSize: '12px',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}
              >
                ⏱️ Thời gian đỗ: <strong>{session.durationFormatted}</strong>
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '24px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content - 4-Image Grid */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '20px'
            }}
          >
            {/* 1. Làn Vào - Toàn Cảnh */}
            <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>📷 Làn Vào - Toàn Cảnh</span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{session.inLaneName || 'Làn Vào'}</span>
              </div>
              <div
                style={{ height: '200px', backgroundColor: '#0f172a', borderRadius: '6px', overflow: 'hidden', cursor: inOverview ? 'zoom-in' : 'default' }}
                onClick={() => inOverview && setZoomedImage({ url: inOverview, title: `Làn Vào - Toàn Cảnh (${session.plateNumber})` })}
              >
                <SnapshotImage src={inOverview} alt="Làn vào toàn cảnh" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                Giờ vào: <strong style={{ color: '#f1f5f9' }}>{session.inTime || '---'}</strong>
              </div>
            </div>

            {/* 2. Làn Vào - Biển Số */}
            <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>🔍 Làn Vào - Biển Số</span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>ALPR In</span>
              </div>
              <div
                style={{ height: '200px', backgroundColor: '#0f172a', borderRadius: '6px', overflow: 'hidden', cursor: inPlate ? 'zoom-in' : 'default' }}
                onClick={() => inPlate && setZoomedImage({ url: inPlate, title: `Làn Vào - Biển Số (${session.plateNumber})` })}
              >
                <SnapshotImage src={inPlate} alt="Làn vào biển số" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                Biển số quét: <strong style={{ color: '#38bdf8' }}>{session.plateNumber}</strong>
              </div>
            </div>

            {/* 3. Làn Ra - Toàn Cảnh */}
            <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#10b981' }}>📷 Làn Ra - Toàn Cảnh</span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{session.outLaneName || 'Làn Ra'}</span>
              </div>
              <div
                style={{ height: '200px', backgroundColor: '#0f172a', borderRadius: '6px', overflow: 'hidden', cursor: outOverview ? 'zoom-in' : 'default' }}
                onClick={() => outOverview && setZoomedImage({ url: outOverview, title: `Làn Ra - Toàn Cảnh (${session.plateNumber})` })}
              >
                <SnapshotImage src={outOverview} alt="Làn ra toàn cảnh" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                Giờ ra: <strong style={{ color: '#f1f5f9' }}>{session.outTime || 'Chưa ra'}</strong>
              </div>
            </div>

            {/* 4. Làn Ra - Biển Số */}
            <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#10b981' }}>🔍 Làn Ra - Biển Số</span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>ALPR Out</span>
              </div>
              <div
                style={{ height: '200px', backgroundColor: '#0f172a', borderRadius: '6px', overflow: 'hidden', cursor: outPlate ? 'zoom-in' : 'default' }}
                onClick={() => outPlate && setZoomedImage({ url: outPlate, title: `Làn Ra - Biển Số (${session.plateNumber})` })}
              >
                <SnapshotImage src={outPlate} alt="Làn ra biển số" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                Biển số quét: <strong style={{ color: '#10b981' }}>{session.outTime ? session.plateNumber : '---'}</strong>
              </div>
            </div>
          </div>

          {/* Metadata information card */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              fontSize: '13px',
              border: '1px solid #334155'
            }}
          >
            <div>
              <span style={{ color: '#94a3b8' }}>Công ty / Đơn vị:</span>{' '}
              <strong style={{ color: '#f8fafc' }}>{session.companyName || 'Khách vãng lai'}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Phòng ban:</span>{' '}
              <strong style={{ color: '#f8fafc' }}>{session.departmentName || '---'}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Nhà thầu:</span>{' '}
              <strong style={{ color: '#f8fafc' }}>{session.contractorName || '---'}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Ghi chú:</span>{' '}
              <span style={{ color: '#cbd5e1' }}>{session.notes || 'Không có ghi chú'}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#0f172a'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: '#334155',
              color: '#f8fafc',
              border: 'none',
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
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setZoomedImage(null)}
        >
          <div style={{ color: '#f8fafc', fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>
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

