import { useState, useEffect, useCallback, lazy, Suspense, type FC } from 'react';
import type { CompanyDto, DepartmentDto, ContractorDto } from '../types/parking.types';
import {
  fetchCompanies,
  saveCompany,
  deleteCompany,
  fetchDepartments,
  saveDepartment,
  deleteDepartment,
  fetchContractors,
  saveContractor,
  deleteContractor
} from '../api/parkingApi';
import TableSkeleton from '../../../shared/components/TableSkeleton';
import EmptyState from '../../../shared/components/EmptyState';
import {
  IconPlus,
  IconRefresh
} from '../../../components/SurveillanceIcons';

const CompanyModal = lazy(() => import('../components/OrganizationModals').then(m => ({ default: m.CompanyModal })));
const DepartmentModal = lazy(() => import('../components/OrganizationModals').then(m => ({ default: m.DepartmentModal })));
const ContractorModal = lazy(() => import('../components/OrganizationModals').then(m => ({ default: m.ContractorModal })));

export interface OrganizationsPageProps {
  apiBaseUrl?: string;
}

type ActiveTab = 'companies' | 'departments' | 'contractors';

export const OrganizationsPage: FC<OrganizationsPageProps> = ({
  apiBaseUrl = window.location.origin
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('companies');

  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [contractors, setContractors] = useState<ContractorDto[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [editingCompany, setEditingCompany] = useState<CompanyDto | null>(null);
  const [showCompanyModal, setShowCompanyModal] = useState(false);

  const [editingDepartment, setEditingDepartment] = useState<DepartmentDto | null>(null);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);

  const [editingContractor, setEditingContractor] = useState<ContractorDto | null>(null);
  const [showContractorModal, setShowContractorModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (activeTab === 'companies') {
        const data = await fetchCompanies(apiBaseUrl);
        setCompanies(data);
      } else if (activeTab === 'departments') {
        const [deps, comps] = await Promise.all([
          fetchDepartments(apiBaseUrl),
          fetchCompanies(apiBaseUrl)
        ]);
        setDepartments(deps);
        setCompanies(comps);
      } else if (activeTab === 'contractors') {
        const data = await fetchContractors(apiBaseUrl);
        setContractors(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Company Handlers
  const handleSaveCompany = async (dto: CompanyDto) => {
    await saveCompany(apiBaseUrl, dto);
    await loadData();
  };
  const handleDeleteCompany = async (id: number, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa công ty "${name}"?`)) return;
    await deleteCompany(apiBaseUrl, id);
    await loadData();
  };

  // Department Handlers
  const handleSaveDepartment = async (dto: DepartmentDto) => {
    await saveDepartment(apiBaseUrl, dto);
    await loadData();
  };
  const handleDeleteDepartment = async (id: number, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa phòng ban "${name}"?`)) return;
    await deleteDepartment(apiBaseUrl, id);
    await loadData();
  };

  // Contractor Handlers
  const handleSaveContractor = async (dto: ContractorDto) => {
    await saveContractor(apiBaseUrl, dto);
    await loadData();
  };
  const handleDeleteContractor = async (id: number, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa nhà thầu "${name}"?`)) return;
    await deleteContractor(apiBaseUrl, id);
    await loadData();
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#F8FAFC', color: '#0F172A', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0F172A' }}>
            Cơ Cấu Tổ Chức & Nhà Thầu
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Quản lý danh mục Công ty nội bộ, Phòng ban & Nhà thầu hợp tác ra vào bãi xe
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => {
              if (activeTab === 'companies') { setEditingCompany(null); setShowCompanyModal(true); }
              else if (activeTab === 'departments') { setEditingDepartment(null); setShowDepartmentModal(true); }
              else { setEditingContractor(null); setShowContractorModal(true); }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: '#0284C7',
              border: 'none',
              borderRadius: '6px',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <IconPlus size={16} /> Thêm Mới
          </button>
          <button
            onClick={loadData}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              color: '#334155',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            <IconRefresh size={16} /> Làm mới
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('companies')}
          style={{
            padding: '10px 18px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'companies' ? '2px solid #0284C7' : '2px solid transparent',
            color: activeTab === 'companies' ? '#0284C7' : '#64748B',
            fontWeight: activeTab === 'companies' ? 600 : 500,
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Công Ty ({companies.length})
        </button>
        <button
          onClick={() => setActiveTab('departments')}
          style={{
            padding: '10px 18px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'departments' ? '2px solid #0284C7' : '2px solid transparent',
            color: activeTab === 'departments' ? '#0284C7' : '#64748B',
            fontWeight: activeTab === 'departments' ? 600 : 500,
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Phòng Ban ({departments.length})
        </button>
        <button
          onClick={() => setActiveTab('contractors')}
          style={{
            padding: '10px 18px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'contractors' ? '2px solid #0284C7' : '2px solid transparent',
            color: activeTab === 'contractors' ? '#0284C7' : '#64748B',
            fontWeight: activeTab === 'contractors' ? 600 : 500,
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Nhà Thầu ({contractors.length})
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <TableSkeleton rows={6} />
          ) : activeTab === 'companies' ? (
            companies.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu công ty." description="Vui lòng nhấn nút 'Thêm Mới' để khai báo công ty." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <th style={thStyle}>Mã Công Ty</th>
                    <th style={thStyle}>Tên Công Ty</th>
                    <th style={thStyle}>Mã Số Thuế</th>
                    <th style={thStyle}>SĐT / Email</th>
                    <th style={thStyle}>Địa Chỉ</th>
                    <th style={thStyle}>Trạng Thái</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c, idx) => {
                    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC';
                    return (
                      <tr
                        key={c.id}
                        style={{ backgroundColor: rowBg, borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = rowBg; }}
                      >
                        <td style={tdStyle}><strong style={{ color: '#0284C7' }}>{c.code}</strong></td>
                        <td style={tdStyle}><span style={{ color: '#0F172A', fontWeight: 500 }}>{c.name}</span></td>
                        <td style={tdStyle}>{c.taxCode || '---'}</td>
                        <td style={tdStyle}>{c.phone || c.email || '---'}</td>
                        <td style={tdStyle}>{c.address || '---'}</td>
                        <td style={tdStyle}>
                          {c.active ? <span style={actBadgeStyle}>Hoạt động</span> : <span style={inactBadgeStyle}>Vô hiệu</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button onClick={() => { setEditingCompany(c); setShowCompanyModal(true); }} style={editBtnStyle}>Sửa</button>
                          <button onClick={() => c.id && handleDeleteCompany(c.id, c.name)} style={delBtnStyle}>Xóa</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : activeTab === 'departments' ? (
            departments.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu phòng ban." description="Vui lòng nhấn nút 'Thêm Mới' để khai báo phòng ban." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <th style={thStyle}>Mã Phòng</th>
                    <th style={thStyle}>Tên Phòng Ban</th>
                    <th style={thStyle}>Thuộc Công Ty</th>
                    <th style={thStyle}>Trạng Thái</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d, idx) => {
                    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC';
                    return (
                      <tr
                        key={d.id}
                        style={{ backgroundColor: rowBg, borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = rowBg; }}
                      >
                        <td style={tdStyle}><strong style={{ color: '#0284C7' }}>{d.code}</strong></td>
                        <td style={tdStyle}><span style={{ color: '#0F172A', fontWeight: 500 }}>{d.name}</span></td>
                        <td style={tdStyle}>{d.companyName || '---'}</td>
                        <td style={tdStyle}>
                          {d.active ? <span style={actBadgeStyle}>Hoạt động</span> : <span style={inactBadgeStyle}>Vô hiệu</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button onClick={() => { setEditingDepartment(d); setShowDepartmentModal(true); }} style={editBtnStyle}>Sửa</button>
                          <button onClick={() => d.id && handleDeleteDepartment(d.id, d.name)} style={delBtnStyle}>Xóa</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            contractors.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu nhà thầu." description="Vui lòng nhấn nút 'Thêm Mới' để khai báo nhà thầu." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <th style={thStyle}>Mã Nhà Thầu</th>
                    <th style={thStyle}>Tên Nhà Thầu</th>
                    <th style={thStyle}>Người Liên Hệ</th>
                    <th style={thStyle}>SĐT / Email</th>
                    <th style={thStyle}>Trạng Thái</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {contractors.map((cn, idx) => {
                    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC';
                    return (
                      <tr
                        key={cn.id}
                        style={{ backgroundColor: rowBg, borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = rowBg; }}
                      >
                        <td style={tdStyle}><strong style={{ color: '#0284C7' }}>{cn.code}</strong></td>
                        <td style={tdStyle}><span style={{ color: '#0F172A', fontWeight: 500 }}>{cn.name}</span></td>
                        <td style={tdStyle}>{cn.contactPerson || '---'}</td>
                        <td style={tdStyle}>{cn.phone || cn.email || '---'}</td>
                        <td style={tdStyle}>
                          {cn.active ? <span style={actBadgeStyle}>Hoạt động</span> : <span style={inactBadgeStyle}>Vô hiệu</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button onClick={() => { setEditingContractor(cn); setShowContractorModal(true); }} style={editBtnStyle}>Sửa</button>
                          <button onClick={() => cn.id && handleDeleteContractor(cn.id, cn.name)} style={delBtnStyle}>Xóa</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>

      {/* Lazy Modals with Suspense */}
      <Suspense fallback={null}>
        {showCompanyModal && (
          <CompanyModal
            company={editingCompany}
            isOpen={showCompanyModal}
            onClose={() => setShowCompanyModal(false)}
            onSave={handleSaveCompany}
          />
        )}
        {showDepartmentModal && (
          <DepartmentModal
            department={editingDepartment}
            companies={companies}
            isOpen={showDepartmentModal}
            onClose={() => setShowDepartmentModal(false)}
            onSave={handleSaveDepartment}
          />
        )}
        {showContractorModal && (
          <ContractorModal
            contractor={editingContractor}
            isOpen={showContractorModal}
            onClose={() => setShowContractorModal(false)}
            onSave={handleSaveContractor}
          />
        )}
      </Suspense>
    </div>
  );
};

const thStyle: React.CSSProperties = { padding: '12px 14px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };
const actBadgeStyle: React.CSSProperties = { background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 };
const inactBadgeStyle: React.CSSProperties = { background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: 4, fontSize: 11 };
const editBtnStyle: React.CSSProperties = { padding: '4px 10px', backgroundColor: '#EFF6FF', color: '#0284C7', border: '1px solid #BFDBFE', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, marginRight: '6px' };
const delBtnStyle: React.CSSProperties = { padding: '4px 10px', backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 };

export default OrganizationsPage;
