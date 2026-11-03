import { useState, useEffect, useCallback, lazy, Suspense, type FC } from 'react';
import type { CameraDto, AiFilterType } from './types';
import CameraTable from './components/CameraTable';
import {
  IconCctv,
  IconPlus,
  IconUpload,
  IconFileSpreadsheet,
  IconRefresh
} from '../../components/SurveillanceIcons';

// Code-split modals with React.lazy to eliminate Initial Render Delay / LCP bottleneck
const CameraAddEditModal = lazy(() => import('./components/CameraAddEditModal'));
const ImportExcelModal = lazy(() => import('./components/ImportExcelModal'));
const CameraAiConfigModal = lazy(() => import('../../components/CameraAiConfigModal'));
const CameraLiveModal = lazy(() => import('./components/CameraLiveModal'));

import { getBackendBaseUrl } from '../../shared/utils/envConfig';
import { toast } from '../../shared/utils/toast';
import { useAuth } from '../../core/auth/AuthContext';

export interface DeviceManagerModuleProps {
  apiBaseUrl?: string;
}

export const DeviceManagerModule: FC<DeviceManagerModuleProps> = ({
  apiBaseUrl = getBackendBaseUrl()
}) => {
  const { can } = useAuth();
  const [cameras, setCameras] = useState<CameraDto[]>([]);
  const [cameraAiModulesMap, setCameraAiModulesMap] = useState<Record<number, string[]>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [aiFilter, setAiFilter] = useState<AiFilterType>('ALL');

  // Modal states
  const [editingCamera, setEditingCamera] = useState<Partial<CameraDto> | null>(null);
  const [showAddEditModal, setShowAddEditModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [aiConfigCamera, setAiConfigCamera] = useState<CameraDto | null>(null);
  const [livePreviewCamera, setLivePreviewCamera] = useState<CameraDto | null>(null);

  // 1. Tải danh sách Camera từ Database Spring Boot
  const loadCamerasFromDb = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`${apiBaseUrl}/api/cameras`);
      if (!res.ok) {
        throw new Error(`Mã lỗi HTTP ${res.status}: Không thể kết nối Backend Server ${apiBaseUrl}`);
      }

      const json = await res.json();
      if (json && json.data && Array.isArray(json.data)) {
        const cams: CameraDto[] = json.data;
        setCameras(cams);

        // Khởi tạo map module AI ngay lập tức từ CameraDto (nếu backend đã trả về)
        const initialMap: Record<number, string[]> = {};
        cams.forEach((c: any) => {
          if (Array.isArray(c.activeAiModules)) {
            initialMap[c.id] = c.activeAiModules;
          }
        });
        if (Object.keys(initialMap).length > 0) {
          setCameraAiModulesMap(initialMap);
        }

        // Đồng bộ chính xác từ API ai-config (tôn trọng 100% trạng thái BẬT/TẮT từ CSDL)
        Promise.all(
          cams.map((c: any) =>
            fetch(`${apiBaseUrl}/api/cameras/${c.id}/ai-config`)
              .then((r) => r.json())
              .then((resAi) => {
                const activeMods = resAi?.data
                  ? resAi.data.filter((item: any) => item.enabled).map((item: any) => item.aiType)
                  : (c.activeAiModules || []);
                return {
                  cameraId: c.id,
                  activeModules: activeMods
                };
              })
              .catch(() => ({
                cameraId: c.id,
                activeModules: c.activeAiModules || []
              }))
          )
        ).then((results) => {
          const map: Record<number, string[]> = {};
          results.forEach((r) => {
            map[r.cameraId] = r.activeModules;
          });
          setCameraAiModulesMap(map);
        });
      } else {
        setCameras([]);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối cơ sở dữ liệu');
      setCameras([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    loadCamerasFromDb();
  }, [loadCamerasFromDb]);

  // 2. Thêm mới hoặc Cập nhật Camera (POST / PUT)
  const handleSaveCamera = async (cameraData: Partial<CameraDto>) => {
    if (cameraData.id) {
      // Cập nhật (PUT /api/cameras/{id})
      const res = await fetch(`${apiBaseUrl}/api/cameras/${cameraData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cameraData.name,
          ipAddress: cameraData.ipAddress,
          location: cameraData.location ?? '',
          onvifPort: cameraData.onvifPort || 80,
          rtspPort: cameraData.rtspPort || 554,
          username: cameraData.username || '',
          password: cameraData.password || '',
          type: cameraData.type || 'IN_GATE',
          rtspSourceUrl: cameraData.rtspSourceUrl || ''
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.code && json.code !== 200)) {
        const detail = json?.devMessage ? ` (${json.devMessage})` : '';
        throw new Error((json?.message || `HTTP ${res.status}`) + detail);
      }
      toast.success(`Đã cập nhật camera "${cameraData.name}" thành công!`);
    } else {
      // Thêm mới (POST /api/cameras)
      const res = await fetch(`${apiBaseUrl}/api/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cameraData.name || 'Camera Mới',
          ipAddress: cameraData.ipAddress || '192.168.1.100',
          location: cameraData.location || 'Khu vực chưa phân loại',
          onvifPort: cameraData.onvifPort || 80,
          rtspPort: cameraData.rtspPort || 554,
          username: cameraData.username || '',
          password: cameraData.password || '',
          type: cameraData.type || 'IN_GATE',
          rtspSourceUrl: cameraData.rtspSourceUrl || ''
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.code && json.code !== 200)) {
        const detail = json?.devMessage ? ` (${json.devMessage})` : '';
        throw new Error((json?.message || `HTTP ${res.status}`) + detail);
      }
      toast.success(`Đã thêm mới camera "${cameraData.name || 'Camera Mới'}" thành công!`);
    }

    await loadCamerasFromDb();
  };

  // 3. Xóa Camera (DELETE /api/cameras/{id})
  const handleDeleteCamera = async (camId: number) => {
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA camera ID #${camId} khỏi Cơ Sở Dữ Liệu?`)) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/cameras/${camId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCameras((prev) => prev.filter((c) => c.id !== camId));
      alert(`Đã xóa thành công camera ID #${camId} khỏi Database.`);
    } catch (err: any) {
      alert(`Lỗi xóa camera khỏi Database: ` + err.message);
    }
  };

  // 4. Tải file CSV mẫu chuẩn hóa theo đúng cấu trúc Backend
  const downloadTemplate = () => {
    const headers = [
      'Tên Camera (*)',
      'Địa Chỉ IP (*)',
      'Cổng RTSP',
      'Cổng ONVIF',
      'Địa Điểm / Khu Vực',
      'Tài Khoản',
      'Mật Khẩu',
      'Phân Loại Luồng (Type)',
      'Luồng RTSP Nguồn (Tùy chọn)'
    ];
    const sample = [
      [
        'Camera Cổng Vào 01',
        '192.168.1.101',
        '554',
        '80',
        'Cổng Chính - Làn Xe Vào',
        'admin',
        'Admin@123',
        'IN_GATE',
        'rtsp://admin:Admin@123@192.168.1.101:554/Streaming/Channels/101'
      ],
      [
        'Camera Cổng Ra 02',
        '192.168.1.102',
        '554',
        '80',
        'Cổng Phụ - Làn Xe Ra',
        'admin',
        'Admin@123',
        'OUT_GATE',
        ''
      ],
      [
        'Camera Toàn Cảnh Sân Bãi',
        '192.168.1.103',
        '554',
        '80',
        'Bãi Đỗ Xe Trung Tâm',
        'admin',
        'Admin@123',
        'OVERVIEW',
        ''
      ]
    ];
    const csvContent = '\uFEFF' + [headers.join(','), ...sample.map((r) => r.map((c) => `"${c}"`).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau_danh_sach_camera_db.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      padding: '20px 24px',
      backgroundColor: '#F8FAFC',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* Thông báo lỗi DB nếu có */}
      {error && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          color: '#DC2626',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Lỗi kết nối Cơ Sở Dữ Liệu: {error}</span>
          <button
            onClick={loadCamerasFromDb}
            style={{ padding: '4px 10px', backgroundColor: '#DC2626', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Main Container Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* 1. Header Toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '14px',
          borderBottom: '1px solid #F1F5F9'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IconCctv size={19} color="#0284C7" />
                <span>Danh Sách Thiết Bị Camera</span>
              </h2>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#0284C7',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BAE6FD',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {cameras.length} camera trong DB
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
              Quản lý thông số RTSP, luồng phụ Sub-stream và gán Module AI chuyên dụng cho từng camera
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {can('DEVICE_MANAGE') && (
              <button
                onClick={() => {
                  setEditingCamera({
                    name: '',
                    ipAddress: '192.168.1.',
                    location: '',
                    rtspPort: 554
                  });
                  setShowAddEditModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  backgroundColor: '#0284C7',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(2, 132, 199, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <IconPlus size={14} color="#FFF" />
                <span>Thêm Camera Mới</span>
              </button>
            )}

            {can('DEVICE_MANAGE') && (
              <button
                onClick={() => setShowImportModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  backgroundColor: '#FFFFFF',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <IconUpload size={14} color="#475569" />
                <span>Nhập Excel</span>
              </button>
            )}

            <button
              onClick={downloadTemplate}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                color: '#64748B',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Tải file mẫu Excel"
            >
              <IconFileSpreadsheet size={14} color="#64748B" />
              <span>File Mẫu</span>
            </button>

            <button
              onClick={loadCamerasFromDb}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#0284C7',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
              title="Tải lại danh sách camera từ Database"
            >
              <IconRefresh size={14} color="#0284C7" style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
              <span>{isLoading ? 'Đang tải...' : 'Làm mới DB'}</span>
            </button>
          </div>
        </div>

        {/* 2. Camera Data Table Component */}
        <CameraTable
          cameras={cameras}
          isLoading={isLoading}
          aiFilter={aiFilter}
          onFilterChange={setAiFilter}
          cameraAiModulesMap={cameraAiModulesMap}
          onEditCamera={(cam) => {
            setEditingCamera(cam);
            setShowAddEditModal(true);
          }}
          onDeleteCamera={handleDeleteCamera}
          onAssignAi={(cam) => setAiConfigCamera(cam)}
          onLiveView={(cam) => setLivePreviewCamera(cam)}
        />
      </div>

      {/* Code-split Modals */}
      <Suspense fallback={null}>
        {showAddEditModal && editingCamera && (
          <CameraAddEditModal
            isOpen={showAddEditModal}
            camera={editingCamera}
            onClose={() => {
              setShowAddEditModal(false);
              setEditingCamera(null);
            }}
            onSave={handleSaveCamera}
            apiBaseUrl={apiBaseUrl}
          />
        )}

        {showImportModal && (
          <ImportExcelModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            apiBaseUrl={apiBaseUrl}
            onImportSuccess={loadCamerasFromDb}
          />
        )}

        {aiConfigCamera && (
          <CameraAiConfigModal
            apiBaseUrl={apiBaseUrl}
            camera={aiConfigCamera}
            onClose={() => setAiConfigCamera(null)}
            onSaved={loadCamerasFromDb}
          />
        )}

        {livePreviewCamera && (
          <CameraLiveModal
            camera={livePreviewCamera}
            onClose={() => setLivePreviewCamera(null)}
          />
        )}
      </Suspense>
    </div>
  );
};

export default DeviceManagerModule;
