import { useState, useEffect, type FC } from 'react';
import type { LaneDto } from '../types/parking.types';

export interface LaneModalProps {
  lane: LaneDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: LaneDto) => Promise<void>;
}

export const LaneModal: FC<LaneModalProps> = ({ lane, isOpen, onClose, onSave }) => {
  const [laneCode, setLaneCode] = useState('');
  const [laneName, setLaneName] = useState('');
  const [laneType, setLaneType] = useState<'IN' | 'OUT' | 'BIDIRECTIONAL'>('IN');
  const [inCameraId, setInCameraId] = useState<number | undefined>(undefined);
  const [outCameraId, setOutCameraId] = useState<number | undefined>(undefined);
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (lane) {
        setLaneCode(lane.laneCode || '');
        setLaneName(lane.laneName || '');
        setLaneType(lane.laneType || 'IN');
        setInCameraId(lane.inCameraId);
        setOutCameraId(lane.outCameraId);
        setActive(lane.active ?? true);
        setDescription(lane.description || '');
      } else {
        setLaneCode('');
        setLaneName('');
        setLaneType('IN');
        setInCameraId(undefined);
        setOutCameraId(undefined);
        setActive(true);
        setDescription('');
      }
      setErr(null);
    }
  }, [isOpen, lane]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!laneCode.trim() || !laneName.trim()) {
      setErr('Vui lòng nhập Mã làn và Tên làn xe.');
      return;
    }
    try {
      setSubmitting(true);
      await onSave({
        id: lane?.id,
        laneCode: laneCode.trim().toUpperCase(),
        laneName: laneName.trim(),
        laneType,
        inCameraId,
        outCameraId,
        active,
        description: description.trim() || undefined
      });
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Lỗi khi lưu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>{lane ? 'Cập Nhật Làn Kiểm Soát' : 'Thêm Mới Làn Xe'}</h3>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          {err && <div style={errStyle}>{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Mã làn *</label>
              <input
                style={inputStyle}
                value={laneCode}
                onChange={(e) => setLaneCode(e.target.value)}
                placeholder="LANE_IN_01"
              />
            </div>
            <div>
              <label style={labelStyle}>Tên làn xe *</label>
              <input
                style={inputStyle}
                value={laneName}
                onChange={(e) => setLaneName(e.target.value)}
                placeholder="Làn 01 - Cổng Chính Vào"
              />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Hướng làn kiểm soát *</label>
            <select
              style={inputStyle}
              value={laneType}
              onChange={(e) => setLaneType(e.target.value as any)}
            >
              <option value="IN">Làn Vào (IN)</option>
              <option value="OUT">Làn Ra (OUT)</option>
              <option value="BIDIRECTIONAL">Hai Chiều (BIDIRECTIONAL)</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Camera Vào (ID)</label>
              <input
                type="number"
                style={inputStyle}
                value={inCameraId || ''}
                onChange={(e) => setInCameraId(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Camera ID vào..."
              />
            </div>
            <div>
              <label style={labelStyle}>Camera Ra (ID)</label>
              <input
                type="number"
                style={inputStyle}
                value={outCameraId || ''}
                onChange={(e) => setOutCameraId(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Camera ID ra..."
              />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Mô tả chi tiết</label>
            <textarea
              rows={2}
              style={{ ...inputStyle, resize: 'none' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Vị trí cổng phụ hoặc lưu ý phân luồng..."
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <input type="checkbox" id="lane-act" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <label htmlFor="lane-act" style={{ color: '#cbd5e1', fontSize: '13px' }}>Kích hoạt hoạt động</label>
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Hủy</button>
            <button type="submit" disabled={submitting} style={submitBtnStyle}>
              {submitting ? 'Lưu...' : 'Lưu Thay Đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.75)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  backdropFilter: 'blur(3px)'
};
const modalBoxStyle: React.CSSProperties = {
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '520px',
  overflow: 'hidden',
  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
};
const headerStyle: React.CSSProperties = {
  padding: '14px 20px',
  background: '#1e293b',
  borderBottom: '1px solid #334155',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
};
const titleStyle: React.CSSProperties = { margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '5px' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '13px'
};
const errStyle: React.CSSProperties = {
  backgroundColor: 'rgba(239, 68, 68, 0.15)',
  border: '1px solid #ef4444',
  color: '#fca5a5',
  padding: '8px 12px',
  borderRadius: '6px',
  marginBottom: '12px',
  fontSize: '12px'
};
const footerStyle: React.CSSProperties = {
  borderTop: '1px solid #1e293b',
  paddingTop: '14px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px'
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 16px',
  backgroundColor: '#334155',
  color: '#f8fafc',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px'
};
const submitBtnStyle: React.CSSProperties = {
  padding: '7px 20px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600
};
export default LaneModal;

