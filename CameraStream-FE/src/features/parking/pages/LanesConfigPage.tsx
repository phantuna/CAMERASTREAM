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
        return <span style={{ background: '#0284c7', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>LÀN VÀO (IN)</span>;
      case 'OUT':
        return <span style={{ background: '#059669', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>LÀN RA (OUT)</span>;
      case 'BIDIRECTIONAL':
        return <span style={{ background: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>HAI CHIỀU</span>;
      default:
        return <span>{type}</span>;
    }
  };

  return (
    <div style={{ padding: '20px', color: '#f8fafc', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>
            Cấu Hình Làn Kiểm Soát Xe (Lanes Master)
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
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
              backgroundColor: '#0284c7',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600
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

      {/* Table */}
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
          ) : lanes.length === 0 ? (
            <EmptyState message="Chưa có cấu hình làn xe nào." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
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
                {lanes.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={tdStyle}><strong style={{ color: '#38bdf8' }}>{l.laneCode}</strong></td>
                    <td style={tdStyle}>{l.laneName}</td>
                    <td style={tdStyle}>{getLaneTypeBadge(l.laneType)}</td>
                    <td style={tdStyle}>{l.inCameraId ? `#${l.inCameraId}` : '---'}</td>
                    <td style={tdStyle}>{l.outCameraId ? `#${l.outCameraId}` : '---'}</td>
                    <td style={tdStyle}>
                      {l.active ? (
                        <span style={{ background: '#059669', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Hoạt động</span>
                      ) : (
                        <span style={{ background: '#64748b', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>Vô hiệu</span>
                      )}
                    </td>
                    <td style={tdStyle}><span style={{ color: '#94a3b8' }}>{l.description || '---'}</span></td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => { setEditingLane(l); setIsModalOpen(true); }}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#334155',
                          color: '#38bdf8',
                          border: '1px solid #475569',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          marginRight: '6px'
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => l.id && handleDeleteLane(l.id, l.laneName)}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#450a0a',
                          color: '#f87171',
                          border: '1px solid #7f1d1d',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
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

const thStyle: React.CSSProperties = { padding: '12px 14px', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };

export default LanesConfigPage;

