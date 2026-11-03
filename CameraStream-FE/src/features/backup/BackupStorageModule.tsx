import { useState, useEffect, type FC } from 'react';
import {
  IconShield,
  IconRefresh,
  IconDownload,
  IconClose,
  IconPlus,
  IconCalendar,
  IconTrash
} from '../../components/SurveillanceIcons';
import { downloadBinaryStreamInChunks } from '../../shared/utils/excelExporter';

export interface BackupStorageModuleProps {
  apiBaseUrl: string;
}

interface BackupJobItem {
  id: number;
  backupId: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalSize?: number;
  fileName?: string;
  checksumSha256?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  createdBy?: string;
  errorMessage?: string;
  notes?: string;
  createdAt?: string;
}

interface BackupConfig {
  id?: number;
  cronExpression: string;
  intervalMinutes?: number;
  maxRetainBackups: number;
  retentionDays: number;
  enabled: boolean;
  storagePath: string;
  autoCleanup: boolean;
}

export const BackupStorageModule: FC<BackupStorageModuleProps> = ({ apiBaseUrl }) => {
  const [backups, setBackups] = useState<BackupJobItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [config, setConfig] = useState<BackupConfig>({
    cronExpression: '0 0 2 * * *',
    intervalMinutes: 1440,
    maxRetainBackups: 10,
    retentionDays: 7,
    enabled: true,
    storagePath: 'D:/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/data/backup',
    autoCleanup: true
  });
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [restoreModalJob, setRestoreModalJob] = useState<BackupJobItem | null>(null);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDownloadBackup = async (backupId: string) => {
    if (downloadingId) return;
    setDownloadingId(backupId);
    setDownloadProgress('0%');
    try {
      await downloadBinaryStreamInChunks(
        `${apiBaseUrl}/api/v1/backups/download/${backupId}`,
        `backup_${backupId}.sql.gz`,
        (loaded, total) => {
          if (total > 0) {
            setDownloadProgress(`${Math.min(100, Math.round((loaded / total) * 100))}%`);
          }
        }
      );
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Lỗi khi tải tệp sao lưu' });
    } finally {
      setDownloadingId(null);
      setDownloadProgress('');
    }
  };

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/backups`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        if (Array.isArray(data)) {
          setBackups(data);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách sao lưu:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/backups/config`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setConfig(json.data);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải cấu hình sao lưu:', err);
    }
  };

  useEffect(() => {
    fetchBackups();
    fetchConfig();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchBackups();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [apiBaseUrl]);

  const handleTriggerBackup = async () => {
    setIsCreating(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/backups`, { method: 'POST' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Đã kích hoạt tiến trình sao lưu hệ thống thành công!' });
        fetchBackups();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.message || 'Không thể tạo bản sao lưu' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi kết nối khi sao lưu' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/backups/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setShowConfigModal(false);
        setMessage({ type: 'success', text: 'Cập nhật cấu hình sao lưu tự động thành công!' });
        fetchConfig();
      } else {
        const err = await res.json();
        alert(err.message || 'Lỗi lưu cấu hình');
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi kết nối');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreModalJob) return;
    setRestoring(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/backups/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: restoreModalJob.backupId })
      });
      if (res.ok) {
        alert('Yêu cầu phục hồi CSDL đã được gửi và xử lý thành công!');
        setRestoreModalJob(null);
        fetchBackups();
      } else {
        const err = await res.json();
        alert(err.message || 'Lỗi phục hồi bản sao lưu');
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi kết nối');
    } finally {
      setRestoring(false);
    }
  };

  // E8 (KỊCH BẢN §4 Block B3): Hủy tiến trình sao lưu PENDING/RUNNING.
  // Backend đặt cờ CANCELLED; worker dừng ở bước tiếp theo, không ghi COMPLETED.
  const handleCancelBackup = async (backupId: string) => {
    if (!window.confirm(`Bạn có chắc muốn hủy tiến trình sao lưu "${backupId}"?`)) return;
    setCancellingId(backupId);
    setMessage(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/backups/${backupId}/cancel`, { method: 'POST' });
      if (res.ok) {
        setMessage({ type: 'success', text: `Đã gửi lệnh hủy tiến trình sao lưu "${backupId}".` });
        fetchBackups();
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || 'Không thể hủy tiến trình sao lưu' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi kết nối khi hủy sao lưu' });
    } finally {
      setCancellingId(null);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bản sao lưu "${backupId}" không? Thao tác này sẽ xóa vĩnh viễn dữ liệu.`)) {
      return;
    }
    setDeletingId(backupId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/backups/${backupId}/delete`, {
        method: 'POST'
      });
      if (res.ok) {
        setMessage({ type: 'success', text: `Đã xóa bản sao lưu "${backupId}" thành công!` });
        fetchBackups();
      } else {
        const fallbackRes = await fetch(`${apiBaseUrl}/api/v1/backups/${backupId}`, {
          method: 'DELETE'
        });
        if (fallbackRes.ok) {
          setMessage({ type: 'success', text: `Đã xóa bản sao lưu "${backupId}" thành công!` });
          fetchBackups();
        } else {
          const err = await fallbackRes.json().catch(() => ({}));
          alert(err.message || 'Lỗi khi xóa bản sao lưu');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi kết nối khi xóa bản sao lưu');
    } finally {
      setDeletingId(null);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#059669'
          }}>
            <IconShield size={26} color="#059669" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Hệ Thống Sao Lưu & Lưu Trữ Dữ Liệu
              </h2>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: config.enabled ? '#DCFCE7' : '#F1F5F9',
                color: config.enabled ? '#15803D' : '#64748B',
                border: `1px solid ${config.enabled ? '#86EFAC' : '#CBD5E1'}`
              }}>
                {config.enabled ? '● TỰ ĐỘNG BẬT' : '○ TẮT TỰ ĐỘNG'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
              Cơ chế Atomic Write Pattern, SHA-256 Checksum Verification & Tự Động Phục Hồi Sau Sập Nguồn
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowConfigModal(true)}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <IconCalendar size={15} color="#475569" />
            <span>Cấu Hình Tự Động</span>
          </button>

          <button
            onClick={fetchBackups}
            disabled={loading}
            style={{
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
            title="Làm mới"
          >
            <IconRefresh size={16} color="#475569" />
          </button>

          <button
            onClick={handleTriggerBackup}
            disabled={isCreating}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: isCreating ? '#94A3B8' : '#0284C7',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isCreating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)'
            }}
          >
            <IconPlus size={16} color="#FFFFFF" />
            <span>{isCreating ? 'Đang Sao Lưu...' : 'Sao Lưu Ngay'}</span>
          </button>
        </div>
      </div>

      {/* Thông báo Alert */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '16px',
          backgroundColor: message.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${message.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
          color: message.type === 'success' ? '#166534' : '#991B1B',
          fontSize: '13px',
          fontWeight: 600
        }}>
          {message.text}
        </div>
      )}

      {/* Bảng danh sách bản sao lưu */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#FAFAFA'
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>
            Lịch Sử Các Bản Sao Lưu ({backups.length})
          </span>
          <span style={{ fontSize: '12px', color: '#64748B' }}>
            Đường dẫn lưu trữ: <code>{config.storagePath}</code>
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '12px 18px', fontWeight: 600 }}>MÃ SAO LƯU</th>
              <th style={{ padding: '12px 18px', fontWeight: 600 }}>LOẠI</th>
              <th style={{ padding: '12px 18px', fontWeight: 600 }}>TRẠNG THÁI</th>
              <th style={{ padding: '12px 18px', fontWeight: 600 }}>DUNG LƯỢNG</th>
              <th style={{ padding: '12px 18px', fontWeight: 600 }}>THỜI GIAN TẠO</th>
              <th style={{ padding: '12px 18px', fontWeight: 600 }}>GHI CHÚ</th>
              <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8' }}>
                  {loading ? 'Đang tải dữ liệu sao lưu...' : 'Chưa có bản sao lưu nào trong hệ thống.'}
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.backupId || b.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
                    {b.backupId}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: b.type === 'FULL' ? '#EFF6FF' : '#F5F3FF',
                      color: b.type === 'FULL' ? '#1D4ED8' : '#7C3AED'
                    }}>
                      {b.type === 'FULL' ? 'THỦ CÔNG' : 'ĐỊNH KỲ'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '6px',
                      backgroundColor:
                        b.status === 'COMPLETED' ? '#DCFCE7' :
                        b.status === 'RUNNING' ? '#DBEAFE' :
                        b.status === 'CANCELLED' ? '#E2E8F0' :
                        b.status === 'FAILED' ? '#FEE2E2' : '#FEF3C7',
                      color:
                        b.status === 'COMPLETED' ? '#15803D' :
                        b.status === 'RUNNING' ? '#1E40AF' :
                        b.status === 'CANCELLED' ? '#475569' :
                        b.status === 'FAILED' ? '#991B1B' : '#92400E'
                    }}>
                      {b.status === 'COMPLETED' ? 'HOÀN TẤT' :
                       b.status === 'RUNNING' ? 'ĐANG CHẠY' :
                       b.status === 'CANCELLED' ? 'ĐÃ HỦY' :
                       b.status === 'FAILED' ? 'THẤT BẠI' : 'CHỜ XỬ LÝ'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', color: '#334155', fontWeight: 500 }}>
                    {formatBytes(b.totalSize)}
                  </td>
                  <td style={{ padding: '14px 18px', color: '#64748B' }}>
                    {b.completedAt ? new Date(b.completedAt).toLocaleString('vi-VN') :
                     b.createdAt ? new Date(b.createdAt).toLocaleString('vi-VN') : '--'}
                  </td>
                  <td style={{ padding: '14px 18px', color: '#475569', maxWidth: '280px' }} title={b.errorMessage || b.notes || ''}>
                    {b.status === 'FAILED' ? (
                      <span style={{
                        color: '#DC2626',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '260px'
                      }}>
                        ⚠️ {b.errorMessage || 'Lỗi tiến trình sao lưu'}
                      </span>
                    ) : (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '260px' }}>
                        {b.notes || '--'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {b.status === 'COMPLETED' && (
                        <>
                          <button
                            onClick={() => setRestoreModalJob(b)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFFFFF',
                              color: '#0284C7',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Phục hồi
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadBackup(b.backupId)}
                            disabled={downloadingId === b.backupId}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#F1F5F9',
                              color: '#334155',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: downloadingId === b.backupId ? 'wait' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <IconDownload size={13} color="#475569" />
                            <span>
                              {downloadingId === b.backupId
                                ? `Tải ${downloadProgress}`
                                : 'Tải'}
                            </span>
                          </button>
                        </>
                      )}

                      {/* E8/B3: Nút HỦY cho tiến trình PENDING / RUNNING */}
                      {(b.status === 'PENDING' || b.status === 'RUNNING') && (
                        <button
                          onClick={() => handleCancelBackup(b.backupId)}
                          disabled={cancellingId === b.backupId}
                          title="Hủy tiến trình sao lưu này"
                          style={{
                            padding: '5px 10px',
                            borderRadius: '6px',
                            border: '1px solid #FCD34D',
                            backgroundColor: '#FFFBEB',
                            color: '#B45309',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: cancellingId === b.backupId ? 'not-allowed' : 'pointer',
                            opacity: cancellingId === b.backupId ? 0.6 : 1
                          }}
                        >
                          <IconClose size={13} color="#B45309" />
                          <span>{cancellingId === b.backupId ? 'Đang hủy...' : 'Huỷ'}</span>
                        </button>
                      )}

                      {/* Nút Xóa bản sao lưu (hỗ trợ xóa khi THẤT BẠI, HOÀN TẤT,...) */}
                      {b.status !== 'RUNNING' && (
                        <button
                          onClick={() => handleDeleteBackup(b.backupId)}
                          disabled={deletingId === b.backupId}
                          title="Xóa bản sao lưu này"
                          style={{
                            padding: '5px 10px',
                            borderRadius: '6px',
                            border: '1px solid #FECACA',
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: deletingId === b.backupId ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: deletingId === b.backupId ? 0.6 : 1
                          }}
                        >
                          <IconTrash size={13} color="#DC2626" />
                          <span>{deletingId === b.backupId ? 'Đang xóa...' : 'Xóa'}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Cấu Hình Tự Động (Chuẩn theo HPTICKET BackupSettingsForm) */}
      {showConfigModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            width: '540px',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                Cấu Hình Sao Lưu CSDL Tự Động
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
              >
                <IconClose size={20} color="#64748B" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="enabledCheck"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="enabledCheck" style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', cursor: 'pointer' }}>
                  Kích hoạt lịch sao lưu tự động định kỳ
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Khung giờ sao lưu (Chu kỳ)
                </label>
                <select
                  value={
                    config.cronExpression === '0 0 2 * * *' ? '0 0 2 * * *' :
                    config.intervalMinutes === 15 ? '15m' :
                    config.intervalMinutes === 30 ? '30m' :
                    config.intervalMinutes === 60 ? '1h' :
                    config.intervalMinutes === 120 ? '2h' :
                    config.intervalMinutes === 360 ? '6h' :
                    config.intervalMinutes === 720 ? '12h' : 'custom'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '0 0 2 * * *') {
                      setConfig({ ...config, cronExpression: '0 0 2 * * *', intervalMinutes: 1440 });
                    } else if (val === '15m') {
                      setConfig({ ...config, cronExpression: '0 */15 * * * *', intervalMinutes: 15 });
                    } else if (val === '30m') {
                      setConfig({ ...config, cronExpression: '0 */30 * * * *', intervalMinutes: 30 });
                    } else if (val === '1h') {
                      setConfig({ ...config, cronExpression: '0 0 * * * *', intervalMinutes: 60 });
                    } else if (val === '2h') {
                      setConfig({ ...config, cronExpression: '0 0 */2 * * *', intervalMinutes: 120 });
                    } else if (val === '6h') {
                      setConfig({ ...config, cronExpression: '0 0 */6 * * *', intervalMinutes: 360 });
                    } else if (val === '12h') {
                      setConfig({ ...config, cronExpression: '0 0 */12 * * *', intervalMinutes: 720 });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px'
                  }}
                >
                  <option value="0 0 2 * * *">02:00 sáng hàng ngày (Khuyến nghị chuẩn HPTicket)</option>
                  <option value="15m">Mỗi 15 phút (Kiểm thử realtime)</option>
                  <option value="30m">Mỗi 30 phút</option>
                  <option value="1h">Mỗi 1 giờ</option>
                  <option value="2h">Mỗi 2 giờ</option>
                  <option value="6h">Mỗi 6 giờ</option>
                  <option value="12h">Mỗi 12 giờ</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Sao lưu tối đa (file)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={config.maxRetainBackups}
                    onChange={(e) => setConfig({ ...config, maxRetainBackups: parseInt(e.target.value) || 10 })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Lưu trữ tối đa (ngày)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={config.retentionDays}
                    onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) || 7 })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Thư mục lưu trữ trên máy chủ
                </label>
                <input
                  type="text"
                  value={config.storagePath}
                  onChange={(e) => setConfig({ ...config, storagePath: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '10px',
                paddingTop: '16px',
                borderTop: '1px solid #E2E8F0'
              }}>
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: savingConfig ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingConfig ? 'Đang lưu...' : 'Lưu Cấu Hình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Phục Hồi Bản Sao Lưu */}
      {restoreModalJob && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            width: '480px',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            overflow: 'hidden',
            border: '1px solid #E2E8F0',
            padding: '24px'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '17px', fontWeight: 800, color: '#DC2626' }}>
              Xác Nhận Phục Hồi Dữ Liệu?
            </h3>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: '0 0 16px 0' }}>
              Bạn đang yêu cầu nạp lại toàn bộ CSDL từ bản sao lưu:
              <br />
              <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>{restoreModalJob.backupId}</strong>
              <br /><br />
              Hệ thống sẽ ghi đè dữ liệu hiện tại bằng dữ liệu của bản sao lưu này.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setRestoreModalJob(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={restoring}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: restoring ? 'not-allowed' : 'pointer'
                }}
              >
                {restoring ? 'Đang phục hồi...' : 'Đồng Ý Phục Hồi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupStorageModule;
