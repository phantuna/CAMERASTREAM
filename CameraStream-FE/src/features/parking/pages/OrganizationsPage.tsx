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
    <div style={{ padding: '20px', color: '#f8fafc', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>
            Cơ Cấu Tổ Chức & Nhà Thầu
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
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
              backgroundColor: '#0284c7',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600
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
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            <IconRefresh size={16} /> Làm mới
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1e293b', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('companies')}
          style={{
            padding: '10px 18px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'companies' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'companies' ? '#38bdf8' : '#94a3b8',
            fontWeight: activeTab === 'companies' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          🏢 Công Ty ({companies.length})
        </button>
        <button
          onClick={() => setActiveTab('departments')}
          style={{
            padding: '10px 18px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'departments' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'departments' ? '#38bdf8' : '#94a3b8',
            fontWeight: activeTab === 'departments' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          👥 Phòng Ban ({departments.length})
        </button>
        <button
          onClick={() => setActiveTab('contractors')}
          style={{
            padding: '10px 18px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'contractors' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'contractors' ? '#38bdf8' : '#94a3b8',
            fontWeight: activeTab === 'contractors' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          🏗️ Nhà Thầu ({contractors.length})
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <TableSkeleton rows={6} />
          ) : activeTab === 'companies' ? (
            companies.length === 0 ? (
              <EmptyState message="Chưa có dữ liệu công ty." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
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
                  {companies.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={tdStyle}><strong style={{ color: '#38bdf8' }}>{c.code}</strong></td>
                      <td style={tdStyle}>{c.name}</td>
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
                  ))}
                </tbody>
              </table>
            )
          ) : activeTab === 'departments' ? (
            departments.length === 0 ? (
              <EmptyState message="Chưa có dữ liệu phòng ban." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                    <th style={thStyle}>Mã Phòng</th>
                    <th style={thStyle}>Tên Phòng Ban</th>
                    <th style={thStyle}>Thuộc Công Ty</th>
                    <th style={thStyle}>Trạng Thái</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={tdStyle}><strong style={{ color: '#38bdf8' }}>{d.code}</strong></td>
                      <td style={tdStyle}>{d.name}</td>
                      <td style={tdStyle}>{d.companyName || '---'}</td>
                      <td style={tdStyle}>
                        {d.active ? <span style={actBadgeStyle}>Hoạt động</span> : <span style={inactBadgeStyle}>Vô hiệu</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button onClick={() => { setEditingDepartment(d); setShowDepartmentModal(true); }} style={editBtnStyle}>Sửa</button>
                        <button onClick={() => d.id && handleDeleteDepartment(d.id, d.name)} style={delBtnStyle}>Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            contractors.length === 0 ? (
              <EmptyState message="Chưa có dữ liệu nhà thầu." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                    <th style={thStyle}>Mã Nhà Thầu</th>
                    <th style={thStyle}>Tên Nhà Thầu</th>
                    <th style={thStyle}>Người Liên Hệ</th>
                    <th style={thStyle}>SĐT / Email</th>
                    <th style={thStyle}>Trạng Thái</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {contractors.map((cn) => (
                    <tr key={cn.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={tdStyle}><strong style={{ color: '#38bdf8' }}>{cn.code}</strong></td>
                      <td style={tdStyle}>{cn.name}</td>
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
                  ))}
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

const thStyle: React.CSSProperties = { padding: '12px 14px', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };
const actBadgeStyle: React.CSSProperties = { background: '#059669', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 };
const inactBadgeStyle: React.CSSProperties = { background: '#64748b', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 };
const editBtnStyle: React.CSSProperties = { padding: '4px 10px', backgroundColor: '#334155', color: '#38bdf8', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' };
const delBtnStyle: React.CSSProperties = { padding: '4px 10px', backgroundColor: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };

export default OrganizationsPage;

