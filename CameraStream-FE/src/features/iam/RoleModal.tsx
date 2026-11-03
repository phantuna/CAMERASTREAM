import React, { useState } from 'react';
import type { Role, UserRole } from '../../core/auth/types';
import { PERMISSION_GROUPS } from '../../core/auth/types';
import {
  IconShield,
  IconShieldCheck,
  IconX,
  IconCheck
} from '../../components/SurveillanceIcons';

interface RoleModalProps {
  roleToEdit: Role | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Role>) => Promise<void>;
}

export const RoleModal: React.FC<RoleModalProps> = ({
  roleToEdit,
  isOpen,
  onClose,
  onSave
}) => {
  const isEdit = !!roleToEdit;

  const [code, setCode] = useState(roleToEdit?.code || '');
  const [name, setName] = useState(roleToEdit?.name || '');
  const [description, setDescription] = useState(roleToEdit?.description || '');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    roleToEdit?.permissions || []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const togglePermission = (permCode: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permCode)
        ? prev.filter((p) => p !== permCode)
        : [...prev, permCode]
    );
  };

  const toggleGroup = (groupPerms: string[]) => {
    const allSelected = groupPerms.every((p) => selectedPermissions.includes(p));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((p) => !groupPerms.includes(p)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...groupPerms])));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Mã nhóm quyền và tên nhóm quyền không được để trống.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave({
        code: code.trim().toUpperCase() as UserRole,
        name: name.trim(),
        description: description.trim(),
        permissions: selectedPermissions
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi lưu nhóm quyền.');
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
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '740px',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#ECFDF5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <IconShieldCheck size={20} color="#059669" />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {isEdit ? 'Chỉnh Sửa Nhóm Quyền & Phân Quyền' : 'Tạo Mới Nhóm Quyền & Phân Quyền'}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                Cấu hình phân quyền truy cập các chức năng giám sát AI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#F1F5F9',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#FEE2E2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                fontSize: '13px'
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Mã Nhóm Quyền (Code) *
              </label>
              <input
                type="text"
                required
                disabled={isEdit && roleToEdit?.code === 'SUPER_ADMIN'}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: OPERATOR"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: isEdit && roleToEdit?.code === 'SUPER_ADMIN' ? '#F1F5F9' : '#FFFFFF',
                  fontSize: '13px',
                  outline: 'none',
                  fontWeight: 700,
                  fontFamily: 'monospace'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Tên Nhóm Quyền *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Nhân Viên Trực Ban ALPR"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Mô Tả Vai Trò
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú phạm vi trách nhiệm của nhóm quyền..."
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          {/* Permissions Matrix */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconShield size={16} color="#0284C7" />
                Bảng Phân Quyền Chi Tiết ({selectedPermissions.length} quyền được gán)
              </label>
              <button
                type="button"
                onClick={() => {
                  const allCodes = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.code));
                  if (selectedPermissions.length === allCodes.length) {
                    setSelectedPermissions([]);
                  } else {
                    setSelectedPermissions(allCodes);
                  }
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#0284C7',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {selectedPermissions.length === PERMISSION_GROUPS.flatMap((g) => g.permissions).length
                  ? 'Bỏ chọn tất cả'
                  : 'Chọn toàn bộ quyền'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {PERMISSION_GROUPS.map((group, gIdx) => {
                const groupCodes = group.permissions.map((p) => p.code);
                const isGroupAll = groupCodes.every((c) => selectedPermissions.includes(c));
                const isGroupSome = groupCodes.some((c) => selectedPermissions.includes(c));

                return (
                  <div
                    key={gIdx}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    {/* Group Header */}
                    <div
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#F8FAFC',
                        borderBottom: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
                        {group.groupName}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupCodes)}
                        style={{
                          fontSize: '11px',
                          color: isGroupAll ? '#10B981' : '#64748B',
                          background: isGroupAll ? 'rgba(16, 185, 129, 0.1)' : '#EDE9FE',
                          border: 'none',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {isGroupAll ? '✓ Đã chọn hết' : isGroupSome ? '○ Chọn hết nhóm' : '+ Chọn nhóm này'}
                      </button>
                    </div>

                    {/* Permissions list in group */}
                    <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {group.permissions.map((p) => {
                        const checked = selectedPermissions.includes(p.code);
                        return (
                          <div
                            key={p.code}
                            onClick={() => togglePermission(p.code)}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                              padding: '8px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              backgroundColor: checked ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                              border: checked ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid transparent',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              style={{
                                marginTop: '3px',
                                accentColor: '#10B981',
                                cursor: 'pointer'
                              }}
                            />
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>
                                {p.label}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748B' }}>
                                {p.description}
                              </div>
                              <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>
                                {p.code}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '9px 20px',
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
              <span>{isSubmitting ? 'Đang Lưu...' : 'Lưu Nhóm Quyền'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default RoleModal;
