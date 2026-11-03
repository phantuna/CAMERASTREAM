import { useState, useEffect, useMemo, useCallback, type FC } from 'react';
import {
  IconCamera,
  IconUser,
  IconChevronLeft,
  IconChevronRight,
  IconClock
} from '../../components/SurveillanceIcons';
import type { SystemEvent } from '../../core/types';
import { useEventStream } from '../../core/websocket/useEventStream';
import HistoryFilterBar, { type HistoryTimeFilter } from '../../components/HistoryFilterBar';
import {
  exportChunkedPagesToExcel,
  exportDataToExcel,
  validateDateRange
} from '../../shared/utils/excelExporter';
import type { ExportProgressCallback } from '../../shared/components/ExportExcelButton';
import KpiStatCard from '../../shared/components/KpiStatCard';
import PaginationBar from '../../shared/components/PaginationBar';
import SnapshotModal from '../../shared/components/SnapshotModal';
import CardSkeleton from '../../shared/components/CardSkeleton';
import TableSkeleton from '../../shared/components/TableSkeleton';
import EmptyState from '../../shared/components/EmptyState';
import { useAuth } from '../../core/auth/AuthContext';

export interface FaceRecognitionModuleProps {
  apiBaseUrl: string;
}

export const FaceRecognitionModule: FC<FaceRecognitionModuleProps> = ({ apiBaseUrl }) => {
  const { can } = useAuth();
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [viewMode] = useState<'GRID' | 'TABLE'>('GRID');

  // Bộ lọc thời gian dùng chung
  const [filter, setFilter] = useState<HistoryTimeFilter>({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    startTime: '00:00',
    endTime: '23:59',
    searchQuery: '',
    categoryFilter: 'ALL'
  });

  // Phân trang Server-side
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);
  const [serverTotalElements, setServerTotalElements] = useState<number>(0);
  const [serverTotalPages, setServerTotalPages] = useState<number>(1);
  const totalPages = serverTotalPages;

  const { registerEventListener } = useEventStream();

  const fetchFaceEvents = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        eventType: 'FACE_RECOGNITION',
        page: String(Math.max(0, currentPage - 1)),
        size: String(pageSize)
      });
      if (filter.startDate) qs.set('fromDate', filter.startDate);
      if (filter.endDate) qs.set('toDate', filter.endDate);
      if (filter.searchQuery && filter.searchQuery.trim()) {
        qs.set('keyword', filter.searchQuery.trim());
      }
      const res = await fetch(`${apiBaseUrl}/api/v1/events?${qs.toString()}`);
      const json = await res.json();
      if (json && json.data) {
        const pageData = json.data;
        const items = pageData.content || [];
        const totalElements = pageData?.page?.totalElements ?? pageData?.totalElements ?? items.length;
        const totalPages = Math.max(1, pageData?.page?.totalPages ?? pageData?.totalPages ?? Math.ceil(totalElements / pageSize));

        setEvents(items);
        setServerTotalElements(totalElements);
        setServerTotalPages(totalPages);
      }
    } catch (err) {
      console.warn('Lỗi tải dữ liệu FaceID:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, currentPage, pageSize, filter.startDate, filter.endDate, filter.searchQuery]);

  useEffect(() => {
    fetchFaceEvents();
  }, [fetchFaceEvents, currentPage, pageSize, filter.startDate, filter.endDate, filter.searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter.startDate, filter.endDate, filter.searchQuery, filter.categoryFilter]);

  useEffect(() => {
    const unsubscribe = registerEventListener('FACE_RECOGNITION', (event) => {
      setEvents((prev) => [event, ...prev.slice(0, pageSize - 1)]);
    });

    return unsubscribe;
  }, [registerEventListener, pageSize]);

  // 1. Lọc theo Khoảng thời gian (Ngày - Giờ) và Từ khóa tìm kiếm
  const timeAndSearchFilteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const rawCreated = ev.createdAt;
      if (!rawCreated) return true;

      const evDateObj = new Date(rawCreated);
      const year = evDateObj.getFullYear();
      const month = String(evDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(evDateObj.getDate()).padStart(2, '0');
      const evDate = `${year}-${month}-${day}`;

      const hours = String(evDateObj.getHours()).padStart(2, '0');
      const mins = String(evDateObj.getMinutes()).padStart(2, '0');
      const evTime = `${hours}:${mins}`;

      // 1. Khoảng ngày
      if (filter.startDate && evDate < filter.startDate) return false;
      if (filter.endDate && evDate > filter.endDate) return false;

      // 2. Khoảng giờ
      if (filter.startTime && evTime < filter.startTime) return false;
      if (filter.endTime && evTime > filter.endTime) return false;

      // 3. Từ khóa (tên nhân sự, mã nhân viên, camera)
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        const pName = (ev.payload?.personName || '').toLowerCase();
        const empId = (ev.payload?.employeeId || '').toLowerCase();
        const camName = (ev.cameraName || '').toLowerCase();
        const camId = String(ev.cameraId || '');

        const match = pName.includes(query) || empId.includes(query) || camName.includes(query) || camId.includes(query);
        if (!match) return false;
      }

      return true;
    });
  }, [events, filter.startDate, filter.endDate, filter.startTime, filter.endTime, filter.searchQuery]);

  // 2. Thống kê nhanh KPI theo đúng thời gian được chọn (Tổng, Nhân sự, Người lạ)
  const kpiStats = useMemo(() => {
    let employees = 0;
    let strangers = 0;
    timeAndSearchFilteredEvents.forEach((ev) => {
      const isEmp = Boolean(ev.payload?.employeeId || (ev.payload?.personName && ev.payload.personName !== 'Người lạ'));
      if (isEmp) employees++;
      else strangers++;
    });
    return {
      total: timeAndSearchFilteredEvents.length,
      employees,
      strangers
    };
  }, [timeAndSearchFilteredEvents]);

  // 3. Logic lọc danh sách hoàn chỉnh (áp dụng thêm Phân loại từ thẻ KPI / dropdown)
  const filteredEvents = useMemo(() => {
    if (filter.categoryFilter === 'ALL') {
      return timeAndSearchFilteredEvents;
    }
    return timeAndSearchFilteredEvents.filter((ev) => {
      if (filter.categoryFilter === 'EMPLOYEE') {
        const isEmployee = Boolean(ev.payload?.employeeId || (ev.payload?.personName && ev.payload.personName !== 'Người lạ'));
        if (!isEmployee) return false;
      } else if (filter.categoryFilter === 'STRANGER') {
        const isStranger = ev.severity === 'WARNING' || !ev.payload?.personName || ev.payload.personName === 'Người lạ';
        if (!isStranger) return false;
      }
      return true;
    });
  }, [timeAndSearchFilteredEvents, filter.categoryFilter]);

  // Phân trang Server-side: dữ liệu events từ server đã đúng theo trang hiện tại
  const paginatedEvents = filteredEvents;

  // Xuất Excel danh sách sự kiện FaceID hợp nhất theo cụm 500 dòng/lần
  const handleExportFaceExcel = async (onProgress: ExportProgressCallback) => {
    const dateErr = validateDateRange(filter.startDate, filter.endDate);
    if (dateErr) {
      throw new Error(dateErr);
    }

    const columns = [
      { header: 'STT', width: 45, render: (_: SystemEvent, i: number) => i + 1 },
      { header: 'Mã sự kiện', key: 'id', width: 90 },
      {
        header: 'Họ và tên nhân sự',
        width: 160,
        render: (ev: SystemEvent) => ev.payload?.personName || 'Người lạ / Khách'
      },
      {
        header: 'Mã nhân viên',
        width: 100,
        render: (ev: SystemEvent) => ev.payload?.employeeId || '-'
      },
      {
        header: 'Phòng ban / Đơn vị',
        width: 140,
        render: (ev: SystemEvent) => ev.payload?.department || '-'
      },
      {
        header: 'Thời gian nhận diện',
        width: 150,
        render: (ev: SystemEvent) => (ev.createdAt ? new Date(ev.createdAt).toLocaleString('vi-VN') : '')
      },
      {
        header: 'Camera / Vị trí',
        width: 150,
        render: (ev: SystemEvent) => ev.cameraName || `Camera #${ev.cameraId}`
      },
      {
        header: 'Độ tin cậy AI',
        width: 95,
        render: (ev: SystemEvent) => `${Math.round((ev.confidence || 0.95) * 100)}%`
      },
      {
        header: 'Phân loại',
        width: 110,
        render: (ev: SystemEvent) => {
          const isEmp = Boolean(
            ev.payload?.employeeId ||
              (ev.payload?.personName && ev.payload.personName !== 'Người lạ')
          );
          return isEmp ? 'Nhân viên hợp lệ' : 'Cảnh báo người lạ';
        }
      }
    ];

    try {
      await exportChunkedPagesToExcel<SystemEvent>({
        apiBaseUrl,
        endpoint: '/api/v1/events',
        params: {
          eventType: 'FACE_RECOGNITION',
          fromDate: filter.startDate,
          toDate: filter.endDate,
          keyword: filter.searchQuery?.trim() || undefined
        },
        chunkSize: 500,
        fileName: `Bao_Cao_FaceID_${filter.startDate}_${filter.endDate}.xls`,
        reportTitle: 'BÁO CÁO NHẬN DIỆN KHUÔN MẶT & ĐIỂM DANH NHÂN SỰ',
        subtitle: `Thời gian lọc: ${filter.startDate} đến ${filter.endDate} | Bộ lọc: ${filter.categoryFilter}`,
        columns,
        onProgress
      });
    } catch (apiErr: any) {
      console.warn('Fallback xuất dữ liệu FaceID tại client:', apiErr?.message);
      if (filteredEvents.length === 0) {
        throw new Error(apiErr?.message || 'Không có bản ghi nào phù hợp với bộ lọc để xuất.');
      }
      onProgress(filteredEvents.length, filteredEvents.length);
      exportDataToExcel({
        fileName: `Bao_Cao_FaceID_${filter.startDate}_${filter.endDate}.xls`,
        reportTitle: 'BÁO CÁO NHẬN DIỆN KHUÔN MẶT & ĐIỂM DANH NHÂN SỰ',
        subtitle: `Thời gian lọc: ${filter.startDate} đến ${filter.endDate} | Bộ lọc: ${filter.categoryFilter} | Tổng: ${filteredEvents.length} lượt`,
        columns,
        data: filteredEvents
      });
    }
  };

  return (
    <div style={{ padding: '16px 20px', maxWidth: '1440px', margin: '0 auto', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* 1. TOP KPI CARDS DÙNG CHUNG (KpiStatCard) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '12px',
        marginBottom: '14px'
      }}>
        <KpiStatCard
          title="Tổng Lượt Vào / Ra"
          value={kpiStats.total}
          sublabel="lượt điểm danh"
          icon={IconCamera}
          color="#7C3AED"
          isActive={filter.categoryFilter === 'ALL'}
          onClick={() => setFilter((prev) => ({ ...prev, categoryFilter: 'ALL' }))}
        />
        <KpiStatCard
          title="Nhân Viên Hợp Lệ"
          value={kpiStats.employees}
          sublabel="nhân sự nhận diện"
          icon={IconUser}
          color="#059669"
          isActive={filter.categoryFilter === 'EMPLOYEE'}
          onClick={() => setFilter((prev) => ({ ...prev, categoryFilter: prev.categoryFilter === 'EMPLOYEE' ? 'ALL' : 'EMPLOYEE' }))}
        />
        <KpiStatCard
          title="Người Lạ / Cảnh Báo"
          value={kpiStats.strangers}
          sublabel="chưa có hồ sơ mẫu"
          icon={IconCamera}
          color="#DC2626"
          isActive={filter.categoryFilter === 'STRANGER'}
          onClick={() => setFilter((prev) => ({ ...prev, categoryFilter: prev.categoryFilter === 'STRANGER' ? 'ALL' : 'STRANGER' }))}
        />
      </div>

      {/* 2. COMPACT HISTORY FILTER BAR (TINH GỌN 1 HÀNG) */}
      <HistoryFilterBar
        themeColor="#7C3AED"
        searchPlaceholder="Tìm họ tên nhân sự, mã số, camera..."
        loading={loading}
        onRefresh={fetchFaceEvents}
        onFilterChange={setFilter}
        onExport={can('ALPR_EXPORT') ? handleExportFaceExcel : undefined}
        exportButtonText="Xuất Excel"
        categoryOptions={[
          { value: 'ALL', label: 'Tất cả' },
          { value: 'EMPLOYEE', label: 'Nhân viên' },
          { value: 'STRANGER', label: 'Người lạ' }
        ]}
      />

      {/* 3. NỘI DUNG DANH SÁCH (LƯỚI HOẶC BẢNG) */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        padding: '16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        {/* Thanh tiêu đề con + Phân trang */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
            Nhật Ký Nhận Diện ({serverTotalElements > 0 ? serverTotalElements : filteredEvents.length})
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#64748B' }}>
              <span>Trang {currentPage} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                style={{
                  padding: '3px 7px',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1',
                  background: currentPage <= 1 ? '#F1F5F9' : '#FFF',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                <IconChevronLeft size={12} />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                style={{
                  padding: '3px 7px',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1',
                  background: currentPage >= totalPages ? '#F1F5F9' : '#FFF',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                <IconChevronRight size={12} />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          viewMode === 'GRID' ? (
            <CardSkeleton count={pageSize} minWidth={280} />
          ) : (
            <TableSkeleton rows={pageSize} cols={6} />
          )
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            searchQuery={filter.searchQuery}
            onClearSearch={() => setFilter(prev => ({ ...prev, searchQuery: '' }))}
            description="Không tìm thấy lượt nhận diện khuôn mặt nào phù hợp với bộ lọc ngày giờ hoặc từ khóa tìm kiếm."
          />
        ) : viewMode === 'GRID' ? (
          /* CHẾ ĐỘ LƯỚI THẺ (GRID) - TỐI ƯU LCP VỚI loading="lazy" decoding="async" */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px'
          }}>
            {paginatedEvents.map((ev) => {
              const isEmployee = Boolean(ev.payload?.employeeId || (ev.payload?.personName && ev.payload.personName !== 'Người lạ'));
              const isWarning = ev.severity === 'WARNING';
              const badgeBg = isEmployee ? '#ECFDF5' : (isWarning ? '#FEF2F2' : '#F1F5F9');
              const badgeColor = isEmployee ? '#059669' : (isWarning ? '#DC2626' : '#64748B');
              const badgeBorder = isEmployee ? '#A7F3D0' : (isWarning ? '#FECACA' : '#E2E8F0');

              return (
                <div
                  key={ev.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {ev.snapshotUrl ? (
                        <div
                          onClick={() => setSelectedSnapshot(ev.snapshotUrl!)}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '7px',
                            overflow: 'hidden',
                            border: '1px solid #CBD5E1',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          <img
                            src={ev.snapshotUrl}
                            alt="Snapshot"
                            loading="lazy"
                            decoding="async"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '7px',
                          backgroundColor: isEmployee ? '#EDE9FE' : '#FEE2E2',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isEmployee ? '#7C3AED' : '#EF4444',
                          fontWeight: 700,
                          fontSize: '12px',
                          flexShrink: 0
                        }}>
                          {isEmployee ? 'NV' : 'LẠ'}
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                          {ev.payload?.personName || 'Người lạ / Khách'}
                        </div>
                        {ev.payload?.employeeId ? (
                          <div style={{ fontSize: '10.5px', color: '#64748B', fontFamily: 'monospace' }}>
                            Mã: {ev.payload.employeeId} {ev.payload?.department ? `• ${ev.payload.department}` : ''}
                          </div>
                        ) : (
                          <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>
                            Chưa có hồ sơ mẫu
                          </div>
                        )}
                      </div>
                    </div>

                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: badgeBg,
                      color: badgeColor,
                      border: `1px solid ${badgeBorder}`
                    }}>
                      {isEmployee ? 'HỢP LỆ' : 'CẢNH BÁO'}
                    </span>
                  </div>

                  <div style={{
                    fontSize: '11px',
                    color: '#64748B',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '6px',
                    padding: '7px 9px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Camera:</span>
                      <strong style={{ color: '#0F172A' }}>{ev.cameraName || `Camera #${ev.cameraId}`}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Độ tin cậy:</span>
                      <strong style={{ color: '#059669' }}>{Math.round((ev.confidence || 0.95) * 100)}%</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <IconClock size={11} color="#64748B" /> Thời gian:
                      </span>
                      <span style={{ color: '#0F172A', fontFamily: 'monospace' }}>
                        {ev.createdAt ? new Date(ev.createdAt).toLocaleString('vi-VN') : 'Vừa xong'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* CHẾ ĐỘ BẢNG (TABLE) */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Ảnh Chụp</th>
                  <th style={{ padding: '8px 12px' }}>Họ Tên & Mã Số</th>
                  <th style={{ padding: '8px 12px' }}>Vị Trí / Camera</th>
                  <th style={{ padding: '8px 12px' }}>Thời Gian</th>
                  <th style={{ padding: '8px 12px' }}>Độ Tin Cậy</th>
                  <th style={{ padding: '8px 12px' }}>Trạng Thái</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.map((ev, idx) => {
                  const isEmployee = Boolean(ev.payload?.employeeId || (ev.payload?.personName && ev.payload.personName !== 'Người lạ'));
                  return (
                    <tr key={ev.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFF' : '#FAFAFA' }}>
                      <td style={{ padding: '6px 12px' }}>
                        {ev.snapshotUrl ? (
                          <img
                            src={ev.snapshotUrl}
                            alt="Snapshot"
                            loading="lazy"
                            decoding="async"
                            style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '10px' }}>
                            {isEmployee ? 'NV' : 'LẠ'}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0F172A' }}>
                        <div>{ev.payload?.personName || 'Người lạ / Khách'}</div>
                        {ev.payload?.employeeId && (
                          <div style={{ fontSize: '10.5px', color: '#64748B', fontFamily: 'monospace' }}>
                            {ev.payload.employeeId}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#475569' }}>
                        {ev.cameraName || `Camera #${ev.cameraId}`}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#0F172A', fontFamily: 'monospace' }}>
                        {ev.createdAt ? new Date(ev.createdAt).toLocaleString('vi-VN') : 'Vừa xong'}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#059669', fontWeight: 700 }}>
                        {Math.round((ev.confidence || 0.95) * 100)}%
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: isEmployee ? '#ECFDF5' : '#FEF2F2',
                          color: isEmployee ? '#059669' : '#DC2626',
                          border: `1px solid ${isEmployee ? '#A7F3D0' : '#FECACA'}`
                        }}>
                          {isEmployee ? 'HỢP LỆ' : 'CẢNH BÁO'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. PHÂN TRANG SERVER-SIDE DÙNG CHUNG (PaginationBar) */}
      <PaginationBar
        currentPage={currentPage}
        totalPages={serverTotalPages}
        totalItems={serverTotalElements}
        pageSize={pageSize}
        itemLabel="lượt người"
        activeColor="#7C3AED"
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
      />

      {/* 5. MODAL PHÓNG TO ẢNH DÙNG CHUNG (SnapshotModal) */}
      <SnapshotModal
        isOpen={Boolean(selectedSnapshot)}
        onClose={() => setSelectedSnapshot(null)}
        imageUrl={selectedSnapshot}
        title="Ảnh Chụp Nhận Diện Khuôn Mặt"
        subtitle="Hệ thống camera giám sát & chấm công tự động"
      />
    </div>
  );
};

export default FaceRecognitionModule;
