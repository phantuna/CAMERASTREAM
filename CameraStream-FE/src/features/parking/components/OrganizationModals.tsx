import { useState, useEffect, type FC } from 'react';
import type { CompanyDto, DepartmentDto, ContractorDto } from '../types/parking.types';

// ==================== COMPANY MODAL ====================
export interface CompanyModalProps {
  company: CompanyDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CompanyDto) => Promise<void>;
}

export const CompanyModal: FC<CompanyModalProps> = ({ company, isOpen, onClose, onSave }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (company) {
        setCode(company.code || '');
        setName(company.name || '');
        setTaxCode(company.taxCode || '');
        setAddress(company.address || '');
        setPhone(company.phone || '');
        setEmail(company.email || '');
        setActive(company.active ?? true);
        setNotes(company.notes || '');
      } else {
        setCode('');
        setName('');
        setTaxCode('');
        setAddress('');
        setPhone('');
        setEmail('');
        setActive(true);
        setNotes('');
      }
      setErr(null);
    }
  }, [isOpen, company]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setErr('Vui lòng nhập Mã và Tên công ty.');
      return;
    }
    try {
      setSubmitting(true);
      await onSave({
        id: company?.id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        taxCode: taxCode.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        active,
        notes: notes.trim() || undefined
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
          <h3 style={titleStyle}>{company ? 'Sửa Công Ty' : 'Thêm Công Ty'}</h3>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px', backgroundColor: '#FFFFFF' }}>
          {err && <div style={errStyle}>{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Mã công ty *</label>
              <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="HP, VNP..." />
            </div>
            <div>
              <label style={labelStyle}>Tên công ty *</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tập đoàn Hoàng Phát" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Mã số thuế</label>
              <input style={inputStyle} value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Số điện thoại</label>
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Địa chỉ</label>
            <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <input type="checkbox" id="comp-act" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            <label htmlFor="comp-act" style={{ color: '#334155', fontSize: '13px', cursor: 'pointer' }}>Kích hoạt</label>
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

// ==================== DEPARTMENT MODAL ====================
export interface DepartmentModalProps {
  department: DepartmentDto | null;
  companies: CompanyDto[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: DepartmentDto) => Promise<void>;
}

export const DepartmentModal: FC<DepartmentModalProps> = ({ department, companies, isOpen, onClose, onSave }) => {
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (department) {
        setCompanyId(department.companyId);
        setCode(department.code || '');
        setName(department.name || '');
        setActive(department.active ?? true);
        setNotes(department.notes || '');
      } else {
        setCompanyId(companies[0]?.id);
        setCode('');
        setName('');
        setActive(true);
        setNotes('');
      }
      setErr(null);
    }
  }, [isOpen, department, companies]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setErr('Vui lòng nhập Mã và Tên phòng ban.');
      return;
    }
    try {
      setSubmitting(true);
      await onSave({
        id: department?.id,
        companyId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        active,
        notes: notes.trim() || undefined
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
          <h3 style={titleStyle}>{department ? 'Sửa Phòng Ban' : 'Thêm Phòng Ban'}</h3>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px', backgroundColor: '#FFFFFF' }}>
          {err && <div style={errStyle}>{err}</div>}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Trực thuộc công ty</label>
            <select
              style={inputStyle}
              value={companyId || ''}
              onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">-- Chọn công ty --</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Mã phòng *</label>
              <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="KT, IT, HC..." />
            </div>
            <div>
              <label style={labelStyle}>Tên phòng ban *</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Phòng Kế Toán" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <input type="checkbox" id="dep-act" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            <label htmlFor="dep-act" style={{ color: '#334155', fontSize: '13px', cursor: 'pointer' }}>Kích hoạt</label>
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

// ==================== CONTRACTOR MODAL ====================
export interface ContractorModalProps {
  contractor: ContractorDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ContractorDto) => Promise<void>;
}

export const ContractorModal: FC<ContractorModalProps> = ({ contractor, isOpen, onClose, onSave }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [active, setActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (contractor) {
        setCode(contractor.code || '');
        setName(contractor.name || '');
        setContactPerson(contractor.contactPerson || '');
        setPhone(contractor.phone || '');
        setEmail(contractor.email || '');
        setActive(contractor.active ?? true);
      } else {
        setCode('');
        setName('');
        setContactPerson('');
        setPhone('');
        setEmail('');
        setActive(true);
      }
      setErr(null);
    }
  }, [isOpen, contractor]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setErr('Vui lòng nhập Mã và Tên nhà thầu.');
      return;
    }
    try {
      setSubmitting(true);
      await onSave({
        id: contractor?.id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        contactPerson: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        active
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
          <h3 style={titleStyle}>{contractor ? 'Sửa Nhà Thầu' : 'Thêm Nhà Thầu'}</h3>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px', backgroundColor: '#FFFFFF' }}>
          {err && <div style={errStyle}>{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Mã nhà thầu *</label>
              <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="NT01..." />
            </div>
            <div>
              <label style={labelStyle}>Tên nhà thầu *</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Công ty Xây dựng Hoàng Gia" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Người liên hệ</label>
              <input style={inputStyle} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Số điện thoại</label>
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <input type="checkbox" id="cnt-act" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            <label htmlFor="cnt-act" style={{ color: '#334155', fontSize: '13px', cursor: 'pointer' }}>Kích hoạt</label>
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

// Common styles
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  backdropFilter: 'blur(3px)'
};
const modalBoxStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '520px',
  overflow: 'hidden',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
};
const headerStyle: React.CSSProperties = {
  padding: '14px 20px',
  background: '#F8FAFC',
  borderBottom: '1px solid #E2E8F0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
};
const titleStyle: React.CSSProperties = { margin: 0, fontSize: '16px', fontWeight: 600, color: '#0F172A' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#64748B', fontSize: '18px', cursor: 'pointer' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 500, color: '#334155', marginBottom: '5px' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  color: '#0F172A',
  fontSize: '13px'
};
const errStyle: React.CSSProperties = {
  backgroundColor: '#FEF2F2',
  border: '1px solid #FECACA',
  color: '#DC2626',
  padding: '8px 12px',
  borderRadius: '6px',
  marginBottom: '12px',
  fontSize: '12px'
};
const footerStyle: React.CSSProperties = {
  borderTop: '1px solid #E2E8F0',
  paddingTop: '14px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px'
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 16px',
  backgroundColor: '#FFFFFF',
  color: '#334155',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500
};
const submitBtnStyle: React.CSSProperties = {
  padding: '7px 20px',
  backgroundColor: '#0284C7',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600
};
