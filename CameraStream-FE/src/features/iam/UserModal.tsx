import React, { useState } from 'react';
import type { User, Role } from '../../core/auth/types';
import {
  IconUser,
  IconX,
  IconCheck
} from '../../components/SurveillanceIcons';

interface UserModalProps {
  userToEdit: User | null;
  roles: Role[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<User> & { password?: string }) => Promise<void>;
}

export const UserModal: React.FC<UserModalProps> = ({
  userToEdit,
  roles,
  isOpen,
  onClose,
  onSave
}) => {
  const isEdit = !!userToEdit;

  const [username, setUsername] = useState(userToEdit?.username || '');
  const [fullName, setFullName] = useState(userToEdit?.fullName || '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(userToEdit?.phone || '');
  const [email, setEmail] = useState(userToEdit?.email || '');
  const [role, setRole] = useState(userToEdit?.role || roles[0]?.code || 'OPERATOR');
  const [active, setActive] = useState(userToEdit ? userToEdit.active : true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Tên đăng nhập không được để trống.');
      return;
    }
    if (!isEdit && !password.trim()) {
      setError('Vui lòng nhập mật khẩu khởi tạo cho tài khoản mới.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave({
        username: username.trim(),
        fullName: fullName.trim() || username.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role,
        active,
        ...(password.trim() ? { password: password.trim() } : {})
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi lưu tài khoản.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          border: '1px solid #E2E8F0'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header matching HPTicket UserModal */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#ECFDF5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <IconUser size={22} color="#059669" />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', margin: 0 }}>
                {isEdit ? 'Cập nhật tài khoản nhân sự' : 'Khai báo tài khoản nhân viên'}
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                {isEdit ? 'Chỉnh sửa thông tin và phân quyền hệ thống' : 'Tạo mới tài khoản và phân quyền truy cập'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: '#F1F5F9',
              borderRadius: '10px',
              padding: '6px',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Form Body with clean underline layout from HPTicket */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: '#FEE2E2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                fontSize: '13px'
              }}
            >
              {error}
            </div>
          )}

          {/* Username */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: 600, color: '#334155' }}>
              <span style={{ color: '#EF4444', marginRight: '4px' }}>*</span> Tên đăng nhập
            </label>
            <div style={{ flex: 1, borderBottom: '1.5px solid #CBD5E1', paddingBottom: '4px' }}>
              <input
                type="text"
                required
                disabled={isEdit}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="VD: nguyenvana"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isEdit ? '#64748B' : '#0F172A'
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: 600, color: '#334155' }}>
              <span style={{ color: '#EF4444', marginRight: '4px' }}>*</span> Mật khẩu
            </label>
            <div style={{ flex: 1, borderBottom: '1.5px solid #CBD5E1', paddingBottom: '4px' }}>
              <input
                type="password"
                required={!isEdit}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? '(Bỏ trống nếu không đổi)' : '••••••••'}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  color: '#0F172A'
                }}
              />
            </div>
          </div>

          {/* Full Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: 600, color: '#334155' }}>
              <span style={{ color: '#EF4444', marginRight: '4px' }}>*</span> Tên nhân viên
            </label>
            <div style={{ flex: 1, borderBottom: '1.5px solid #CBD5E1', paddingBottom: '4px' }}>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="VD: Nguyễn Văn An"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0F172A'
                }}
              />
            </div>
          </div>

          {/* Role selection dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: 600, color: '#334155' }}>
              <span style={{ color: '#EF4444', marginRight: '4px' }}>*</span> Nhóm quyền
            </label>
            <div style={{ flex: 1, borderBottom: '1.5px solid #CBD5E1', paddingBottom: '4px' }}>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0F172A',
                  cursor: 'pointer'
                }}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.code}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Phone */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: 600, color: '#334155' }}>
              Số điện thoại
            </label>
            <div style={{ flex: 1, borderBottom: '1.5px solid #CBD5E1', paddingBottom: '4px' }}>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0988.xxx.xxx"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  color: '#0F172A'
                }}
              />
            </div>
          </div>

          {/* Email */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: 600, color: '#334155' }}>
              Địa chỉ Email
            </label>
            <div style={{ flex: 1, borderBottom: '1.5px solid #CBD5E1', paddingBottom: '4px' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@hoangphat.vn"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  color: '#0F172A'
                }}
              />
            </div>
          </div>

          {/* Active status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>Sử dụng tài khoản</div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>Cho phép đăng nhập vào hệ thống</div>
            </div>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                accentColor: '#059669',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>

        {/* Modal Footer with HPTicket emerald buttons */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#059669',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)'
            }}
          >
            <IconCheck size={16} />
            <span>{isSubmitting ? 'Đang lưu...' : 'Lưu thông tin'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
export default UserModal;
