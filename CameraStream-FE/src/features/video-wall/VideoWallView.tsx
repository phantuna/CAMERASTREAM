import { useState, useEffect, useMemo, useCallback, lazy, Suspense, type FC } from 'react';
import type { CameraDto } from '../device-manager/types';
import type { ModuleMode } from './types';
import CameraTile from './components/CameraTile';
import CameraWallToolbar from './components/CameraWallToolbar';
import VideoWallSkeleton from './components/VideoWallSkeleton';
import { IconCctv, IconClose } from '../../components/SurveillanceIcons';
import { resolveImageUrl } from '../../shared/utils/imageUrl';
import { useEventStream } from '../../core/websocket/useEventStream';
import { getBackendBaseUrl, getAiServiceBaseUrl } from '../../shared/utils/envConfig';

// Code-split heavy modals with React.lazy to eliminate Initial Render Delay / LCP bottleneck
const SpotlightDrawer = lazy(() => import('./components/SpotlightDrawer'));
const RoiConfigModal = lazy(() => import('../../components/RoiConfigModal'));
const SnapshotModal = lazy(() => import('../../shared/components/SnapshotModal'));

export interface VideoWallViewProps {
  apiBaseUrl?: string;
  aiApiBaseUrl?: string;
  aiSseUrl?: string;
  moduleMode?: ModuleMode;
  aiType?: string;
}

export const VideoWallView: FC<VideoWallViewProps> = ({
  apiBaseUrl = getBackendBaseUrl(),
  aiApiBaseUrl,
  moduleMode = 'VEHICLE',
  aiType
}) => {
  const effectiveAiApiBaseUrl = aiApiBaseUrl || getAiServiceBaseUrl();
  const effectiveAiType = aiType || (moduleMode === 'FACE' ? 'FACE_RECOGNITION' : 'VEHICLE_ANPR');

  // Camera state
  const [cameras, setCameras] = useState<CameraDto[]>([]);
  const [cameraAiModulesMap, setCameraAiModulesMap] = useState<Record<number, string[]>>({});
  const [isLoadingCameras, setIsLoadingCameras] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [selectedArea, setSelectedArea] = useState<string>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Grid sizing (Mặc định 4x4 = 16 camera chuẩn VMS)
  const [gridCols, setGridCols] = useState<number>(4);
  const [gridRows, setGridRows] = useState<number>(4);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Cấu hình vùng ROI tĩnh của các camera từ AI Service
  const [cameraRoiMap, setCameraRoiMap] = useState<Record<number, [number, number][]>>({});
  const [realDetections, setRealDetections] = useState<any[]>([]);

  // Modals state
  const [spotlightCamera, setSpotlightCamera] = useState<CameraDto | null>(null);
  const [roiCamera, setRoiCamera] = useState<CameraDto | null>(null);
  const [selectedDetection, setSelectedDetection] = useState<any | null>(null);

  const handleTileClick = useCallback((cam: CameraDto) => {
    setSpotlightCamera(cam);
  }, []);

  // 1. Tải danh sách Camera từ Database Spring Boot
  const loadCamerasFromDb = useCallback(async () => {
    try {
      setIsLoadingCameras(true);
      setError(null);

      const res = await fetch(`${apiBaseUrl}/api/cameras`);
      if (!res.ok) {
        throw new Error(`Mã lỗi HTTP ${res.status}: Không thể kết nối Backend Server ${apiBaseUrl}`);
      }

      const json = await res.json();
      if (json && json.data && Array.isArray(json.data)) {
        const cams: CameraDto[] = json.data;
        setCameras(cams);

        // TỐI ƯU HIỆU NĂNG (Triệt tiêu 100% N+1 requests):
        // CameraDto từ Backend đã nạp sẵn mảng activeAiModules, đọc trực tiếp 0ms không gọi thêm N request
        const map: Record<number, string[]> = {};
        cams.forEach((c) => {
          map[c.id] = Array.isArray(c.activeAiModules) ? c.activeAiModules : [];
        });
        setCameraAiModulesMap(map);
      } else {
        setCameras([]);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối cơ sở dữ liệu');
      setCameras([]);
    } finally {
      setIsLoadingCameras(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    loadCamerasFromDb();
  }, [loadCamerasFromDb]);

  // 2. Debounce tìm kiếm 300ms chuẩn Search Flow
  useEffect(() => {
    if (!searchInput.trim()) {
      setDebouncedSearch('');
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 3. Tải danh sách địa điểm và đếm số lượng
  const { distinctAreas, areaCounts } = useMemo(() => {
    const set = new Set<string>();
    const counts: Record<string, number> = {};
    cameras.forEach((c) => {
      if (c.location && c.location.trim()) {
        const loc = c.location.trim();
        set.add(loc);
        counts[loc] = (counts[loc] || 0) + 1;
      }
    });
    return { distinctAreas: Array.from(set), areaCounts: counts };
  }, [cameras]);

  // 4. Lọc danh sách Camera theo Địa điểm, Từ khóa và Phân hệ
  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      const matchArea = selectedArea === 'ALL' || cam.location === selectedArea;
      const matchSearch =
        !debouncedSearch ||
        cam.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        cam.ipAddress.includes(debouncedSearch) ||
        (cam.location && cam.location.toLowerCase().includes(debouncedSearch.toLowerCase()));

      const mods = cameraAiModulesMap[cam.id] || [];
      const matchAi = moduleMode === 'ALL' || effectiveAiType === 'ALL'
        ? true
        : (moduleMode === 'FACE' ? (mods.includes('FACE_RECOGNITION') || cameras.length <= 4) : true);

      return matchArea && matchSearch && matchAi;
    });
  }, [cameras, selectedArea, debouncedSearch, cameraAiModulesMap, moduleMode, effectiveAiType]);

  // Phân trang Viewport thông minh (Smart Viewport Pagination)
  const pageSize = gridCols * gridRows;
  const totalPages = Math.max(1, Math.ceil(filteredCameras.length / pageSize));

  // Tự động reset trang khi bộ lọc thay đổi
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedArea, debouncedSearch, effectiveAiType, moduleMode]);

  // Đảm bảo không bị trang vượt quá giới hạn khi đổi kích thước lưới
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const gridSlots = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredCameras.slice(startIndex, startIndex + pageSize);
  }, [filteredCameras, currentPage, pageSize]);

  // 5. Tải cấu hình vùng ảo ROI tĩnh của các camera từ AI Service
  useEffect(() => {
    let isCancelled = false;

    const fetchRoiConfig = async () => {
      try {
        const res = await fetch(`${effectiveAiApiBaseUrl}/api/roi-config`);
        if (res.ok) {
          const json = await res.json();
          if (!isCancelled && json && json.data) {
            const camerasRoi = json.data.cameras || {};
            const map: Record<number, [number, number][]> = {};
            Object.keys(camerasRoi).forEach((cidStr) => {
              const cid = Number(cidStr);
              if (Array.isArray(camerasRoi[cidStr])) {
                map[cid] = camerasRoi[cidStr];
              }
            });
            setCameraRoiMap(map);
          }
        }
      } catch (e) {
        // ignore
      }
    };

    fetchRoiConfig();
    return () => {
      isCancelled = true;
    };
  }, [effectiveAiApiBaseUrl]);

  // 6. Tải sự kiện nhận diện mới nhất & lắng nghe WebSocket thời gian thực (Bỏ polling 20s)
  const fetchDetections = useCallback(async () => {
    try {
      const eventType = moduleMode === 'FACE' ? 'FACE_RECOGNITION' : 'VEHICLE_ANPR';
      const res = await fetch(`${apiBaseUrl}/api/v1/events?eventType=${eventType}&size=30`);
      if (res.ok) {
        const json = await res.json();
        const items = json?.data?.content || [];
        setRealDetections(items.map((ev: any) => ({
          id: ev.id,
          plateNumber: ev.payload?.plateNumber || ev.payload?.personName || 'Xe mới',
          vehicleType: ev.payload?.employeeId ? `NV: ${ev.payload.employeeId}` : (ev.severity === 'WARNING' ? 'CẢNH BÁO' : (ev.payload?.vehicleType || 'HỢP LỆ')),
          confidence: ev.confidence ? Math.round(ev.confidence * 100) : 95,
          snapshotUrl: resolveImageUrl(ev.snapshotUrl, apiBaseUrl),
          plateCropUrl: resolveImageUrl(ev.payload?.plateCropUrl || ev.snapshotUrl, apiBaseUrl),
          detectedAt: ev.createdAt || ev.detectedAt,
          gateName: ev.cameraName || `Camera #${ev.cameraId}`,
          status: ev.severity === 'WARNING' ? 'CẢNH BÁO' : 'HỢP LỆ',
          cameraId: ev.cameraId
        })));
      }
    } catch {
      // ignore
    }
  }, [apiBaseUrl, moduleMode]);

  const wsUrl = useMemo(() => {
    return apiBaseUrl ? apiBaseUrl.replace(/^http/, 'ws') + '/ws-camera' : undefined;
  }, [apiBaseUrl]);
  const { registerEventListener } = useEventStream({ wsUrl });

  useEffect(() => {
    fetchDetections();

    // Lắng nghe WebSocket thời gian thực từ Spring Boot Universal Event Hub
    const unsubs = [
      registerEventListener('VEHICLE_ANPR', (ev) => {
        const newDet = {
          id: ev.id,
          plateNumber: ev.payload?.plateNumber || 'Xe mới',
          vehicleType: (ev.payload?.vehicleType || 'CAR') as any,
          confidence: ev.confidence ? Math.round(ev.confidence * 100) : 95,
          snapshotUrl: resolveImageUrl(ev.snapshotUrl, apiBaseUrl),
          plateCropUrl: resolveImageUrl(ev.payload?.plateCropUrl || ev.snapshotUrl, apiBaseUrl),
          detectedAt: ev.createdAt || new Date().toISOString(),
          gateName: ev.cameraName || `Camera #${ev.cameraId}`,
          status: ev.severity === 'WARNING' ? 'CẢNH BÁO' : 'HỢP LỆ',
          cameraId: ev.cameraId
        };
        setRealDetections((prev) => [newDet, ...prev.slice(0, 49)]);
      }),
      registerEventListener('FACE_RECOGNITION', (ev) => {
        const newDet = {
          id: ev.id,
          plateNumber: ev.payload?.personName || 'Người lạ',
          vehicleType: ev.payload?.employeeId ? `NV: ${ev.payload.employeeId}` : (ev.severity === 'WARNING' ? 'NGƯỜI LẠ' : 'KHÁCH'),
          confidence: ev.confidence ? Math.round(ev.confidence * 100) : 95,
          snapshotUrl: resolveImageUrl(ev.snapshotUrl, apiBaseUrl),
          plateCropUrl: resolveImageUrl(ev.payload?.plateCropUrl || ev.snapshotUrl, apiBaseUrl),
          detectedAt: ev.createdAt || new Date().toISOString(),
          gateName: ev.cameraName || `Camera #${ev.cameraId}`,
          status: ev.severity === 'WARNING' ? 'CẢNH BÁO' : 'HỢP LỆ',
          cameraId: ev.cameraId
        };
        setRealDetections((prev) => [newDet, ...prev.slice(0, 49)]);
      })
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [fetchDetections, apiBaseUrl, registerEventListener]);

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#F8FAFC'
    }}>
      {/* Thông báo lỗi nếu có */}
      {error && (
        <div style={{
          padding: '10px 20px',
          backgroundColor: '#FEF2F2',
          borderBottom: '1px solid #FECACA',
          color: '#DC2626',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Lỗi kết nối Cơ Sở Dữ Liệu: {error}</span>
          <button onClick={loadCamerasFromDb} style={{ padding: '3px 8px', backgroundColor: '#DC2626', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Thử lại
          </button>
        </div>
      )}

      {/* Toolbar */}
      <CameraWallToolbar
        areas={distinctAreas}
        selectedArea={selectedArea}
        onAreaChange={setSelectedArea}
        totalCamerasCount={cameras.length}
        areaCounts={areaCounts}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        isSearching={isSearching}
        gridCols={gridCols}
        gridRows={gridRows}
        onApplyGrid={(cols, rows) => {
          setGridCols(cols);
          setGridRows(rows);
        }}
        onRefresh={loadCamerasFromDb}
        isLoading={isLoadingCameras}
      />

      {/* Main Grid View */}
      <main style={{ flex: 1, padding: '14px', overflowY: 'auto' }}>
        {isLoadingCameras ? (
          <VideoWallSkeleton cols={gridCols} rows={gridRows} />
        ) : filteredCameras.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            backgroundColor: '#181F2B',
            borderRadius: '8px',
            border: '1px dashed #334155',
            color: '#94A3B8'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <IconCctv size={52} color="#475569" />
            </div>
            <h3 style={{ color: '#F1F5F9', marginBottom: '6px' }}>
              {debouncedSearch
                ? `Không tìm thấy camera nào phù hợp với "${debouncedSearch}"`
                : 'Chưa Có Camera Nào Trong Cơ Sở Dữ Liệu'}
            </h3>
            <p style={{ fontSize: '13px', maxWidth: '500px', margin: '0 auto 20px auto' }}>
              {debouncedSearch
                ? 'Hãy thử kiểm tra lại lỗi chính tả hoặc tìm theo địa chỉ IP / địa điểm khác.'
                : 'Vui lòng thêm camera hoặc vào phân hệ Quản Lý Thiết Bị để nhập camera vào Database.'}
            </p>
            {debouncedSearch && (
              <button
                onClick={() => setSearchInput('')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  backgroundColor: '#0284C7',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <IconClose size={13} color="#FFF" />
                <span>Xóa bộ lọc tìm kiếm</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            gap: '12px',
            backgroundColor: '#FFFFFF',
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            {gridSlots.map((cam, idx) => (
              <CameraTile
                key={cam.id}
                camera={cam}
                onClick={handleTileClick}
                searchQuery={debouncedSearch}
                isLcpCandidate={idx === 0}
                moduleMode={moduleMode}
                aiApiBaseUrl={effectiveAiApiBaseUrl}
              />
            ))}
          </div>
        )}

        {/* Thanh Điều Hướng Phân Trang Viewport (Smart Pagination) */}
        {!isLoadingCameras && filteredCameras.length > 0 && (
          <div style={{
            marginTop: '12px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ fontSize: '12.5px', color: '#64748B' }}>
              Hiển thị camera{' '}
              <strong style={{ color: '#0F172A' }}>
                {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredCameras.length)}
              </strong>{' '}
              trên tổng <strong style={{ color: '#0284C7' }}>{filteredCameras.length}</strong> camera
              {selectedArea !== 'ALL' && <span> (Khu vực: <strong>{selectedArea}</strong>)</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: currentPage === 1 ? '#F8FAFC' : '#FFFFFF',
                  color: currentPage === 1 ? '#94A3B8' : '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                ◀ Trang trước
              </button>

              <span style={{ fontSize: '12px', color: '#334155', fontWeight: 600, padding: '0 4px' }}>
                Trang <strong style={{ color: '#0284C7' }}>{currentPage}</strong> / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: currentPage === totalPages ? '#F8FAFC' : '#FFFFFF',
                  color: currentPage === totalPages ? '#94A3B8' : '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Trang sau ▶
              </button>

              {/* Danh sách các số trang khi số lượng vừa phải */}
              {totalPages > 1 && totalPages <= 8 && (
                <div style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCurrentPage(num)}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '5px',
                        border: '1px solid',
                        borderColor: currentPage === num ? '#0284C7' : '#E2E8F0',
                        backgroundColor: currentPage === num ? '#0284C7' : '#F8FAFC',
                        color: currentPage === num ? '#FFFFFF' : '#475569',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Code-split Modals */}
      <Suspense fallback={null}>
        {spotlightCamera && (
          <SpotlightDrawer
            camera={spotlightCamera}
            onClose={() => setSpotlightCamera(null)}
            apiBaseUrl={apiBaseUrl}
            aiApiBaseUrl={effectiveAiApiBaseUrl}
            moduleMode={moduleMode}
            detections={realDetections}
            initialRoi={cameraRoiMap[spotlightCamera.id]}
            onConfigureRoi={(cam) => setRoiCamera(cam)}
            onSelectDetection={(det) => setSelectedDetection(det)}
          />
        )}

        {roiCamera && (
          <RoiConfigModal
            isOpen={Boolean(roiCamera)}
            onClose={() => setRoiCamera(null)}
            camera={roiCamera as any}
            initialRoi={cameraRoiMap[roiCamera.id]}
            aiApiBaseUrl={effectiveAiApiBaseUrl}
            onSaveSuccess={(savedRoi) => {
              setCameraRoiMap((prev) => ({
                ...prev,
                [roiCamera.id]: savedRoi
              }));
            }}
          />
        )}

        {selectedDetection && (
          <SnapshotModal
            isOpen={Boolean(selectedDetection)}
            onClose={() => setSelectedDetection(null)}
            imageUrl={selectedDetection.snapshotUrl}
            cropUrl={selectedDetection.plateCropUrl}
            title={selectedDetection.plateNumber || selectedDetection.personName || 'Chi tiết nhận diện'}
            subtitle={selectedDetection.gateName || `Camera #${selectedDetection.cameraId}`}
            metadata={[
              { label: 'Loại phương tiện / Đối tượng', value: selectedDetection.vehicleType || 'Không xác định' },
              { label: 'Độ tin cậy', value: `${selectedDetection.confidence ? Math.round(selectedDetection.confidence) : 95}%` },
              { label: 'Thời gian', value: selectedDetection.detectedAt ? new Date(selectedDetection.detectedAt).toLocaleString('vi-VN') : 'Vừa xong' },
              { label: 'Trạng thái', value: selectedDetection.status || 'HỢP LỆ' }
            ]}
          />
        )}
      </Suspense>
    </div>
  );
};

export default VideoWallView;
