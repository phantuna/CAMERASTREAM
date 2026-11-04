import { useState, useEffect, type FC } from 'react';
import type { VehicleDto, CompanyDto, DepartmentDto, VehicleType } from '../types/parking.types';
import { fetchCompanies, fetchDepartments } from '../api/parkingApi';

export interface VehicleModalProps {
  vehicle: VehicleDto | null;
  baseUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: VehicleDto) => Promise<void>;
}

export const VehicleModal: FC<VehicleModalProps> = ({
  vehicle,
  baseUrl,
  isOpen,
  onClose,
  onSave
}) => {
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('CAR');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');

  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchCompanies(baseUrl).then(setCompanies).catch(() => {});
      if (vehicle) {
        setPlateNumber(vehicle.plateNumber || '');
        setVehicleType(vehicle.vehicleType || 'CAR');
        setBrand(vehicle.brand || '');
        setModel(vehicle.model || '');
        setColor(vehicle.color || '');
        setCompanyId(vehicle.companyId);
        setDepartmentId(vehicle.departmentId);
        setOwnerName(vehicle.ownerName || '');
        setOwnerPhone(vehicle.ownerPhone || '');
        setActive(vehicle.active ?? true);
        setNotes(vehicle.notes || '');
      } else {
        setPlateNumber('');
        setVehicleType('CAR');
        setBrand('');
        setModel('');
        setColor('');
        setCompanyId(undefined);
        setDepartmentId(undefined);
        setOwnerName('');
        setOwnerPhone('');
        setActive(true);
        setNotes('');
      }
      setErrorMsg(null);
    }
  }, [isOpen, vehicle, baseUrl]);

  useEffect(() => {
    if (isOpen) {
      fetchDepartments(baseUrl, companyId).then(setDepartments).catch(() => {});
    }
  }, [companyId, isOpen, baseUrl]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateNumber.trim()) {
      setErrorMsg('Vui lòng nhập biển số xe.');
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onSave({
        id: vehicle?.id,
        plateNumber: plateNumber.trim().toUpperCase(),
        vehicleType,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        color: color.trim() || undefined,
        companyId,
        departmentId,
        ownerName: ownerName.trim() || undefined,
        ownerPhone: ownerPhone.trim() || undefined,
        active,
        notes: notes.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi lưu phương tiện');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '650px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}>
            {vehicle ? 'Cập Nhật Phương Tiện' : 'Thêm Mới Phương Tiện'}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '13px'
              }}
            >
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>
                Biển số xe <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="VD: 30A-12345"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '14px',
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>
                Loại xe <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '14px'
                }}
              >
                <option value="CAR">🚗 Ô tô (CAR)</option>
                <option value="BIKE">🏍️ Xe máy (BIKE)</option>
                <option value="TRUCK">🚚 Xe tải (TRUCK)</option>
                <option value="OTHER">🚙 Khác (OTHER)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Hãng xe</label>
              <input
                type="text"
                placeholder="Toyota, Honda, ..."
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Dòng xe (Model)</label>
              <input
                type="text"
                placeholder="Camry, Vios, SH..."
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Màu sơn</label>
              <input
                type="text"
                placeholder="Trắng, Đen, Đỏ..."
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Công ty / Đơn vị</label>
              <select
                value={companyId || ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  setCompanyId(val);
                  setDepartmentId(undefined);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              >
                <option value="">-- Không chọn / Khách vãng lai --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Phòng ban</label>
              <select
                value={departmentId || ''}
                onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : undefined)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              >
                <option value="">-- Chọn phòng ban --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Chủ sở hữu / Lái xe</label>
              <input
                type="text"
                placeholder="Họ và tên..."
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Số điện thoại</label>
              <input
                type="text"
                placeholder="0912..."
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>Ghi chú</label>
            <textarea
              rows={2}
              placeholder="Ghi chú thêm về xe..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '13px',
                resize: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <input
              type="checkbox"
              id="vehicle-active-cb"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="vehicle-active-cb" style={{ color: '#cbd5e1', fontSize: '14px', cursor: 'pointer' }}>
              Trạng thái kích hoạt (cho phép nhận diện và vào bãi)
            </label>
          </div>

          <div
            style={{
              paddingTop: '16px',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 18px',
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 22px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontWeight: 600
              }}
            >
              {isSubmitting ? 'Đang lưu...' : vehicle ? 'Lưu Thay Đổi' : 'Tạo Mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default VehicleModal;

