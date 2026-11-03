import React, { useState } from 'react';
import { useAuth } from '../../core/auth/AuthContext';
import type { User, Role } from '../../core/auth/types';
import { AdminConfigCard } from './AdminConfigCard';
import UserModal from './UserModal';
import RoleModal from './RoleModal';
import {
  IconUsers,
  IconShieldCheck,
  IconRefreshCw,
  IconCheck,
  IconX
} from '../../components/SurveillanceIcons';

interface IAMModuleProps {
  apiBaseUrl?: string;
  initialTab?: 'KhaiBaoPhanQuyen' | 'KhaibaoDangNhap';
}

export const IAMModule: React.FC<IAMModuleProps> = ({ initialTab = 'KhaiBaoPhanQuyen' }) => {
  const {
    users,
    roles,
    createUser,
    updateUser,
    deleteUsers,
    toggleUserActive,
    createRole,
    updateRole,
    deleteRoles,
    refreshUsers
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'KhaiBaoPhanQuyen' | 'KhaibaoDangNhap'>(initialTab);
  const [searchTerm, setSearchTerm] = useState('');

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Modal states
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState<Role | null>(null);

  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Handlers for User
  const openNewUserModal = () => {
    setUserToEdit(null);
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (selectedUser: User) => {
    setUserToEdit(selectedUser);
    setIsUserModalOpen(true);
  };

  const handleDeleteUsers = async (selectedIds: (string | number)[]) => {
    await deleteUsers(selectedIds);
    showToast('success', `Đã xóa ${selectedIds.length} tài khoản thành công.`);
  };

  const handleToggleUserActive = async (id: string | number) => {
    await toggleUserActive(id);
    showToast('success', 'Đã cập nhật trạng thái sử dụng tài khoản.');
  };

  // Handlers for Role
  const openNewRoleModal = () => {
    setRoleToEdit(null);
    setIsRoleModalOpen(true);
  };

  const openEditRoleModal = (selectedRole: Role) => {
    setRoleToEdit(selectedRole);
    setIsRoleModalOpen(true);
  };

  const handleDeleteRoles = async (selectedIds: (string | number)[]) => {
    if (selectedIds.some((id) => {
      const code = roles.find((r) => r.id === id)?.code;
      return code === 'SUPER_ADMIN';
    })) {
      showToast('error', 'Không thể xóa nhóm quyền Quản Trị Viên Tối Cao (SUPER_ADMIN)!');
      return;
    }
    await deleteRoles(selectedIds);
    showToast('success', `Đã xóa ${selectedIds.length} nhóm quyền thành công.`);
  };

  const filteredUsers = users.filter((u) => {
    if (!searchTerm.trim()) return true;
    return (
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phone && u.phone.includes(searchTerm))
    );
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            zIndex: 10000,
            padding: '12px 20px',
            borderRadius: '12px',
            backgroundColor: toastMsg.type === 'success' ? '#059669' : '#DC2626',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '13px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {toastMsg.type === 'success' ? <IconCheck size={18} /> : <IconX size={18} />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* SubTab navigation matching HPTicket IAM layout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('KhaiBaoPhanQuyen')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: activeTab === 'KhaiBaoPhanQuyen' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'KhaiBaoPhanQuyen' ? '#0F172A' : '#64748B',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: activeTab === 'KhaiBaoPhanQuyen' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            borderBottom: activeTab === 'KhaiBaoPhanQuyen' ? '2.5px solid #059669' : 'none'
          }}
        >
          <IconShieldCheck size={18} color={activeTab === 'KhaiBaoPhanQuyen' ? '#059669' : '#64748B'} />
          <span>KHAI BÁO NHÓM QUYỀN ({roles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('KhaibaoDangNhap')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: activeTab === 'KhaibaoDangNhap' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'KhaibaoDangNhap' ? '#0F172A' : '#64748B',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: activeTab === 'KhaibaoDangNhap' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            borderBottom: activeTab === 'KhaiBaoPhanQuyen' ? 'none' : '2.5px solid #059669'
          }}
        >
          <IconUsers size={18} color={activeTab === 'KhaibaoDangNhap' ? '#059669' : '#64748B'} />
          <span>KHAI BÁO ĐĂNG NHẬP ({users.length})</span>
        </button>
      </div>

      {/* 1. KHAI BÁO NHÓM QUYỀN (/KhaiBaoPhanQuyen) */}
      {activeTab === 'KhaiBaoPhanQuyen' && (
        <AdminConfigCard
          title="KHAI BÁO NHÓM QUYỀN"
          data={roles}
          columns={[
            {
              header: 'ID',
              accessor: (_row: any, idx: number) => idx + 1,
              style: { width: '70px', fontFamily: 'monospace', textAlign: 'center' }
            },
            {
              header: 'Mã nhóm quyền',
              accessor: 'code',
              style: { fontFamily: 'monospace', fontWeight: 800, color: '#1E293B' }
            },
            {
              header: 'Tên nhóm quyền',
              accessor: 'name',
              style: { fontWeight: 700, color: '#0F172A' }
            },
            {
              header: 'Mô tả vai trò',
              accessor: 'description',
              style: { color: '#64748B' }
            },
            {
              header: 'Danh mục quyền gán',
              accessor: (row: Role) => (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {row.code === 'SUPER_ADMIN' ? (
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: '#F3E8FF',
                        color: '#7E22CE',
                        fontSize: '11px',
                        fontWeight: 700
                      }}
                    >
                      ★ Toàn Quyền Quản Trị (SuperAdmin)
                    </span>
                  ) : (
                    row.permissions.map((p) => (
                      <span
                        key={p}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#F1F5F9',
                          color: '#334155',
                          fontSize: '10.5px',
                          fontFamily: 'monospace'
                        }}
                      >
                        {p}
                      </span>
                    ))
                  )}
                </div>
              ),
              style: { padding: '8px 14px' }
            },
            {
              header: 'Sử dụng',
              accessor: 'active',
              style: { width: '90px', textAlign: 'center' }
            }
          ]}
          onAddNew={openNewRoleModal}
          onEdit={openEditRoleModal}
          onDelete={handleDeleteRoles}
          onToggleActive={(id, curr) => updateRole(id, { active: !curr })}
        />
      )}

      {/* 2. KHAI BÁO TÀI KHOẢN ĐĂNG NHẬP (/KhaibaoDangNhap) */}
      {activeTab === 'KhaibaoDangNhap' && (
        <AdminConfigCard
          title="KHAI BÁO ĐĂNG NHẬP"
          data={filteredUsers}
          columns={[
            {
              header: 'ID',
              accessor: (_row: any, idx: number) => idx + 1,
              style: { width: '60px', fontFamily: 'monospace', textAlign: 'center' }
            },
            {
              header: 'Tên đăng nhập',
              accessor: 'username',
              style: { fontFamily: 'monospace', fontWeight: 800, color: '#1E293B' }
            },
            {
              header: 'Nhóm quyền',
              accessor: (row: User) => {
                const r = roles.find((role) => role.code === row.role);
                return r?.name || row.roleName || row.role;
              },
              style: { fontWeight: 700, color: '#0F172A' }
            },
            {
              header: 'Tên người dùng',
              accessor: 'fullName',
              style: { fontWeight: 600, color: '#1E293B' }
            },
            {
              header: 'Số điện thoại',
              accessor: (row: User) => row.phone || '—',
              style: { color: '#64748B' }
            },
            {
              header: 'Đăng nhập cuối',
              accessor: (row: User) => row.lastLoginAt || 'Chưa đăng nhập',
              style: { color: '#94A3B8', fontSize: '11.5px' }
            },
            {
              header: 'Sử dụng',
              accessor: 'active',
              style: { width: '90px', textAlign: 'center' }
            }
          ]}
          onAddNew={openNewUserModal}
          onEdit={openEditUserModal}
          onDelete={handleDeleteUsers}
          onToggleActive={handleToggleUserActive}
          toolbarRight={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm username, tên..."
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12.5px',
                  outline: 'none',
                  width: '200px'
                }}
              />
              <button
                type="button"
                onClick={refreshUsers}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <IconRefreshCw size={14} />
                <span>Làm mới</span>
              </button>
            </div>
          }
        />
      )}

      {/* User Modal */}
      <UserModal
        isOpen={isUserModalOpen}
        userToEdit={userToEdit}
        roles={roles}
        onClose={() => setIsUserModalOpen(false)}
        onSave={async (data) => {
          if (userToEdit) {
            await updateUser(userToEdit.id, data);
            showToast('success', `Cập nhật tài khoản ${data.username} thành công!`);
          } else {
            await createUser(data);
            showToast('success', `Tạo mới tài khoản ${data.username} thành công!`);
          }
        }}
      />

      {/* Role Modal */}
      <RoleModal
        isOpen={isRoleModalOpen}
        roleToEdit={roleToEdit}
        onClose={() => setIsRoleModalOpen(false)}
        onSave={async (data) => {
          if (roleToEdit) {
            await updateRole(roleToEdit.id, data);
            showToast('success', `Cập nhật nhóm quyền ${data.name} thành công!`);
          } else {
            await createRole(data);
            showToast('success', `Tạo mới nhóm quyền ${data.name} thành công!`);
          }
        }}
      />
    </div>
  );
};
export default IAMModule;
