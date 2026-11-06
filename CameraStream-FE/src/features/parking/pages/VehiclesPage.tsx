import { useState, useEffect, useCallback, lazy, Suspense, type FC } from 'react';
import type { VehicleDto, VehicleFilter, CompanyDto, DepartmentDto } from '../types/parking.types';
import {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getExportVehiclesUrl,
  fetchCompanies,
  fetchDepartments
} from '../api/parkingApi';
import PaginationBar from '../../../shared/components/PaginationBar';
import TableSkeleton from '../../../shared/components/TableSkeleton';
import EmptyState from '../../../shared/components/EmptyState';
import {
  IconSearch,
  IconRefresh,
  IconPlus,
  IconFileSpreadsheet
} from '../../../components/SurveillanceIcons';

const VehicleModal = lazy(() => import('../components/VehicleModal'));

export interface VehiclesPageProps {
  apiBaseUrl?: string;
}

export const VehiclesPage: FC<VehiclesPageProps> = ({
  apiBaseUrl = window.location.origin
}) => {
  const [keyword, setKeyword] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [activeFilter, setActiveFilter] = useState<string>('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);

  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [editingVehicle, setEditingVehicle] = useState<VehicleDto | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load Companies & Departments
  useEffect(() => {
    fetchCompanies(apiBaseUrl).then(setCompanies).catch(() => {});
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchDepartments(apiBaseUrl, companyId).then(setDepartments).catch(() => {});
  }, [apiBaseUrl, companyId]);

  // Load Vehicles
  const loadVehicles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const filter: VehicleFilter = {
        keyword: keyword.trim() || undefined,
        vehicleType: vehicleType || undefined,
        companyId,
        departmentId,
        active: activeFilter === '' ? undefined : activeFilter === 'true'
      };
      const res = await fetchVehicles(apiBaseUrl, filter, currentPage - 1, pageSize);
      if (res) {
        setVehicles(res.content || []);
        setTotalPages(res.totalPages || 1);
        setTotalElements(res.totalElements || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi tải danh sách xe');
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, keyword, vehicleType, companyId, departmentId, activeFilter, currentPage, pageSize]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const handleSaveVehicle = async (dto: VehicleDto) => {
    if (dto.id) {
      await updateVehicle(apiBaseUrl, dto.id, dto);
    } else {
      await createVehicle(apiBaseUrl, dto);
    }
    await loadVehicles();
  };

  const handleDeleteVehicle = async (id: number, plate: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa phương tiện biển số "${plate}"?`)) return;
    try {
      await deleteVehicle(apiBaseUrl, id);
      await loadVehicles();
    } catch (err: any) {
      alert('Lỗi xóa phương tiện: ' + err.message);
    }
  };

  const handleExportExcel = () => {
    const filter: VehicleFilter = {
      keyword: keyword.trim() || undefined,
      vehicleType: vehicleType || undefined,
      companyId,
      departmentId,
      active: activeFilter === '' ? undefined : activeFilter === 'true'
    };
    const url = getExportVehiclesUrl(apiBaseUrl, filter);
    window.open(url, '_blank');
  };

  const formatVehicleType = (vt: string) => {
    switch (vt) {
      case 'CAR': return 'Ô tô';
      case 'BIKE': return 'Xe máy';
      case 'TRUCK': return 'Xe tải';
      default: return 'Khác';
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#F8FAFC', color: '#0F172A', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0F172A' }}>
            Danh Bạ Phương Tiện (Vehicles Master)
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Quản lý biển số xe đăng ký nội bộ, cán bộ nhân viên, nhà thầu & phân loại ô tô/xe máy
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setEditingVehicle(null); setIsModalOpen(true); }}
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
            <IconPlus size={16} /> Thêm Phương Tiện Mới
          </button>
          <button
            onClick={handleExportExcel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              backgroundColor: '#059669',
              border: '1px solid #047857',
              borderRadius: '6px',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <IconFileSpreadsheet size={16} /> Xuất Excel
          </button>
          <button
            onClick={() => { setCurrentPage(1); loadVehicles(); }}
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

      {/* Filter Toolbar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div>
          <label style={filterLabelStyle}>Tìm kiếm từ khóa</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Biển số, tên chủ xe, sđt..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setCurrentPage(1); loadVehicles(); } }}
              style={filterInputStyle}
            />
            <IconSearch size={14} style={{ position: 'absolute', right: '10px', top: '10px', color: '#94A3B8' }} />
          </div>
        </div>

        <div>
          <label style={filterLabelStyle}>Loại phương tiện</label>
          <select
            value={vehicleType}
            onChange={(e) => { setVehicleType(e.target.value); setCurrentPage(1); }}
            style={filterInputStyle}
          >
            <option value="">-- Tất cả loại xe --</option>
            <option value="CAR">Ô tô</option>
            <option value="BIKE">Xe máy</option>
            <option value="TRUCK">Xe tải</option>
            <option value="OTHER">Khác</option>
          </select>
        </div>

        <div>
          <label style={filterLabelStyle}>Công ty / Đơn vị</label>
          <select
            value={companyId || ''}
            onChange={(e) => {
              setCompanyId(e.target.value ? Number(e.target.value) : undefined);
              setDepartmentId(undefined);
              setCurrentPage(1);
            }}
            style={filterInputStyle}
          >
            <option value="">-- Tất cả công ty --</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={filterLabelStyle}>Phòng ban</label>
          <select
            value={departmentId || ''}
            onChange={(e) => { setDepartmentId(e.target.value ? Number(e.target.value) : undefined); setCurrentPage(1); }}
            style={filterInputStyle}
          >
            <option value="">-- Tất cả phòng ban --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={filterLabelStyle}>Trạng thái</label>
          <select
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value); setCurrentPage(1); }}
            style={filterInputStyle}
          >
            <option value="">-- Tất cả --</option>
            <option value="true">Đang kích hoạt</option>
            <option value="false">Tạm khóa / Vô hiệu</option>
          </select>
        </div>
      </div>

      {/* Table Section */}
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
            <TableSkeleton rows={8} />
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>
              <p>Có lỗi xảy ra: {error}</p>
              <button
                onClick={loadVehicles}
                style={{ padding: '8px 16px', backgroundColor: '#F1F5F9', color: '#0F172A', border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer' }}
              >
                Thử lại
              </button>
            </div>
          ) : vehicles.length === 0 ? (
            <EmptyState title="Không tìm thấy phương tiện nào" description="Thử thay đổi từ khóa tìm kiếm hoặc lọc theo điều kiện khác." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={thStyle}>Biển Số</th>
                  <th style={thStyle}>Loại Xe</th>
                  <th style={thStyle}>Hiệu Xe / Màu</th>
                  <th style={thStyle}>Chủ Sở Hữu / SĐT</th>
                  <th style={thStyle}>Công Ty / Phòng Ban</th>
                  <th style={thStyle}>Trạng Thái</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v, idx) => {
                  const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC';
                  return (
                    <tr
                      key={v.id}
                      style={{
                        backgroundColor: rowBg,
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = rowBg; }}
                    >
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#1D4ED8',
                            backgroundColor: '#EFF6FF',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid #BFDBFE'
                          }}
                        >
                          {v.plateNumber}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          backgroundColor: '#F1F5F9',
                          color: '#334155',
                          border: '1px solid #E2E8F0'
                        }}>
                          {formatVehicleType(v.vehicleType)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ color: '#0F172A', fontWeight: 500 }}>{v.brand || '---'} {v.model ? `(${v.model})` : ''}</div>
                        {v.color && <div style={{ fontSize: '11px', color: '#64748B' }}>Màu: {v.color}</div>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ color: '#0F172A', fontWeight: 500 }}>{v.ownerName || 'Chưa cập nhật'}</div>
                        {v.ownerPhone && <div style={{ fontSize: '11px', color: '#0284C7', fontWeight: 500 }}>{v.ownerPhone}</div>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ color: '#0F172A' }}>{v.companyName || 'Khách vãng lai'}</div>
                        {v.departmentName && <div style={{ fontSize: '11px', color: '#64748B' }}>{v.departmentName}</div>}
                      </td>
                      <td style={tdStyle}>
                        {v.active ? (
                          <span style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Hoạt động</span>
                        ) : (
                          <span style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>Vô hiệu</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => { setEditingVehicle(v); setIsModalOpen(true); }}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#EFF6FF',
                              color: '#0284C7',
                              border: '1px solid #BFDBFE',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 500
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => v.id && handleDeleteVehicle(v.id, v.plateNumber)}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#FEF2F2',
                              color: '#DC2626',
                              border: '1px solid #FECACA',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 500
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer pagination */}
        <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 16px', backgroundColor: '#FFFFFF' }}>
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalElements}
            pageSize={pageSize}
            itemLabel="phương tiện"
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* Modal with Suspense */}
      <Suspense fallback={null}>
        {isModalOpen && (
          <VehicleModal
            vehicle={editingVehicle}
            baseUrl={apiBaseUrl}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSave={handleSaveVehicle}
          />
        )}
      </Suspense>
    </div>
  );
};

const thStyle: React.CSSProperties = { padding: '12px 14px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };
const filterLabelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' };
const filterInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  color: '#0F172A',
  fontSize: '13px'
};

export default VehiclesPage;
