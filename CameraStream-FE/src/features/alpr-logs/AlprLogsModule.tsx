import { useState, useEffect, useMemo, useCallback, useRef, type FC } from 'react';
import type { RealDetectionEvent } from './types';
import HistoryFilterBar, { type HistoryTimeFilter } from '../../components/HistoryFilterBar';
import {
  IconCar,
  IconMoto,
  IconGrid
} from '../../components/SurveillanceIcons';
import KpiStatCard from '../../shared/components/KpiStatCard';
import { ViewModeToggle, type ViewMode } from '../../shared/components/ViewModeToggle';
import PaginationBar from '../../shared/components/PaginationBar';
import SnapshotModal from '../../shared/components/SnapshotModal';
import CardSkeleton from '../../shared/components/CardSkeleton';
import TableSkeleton from '../../shared/components/TableSkeleton';
import EmptyState from '../../shared/components/EmptyState';
import {
  exportChunkedPagesToExcel,
  exportDataToExcel,
  validateDateRange
} from '../../shared/utils/excelExporter';
import type { ExportProgressCallback } from '../../shared/components/ExportExcelButton';
import AlprCardItem from './components/AlprCardItem';
import AlprTable from './components/AlprTable';
import { useEventStream } from '../../core/websocket/useEventStream';
import { resolveImageUrl, AI_SERVICE_BASE_URL } from '../../shared/utils/imageUrl';
import { useAuth } from '../../core/auth/AuthContext';

export interface AlprLogsModuleProps {
  apiBaseUrl: string;
}

export const AlprLogsModule: FC<AlprLogsModuleProps> = ({ apiBaseUrl }) => {
  const { can } = useAuth();
  const [detections, setDetections] = useState<RealDetectionEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('alpr_view_mode') as ViewMode) || 'TABLE';
    } catch {
      return 'TABLE';
    }
  });
  const [selectedDetection, setSelectedDetection] = useState<RealDetectionEvent | null>(null);

  // Lưu chế độ xem để lần sau mở lại đúng giao diện đã chọn
  useEffect(() => {
    try {
      localStorage.setItem('alpr_view_mode', viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  // AbortController ref để hủy các request đang bay dở khi unmount hoặc gọi mới
  const abortControllerRef = useRef<AbortController | null>(null);

  // Bộ lọc Ngày Giờ HistoryFilterBar
  const [timeFilter, setTimeFilter] = useState<HistoryTimeFilter>({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    startTime: '00:00',
    endTime: '23:59',
    searchQuery: '',
    categoryFilter: 'ALL'
  });
  const { startDate: rangeStart, endDate: rangeEnd } = timeFilter;

  // Phân trang Server-side
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);
  const [serverTotalElements, setServerTotalElements] = useState<number>(0);
  const [serverTotalPages, setServerTotalPages] = useState<number>(1);
  const [serverStats, setServerStats] = useState<{ total: number; cars: number; motos: number; persons: number }>({
    total: 0,
    cars: 0,
    motos: 0,
    persons: 0
  });

  // Tải danh sách phát hiện từ Python AI Service hoặc Spring Boot
  const fetchDetections = useCallback(async (isSilent = false) => {
    // Hủy request cũ nếu đang chạy dở để tránh rò rỉ bộ nhớ (memory leak)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!isSilent) setLoading(true);

    try {
      // 1. Nguồn chính: Spring Boot Event Hub (Server-side Pagination & Filter)
      const qs = new URLSearchParams({
        eventType: 'VEHICLE_ANPR',
        page: String(Math.max(0, currentPage - 1)),
        size: String(pageSize)
      });
      if (rangeStart) qs.set('fromDate', rangeStart);
      if (rangeEnd) qs.set('toDate', rangeEnd);
      if (timeFilter.searchQuery && timeFilter.searchQuery.trim()) {
        qs.set('keyword', timeFilter.searchQuery.trim());
      }
      if (timeFilter.categoryFilter && timeFilter.categoryFilter !== 'ALL') {
        qs.set('vehicleType', timeFilter.categoryFilter);
      }

      // Tải song song thống kê tổng thể trong khoảng thời gian đã chọn
      const statQs = new URLSearchParams({ eventType: 'VEHICLE_ANPR' });
      if (rangeStart) statQs.set('fromDate', rangeStart);
      if (rangeEnd) statQs.set('toDate', rangeEnd);
      if (timeFilter.searchQuery && timeFilter.searchQuery.trim()) {
        statQs.set('keyword', timeFilter.searchQuery.trim());
      }
      fetch(`${apiBaseUrl}/api/v1/events/stats?${statQs.toString()}`, {
        headers: { 'Accept': 'application/json' }
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((sJson) => {
          if (sJson && sJson.data) {
            setServerStats({
              total: Number(sJson.data.total || 0),
              cars: Number(sJson.data.cars || 0),
              motos: Number(sJson.data.motos || 0),
              persons: Number(sJson.data.persons || 0)
            });
          }
        })
        .catch(() => {});

      const res = await fetch(`${apiBaseUrl}/api/v1/events?${qs.toString()}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      });
      if (res.ok) {
        const json = await res.json();
        const pageData = json?.data;
        const items = pageData?.content || [];
        const totalElements = pageData?.page?.totalElements ?? pageData?.totalElements ?? items.length;
        const totalPages = Math.max(1, pageData?.page?.totalPages ?? pageData?.totalPages ?? Math.ceil(totalElements / pageSize));

        setServerTotalElements(totalElements);
        setServerTotalPages(totalPages);

        const mapped: RealDetectionEvent[] = items.map((ev: any) => ({
          id: String(ev.id),
          plateNumber: ev.payload?.plateNumber || 'CHƯA RÕ BIỂN',
          vehicleType: (ev.payload?.vehicleType || 'CAR') as any,
          confidence: ev.confidence ? Math.round(ev.confidence * 100) : 95,
          snapshotUrl: resolveImageUrl(ev.snapshotUrl, apiBaseUrl),
          plateCropUrl: resolveImageUrl(ev.payload?.plateCropUrl || ev.snapshotUrl, apiBaseUrl),
          detectedAt: ev.createdAt || ev.detectedAt,
          gateName: ev.cameraName || `Camera #${ev.cameraId}`,
          status: ev.severity === 'WARNING' ? 'CẢNH BÁO' : 'HỢP LỆ'
        }));

        setDetections(mapped);
        return;
      }

      // 2. Fallback: AI service Python (khi backend chưa có dữ liệu)
      const pyRes = await fetch(`${AI_SERVICE_BASE_URL}/api/detections`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      if (pyRes.ok) {
        const json = await pyRes.json();
        if (json && Array.isArray(json.data)) {
          const newItems: RealDetectionEvent[] = json.data.slice(0, 200).map((item: any) => ({
            ...item,
            snapshotUrl: resolveImageUrl(item.snapshotUrl),
            plateCropUrl: resolveImageUrl(item.plateCropUrl)
          }));
          setServerTotalElements(newItems.length);
          setServerTotalPages(Math.max(1, Math.ceil(newItems.length / pageSize)));
          setDetections((prev) => {
            if (
              prev.length === newItems.length &&
              prev[0]?.id === newItems[0]?.id &&
              prev[0]?.detectedAt === newItems[0]?.detectedAt
            ) {
              return prev;
            }
            return newItems;
          });
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Lỗi tải dữ liệu ALPR:', err);
      }
    } finally {
      // Chỉ request mới nhất mới được tắt skeleton (request bị abort không ghi đè trạng thái)
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [apiBaseUrl, rangeStart, rangeEnd, currentPage, pageSize, timeFilter.searchQuery, timeFilter.categoryFilter]);

  // Lắng nghe sự kiện phương tiện mới qua WebSocket thời gian thực (Loại bỏ triệt để HTTP Polling gây spam SQL)
  const { registerEventListener } = useEventStream();

  useEffect(() => {
    fetchDetections(false);
  }, [fetchDetections, currentPage, pageSize, rangeStart, rangeEnd, timeFilter.searchQuery, timeFilter.categoryFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rangeStart, rangeEnd, timeFilter.searchQuery, timeFilter.categoryFilter]);

  useEffect(() => {
    const unsubscribe = registerEventListener('VEHICLE_ANPR', (event) => {
      const newDet: RealDetectionEvent = {
        id: String(event.id),
        plateNumber: event.payload?.plateNumber || 'CHƯA RÕ BIỂN',
        vehicleType: (event.payload?.vehicleType || 'CAR') as any,
        confidence: event.confidence ? Math.round(event.confidence * 100) : 95,
        snapshotUrl: resolveImageUrl(event.snapshotUrl, apiBaseUrl),
        plateCropUrl: resolveImageUrl(event.payload?.plateCropUrl || event.snapshotUrl, apiBaseUrl),
        detectedAt: event.createdAt || new Date().toISOString(),
        gateName: event.cameraName || `Camera #${event.cameraId}`,
        status: event.severity === 'WARNING' ? 'CẢNH BÁO' : 'HỢP LỆ'
      };
      setDetections((prev) => [newDet, ...prev.slice(0, 199)]);
    });

    return () => {
      unsubscribe();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchDetections, registerEventListener]);

  // 1. Lọc theo Khoảng thời gian (Ngày - Giờ) và Từ khóa tìm kiếm (trước khi lọc Phân loại)
  const timeAndSearchFilteredDetections = useMemo(() => {
    return detections.filter((det) => {
      // 1. Khoảng Ngày - Giờ
      if (timeFilter) {
        const rawTime = det.detectedAt || det.timestamp;
        if (rawTime) {
          const dObj = new Date(rawTime);
          if (!isNaN(dObj.getTime())) {
            const y = dObj.getFullYear();
            const m = String(dObj.getMonth() + 1).padStart(2, '0');
            const d = String(dObj.getDate()).padStart(2, '0');
            const detDate = `${y}-${m}-${d}`;
            const h = String(dObj.getHours()).padStart(2, '0');
            const min = String(dObj.getMinutes()).padStart(2, '0');
            const detTime = `${h}:${min}`;

            if (timeFilter.startDate && detDate < timeFilter.startDate) return false;
            if (timeFilter.endDate && detDate > timeFilter.endDate) return false;
            if (timeFilter.startTime && detTime < timeFilter.startTime) return false;
            if (timeFilter.endTime && detTime > timeFilter.endTime) return false;
          }
        }
      }

      // 2. Từ khóa tìm kiếm
      const query = (timeFilter.searchQuery || '').toLowerCase();
      const matchSearch =
        !query ||
        (det.plateNumber && det.plateNumber.toLowerCase().includes(query)) ||
        Boolean((det as any).personName && (det as any).personName.toLowerCase().includes(query)) ||
        (det.gateName && det.gateName.toLowerCase().includes(query)) ||
        (det.cameraName && det.cameraName.toLowerCase().includes(query));

      return matchSearch;
    });
  }, [detections, timeFilter.startDate, timeFilter.endDate, timeFilter.startTime, timeFilter.endTime, timeFilter.searchQuery]);

  // 2. Thống kê nhanh KPI chuẩn xác theo đúng khoảng thời gian được chọn
  const kpiStats = useMemo(() => {
    // Nếu có số liệu thống kê chuẩn xác toàn DB từ Server trong khoảng ngày/bộ lọc
    if (serverStats.total > 0 || serverStats.cars > 0 || serverStats.motos > 0) {
      return {
        total: serverStats.total,
        cars: serverStats.cars,
        motos: serverStats.motos,
        persons: serverStats.persons,
        avgConf: '98.5'
      };
    }

    let cars = 0;
    let motos = 0;
    let persons = 0;
    let totalConf = 0;

    timeAndSearchFilteredDetections.forEach((d) => {
      const vType = (d.vehicleType || '').toUpperCase();
      const isPerson = Boolean(
        (d as any).personName ||
        d.note?.includes('Person') ||
        vType === 'PERSON' ||
        (d as any).module === 'FACE_ID' ||
        (d as any).eventType === 'FACE_RECOGNITION'
      );
      if (isPerson) {
        persons++;
      } else if (vType === 'MOTO' || vType === 'MOTORCYCLE' || vType === 'BIKE') {
        motos++;
      } else {
        cars++;
      }
      totalConf += (d.confidence || 92);
    });

    const total = serverTotalElements > 0 ? serverTotalElements : timeAndSearchFilteredDetections.length;
    const avgConf = timeAndSearchFilteredDetections.length > 0 ? (totalConf / timeAndSearchFilteredDetections.length).toFixed(1) : '98.5';
    return {
      total,
      cars,
      motos,
      persons,
      avgConf
    };
  }, [serverStats, serverTotalElements, timeAndSearchFilteredDetections]);

  // 3. Logic lọc danh sách hoàn chỉnh (áp dụng thêm Phân loại đối tượng từ thẻ KPI / dropdown)
  const filteredDetections = useMemo(() => {
    if (timeFilter.categoryFilter === 'ALL') {
      return timeAndSearchFilteredDetections;
    }
    return timeAndSearchFilteredDetections.filter((det) => {
      const isPerson = Boolean(
        (det as any).personName ||
        det.note?.includes('Person') ||
        (det.vehicleType || '').toUpperCase() === 'PERSON'
      );
      const cat = timeFilter.categoryFilter;

      if (cat === 'CAR') return !isPerson && (det.vehicleType === 'CAR' || !det.vehicleType);
      if (cat === 'MOTO') return !isPerson && det.vehicleType === 'MOTO';
      if (cat === 'TRUCK') return !isPerson && det.vehicleType === 'TRUCK';
      if (cat === 'PERSON') return isPerson;

      return true;
    });
  }, [timeAndSearchFilteredDetections, timeFilter.categoryFilter]);

  // Phân trang Server-side: dữ liệu detections đã là đúng trang hiện tại
  const paginatedDetections = filteredDetections;

  // Xử lý xuất Excel hợp nhất theo cụm 500 dòng/lần (Chunked 500 rows) kèm tiến độ trực tiếp trên ExportExcelButton
  const handleExportAlprExcel = async (onProgress: ExportProgressCallback) => {
    const dateErr = validateDateRange(timeFilter.startDate, timeFilter.endDate);
    if (dateErr) {
      throw new Error(dateErr);
    }

    try {
      await exportChunkedPagesToExcel<any>({
        apiBaseUrl,
        endpoint: '/api/v1/events',
        params: {
          eventType: 'VEHICLE_ANPR',
          fromDate: timeFilter.startDate,
          toDate: timeFilter.endDate,
          vehicleType: timeFilter.categoryFilter !== 'ALL' ? timeFilter.categoryFilter : undefined,
          keyword: timeFilter.searchQuery?.trim() || undefined
        },
        chunkSize: 500,
        fileName: `Bao_Cao_Nhan_Dien_Xe_${timeFilter.startDate}_${timeFilter.endDate}.xls`,
        reportTitle: 'BÁO CÁO LỊCH SỬ NHẬN DIỆN PHƯƠNG TIỆN (ALPR)',
        subtitle: `Thời gian: ${timeFilter.startDate} đến ${timeFilter.endDate} | Phân loại: ${timeFilter.categoryFilter}`,
        onProgress,
        columns: [
          { header: 'STT', width: 45, render: (_, i) => i + 1 },
          { header: 'Mã sự kiện', key: 'id', width: 90 },
          {
            header: 'Biển số / Định danh',
            width: 140,
            render: (ev) => ev.payload?.plateNumber || ev.plateNumber || 'CHƯA RÕ BIỂN'
          },
          {
            header: 'Loại phương tiện',
            width: 130,
            render: (ev) => {
              const vType = (ev.payload?.vehicleType || ev.vehicleType || '').toUpperCase();
              if (vType === 'CAR') return 'Ô tô';
              if (vType === 'MOTO' || vType === 'MOTORCYCLE' || vType === 'BIKE') return 'Xe máy';
              if (vType === 'TRUCK') return 'Xe tải';
              if (vType === 'PERSON') return 'Người (FaceID)';
              return vType || 'Ô tô';
            }
          },
          {
            header: 'Độ tin cậy AI',
            width: 95,
            render: (ev) => {
              const raw = ev.confidence ?? 0.95;
              const pct = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
              return `${pct}%`;
            }
          },
          {
            header: 'Thời gian nhận diện',
            width: 150,
            render: (ev) => {
              const t = ev.createdAt || ev.detectedAt || ev.timestamp;
              return t ? new Date(t).toLocaleString('vi-VN') : '';
            }
          },
          {
            header: 'Cổng / Camera giám sát',
            width: 160,
            render: (ev) => ev.cameraName || ev.gateName || `Camera #${ev.cameraId ?? ''}`
          },
          {
            header: 'Trạng thái',
            width: 100,
            render: (ev) => (ev.severity === 'WARNING' || ev.isViolation ? 'Cảnh báo vi phạm' : 'Hợp lệ')
          }
        ]
      });
    } catch (apiErr: any) {
      console.warn('Fallback xuất dữ liệu đang hiển thị tại client:', apiErr?.message);
      if (filteredDetections.length === 0) {
        throw new Error(apiErr?.message || 'Không có bản ghi nào phù hợp với bộ lọc để xuất.');
      }
      onProgress(filteredDetections.length, filteredDetections.length);
      exportDataToExcel({
        fileName: `Bao_Cao_Nhan_Dien_Xe_${timeFilter.startDate}_${timeFilter.endDate}.xls`,
        reportTitle: 'BÁO CÁO LỊCH SỬ NHẬN DIỆN PHƯƠNG TIỆN (ALPR)',
        subtitle: `Thời gian: ${timeFilter.startDate} đến ${timeFilter.endDate} | Phân loại: ${timeFilter.categoryFilter} | Tổng: ${filteredDetections.length} lượt`,
        columns: [
          { header: 'STT', width: 45, render: (_, i) => i + 1 },
          { header: 'Mã sự kiện', key: 'id', width: 90 },
          {
            header: 'Biển số / Định danh',
            width: 140,
            render: (d) => d.plateNumber || (d as any).personName || 'Không xác định'
          },
          {
            header: 'Loại phương tiện / Đối tượng',
            width: 130,
            render: (d) => {
              const vType = (d.vehicleType || '').toUpperCase();
              if ((d as any).personName || d.note?.includes('Person') || vType === 'PERSON') return 'Người (FaceID)';
              if (vType === 'CAR') return 'Ô tô';
              if (vType === 'MOTO' || vType === 'MOTORCYCLE' || vType === 'BIKE') return 'Xe máy';
              if (vType === 'TRUCK') return 'Xe tải';
              return 'Khác';
            }
          },
          {
            header: 'Độ tin cậy AI',
            width: 95,
            render: (d) => `${d.confidence ? Math.round(d.confidence) : 95}%`
          },
          {
            header: 'Thời gian nhận diện',
            width: 150,
            render: (d) => {
              const t = d.detectedAt || d.timestamp;
              return t ? new Date(t).toLocaleString('vi-VN') : '';
            }
          },
          {
            header: 'Cổng / Camera giám sát',
            width: 160,
            render: (d) => d.cameraName || d.gateName || 'Camera Cổng'
          },
          {
            header: 'Trạng thái',
            width: 100,
            render: (d) => ((d as any).isViolation ? 'Cảnh báo vi phạm' : 'Hợp lệ')
          }
        ],
        data: filteredDetections
      });
    }
  };

  return (
    <div style={{ padding: '14px 14px', maxWidth: '1440px', margin: '0 auto', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* 1. TOP KPI CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px',
        marginBottom: '14px'
      }}>
        <KpiStatCard
          title="Tổng Lượt Xe"
          value={kpiStats.total}
          sublabel="lượt qua cổng"
          icon={IconGrid}
          color="#0284C7"
          isActive={timeFilter.categoryFilter === 'ALL'}
          onClick={() => setTimeFilter((prev) => ({ ...prev, categoryFilter: 'ALL' }))}
        />
        <KpiStatCard
          title="Ô Tô Nhận Diện"
          value={kpiStats.cars}
          sublabel="lượt ô tô / tải"
          icon={IconCar}
          color="#2563EB"
          isActive={timeFilter.categoryFilter === 'CAR'}
          onClick={() => setTimeFilter((prev) => ({ ...prev, categoryFilter: prev.categoryFilter === 'CAR' ? 'ALL' : 'CAR' }))}
        />
        <KpiStatCard
          title="Xe Máy Nhận Diện"
          value={kpiStats.motos}
          sublabel="lượt xe máy"
          icon={IconMoto}
          color="#059669"
          isActive={timeFilter.categoryFilter === 'MOTO'}
          onClick={() => setTimeFilter((prev) => ({ ...prev, categoryFilter: prev.categoryFilter === 'MOTO' ? 'ALL' : 'MOTO' }))}
        />
      </div>

      {/* 2. THANH LỌC THỜI GIAN VÀ XUẤT EXCEL / CSV CHUNKED */}
      <HistoryFilterBar
        title="Lọc Lịch Sử Nhận Diện Phương Tiện"
        themeColor="#0284C7"
        searchPlaceholder="Tìm theo biển số, cổng vào, camera..."
        loading={loading}
        onRefresh={() => fetchDetections(false)}
        onFilterChange={setTimeFilter}
        onExport={can('ALPR_EXPORT') ? handleExportAlprExcel : undefined}
        exportButtonText="Xuất Excel"
        categoryOptions={[
          { value: 'ALL', label: 'Tất cả' },
          { value: 'CAR', label: 'Ô tô' },
          { value: 'MOTO', label: 'Xe máy' },
          { value: 'TRUCK', label: 'Xe tải' },
          { value: 'PERSON', label: 'Người (FaceID)' }
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
        {/* Toolbar chế độ xem (Bảng hàng ngang / Lưới thẻ) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          paddingBottom: '10px',
          borderBottom: '1px solid #F1F5F9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
              Danh Sách Phương Tiện
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#EFF6FF',
              color: '#1D4ED8',
              border: '1px solid #DBEAFE'
            }}>
              {filteredDetections.length.toLocaleString()} lượt
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748B' }}>Chế độ xem:</span>
            <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {loading ? (
          viewMode === 'GRID' ? (
            <CardSkeleton count={pageSize} minWidth={240} />
          ) : (
            <TableSkeleton rows={pageSize} cols={7} />
          )
        ) : filteredDetections.length === 0 ? (
          <EmptyState
            title={timeFilter.searchQuery ? undefined : 'Không có lượt xe nào trong khoảng thời gian đã chọn'}
            description={
              detections.length > 0 && !timeFilter.searchQuery
                ? `Hiện đang có ${detections.length} lượt xe được lưu trong hệ thống. Bạn có thể mở rộng ngày lọc hoặc bấm nút bên dưới để xem toàn bộ.`
                : 'Không tìm thấy sự kiện phương tiện nào phù hợp với bộ lọc ngày giờ hoặc từ khóa tìm kiếm.'
            }
            searchQuery={timeFilter.searchQuery}
            onClearSearch={() => setTimeFilter(prev => ({ ...prev, searchQuery: '' }))}
            actionText={detections.length > 0 && !timeFilter.searchQuery ? `Xem tất cả ${detections.length} lượt xe trong hệ thống` : undefined}
            onAction={
              detections.length > 0 && !timeFilter.searchQuery
                ? () => setTimeFilter(prev => ({ ...prev, startDate: '', endDate: '' }))
                : undefined
            }
          />
        ) : viewMode === 'GRID' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '14px'
          }}>
            {paginatedDetections.map((det) => (
              <AlprCardItem
                key={`alpr-grid-${det.id}`}
                detection={det}
                onClickSnapshot={setSelectedDetection}
              />
            ))}
          </div>
        ) : (
          <AlprTable
            detections={paginatedDetections}
            onClickSnapshot={setSelectedDetection}
          />
        )}
      </div>

      {/* 4. PHÂN TRANG SERVER-SIDE */}
      <PaginationBar
        currentPage={currentPage}
        totalPages={serverTotalPages}
        totalItems={serverTotalElements}
        pageSize={pageSize}
        pageSizeOptions={[6, 12, 24, 48]}
        itemLabel="lượt xe"
        activeColor="#0284C7"
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
      />

      {/* 5. MODAL XEM ẢNH PHÓNG TO */}
      <SnapshotModal
        isOpen={Boolean(selectedDetection)}
        onClose={() => setSelectedDetection(null)}
        imageUrl={selectedDetection?.snapshotUrl || selectedDetection?.plateCropUrl}
        cropUrl={selectedDetection?.snapshotUrl ? selectedDetection?.plateCropUrl : undefined}
        title={`Chi Tiết Nhận Diện: ${selectedDetection?.plateNumber || 'Phương tiện'}`}
        subtitle={`${selectedDetection?.gateName || selectedDetection?.cameraName || 'Camera Cổng'} • ${selectedDetection?.detectedAt || selectedDetection?.timestamp || ''}`}
        metadata={[
          { label: 'Biển số', value: selectedDetection?.plateNumber || 'CHƯA RÕ' },
          { label: 'Loại xe', value: selectedDetection?.vehicleType || 'Ô tô' },
          { label: 'Cổng / Làn', value: selectedDetection?.gateName || (selectedDetection?.laneDirection === 'OUT' ? 'Cổng Ra' : 'Cổng Vào') }
        ]}
      />
    </div>
  );
};

export default AlprLogsModule;
