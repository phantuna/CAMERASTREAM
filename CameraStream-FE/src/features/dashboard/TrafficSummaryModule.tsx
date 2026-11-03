import type { FC } from 'react';
import { useEffect, useState } from 'react';
import {
  IconSearch,
  IconDownload,
  IconRefresh
} from '../../components/SurveillanceIcons';
import {
  getTrafficSummary,
  type TrafficSummaryItem,
  type TrafficSummaryQuery
} from '../../shared/api/statisticsApi';
import { ExportExcelButton, type ExportProgressCallback } from '../../shared/components/ExportExcelButton';
import { exportDataToExcel } from '../../shared/utils/excelExporter';
import { toast } from '../../shared/utils/toast';

interface TrafficSummaryModuleProps {
  apiBaseUrl: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export const TrafficSummaryModule: FC<TrafficSummaryModuleProps> = ({ apiBaseUrl }) => {
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [cameraId, setCameraId] = useState<string>('');
  const [plateKeyword, setPlateKeyword] = useState('');

  const [rows, setRows] = useState<TrafficSummaryItem[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPlates, setTotalPlates] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [globalIns, setGlobalIns] = useState(0);
  const [globalOuts, setGlobalOuts] = useState(0);

  const [isTruncated, setIsTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = (overridePage?: number, overrideSize?: number): TrafficSummaryQuery => ({
    fromDate,
    toDate,
    eventType: 'VEHICLE_ANPR',
    cameraId: cameraId ? Number(cameraId) : null,
    plateKeyword: plateKeyword.trim() || undefined,
    page: overridePage !== undefined ? overridePage : page - 1,
    size: overrideSize !== undefined ? overrideSize : pageSize
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();

    const result = await getTrafficSummary(apiBaseUrl, buildQuery(), controller.signal);
    if (result) {
      setRows(result.items || []);
      setTotalRows(result.totalRows || 0);
      setTotalPlates(result.totalPlates != null ? result.totalPlates : (result.items?.length || 0));
      setTotalPages(result.totalPages != null ? Math.max(1, result.totalPages) : 1);
      if (result.totalIns != null) setGlobalIns(result.totalIns);
      if (result.totalOuts != null) setGlobalOuts(result.totalOuts);
      setIsTruncated(result.isTruncated || false);
      if (result.isTruncated) {
        toast.warning(
          `Kết quả bị cắt tại ${result.totalRows} dòng (giới hạn báo cáo) — xin thu hẹp khoảng thời gian hoặc lọc biển số.`,
          'Báo cáo bị cắt cụt'
        );
      }
    } else {
      setError('Không thể tải báo cáo (backend chưa chạy hoặc lỗi mạng).');
      setRows([]);
      setTotalRows(0);
      setTotalPlates(0);
      setTotalPages(1);
    }
    setLoading(false);
  };

  // Reset về trang 1 khi thay đổi bất kỳ bộ lọc nào
  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, cameraId, plateKeyword, pageSize]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, cameraId, plateKeyword, page, pageSize, apiBaseUrl]);

  const handleExport = async (onProgress: ExportProgressCallback) => {
    // Tải toàn bộ danh sách phù hợp bộ lọc ngày (size lớn, không phân trang) để xuất file Excel đầy đủ
    const result = await getTrafficSummary(apiBaseUrl, buildQuery(0, 10000));
    const allItems = result?.items?.length ? result.items : rows;
    if (!allItems || allItems.length === 0) {
      throw new Error('Không có bản ghi nào phù hợp bộ lọc để xuất Excel.');
    }

    // Xử lý đóng gói theo từng cụm 500 dòng/lần để cập nhật tiến độ và không làm đơ UI
    const chunkSize = 500;
    const processed: TrafficSummaryItem[] = [];
    for (let i = 0; i < allItems.length; i += chunkSize) {
      const slice = allItems.slice(i, i + chunkSize);
      processed.push(...slice);
      onProgress(processed.length, allItems.length);
      await new Promise((r) => setTimeout(r, 10));
    }

    exportDataToExcel({
      fileName: `Bao_Cao_Luot_Xe_${fromDate}_${toDate}.xls`,
      reportTitle: 'BÁO CÁO TỔNG HỢP LƯỢT RA/VÀO THEO BIỂN SỐ',
      subtitle: `Từ ngày: ${fromDate} đến ${toDate} | Tổng số biển số: ${processed.length}`,
      columns: [
        { header: 'STT', width: 45, render: (_, i) => i + 1 },
        { header: 'Biển Số', key: 'plateNumber', width: 130 },
        { header: 'Loại Xe', width: 100, render: (r) => r.vehicleType || '—' },
        { header: 'Camera', width: 150, render: (r) => r.cameraName || `#${r.cameraId ?? '—'}` },
        { header: 'Lượt Vào', key: 'inCount', width: 90 },
        { header: 'Lượt Ra', key: 'outCount', width: 90 },
        { header: 'Tổng Lượt', key: 'totalEvents', width: 95 },
        {
          header: 'Tin Cậy TB',
          width: 100,
          render: (r) => (r.confidenceAvg != null ? `${Math.round(r.confidenceAvg * 100)}%` : '—')
        },
        {
          header: 'Lần Cuối Thấy',
          width: 150,
          render: (r) => (r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString('vi-VN') : '—')
        },
        {
          header: 'Làn / Cổng',
          width: 120,
          render: (r) => r.lastLane || (r.inCount > 0 && r.outCount === 0 ? 'Cổng Vào' : (r.outCount > 0 && r.inCount === 0 ? 'Cổng Ra' : '—'))
        }
      ],
      data: processed
    });
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
            Báo Cáo Lượt Ra/Vào Theo Biển Số
          </h2>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px' }}>
            Gộp số lượt vào/ra từng biển số, độ tin cậy trung bình & camera gần nhất
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            title="Tải lại"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '7px 12px', borderRadius: '7px',
              backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1',
              color: '#334155', fontSize: '11.5px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            <IconRefresh size={13} />
            <span>Tải Lại</span>
          </button>
          <ExportExcelButton
            onExport={handleExport}
            buttonText="Xuất Excel"
          />
        </div>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
          backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: '10px', padding: '12px 14px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Từ Ngày</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '6px 8px', fontSize: '12px', borderRadius: '6px',
              border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', outline: 'none'
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Đến Ngày</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '6px 8px', fontSize: '12px', borderRadius: '6px',
              border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', outline: 'none'
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Camera (ID)</span>
          <input
            type="number"
            value={cameraId}
            placeholder="Tất cả"
            onChange={(e) => setCameraId(e.target.value)}
            style={{
              width: '110px', padding: '6px 8px', fontSize: '12px', borderRadius: '6px',
              border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', outline: 'none'
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '1 1 200px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Biển Số (từ khóa)</span>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={plateKeyword}
              placeholder="VD: 5X, 29A..."
              onChange={(e) => setPlateKeyword(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px 6px 28px', fontSize: '12px',
                borderRadius: '6px', border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC', outline: 'none',
                position: 'relative'
              }}
            />
            <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <IconSearch size={13} color="#94A3B8" />
            </div>
          </div>
        </div>
      </div>

      {/* Truncated warning */}
      {isTruncated && (
        <div
          style={{
            padding: '10px 14px', borderRadius: '8px',
            backgroundColor: '#FEF3C7', border: '1px solid #FDE68A',
            color: '#92400E', fontSize: '11.5px', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <IconDownload size={14} color="#92400E" />
          Kết quả bị cắt tại {totalRows.toLocaleString()} dòng — hãy thu hẹp khoảng thời gian hoặc lọc biển số để xem đầy đủ.
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px',
          backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
          color: '#991B1B', fontSize: '11.5px', fontWeight: 600
        }}>
          {error}
        </div>
      )}

      {/* Summary chips */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            padding: '8px 14px', borderRadius: '8px', backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0', fontSize: '12px'
          }}>
            <strong style={{ color: '#059669' }}>{totalPlates.toLocaleString()}</strong> biển số
          </div>
          <div style={{
            padding: '8px 14px', borderRadius: '8px', backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0', fontSize: '12px'
          }}>
            <strong style={{ color: '#0284C7' }}>{globalIns.toLocaleString()}</strong> lượt vào
          </div>
          <div style={{
            padding: '8px 14px', borderRadius: '8px', backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0', fontSize: '12px'
          }}>
            <strong style={{ color: '#D97706' }}>{globalOuts.toLocaleString()}</strong> lượt ra
          </div>
        </div>
      )}

      {/* Data table */}
      <div
        style={{
          backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: '10px', overflow: 'hidden'
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Biển Số', 'Loại Xe', 'Camera', 'Vào', 'Ra', 'Tổng', 'Tin Cậy TB', 'Lần Cuối', 'Làn/Cổng'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 12px', textAlign: 'left',
                      fontSize: '10.5px', fontWeight: 800, color: '#64748B',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
                    Không có bản ghi nào phù hợp bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={`${row.plateNumber}-${row.cameraId}-${i}`}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FAFBFC'
                    }}
                  >
                    <td style={{ padding: '9px 12px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                      {row.plateNumber}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#334155' }}>{row.vehicleType || '—'}</td>
                    <td style={{ padding: '9px 12px', color: '#334155' }}>{row.cameraName || `#${row.cameraId ?? '—'}`}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>
                      {row.inCount}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#D97706' }}>
                      {row.outCount}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#0F172A' }}>
                      {row.totalEvents}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: '#334155' }}>
                      {row.confidenceAvg != null ? `${Math.round(row.confidenceAvg * 100)}%` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#64748B', fontSize: '11px' }}>
                      {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {(() => {
                        const laneText = row.lastLane || (row.inCount > 0 && row.outCount === 0 ? 'Cổng Vào' : (row.outCount > 0 && row.inCount === 0 ? 'Cổng Ra' : '—'));
                        if (laneText === '—' || !laneText) return <span style={{ color: '#94A3B8' }}>—</span>;
                        const isOut = laneText.includes('Ra') || laneText.toUpperCase().includes('OUT');
                        return (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: isOut ? '#EFF6FF' : '#DCFCE7',
                            color: isOut ? '#1D4ED8' : '#15803D',
                            border: `1px solid ${isOut ? '#BFDBFE' : '#BBF7D0'}`
                          }}>
                            {laneText}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh Phân Trang (Pagination Footer) */}
        {!loading && totalPlates > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid #E2E8F0',
              backgroundColor: '#FAFBFC',
              fontSize: '12px',
              color: '#64748B',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            {/* Thống kê dòng hiển thị */}
            <div>
              Hiển thị <strong style={{ color: '#0F172A' }}>{(page - 1) * pageSize + 1}</strong> - <strong style={{ color: '#0F172A' }}>{Math.min(page * pageSize, totalPlates)}</strong> trên tổng số <strong style={{ color: '#0F172A' }}>{totalPlates.toLocaleString()}</strong> biển số
            </div>

            {/* Điều hướng trang */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}>
                <span style={{ fontSize: '11px' }}>Hiển thị:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '11.5px',
                    cursor: 'pointer'
                  }}
                >
                  <option value={10}>10 dòng / trang</option>
                  <option value={20}>20 dòng / trang</option>
                  <option value={50}>50 dòng / trang</option>
                  <option value={100}>100 dòng / trang</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                title="Trang đầu"
                style={{
                  padding: '5px 9px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: page <= 1 ? '#F1F5F9' : '#FFFFFF',
                  color: page <= 1 ? '#94A3B8' : '#334155',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '11px'
                }}
              >
                ««
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                title="Trang trước"
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: page <= 1 ? '#F1F5F9' : '#FFFFFF',
                  color: page <= 1 ? '#94A3B8' : '#334155',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '11px'
                }}
              >
                ‹ Trước
              </button>

              <span style={{ padding: '0 6px', fontWeight: 600, color: '#334155', fontSize: '11.5px' }}>
                Trang <strong style={{ color: '#0284C7' }}>{page}</strong> / {Math.max(1, totalPages)}
              </span>

              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                title="Trang sau"
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: page >= totalPages ? '#F1F5F9' : '#FFFFFF',
                  color: page >= totalPages ? '#94A3B8' : '#334155',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '11px'
                }}
              >
                Sau ›
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                title="Trang cuối"
                style={{
                  padding: '5px 9px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: page >= totalPages ? '#F1F5F9' : '#FFFFFF',
                  color: page >= totalPages ? '#94A3B8' : '#334155',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '11px'
                }}
              >
                »»
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrafficSummaryModule;
