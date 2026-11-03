import { useState, useEffect, useCallback, type FC } from 'react';
import {
  IconAlertTriangle,
  IconRefresh,
  IconEye
} from '../../components/SurveillanceIcons';
import { resolveImageUrl } from '../../shared/utils/imageUrl';
import { useEventStream } from '../../core/websocket/useEventStream';
import PaginationBar from '../../shared/components/PaginationBar';
import SnapshotModal from '../../shared/components/SnapshotModal';

export interface AlertCenterModuleProps {
  apiBaseUrl: string;
}

interface AlertItem {
  id: number;
  eventType: string;
  moduleSource: string;
  cameraId: number;
  cameraName: string;
  snapshotUrl?: string;
  confidence?: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  payload?: any;
  acknowledged: boolean;
  createdAt?: string;
}

export const AlertCenterModule: FC<AlertCenterModuleProps> = ({ apiBaseUrl }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNACK' | 'ACK'>('UNACK');
  const [selectedSeverity, setSelectedSeverity] = useState<'ALL' | 'WARNING' | 'CRITICAL'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Phân trang Server-side
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);
  const [totalElements, setTotalElements] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Snapshot modal
  const [selectedSnapshot, setSelectedSnapshot] = useState<AlertItem | null>(null);
  const [ackingId, setAckingId] = useState<number | null>(null);

  // Tải danh sách cảnh báo từ backend
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(Math.max(0, currentPage - 1)),
        size: String(pageSize)
      });

      if (activeTab === 'UNACK') qs.set('acknowledged', 'false');
      if (activeTab === 'ACK') qs.set('acknowledged', 'true');
      if (selectedSeverity !== 'ALL') qs.set('severity', selectedSeverity);
      if (startDate) qs.set('fromDate', startDate);
      if (endDate) qs.set('toDate', endDate);

      const res = await fetch(`${apiBaseUrl}/api/v1/events/alerts?${qs.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const pageData = json?.data;
        if (pageData) {
          const items = pageData.content || [];
          const totalElements = pageData?.page?.totalElements ?? pageData?.totalElements ?? items.length;
          const totalPages = Math.max(1, pageData?.page?.totalPages ?? pageData?.totalPages ?? Math.ceil(totalElements / pageSize));

          setAlerts(items);
          setTotalElements(totalElements);
          setTotalPages(totalPages);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách cảnh báo:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, currentPage, pageSize, activeTab, selectedSeverity, startDate, endDate]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedSeverity, startDate, endDate]);

  // Lắng nghe sự kiện khẩn cấp thời gian thực qua WebSocket
  const wsUrl = apiBaseUrl ? apiBaseUrl.replace(/^http/, 'ws') + '/ws-camera' : undefined;
  const { registerEventListener } = useEventStream({ wsUrl });

  useEffect(() => {
    const handleNewAlert = (ev: any) => {
      if (ev.severity === 'WARNING' || ev.severity === 'CRITICAL') {
        setAlerts((prev) => [ev, ...prev.slice(0, pageSize - 1)]);
        setTotalElements((t) => t + 1);
      }
    };

    const unsubs = [
      registerEventListener('VEHICLE_ANPR', handleNewAlert),
      registerEventListener('FACE_RECOGNITION', handleNewAlert)
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [registerEventListener, pageSize]);

  // Xử lý xác nhận đã xử lý cảnh báo (Acknowledge) - Chuẩn HPTicket Idempotency-Key
  const handleAcknowledge = async (id: number) => {
    setAckingId(id);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ack-${id}-${Date.now()}`;

      const res = await fetch(`${apiBaseUrl}/api/v1/events/${id}/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        }
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((item) => (item.id === id ? { ...item, acknowledged: true } : item))
        );
        // Nếu đang ở tab Chưa xử lý, tải lại trang
        if (activeTab === 'UNACK') {
          fetchAlerts();
        }
      } else {
        alert('Không thể xác nhận cảnh báo. Vui lòng thử lại!');
      }
    } catch (err) {
      alert('Lỗi kết nối khi gửi xác nhận.');
    } finally {
      setAckingId(null);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
      {/* Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#DC2626'
          }}>
            <IconAlertTriangle size={24} color="#DC2626" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Trung Tâm Cảnh Báo An Ninh (Alert Center)
              </h2>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: '#FEE2E2',
                color: '#991B1B',
                border: '1px solid #FCA5A5'
              }}>
                SLA: 24 GIỜ
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
              Quản lý các sự kiện khẩn cấp, người lạ, phương tiện vi phạm và xác nhận xử lý theo ca trực
            </p>
          </div>
        </div>

        <button
          onClick={fetchAlerts}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <IconRefresh size={14} color="#64748B" />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Bộ Lọc Tabs & Tiêu Chí */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        padding: '12px 18px',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Status Tabs */}
        <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px', gap: '2px' }}>
          {[
            { id: 'UNACK', label: 'Chưa xử lý' },
            { id: 'ACK', label: 'Đã xác nhận' },
            { id: 'ALL', label: 'Tất cả' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#DC2626' : 'transparent',
                color: activeTab === tab.id ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Severity Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Mức độ:</span>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value as any)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              fontSize: '12px',
              color: '#0F172A',
              fontWeight: 600,
              outline: 'none'
            }}
          >
            <option value="ALL">Tất cả mức độ</option>
            <option value="CRITICAL">Nguy hiểm (CRITICAL)</option>
            <option value="WARNING">Cảnh báo (WARNING)</option>
          </select>
        </div>

        {/* Date Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Từ ngày:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              color: '#0F172A'
            }}
          />
          <span style={{ fontSize: '12px', color: '#64748B' }}>đến:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              color: '#0F172A'
            }}
          />
        </div>
      </div>

      {/* Bảng Danh Sách Cảnh Báo */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
            Đang tải dữ liệu cảnh báo an ninh...
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <IconAlertTriangle size={36} color="#94A3B8" />
            </div>
            <h4 style={{ margin: 0, fontSize: '15px', color: '#0F172A' }}>
              Không Có Cảnh Báo Nào Cần Xử Lý
            </h4>
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748B' }}>
              Tất cả các sự kiện an ninh đang ở trạng thái an toàn hoặc đã được xác nhận hoàn tất.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '12px' }}>
                <th style={{ padding: '14px 18px' }}>MÃ / THỜI GIAN</th>
                <th style={{ padding: '14px 18px' }}>MỨC ĐỘ</th>
                <th style={{ padding: '14px 18px' }}>PHÂN LOẠI & NỘI DUNG</th>
                <th style={{ padding: '14px 18px' }}>CAMERA NGUỒN</th>
                <th style={{ padding: '14px 18px' }}>ẢNH CHỤP</th>
                <th style={{ padding: '14px 18px' }}>TRẠNG THÁI</th>
                <th style={{ padding: '14px 18px', textAlign: 'right' }}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((al) => {
                const isCrit = al.severity === 'CRITICAL';
                const content = al.payload?.plateNumber
                  ? `Phương tiện: ${al.payload.plateNumber} (${al.payload.vehicleType || 'Xe'})`
                  : al.payload?.personName
                    ? `Nhận diện: ${al.payload.personName} (NV: ${al.payload.employeeId || 'Không rõ'})`
                    : al.eventType;

                return (
                  <tr key={al.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: !al.acknowledged && isCrit ? '#FEF2F2' : '#FFFFFF' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace' }}>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>#{al.id}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {al.createdAt ? new Date(al.createdAt).toLocaleString('vi-VN') : '--'}
                      </div>
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: isCrit ? '#FEE2E2' : '#FEF3C7',
                        color: isCrit ? '#991B1B' : '#92400E',
                        border: `1px solid ${isCrit ? '#FCA5A5' : '#FCD34D'}`
                      }}>
                        {isCrit ? 'NGUY HIỂM' : 'CẢNH BÁO'}
                      </span>
                    </td>

                    <td style={{ padding: '14px 18px', fontWeight: 600, color: '#0F172A' }}>
                      <div>{content}</div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 400 }}>{al.moduleSource || al.eventType}</div>
                    </td>

                    <td style={{ padding: '14px 18px', color: '#334155' }}>
                      {al.cameraName || `Camera #${al.cameraId}`}
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      {al.snapshotUrl ? (
                        <div
                          onClick={() => setSelectedSnapshot(al)}
                          style={{
                            width: '44px',
                            height: '32px',
                            borderRadius: '5px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: '1px solid #CBD5E1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#000'
                          }}
                          title="Xem ảnh phóng to"
                        >
                          <img
                            src={resolveImageUrl(al.snapshotUrl, apiBaseUrl)}
                            alt="Snapshot"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '11px' }}>Không có</span>
                      )}
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: al.acknowledged ? '#DCFCE7' : '#FEE2E2',
                        color: al.acknowledged ? '#15803D' : '#B91C1C',
                        border: `1px solid ${al.acknowledged ? '#86EFAC' : '#FCA5A5'}`
                      }}>
                        {al.acknowledged ? 'ĐÃ XÁC NHẬN' : 'CHỜ XỬ LÝ'}
                      </span>
                    </td>

                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        {al.snapshotUrl && (
                          <button
                            onClick={() => setSelectedSnapshot(al)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFFFFF',
                              color: '#475569',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Xem chi tiết ảnh"
                          >
                            <IconEye size={13} color="#475569" />
                          </button>
                        )}

                        {!al.acknowledged ? (
                          <button
                            onClick={() => handleAcknowledge(al.id)}
                            disabled={ackingId === al.id}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              border: 'none',
                              backgroundColor: '#DC2626',
                              color: '#FFFFFF',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: ackingId === al.id ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {ackingId === al.id ? 'Đang gửi...' : 'Xác nhận xử lý'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                            ✓ Đã xong
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Phân trang */}
      <PaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalElements}
        pageSize={pageSize}
        itemLabel="cảnh báo"
        activeColor="#DC2626"
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
      />

      {/* Modal xem ảnh phóng to */}
      {selectedSnapshot && (
        <SnapshotModal
          isOpen={Boolean(selectedSnapshot)}
          onClose={() => setSelectedSnapshot(null)}
          imageUrl={resolveImageUrl(selectedSnapshot.snapshotUrl, apiBaseUrl)}
          cropUrl={selectedSnapshot.payload?.plateCropUrl ? resolveImageUrl(selectedSnapshot.payload.plateCropUrl, apiBaseUrl) : undefined}
          title={`Chi Tiết Cảnh Báo #${selectedSnapshot.id}: ${selectedSnapshot.eventType}`}
          subtitle={`${selectedSnapshot.cameraName || `Camera #${selectedSnapshot.cameraId}`} • ${selectedSnapshot.createdAt ? new Date(selectedSnapshot.createdAt).toLocaleString('vi-VN') : ''}`}
          metadata={[
            { label: 'Mức độ', value: selectedSnapshot.severity },
            { label: 'Trạng thái', value: selectedSnapshot.acknowledged ? 'Đã xác nhận' : 'Chưa xử lý' },
            { label: 'Camera', value: selectedSnapshot.cameraName || `#${selectedSnapshot.cameraId}` }
          ]}
        />
      )}
    </div>
  );
};

export default AlertCenterModule;
