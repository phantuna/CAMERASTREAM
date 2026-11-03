import { useState, useEffect, type FC, type FormEvent } from 'react';
import type { CameraDto } from '../types';
import {
  IconClose,
  IconEdit,
  IconPlus,
  IconCheck,
  IconRefresh
} from '../../../components/SurveillanceIcons';
import { getBackendBaseUrl } from '../../../shared/utils/envConfig';
import { listGates, createGate, type GateDto } from '../../vehicle-gate/gates';
import { toast } from '../../../shared/utils/toast';

const VALID_CAMERA_TYPES = new Set([
  'IN_GATE',
  'OUT_GATE',
  'OVERVIEW',
  'TRAFFIC',
  'FIXED',
  'PERIMETER',
  'SURVEILLANCE',
  'CUSTOM'
]);

export interface CameraAddEditModalProps {
  isOpen: boolean;
  camera: Partial<CameraDto> | null;
  onClose: () => void;
  onSave: (cameraData: Partial<CameraDto>) => Promise<void>;
  apiBaseUrl?: string;
}

export const CameraAddEditModal: FC<CameraAddEditModalProps> = ({
  isOpen,
  camera,
  onClose,
  onSave,
  apiBaseUrl = getBackendBaseUrl()
}) => {
  const [formData, setFormData] = useState<Partial<CameraDto>>(camera || {});
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Danh mục Làn Cổng (bảng "gates") để chọn "địa điểm" cho camera
  const [gates, setGates] = useState<GateDto[]>([]);
  const [showQuickGate, setShowQuickGate] = useState<boolean>(false);
  const [newGateCode, setNewGateCode] = useState<string>('');
  const [newGateName, setNewGateName] = useState<string>('');
  const [creatingGate, setCreatingGate] = useState<boolean>(false);

  useEffect(() => {
    if (camera) {
      setFormData({
        ...camera,
        type: camera.type && VALID_CAMERA_TYPES.has(camera.type) ? camera.type : 'IN_GATE'
      });
    }
  }, [camera, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    listGates(apiBaseUrl)
      .then((list) => { if (!cancelled) setGates(list); })
      .catch(() => { if (!cancelled) setGates([]); });
    return () => { cancelled = true; };
  }, [isOpen, apiBaseUrl]);

  if (!isOpen || !camera) return null;

  const activeGates = gates.filter((g) => g.active !== false);
  const currentLoc = (formData.location || '').trim();
  const matchedGate = activeGates.find(
    (g) =>
      g.name.trim().toLowerCase() === currentLoc.toLowerCase() ||
      g.code.trim().toLowerCase() === currentLoc.toLowerCase()
  );

  const handleQuickCreateGate = async () => {
    const code = newGateCode.trim().toUpperCase();
    const name = newGateName.trim();
    if (!code || !name) {
      toast.warning('Vui lòng nhập đủ Mã cổng (Code) và Tên Làn Cổng.');
      return;
    }
    setCreatingGate(true);
    try {
      const created = await createGate({ code, name, active: true }, apiBaseUrl);
      setGates((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
      setFormData((prev) => ({
        ...prev,
        location: created.name,
        type: VALID_CAMERA_TYPES.has(created.code) ? created.code : (prev.type || 'IN_GATE')
      }));
      setNewGateCode('');
      setNewGateName('');
      setShowQuickGate(false);
      toast.success(`Đã tạo và gán Làn Cổng "${created.name}"`);
    } catch (err: any) {
      toast.error(err?.message || 'Không tạo được Làn Cổng mới.');
    } finally {
      setCreatingGate(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      toast.error(`Lỗi khi lưu camera: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          border: '1.5px solid #CBD5E1',
          borderRadius: '16px',
          width: '90vw',
          maxWidth: '520px',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          backgroundColor: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#0F172A', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {formData.id ? (
              <>
                <IconEdit size={18} color="#0284C7" />
                <span>Cấu Hình & Sửa Camera DB (#{formData.id})</span>
              </>
            ) : (
              <>
                <IconPlus size={18} color="#059669" />
                <span>Thêm Camera Mới Vào Database</span>
              </>
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
            }}
            title="Đóng cửa sổ"
          >
            <IconClose size={18} color="#475569" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
              Tên Camera (*)
            </label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="VD: Camera Cổng Chính 01"
              style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
              Địa Chỉ IP (*)
            </label>
            <input
              type="text"
              required
              value={formData.ipAddress || ''}
              onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
              placeholder="192.168.1.100"
              style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', fontFamily: 'monospace', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <label style={{ fontSize: '12.5px', color: '#0F172A', fontWeight: 700 }}>
                Làn Cổng / Địa Điểm (chọn từ danh mục Gate)
              </label>
              <button
                type="button"
                onClick={() => setShowQuickGate((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284C7',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {showQuickGate ? 'Đóng tạo nhanh' : '+ Tạo nhanh Làn Cổng'}
              </button>
            </div>
            <select
              value={matchedGate ? String(matchedGate.id) : (currentLoc ? '__CUSTOM__' : '')}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setFormData({ ...formData, location: '' });
                  return;
                }
                if (val === '__CUSTOM__') return;
                const g = activeGates.find((x) => String(x.id) === val);
                if (g) {
                  setFormData({
                    ...formData,
                    location: g.name,
                    type: VALID_CAMERA_TYPES.has(g.code) ? g.code : (formData.type || 'IN_GATE')
                  });
                }
              }}
              style={{ width: '100%', padding: '9px 12px', backgroundColor: '#EFF6FF', border: '1.5px solid #93C5FD', color: '#1D4ED8', borderRadius: '8px', fontSize: '13px', fontWeight: 700, outline: 'none' }}
            >
              <option value="">— Chưa gán Làn Cổng —</option>
              {!matchedGate && currentLoc && (
                <option value="__CUSTOM__">[Hiện tại] {currentLoc}</option>
              )}
              {activeGates.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  [{g.code}] {g.name}{g.description ? ` — ${g.description}` : ''}
                </option>
              ))}
            </select>

            {showQuickGate && (
              <div style={{
                marginTop: '8px',
                padding: '10px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexWrap: 'wrap'
              }}>
                <input
                  type="text"
                  value={newGateCode}
                  onChange={(e) => setNewGateCode(e.target.value.toUpperCase())}
                  placeholder="Mã (VD: IN_GATE)"
                  style={{ width: '125px', padding: '6px 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', fontWeight: 700 }}
                />
                <input
                  type="text"
                  value={newGateName}
                  onChange={(e) => setNewGateName(e.target.value)}
                  placeholder="Tên cổng (VD: Cổng Vào 1)"
                  style={{ flex: 1, minWidth: '140px', padding: '6px 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
                />
                <button
                  type="button"
                  disabled={creatingGate}
                  onClick={handleQuickCreateGate}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#059669',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: creatingGate ? 'wait' : 'pointer'
                  }}
                >
                  {creatingGate ? 'Đang tạo...' : 'Tạo & Chọn'}
                </button>
              </div>
            )}

            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
              Khu vực / Làn Cổng này sẽ được gán làm "địa điểm" của camera (quản lý trong phân hệ Làn Cổng Gate).
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
                Cổng RTSP
              </label>
              <input
                type="number"
                value={formData.rtspPort || 554}
                onChange={(e) => setFormData({ ...formData, rtspPort: parseInt(e.target.value, 10) || 554 })}
                style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
                Cổng ONVIF
              </label>
              <input
                type="number"
                value={formData.onvifPort || 80}
                onChange={(e) => setFormData({ ...formData, onvifPort: parseInt(e.target.value, 10) || 80 })}
                style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
                Tài Khoản (Username)
              </label>
              <input
                type="text"
                value={formData.username || ''}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="VD: admin"
                style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
                Mật Khẩu (Password)
              </label>
              <input
                type="password"
                value={formData.password || ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Để trống nếu không đổi"
                style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
              Phân Loại Luồng (Type)
            </label>
            <select
              value={formData.type || 'IN_GATE'}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, outline: 'none' }}
            >
              <option value="IN_GATE">Cổng Vào (IN_GATE)</option>
              <option value="OUT_GATE">Cổng Ra (OUT_GATE)</option>
              <option value="OVERVIEW">Toàn Cảnh Bãi Xe (OVERVIEW)</option>
              <option value="TRAFFIC">Giao Thông Đô Thị (TRAFFIC)</option>
              <option value="FIXED">Camera Cố Định (FIXED)</option>
              <option value="PERIMETER">Hàng Rào An Ninh (PERIMETER)</option>
              <option value="CUSTOM">Tùy Chỉnh (CUSTOM)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12.5px', color: '#0F172A', fontWeight: 700, marginBottom: '5px' }}>
              Đường Dẫn RTSP Trực Tiếp (Tùy chọn - Bỏ qua nếu dùng ONVIF)
            </label>
            <input
              type="text"
              value={formData.rtspSourceUrl || ''}
              onChange={(e) => setFormData({ ...formData, rtspSourceUrl: e.target.value })}
              placeholder="rtsp://admin:admin123@192.168.1.100:554/live"
              style={{ width: '100%', padding: '9px 12px', backgroundColor: '#F8FAFC', border: '1.5px solid #CBD5E1', color: '#334155', fontFamily: 'monospace', borderRadius: '8px', fontSize: '12px', outline: 'none' }}
            />
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{ padding: '8px 16px', backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '7px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                backgroundColor: isSaving ? '#94A3B8' : '#0284C7',
                color: '#FFF',
                border: 'none',
                borderRadius: '7px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: isSaving ? 'wait' : 'pointer'
              }}
            >
              {isSaving ? (
                <>
                  <IconRefresh size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <IconCheck size={14} color="#FFF" />
                  <span>{formData.id ? 'Cập Nhật Camera' : 'Lưu Vào Database'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CameraAddEditModal;
