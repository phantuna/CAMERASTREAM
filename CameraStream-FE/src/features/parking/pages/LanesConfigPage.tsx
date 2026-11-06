import { useState, useEffect, useCallback, lazy, Suspense, type FC } from 'react';
import type { LaneDto } from '../types/parking.types';
import { fetchLanes, saveLane, deleteLane } from '../api/parkingApi';
import TableSkeleton from '../../../shared/components/TableSkeleton';
import EmptyState from '../../../shared/components/EmptyState';
import {
  IconPlus,
  IconRefresh
} from '../../../components/SurveillanceIcons';

const LaneModal = lazy(() => import('../components/LaneModal'));

export interface LanesConfigPageProps {
  apiBaseUrl?: string;
}

export const LanesConfigPage: FC<LanesConfigPageProps> = ({
  apiBaseUrl = window.location.origin
}) => {
  const [lanes, setLanes] = useState<LaneDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingLane, setEditingLane] = useState<LaneDto | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadLanes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchLanes(apiBaseUrl);
      setLanes(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    loadLanes();
  }, [loadLanes]);

  const handleSaveLane = async (dto: LaneDto) => {
    await saveLane(apiBaseUrl, dto);
    await loadLanes();
  };

  const handleDeleteLane = async (id: number, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa làn xe "${name}"?`)) return;
    await deleteLane(apiBaseUrl, id);
    await loadLanes();
  };

  const getLaneTypeBadge = (type: string) => {
    switch (type) {
      case 'IN':
        return <span style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>LÀN VÀO (IN)</span>;
      case 'OUT':
        return <span style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>LÀN RA (OUT)</span>;
      case 'BIDIRECTIONAL':
        return <span style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>HAI CHIỀU</span>;
      default:
        return <span>{type}</span>;
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#F8FAFC', color: '#0F172A', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0F172A' }}>
            Cấu Hình Làn Kiểm Soát Xe (Lanes Master)
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Khai báo làn xe, chiều vào/ra, gán Camera ID tương ứng cho ALPR và Barrier
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setEditingLane(null); setIsModalOpen(true); }}
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
            <IconPlus size={16} /> Thêm Làn Xe Mới
          </button>
          <button
            onClick={loadLanes}
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

      {/* Table */}
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
          ) : lanes.length === 0 ? (
            <EmptyState title="Chưa có cấu hình làn xe nào." description="Vui lòng nhấn nút 'Thêm Làn Xe Mới' để khai báo làn kiểm soát." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={thStyle}>Mã Làn</th>
                  <th style={thStyle}>Tên Làn Xe</th>
                  <th style={thStyle}>Hướng Kiểm Soát</th>
                  <th style={thStyle}>Camera Vào ID</th>
                  <th style={thStyle}>Camera Ra ID</th>
                  <th style={thStyle}>Trạng Thái</th>
                  <th style={thStyle}>Mô Tả</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {lanes.map((l, idx) => {
                  const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC';
                  return (
                    <tr
                      key={l.id}
                      style={{ backgroundColor: rowBg, borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = rowBg; }}
                    >
                      <td style={tdStyle}><strong style={{ color: '#0284C7' }}>{l.laneCode}</strong></td>
                      <td style={tdStyle}><span style={{ color: '#0F172A', fontWeight: 500 }}>{l.laneName}</span></td>
                      <td style={tdStyle}>{getLaneTypeBadge(l.laneType)}</td>
                      <td style={tdStyle}>{l.inCameraId ? `#${l.inCameraId}` : '---'}</td>
                      <td style={tdStyle}>{l.outCameraId ? `#${l.outCameraId}` : '---'}</td>
                      <td style={tdStyle}>
                        {l.active ? (
                          <span style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Hoạt động</span>
                        ) : (
                          <span style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>Vô hiệu</span>
                        )}
                      </td>
                      <td style={tdStyle}><span style={{ color: '#64748B' }}>{l.description || '---'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => { setEditingLane(l); setIsModalOpen(true); }}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#EFF6FF',
                            color: '#0284C7',
                            border: '1px solid #BFDBFE',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            marginRight: '6px'
                          }}
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => l.id && handleDeleteLane(l.id, l.laneName)}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Lane Modal with Suspense */}
      <Suspense fallback={null}>
        {isModalOpen && (
          <LaneModal
            lane={editingLane}
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSave={handleSaveLane}
          />
        )}
      </Suspense>
    </div>
  );
};

const thStyle: React.CSSProperties = { padding: '12px 14px', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };

export default LanesConfigPage;
