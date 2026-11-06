import { useState, useEffect, useCallback, lazy, Suspense, type FC } from 'react';
import type { ParkingSessionDto, ParkingSessionFilter, LaneDto } from '../types/parking.types';
import { fetchParkingSessions, getExportParkingSessionsUrl, fetchLanes } from '../api/parkingApi';
import PaginationBar from '../../../shared/components/PaginationBar';
import TableSkeleton from '../../../shared/components/TableSkeleton';
import EmptyState from '../../../shared/components/EmptyState';
import { SnapshotImage } from '../../../shared/components/SnapshotImage';
import { resolveImageUrl } from '../../../shared/utils/imageUrl';
import {
  IconSearch,
  IconRefresh,
  IconFileSpreadsheet,
  IconCalendar
} from '../../../components/SurveillanceIcons';

const Evidence4ImageModal = lazy(() => import('../components/Evidence4ImageModal'));

export interface ParkingHistoryPageProps {
  apiBaseUrl?: string;
}

export const ParkingHistoryPage: FC<ParkingHistoryPageProps> = ({
  apiBaseUrl = window.location.origin
}) => {
  // Filters state
  const [plateNumber, setPlateNumber] = useState('');
  const [status, setStatus] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [inLaneId, setInLaneId] = useState<number | undefined>(undefined);
  const [outLaneId, setOutLaneId] = useState<number | undefined>(undefined);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);

  // Data state
  const [sessions, setSessions] = useState<ParkingSessionDto[]>([]);
  const [lanes, setLanes] = useState<LaneDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal detail
  const [selectedSession, setSelectedSession] = useState<ParkingSessionDto | null>(null);

  // Quick Date Presets
  const applyDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const todayStr = toDateStr(now);
      setFromTime(`${todayStr}T00:00:00`);
      setToTime(`${todayStr}T23:59:59`);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toDateStr(y);
      setFromTime(`${yStr}T00:00:00`);
      setToTime(`${yStr}T23:59:59`);
    } else if (preset === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      setFromTime(`${toDateStr(w)}T00:00:00`);
      setToTime(`${toDateStr(now)}T23:59:59`);
    } else if (preset === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromTime(`${toDateStr(m)}T00:00:00`);
      setToTime(`${toDateStr(now)}T23:59:59`);
    } else {
      setFromTime('');
      setToTime('');
    }
    setCurrentPage(1);
  };

  // Load Lanes for Filter dropdown
  useEffect(() => {
    fetchLanes(apiBaseUrl).then(setLanes).catch(() => {});
  }, [apiBaseUrl]);

  // Load Sessions
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const filter: ParkingSessionFilter = {
        plateNumber: plateNumber.trim() || undefined,
        status: status || undefined,
        vehicleType: vehicleType || undefined,
        inLaneId,
        outLaneId,
        fromTime: fromTime || undefined,
        toTime: toTime || undefined
      };
      const res = await fetchParkingSessions(apiBaseUrl, filter, currentPage - 1, pageSize);
      if (res) {
        setSessions(res.content || []);
        setTotalPages(res.totalPages || 1);
        setTotalElements(res.totalElements || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, plateNumber, status, vehicleType, inLaneId, outLaneId, fromTime, toTime, currentPage, pageSize]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Export Excel
  const handleExportExcel = () => {
    const filter: ParkingSessionFilter = {
      plateNumber: plateNumber.trim() || undefined,
      status: status || undefined,
      vehicleType: vehicleType || undefined,
      inLaneId,
      outLaneId,
      fromTime: fromTime || undefined,
      toTime: toTime || undefined
    };
    const url = getExportParkingSessionsUrl(apiBaseUrl, filter);
    window.open(url, '_blank');
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'ACTIVE':
        return (
          <span style={{
            background: '#EFF6FF',
            color: '#1D4ED8',
            border: '1px solid #BFDBFE',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600
          }}>
            ĐANG TRONG BÃI
          </span>
        );
      case 'COMPLETED':
        return (
          <span style={{
            background: '#ECFDF5',
            color: '#047857',
            border: '1px solid #A7F3D0',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600
          }}>
            ĐÃ HOÀN THÀNH
          </span>
        );
      case 'UNMATCHED_OUT':
        return (
          <span style={{
            background: '#FFFBEB',
            color: '#B45309',
            border: '1px solid #FDE68A',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600
          }}>
            RA KHÔNG KHỚP
          </span>
        );
      default:
        return (
          <span style={{
            background: '#F1F5F9',
            color: '#475569',
            border: '1px solid #CBD5E1',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 11
          }}>
            {st}
          </span>
        );
    }
  };

  const getVehicleBadge = (vt: string) => {
    switch (vt) {
      case 'CAR': return 'Ô tô';
      case 'BIKE': return 'Xe máy';
      case 'TRUCK': return 'Xe tải';
      default: return 'Khác';
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#F8FAFC', color: '#0F172A', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0F172A' }}>
            Lịch Sử Xe Vào / Ra (HPParking Master)
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
            Đối chiếu hình ảnh 4 kênh (Toàn cảnh & Biển số lúc vào/ra) kèm tổng thời lượng lưu bãi
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
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
            <IconFileSpreadsheet size={16} /> Xuất Excel Server-Side
          </button>
          <button
            onClick={() => { setCurrentPage(1); loadSessions(); }}
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
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
        }}
      >
        {/* Quick Date Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
            <IconCalendar size={14} /> Mốc thời gian:
          </span>
          <button onClick={() => applyDatePreset('today')} style={presetBtnStyle}>
            Hôm nay
          </button>
          <button onClick={() => applyDatePreset('yesterday')} style={presetBtnStyle}>
            Hôm qua
          </button>
          <button onClick={() => applyDatePreset('week')} style={presetBtnStyle}>
            7 ngày qua
          </button>
          <button onClick={() => applyDatePreset('month')} style={presetBtnStyle}>
            Tháng này
          </button>
          <button onClick={() => applyDatePreset('all')} style={presetBtnStyle}>
            Tất cả
          </button>
        </div>

        {/* Filter inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <div>
            <label style={filterLabelStyle}>Biển số xe</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Tìm biển số..."
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setCurrentPage(1); loadSessions(); } }}
                style={filterInputStyle}
              />
              <IconSearch
                size={14}
                style={{ position: 'absolute', right: '10px', top: '10px', color: '#94A3B8' }}
              />
            </div>
          </div>

          <div>
            <label style={filterLabelStyle}>Trạng thái</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setCurrentPage(1); }}
              style={filterInputStyle}
            >
              <option value="">-- Tất cả trạng thái --</option>
              <option value="ACTIVE">Đang trong bãi</option>
              <option value="COMPLETED">Đã hoàn thành (Đã ra)</option>
              <option value="UNMATCHED_OUT">Ra không khớp vào</option>
            </select>
          </div>

          <div>
            <label style={filterLabelStyle}>Loại xe</label>
            <select
              value={vehicleType}
              onChange={(e) => { setVehicleType(e.target.value); setCurrentPage(1); }}
              style={filterInputStyle}
            >
              <option value="">-- Tất cả loại xe --</option>
              <option value="CAR">Ô tô (CAR)</option>
              <option value="BIKE">Xe máy (BIKE)</option>
              <option value="TRUCK">Xe tải (TRUCK)</option>
              <option value="OTHER">Khác (OTHER)</option>
            </select>
          </div>

          <div>
            <label style={filterLabelStyle}>Làn Vào</label>
            <select
              value={inLaneId || ''}
              onChange={(e) => { setInLaneId(e.target.value ? Number(e.target.value) : undefined); setCurrentPage(1); }}
              style={filterInputStyle}
            >
              <option value="">-- Tất cả làn vào --</option>
              {lanes.filter((l) => l.laneType === 'IN' || l.laneType === 'BIDIRECTIONAL').map((l) => (
                <option key={l.id} value={l.id}>{l.laneName}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={filterLabelStyle}>Làn Ra</label>
            <select
              value={outLaneId || ''}
              onChange={(e) => { setOutLaneId(e.target.value ? Number(e.target.value) : undefined); setCurrentPage(1); }}
              style={filterInputStyle}
            >
              <option value="">-- Tất cả làn ra --</option>
              {lanes.filter((l) => l.laneType === 'OUT' || l.laneType === 'BIDIRECTIONAL').map((l) => (
                <option key={l.id} value={l.id}>{l.laneName}</option>
              ))}
            </select>
          </div>
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
                onClick={loadSessions}
                style={{ padding: '8px 16px', backgroundColor: '#F1F5F9', color: '#0F172A', border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer' }}
              >
                Thử lại
              </button>
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState title="Không tìm thấy phiên gửi xe nào" description="Thử thay đổi bộ lọc hoặc chọn khoảng thời gian khác." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                  <th style={thStyle}>Biển Số Xe</th>
                  <th style={thStyle}>Loại Xe</th>
                  <th style={thStyle}>Giờ Vào / Làn Vào</th>
                  <th style={thStyle}>Giờ Ra / Làn Ra</th>
                  <th style={thStyle}>Thời Lượng</th>
                  <th style={thStyle}>Trạng Thái</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Ảnh Đối Chiếu (4 Kênh)</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, idx) => {
                  const inPlate = s.inPlateImagePath ? resolveImageUrl(s.inPlateImagePath) : undefined;
                  const outPlate = s.outPlateImagePath ? resolveImageUrl(s.outPlateImagePath) : undefined;
                  const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC';
                  return (
                    <tr
                      key={s.id}
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
                          {s.plateNumber}
                        </span>
                        {s.companyName && (
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                            {s.companyName}
                          </div>
                        )}
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
                          {getVehicleBadge(s.vehicleType)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ color: '#0F172A', fontWeight: 500 }}>{s.inTime || '---'}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>{s.inLaneName || 'Làn vào'}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ color: '#0F172A', fontWeight: 500 }}>{s.outTime || 'Chưa ra'}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>{s.outLaneName || '---'}</div>
                      </td>
                      <td style={tdStyle}>
                        {s.durationFormatted ? (
                          <span style={{ color: '#0284C7', fontWeight: 600 }}>{s.durationFormatted}</span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>---</span>
                        )}
                      </td>
                      <td style={tdStyle}>{getStatusBadge(s.status)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: '6px',
                            alignItems: 'center',
                            cursor: 'pointer'
                          }}
                          onClick={() => setSelectedSession(s)}
                          title="Nhấp để xem đầy đủ 4 ảnh đối chiếu"
                        >
                          {/* Mini thumbnail in plate */}
                          <div style={{ width: '42px', height: '28px', backgroundColor: '#F8FAFC', borderRadius: 4, overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                            <SnapshotImage src={inPlate} alt="In" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                          {/* Mini thumbnail out plate */}
                          <div style={{ width: '42px', height: '28px', backgroundColor: '#F8FAFC', borderRadius: 4, overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                            <SnapshotImage src={outPlate} alt="Out" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedSession(s)}
                          style={{
                            padding: '5px 12px',
                            backgroundColor: '#0284C7',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500
                          }}
                        >
                          Chi Tiết 4 Kênh
                        </button>
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
            itemLabel="lượt gửi xe"
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* 4-Image Modal with Suspense */}
      <Suspense fallback={null}>
        {selectedSession && (
          <Evidence4ImageModal
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
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
const presetBtnStyle: React.CSSProperties = {
  padding: '5px 12px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '4px',
  color: '#334155',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500
};

export default ParkingHistoryPage;
