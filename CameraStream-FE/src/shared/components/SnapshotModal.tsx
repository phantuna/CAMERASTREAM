import { useEffect, type FC } from 'react';
import { IconClose } from '../../components/SurveillanceIcons';
import SnapshotImage from './SnapshotImage';

export interface SnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  cropUrl?: string | null;
  title?: string;
  subtitle?: string;
  metadata?: Array<{ label: string; value: string | number }>;
}

export const SnapshotModal: FC<SnapshotModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  cropUrl,
  title = 'Chi Tiết Ảnh Nhận Diện',
  subtitle,
  metadata
}) => {
  // Đóng khi bấm phím Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const primaryImage = imageUrl || cropUrl;
  const hasBoth = Boolean(imageUrl && cropUrl && imageUrl !== cropUrl);
  const isCropOnly = !imageUrl && Boolean(cropUrl);

  if (!isOpen || !primaryImage) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.15s ease-out',
        backdropFilter: 'blur(3px)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '92vw',
          maxHeight: '92vh',
          backgroundColor: '#0F172A',
          borderRadius: '12px',
          border: '1px solid #334155',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header Modal */}
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#1E293B',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{title}</span>
              {isCropOnly && (
                <span style={{
                  fontSize: '10.5px',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38BDF8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  fontWeight: 600
                }}>
                  Ảnh Cắt Cận Cảnh
                </span>
              )}
            </div>
            {subtitle && (
              <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>{subtitle}</div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            title="Đóng (Esc)"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Content: Image display */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#020617',
            overflow: 'auto',
            maxHeight: 'calc(80vh - 80px)',
            minHeight: '200px'
          }}
        >
          <SnapshotImage
            src={primaryImage}
            alt={title}
            priority={true}
            fallbackText="Không có hình ảnh"
            style={{
              maxWidth: '100%',
              maxHeight: '75vh',
              objectFit: 'contain',
              display: 'block'
            }}
          />

          {/* Crop Overlay thumbnail nếu có ảnh toàn cảnh và ảnh cắt riêng */}
          {hasBoth && cropUrl && (
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                padding: '3px',
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                border: '1.5px solid #38BDF8',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
              }}
              title="Ảnh nhận diện vùng đối tượng"
            >
              <SnapshotImage
                src={cropUrl}
                alt="Crop Detail"
                fallbackText="—"
                style={{
                  maxHeight: '70px',
                  maxWidth: '120px',
                  objectFit: 'contain',
                  display: 'block',
                  borderRadius: '3px'
                }}
              />
            </div>
          )}
        </div>

        {/* Footer: Metadata badges nếu có */}
        {metadata && metadata.length > 0 && (
          <div
            style={{
              padding: '10px 18px',
              backgroundColor: '#1E293B',
              borderTop: '1px solid #334155',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              alignItems: 'center'
            }}
          >
            {metadata.map((item, i) => (
              <div key={i} style={{ fontSize: '11.5px', color: '#CBD5E1' }}>
                <span style={{ color: '#94A3B8', marginRight: '4px' }}>{item.label}:</span>
                <strong style={{ color: '#38BDF8' }}>{item.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SnapshotModal;
