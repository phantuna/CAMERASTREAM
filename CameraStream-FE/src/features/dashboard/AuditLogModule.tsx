import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { statisticsApi, type AuditLogItem, type PageResponse } from '../../shared/api/statisticsApi';
import { ExportExcelButton, type ExportProgressCallback } from '../../shared/components/ExportExcelButton';
import { exportChunkedPagesToExcel } from '../../shared/utils/excelExporter';
import { getBackendBaseUrl } from '../../shared/utils/envConfig';

// ── Bộ Icon SVG chuẩn kích thước cố định (không phụ thuộc Tailwind/lucide-react) ──
type IconProps = { size?: number; color?: string; style?: React.CSSProperties };

const SvgIcon: React.FC<IconProps & { children: React.ReactNode }> = ({
  size = 15,
  color = 'currentColor',
  style,
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    {children}
  </svg>
);

const IconFileText: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></SvgIcon>
);
const IconRefresh: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></SvgIcon>
);
const IconSearch: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></SvgIcon>
);
const IconCheckCircle: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></SvgIcon>
);
const IconXCircle: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></SvgIcon>
);
const IconShield: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></SvgIcon>
);
const IconChevronLeft: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><polyline points="15 18 9 12 15 6" /></SvgIcon>
);
const IconChevronRight: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><polyline points="9 18 15 12 9 6" /></SvgIcon>
);
const IconEye: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></SvgIcon>
);
const IconX: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></SvgIcon>
);
const IconUser: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></SvgIcon>
);
const IconGlobe: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></SvgIcon>
);
const IconClock: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></SvgIcon>
);
const IconTag: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></SvgIcon>
);
const IconArrowRight: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></SvgIcon>
);
const IconCopy: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></SvgIcon>
);
const IconCheck: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><polyline points="20 6 9 17 4 12" /></SvgIcon>
);
const IconCode: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></SvgIcon>
);
const IconChevronDown: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><polyline points="6 9 12 15 18 9" /></SvgIcon>
);
const IconChevronUp: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><polyline points="18 15 12 9 6 15" /></SvgIcon>
);
const IconActivity: React.FC<IconProps> = (p) => (
  <SvgIcon {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></SvgIcon>
);

// ── Bảng ánh xạ đối tượng & trường dữ liệu chuẩn HPticket ──────────────────
const ENTITY_NAMES: Record<string, string> = {
  Camera: 'Camera giám sát',
  camera: 'Camera giám sát',
  cameras: 'Camera giám sát',
  CameraAiConfig: 'Cấu hình AI Camera',
  Gate: 'Làn Cổng Gate',
  gate: 'Làn Cổng Gate',
  User: 'Tài khoản đăng nhập',
  user: 'Tài khoản đăng nhập',
  users: 'Tài khoản đăng nhập',
  Role: 'Khai báo nhóm quyền',
  role: 'Khai báo nhóm quyền',
  roles: 'Khai báo nhóm quyền',
  Permission: 'Quyền hạn hệ thống',
  BackupJob: 'Sao lưu & Phục hồi CSDL',
  BackupSetting: 'Cấu hình Sao lưu tự động',
  Auth: 'Hệ thống xác thực',
  ALPR_DETECTION: 'Báo cáo Lịch sử Biển số',
  VEHICLE_ACCESS_LOG: 'Báo cáo Lượt xe Ra/Vào',
  ALERT: 'Cảnh báo an ninh',
  EXPORT: 'Báo cáo & Thống kê',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Tên hiển thị',
  code: 'Mã định danh',
  username: 'Tên đăng nhập',
  fullName: 'Họ và tên',
  email: 'Email',
  phone: 'Số điện thoại',
  role: 'Vai trò',
  permissions: 'Danh sách quyền hạn',
  active: 'Trạng thái hoạt động',
  description: 'Mô tả',
  ipAddress: 'Địa chỉ IP',
  rtspPort: 'Cổng RTSP',
  onvifPort: 'Cổng ONVIF',
  type: 'Phân loại cổng',
  location: 'Vị trí / Làn cổng',
  streamPath: 'Luồng Stream (Path)',
  aiType: 'Mô-đun AI',
  enabled: 'Trạng thái bật AI',
  inferenceFps: 'Tốc độ xử lý (FPS)',
  confidenceThreshold: 'Ngưỡng tin cậy AI',
  roiCoordinates: 'Vùng nhận diện (ROI)',
  password: 'Mật khẩu',
  backupIntervalDays: 'Chu kỳ sao lưu (ngày)',
  backupIntervalMinutes: 'Chu kỳ sao lưu (phút)',
  maxFiles: 'Số bản lưu tối đa',
  backupPath: 'Thư mục lưu trữ',
  from: 'Từ ngày',
  to: 'Đến ngày',
  search: 'Từ khóa lọc',
  totalRows: 'Số dòng dữ liệu',
};

const getEntityLabel = (entity?: string | null): string => {
  if (!entity) return 'Hệ thống';
  return ENTITY_NAMES[entity] || entity;
};

const formatDiffValue = (val: any): string => {
  if (val === null || val === undefined || val === '') return 'trống';
  if (typeof val === 'boolean') return val ? 'Hoạt động' : 'Tạm ngưng';
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : 'trống';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

interface ParsedReason {
  note: string;
  oldData: Record<string, any> | null;
  newData: Record<string, any> | null;
  changes: Record<string, { old: any; new: any }> | null;
}

const parseAuditReason = (rawReason?: string | null): ParsedReason => {
  if (!rawReason || !rawReason.trim()) {
    return { note: '', oldData: null, newData: null, changes: null };
  }
  const trimmed = rawReason.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const oldData = parsed.oldData && typeof parsed.oldData === 'object' ? parsed.oldData : null;
      const newData = parsed.newData && typeof parsed.newData === 'object' ? parsed.newData : null;
      let changes = parsed.changes && typeof parsed.changes === 'object' ? parsed.changes : null;

      if (!changes && oldData && newData) {
        const computed: Record<string, { old: any; new: any }> = {};
        const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
        for (const k of keys) {
          if (JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) {
            computed[k] = { old: oldData[k], new: newData[k] };
          }
        }
        if (Object.keys(computed).length > 0) changes = computed;
      }

      return {
        note: parsed.note || '',
        oldData,
        newData,
        changes,
      };
    } catch {
      // Fallback plain string
    }
  }

  if (trimmed.includes('export') && trimmed.includes('from=')) {
    const meta: Record<string, any> = {};
    const parts = trimmed.split(/\s+/);
    parts.forEach((p) => {
      if (p.includes('=')) {
        const [k, v] = p.split('=');
        if (k && v && v !== 'null') meta[k] = v;
      }
    });
    return {
      note: 'Xuất tệp báo cáo thống kê Excel',
      oldData: null,
      newData: Object.keys(meta).length > 0 ? meta : null,
      changes: null,
    };
  }

  return { note: trimmed, oldData: null, newData: null, changes: null };
};

const getActionBadgeInfo = (actionType: string) => {
  const act = (actionType || '').toUpperCase();
  switch (act) {
    case 'CREATE':
      return { label: 'Tạo mới', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' };
    case 'UPDATE':
      return { label: 'Cập nhật', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
    case 'STATUS':
      return { label: 'Đổi trạng thái', bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' };
    case 'DELETE':
      return { label: 'Xóa dữ liệu', bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' };
    case 'LOGIN':
      return { label: 'Đăng nhập', bg: '#EEF2FF', color: '#4338CA', border: '#C7D2FE' };
    case 'LOGOUT':
      return { label: 'Đăng xuất', bg: '#F1F5F9', color: '#334155', border: '#CBD5E1' };
    case 'BACKUP':
      return { label: 'Sao lưu CSDL', bg: '#ECFEFF', color: '#0E7490', border: '#A5F3FC' };
    case 'RESTORE':
      return { label: 'Khôi phục CSDL', bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' };
    case 'EXPORT':
      return { label: 'Xuất báo cáo', bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' };
    case 'ACK':
      return { label: 'Xác nhận cảnh báo', bg: '#FAF5FF', color: '#7E22CE', border: '#E9D5FF' };
    default:
      return { label: act || 'Thao tác', bg: '#F8FAFC', color: '#334155', border: '#E2E8F0' };
  }
};

const getActionVerb = (actionType: string): string => {
  switch ((actionType || '').toUpperCase()) {
    case 'CREATE':
      return 'tạo mới';
    case 'UPDATE':
      return 'cập nhật';
    case 'STATUS':
      return 'đổi trạng thái';
    case 'DELETE':
      return 'xóa';
    case 'LOGIN':
      return 'đăng nhập vào';
    case 'LOGOUT':
      return 'đăng xuất khỏi';
    case 'BACKUP':
      return 'kích hoạt sao lưu';
    case 'RESTORE':
      return 'khôi phục';
    case 'EXPORT':
      return 'xuất tệp từ';
    case 'ACK':
      return 'xác nhận xử lý';
    default:
      return 'thao tác trên';
  }
};

const formatDateParts = (iso?: string | null): { date: string; time: string; full: string } => {
  if (!iso) return { date: '--/--/----', time: '--:--:--', full: '--' };
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: iso, time: '', full: iso };
    const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { date, time, full: `${time} - ${date}` };
  } catch {
    return { date: iso, time: '', full: iso };
  }
};

// ── Modal Xem Chi Tiết Nhật Ký (Chuẩn LogSnapshotModal từ HPticket) ────────
interface LogDetailModalProps {
  log: AuditLogItem | null;
  onClose: () => void;
}

const LogSnapshotModal: React.FC<LogDetailModalProps> = ({ log, onClose }) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const parsed = parseAuditReason(log.reason);
  const badge = getActionBadgeInfo(log.actionType);
  const entityLabel = getEntityLabel(log.targetEntity);
  const timeInfo = formatDateParts(log.createdAt);

  const changeEntries = parsed.changes ? Object.entries(parsed.changes) : [];
  const detailSource = parsed.newData || parsed.oldData || null;
  const detailEntries = detailSource ? Object.entries(detailSource) : [];

  const rawPayload = {
    id: log.id,
    actorUsername: log.actorUsername,
    actorRole: log.actorRole,
    sourceIp: log.source,
    actionType: log.actionType,
    targetEntity: log.targetEntity,
    targetId: log.targetId,
    targetDisplay: log.targetDisplay,
    success: log.success,
    errorMessage: log.errorMessage,
    createdAt: log.createdAt,
    details: parsed,
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(rawPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.2)',
          border: '1px solid #E2E8F0',
          width: '100%',
          maxWidth: '760px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                }}
              >
                {badge.label}
              </span>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: '#ECFDF5',
                  color: '#047857',
                  border: '1px solid #A7F3D0',
                }}
              >
                {entityLabel}
              </span>
              {log.success ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: '#ECFDF5',
                    color: '#047857',
                    border: '1px solid #A7F3D0',
                  }}
                >
                  <IconCheckCircle size={13} color="#047857" /> Thành công
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 10px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: '#FFF1F2',
                    color: '#BE123C',
                    border: '1px solid #FECDD3',
                  }}
                >
                  <IconXCircle size={13} color="#BE123C" /> Thất bại
                </span>
              )}
            </div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
              {parsed.note || `${badge.label} ${entityLabel}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '8px',
              background: 'none',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
            }}
          >
            <IconX size={18} color="#64748B" />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* 4 Thẻ thông tin tóm tắt */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                <IconUser size={13} color="#059669" /> Người thực hiện
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                @{log.actorUsername || 'SYSTEM'}
              </div>
              {log.actorRole && (
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{log.actorRole}</div>
              )}
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                <IconGlobe size={13} color="#0284C7" /> Nguồn / Địa chỉ IP
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
                {log.source || 'SYSTEM'}
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                <IconClock size={13} color="#D97706" /> Thời điểm ghi nhận
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{timeInfo.full}</div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                <IconTag size={13} color="#7C3AED" /> Đối tượng tác động
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#047857', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.targetDisplay || ''}>
                {log.targetDisplay || (log.targetId ? `#${log.targetId}` : entityLabel)}
              </div>
            </div>
          </div>

          {/* Hộp thông báo lỗi nếu thất bại */}
          {!log.success && log.errorMessage && (
            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#FFF1F2', border: '1px solid #FECDD3', color: '#9F1239', fontSize: '12.5px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <IconXCircle size={16} color="#E11D48" style={{ marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: '2px' }}>Chi tiết lỗi ghi nhận:</div>
                <div>{log.errorMessage}</div>
              </div>
            </div>
          )}

          {/* Bảng 1: Bảng so sánh Trước khi sửa vs Sau khi sửa */}
          {changeEntries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconActivity size={14} color="#0284C7" />
                Bảng so sánh thay đổi dữ liệu ({changeEntries.length} trường)
              </h4>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>
                      <th style={{ padding: '10px 14px', width: '32%' }}>Trường thông tin</th>
                      <th style={{ padding: '10px 14px', width: '34%' }}>Trước khi sửa</th>
                      <th style={{ padding: '10px 14px', width: '34%' }}>Sau khi sửa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeEntries.map(([field, diff]) => (
                      <tr key={field} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>
                          {FIELD_LABELS[field] || field}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#E11D48', textDecoration: 'line-through', backgroundColor: '#FFF1F2', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {formatDiffValue(diff?.old)}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#047857', fontWeight: 700, backgroundColor: '#ECFDF5', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {formatDiffValue(diff?.new)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : detailEntries.length > 0 ? (
            /* Bảng 2: Chi tiết dữ liệu thiết lập (khi Tạo mới / Xóa / Xuất báo cáo) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>
                Chi tiết dữ liệu ghi nhận
              </h4>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>
                      <th style={{ padding: '10px 14px', width: '38%' }}>Thuộc tính</th>
                      <th style={{ padding: '10px 14px', width: '62%' }}>Giá trị thiết lập</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailEntries.map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>
                          {FIELD_LABELS[k] || k}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#0F172A', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {formatDiffValue(v)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#475569' }}>
              <strong style={{ color: '#0F172A' }}>Ghi chú thao tác: </strong>
              {parsed.note || 'Thao tác được ghi nhận tự động bởi hệ thống.'}
            </div>
          )}

          {/* Dữ liệu kỹ thuật JSON gốc (Collapsible) */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => setShowRawJson((v) => !v)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#475569',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <IconCode size={14} color="#475569" />
                <span>Dữ liệu kỹ thuật (Raw JSON)</span>
                {showRawJson ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              </button>
              <button
                type="button"
                onClick={handleCopyJson}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                {copied ? (
                  <>
                    <IconCheck size={12} color="#059669" /> Đã sao chép
                  </>
                ) : (
                  <>
                    <IconCopy size={12} color="#475569" /> Sao chép JSON
                  </>
                )}
              </button>
            </div>
            {showRawJson && (
              <pre style={{ margin: 0, padding: '14px', backgroundColor: '#0F172A', color: '#F1F5F9', fontSize: '11.5px', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '220px' }}>
                {JSON.stringify(rawPayload, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              backgroundColor: '#1E293B',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Component Chính: AuditLogModule ────────────────────────────────────────
export const AuditLogModule: React.FC<{ apiBaseUrl?: string }> = () => {
  const [data, setData] = useState<PageResponse<AuditLogItem> | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const [actionType, setActionType] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actorFilter, setActorFilter] = useState<string>('');
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [toDate, setToDate] = useState<string>(todayStr);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pageRes, statsRes] = await Promise.all([
        statisticsApi.getAuditLogs({
          actionType: actionType === 'ALL' ? undefined : actionType,
          actorUsername: actorFilter.trim() || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          page,
          size: pageSize,
        }),
        statisticsApi.getAuditStats(),
      ]);
      setData(pageRes);
      setStats(statsRes || {});
    } catch (e) {
      console.error('Failed to load audit logs', e);
    } finally {
      setLoading(false);
    }
  }, [actionType, actorFilter, fromDate, toDate, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rawItems = data?.content || [];
  const items = useMemo(() => {
    if (statusFilter === 'SUCCESS') return rawItems.filter((i) => i.success !== false);
    if (statusFilter === 'FAILED') return rawItems.filter((i) => i.success === false);
    return rawItems;
  }, [rawItems, statusFilter]);

  const totalPages = data?.totalPages || 0;
  const totalElements = data?.totalElements || 0;

  const totalByStats = Object.values(stats).reduce((a, b) => a + b, 0);
  const crudCount =
    (stats.CREATE || 0) +
    (stats.UPDATE || 0) +
    (stats.DELETE || 0) +
    (stats.STATUS || 0) +
    (stats.BACKUP || 0) +
    (stats.RESTORE || 0);
  const exportAndAuthCount =
    (stats.EXPORT || 0) + (stats.LOGIN || 0) + (stats.LOGOUT || 0) + (stats.ACK || 0);
  const failCount = rawItems.filter((i) => i.success === false).length;

  // Render câu mô tả tiếng Việt tự nhiên + thẻ diff trực tiếp trên dòng (chuẩn HPticket)
  const renderNaturalDescription = (log: AuditLogItem) => {
    const actor = log.actorUsername && log.actorUsername !== 'SYSTEM' ? `@${log.actorUsername}` : 'Hệ thống';
    const verb = getActionVerb(log.actionType);
    const entityLabel = getEntityLabel(log.targetEntity);
    const parsed = parseAuditReason(log.reason);
    const diffEntries = parsed.changes ? Object.entries(parsed.changes) : [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.5 }}>
          <strong style={{ color: '#0F172A' }}>{actor}</strong> đã {verb}{' '}
          <strong style={{ color: '#1E293B' }}>{entityLabel.toLowerCase()}</strong>
          {log.targetDisplay && (
            <span
              style={{
                marginLeft: '6px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: '#F1F5F9',
                color: '#1E293B',
                fontWeight: 600,
                fontSize: '11.5px',
              }}
            >
              [{log.targetDisplay}]
            </span>
          )}
          {parsed.note && !parsed.changes && (
            <span style={{ color: '#64748B' }}> — {parsed.note}</span>
          )}
        </div>

        {diffEntries.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
            {diffEntries.slice(0, 3).map(([field, val]) => (
              <span
                key={field}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '11px',
                }}
              >
                <span style={{ fontWeight: 600, color: '#475569' }}>{FIELD_LABELS[field] || field}:</span>
                <span style={{ color: '#E11D48', textDecoration: 'line-through', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatDiffValue(val?.old)}
                </span>
                <IconArrowRight size={11} color="#94A3B8" />
                <span style={{ color: '#047857', fontWeight: 700, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatDiffValue(val?.new)}
                </span>
              </span>
            ))}
            {diffEntries.length > 3 && (
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284C7' }}>
                +{diffEntries.length - 3} trường khác
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleExportAuditExcel = async (onProgress: ExportProgressCallback) => {
    const apiBaseUrl = getBackendBaseUrl();
    await exportChunkedPagesToExcel<AuditLogItem>({
      apiBaseUrl,
      endpoint: '/api/v1/audit-logs',
      params: {
        actionType: actionType === 'ALL' ? undefined : actionType,
        actorUsername: actorFilter.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      },
      chunkSize: 500,
      fileName: `Nhat_Ky_He_Thong_${new Date().toISOString().slice(0, 10)}.xls`,
      reportTitle: 'BÁO CÁO NHẬT KÝ THAO TÁC HỆ THỐNG (AUDIT LOG)',
      subtitle: `Bộ lọc thao tác: ${actionType} | Trạng thái: ${statusFilter}`,
      filterItem: (row) => {
        if (statusFilter === 'SUCCESS') return row.success !== false;
        if (statusFilter === 'FAILED') return row.success === false;
        return true;
      },
      onProgress,
      columns: [
        { header: 'STT', width: 45, render: (_, i) => i + 1 },
        { header: 'Mã Log', key: 'id', width: 70 },
        {
          header: 'Thời gian',
          width: 145,
          render: (r) => formatDateParts(r.createdAt).full,
        },
        {
          header: 'Người thực hiện',
          width: 120,
          render: (r) => `@${r.actorUsername || 'SYSTEM'}`,
        },
        {
          header: 'Nguồn / IP',
          width: 115,
          render: (r) => r.source || r.actorRole || 'SYSTEM',
        },
        {
          header: 'Loại thao tác',
          width: 120,
          render: (r) => getActionBadgeInfo(r.actionType).label,
        },
        {
          header: 'Phân hệ',
          width: 150,
          render: (r) => getEntityLabel(r.targetEntity),
        },
        {
          header: 'Đối tượng tác động',
          width: 160,
          render: (r) => r.targetDisplay || (r.targetId ? `#${r.targetId}` : ''),
        },
        {
          header: 'Trạng thái',
          width: 95,
          render: (r) => (r.success !== false ? 'Thành công' : 'Thất bại'),
        },
        {
          header: 'Chi tiết thao tác',
          width: 240,
          render: (r) => {
            const parsed = parseAuditReason(r.reason);
            return parsed.note || r.reason || '';
          },
        },
      ],
    });
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        backgroundColor: '#F8FAFC',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
            Nhật Ký Thao Tác Hệ Thống
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>
            Theo dõi toàn diện lịch sử đăng nhập, thêm/sửa/xóa thiết bị camera, phân quyền, sao lưu CSDL và xuất báo cáo
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ExportExcelButton onExport={handleExportAuditExcel} buttonText="Xuất Excel" />
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#334155',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            <IconRefresh size={14} color="#0284C7" />
            <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #BFDBFE', backgroundColor: '#EFF6FF' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#1D4ED8', letterSpacing: '0.04em' }}>
              Tổng Hành Động
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconShield size={15} color="#2563EB" />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{totalByStats}</div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>Toàn bộ sự kiện ghi nhận</div>
        </div>

        <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #A7F3D0', backgroundColor: '#ECFDF5' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#047857', letterSpacing: '0.04em' }}>
              Thay Đổi Cấu Hình & Dữ Liệu
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconActivity size={15} color="#059669" />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{crudCount}</div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>Tạo mới, cập nhật, xóa, sao lưu</div>
        </div>

        <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #FDE68A', backgroundColor: '#FFFBEB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#B45309', letterSpacing: '0.04em' }}>
              Phiên & Xuất Báo Cáo
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconCheckCircle size={15} color="#D97706" />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{exportAndAuthCount}</div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>Đăng nhập, xuất Excel, ACK</div>
        </div>

        <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #FECDD3', backgroundColor: '#FFF1F2' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#BE123C', letterSpacing: '0.04em' }}>
              Thao Tác Thất Bại
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#FFE4E6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconXCircle size={15} color="#E11D48" />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{failCount}</div>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>Cảnh báo lỗi trên trang hiện tại</div>
        </div>
      </div>

      {/* Bộ lọc chuẩn HPticket */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '14px 16px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: '12px',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '4px' }}>
            Từ ngày
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(0);
            }}
            style={{
              padding: '6.5px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              fontWeight: 500,
              color: '#0F172A',
              backgroundColor: '#FFFFFF',
              outline: 'none',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '4px' }}>
            Đến ngày
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(0);
            }}
            style={{
              padding: '6.5px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              fontWeight: 500,
              color: '#0F172A',
              backgroundColor: '#FFFFFF',
              outline: 'none',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '4px' }}>
            Loại thao tác
          </label>
          <select
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
              setPage(0);
            }}
            style={{
              padding: '6.5px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#0F172A',
              backgroundColor: '#FFFFFF',
              outline: 'none',
            }}
          >
            <option value="ALL">Tất cả thao tác</option>
            <option value="CREATE">Tạo mới (CREATE)</option>
            <option value="UPDATE">Cập nhật (UPDATE)</option>
            <option value="STATUS">Đổi trạng thái (STATUS)</option>
            <option value="DELETE">Xóa dữ liệu (DELETE)</option>
            <option value="LOGIN">Đăng nhập (LOGIN)</option>
            <option value="LOGOUT">Đăng xuất (LOGOUT)</option>
            <option value="BACKUP">Sao lưu CSDL (BACKUP)</option>
            <option value="RESTORE">Khôi phục CSDL (RESTORE)</option>
            <option value="EXPORT">Xuất báo cáo (EXPORT)</option>
            <option value="ACK">Xác nhận cảnh báo (ACK)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '4px' }}>
            Trạng thái
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6.5px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#0F172A',
              backgroundColor: '#FFFFFF',
              outline: 'none',
            }}
          >
            <option value="ALL">Tất cả kết quả</option>
            <option value="SUCCESS">Thành công</option>
            <option value="FAILED">Thất bại</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '210px' }}>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '4px' }}>
            Người thực hiện
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '10px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
              <IconSearch size={14} color="#94A3B8" />
            </span>
            <input
              type="text"
              placeholder="Tìm theo tài khoản (VD: admin)..."
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(0);
                  fetchData();
                }
              }}
              style={{
                width: '100%',
                padding: '6.5px 12px 6.5px 30px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '12.5px',
                fontWeight: 500,
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <button
          onClick={() => {
            setPage(0);
            fetchData();
          }}
          style={{
            padding: '7.5px 18px',
            borderRadius: '8px',
            backgroundColor: '#059669',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Tìm kiếm
        </button>
      </div>

      {/* Bảng dữ liệu chuẩn HPticket */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '56px 20px', textAlign: 'center', fontSize: '13px', color: '#64748B' }}>
              Đang tải nhật ký hệ thống...
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: '56px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', gap: '8px' }}>
              <IconFileText size={32} color="#CBD5E1" />
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>
                Chưa có bản ghi nhật ký phù hợp với bộ lọc
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', width: '125px', whiteSpace: 'nowrap' }}>Thời gian</th>
                  <th style={{ padding: '12px 12px', width: '130px', whiteSpace: 'nowrap' }}>Thao tác</th>
                  <th style={{ padding: '12px 12px', width: '190px' }}>Đối tượng</th>
                  <th style={{ padding: '12px 12px', minWidth: '260px' }}>Mô tả chi tiết & Thay đổi</th>
                  <th style={{ padding: '12px 12px', width: '120px', whiteSpace: 'nowrap' }}>Trạng thái</th>
                  <th style={{ padding: '12px 12px', width: '150px', whiteSpace: 'nowrap' }}>Người thực hiện / IP</th>
                  <th style={{ padding: '12px 16px', width: '90px', textAlign: 'right', whiteSpace: 'nowrap' }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => {
                  const t = formatDateParts(row.createdAt);
                  const badge = getActionBadgeInfo(row.actionType);
                  const entityLabel = getEntityLabel(row.targetEntity);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedLog(row)}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                        cursor: 'pointer',
                      }}
                    >
                      {/* Thời gian 2 dòng */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{t.date}</div>
                        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748B', marginTop: '2px' }}>{t.time}</div>
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Đối tượng */}
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{entityLabel}</div>
                        {row.targetDisplay && (
                          <div
                            style={{
                              fontSize: '11.5px',
                              color: '#047857',
                              fontWeight: 600,
                              maxWidth: '185px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: '2px',
                            }}
                            title={row.targetDisplay}
                          >
                            {row.targetDisplay}
                          </div>
                        )}
                      </td>

                      {/* Mô tả chi tiết + Diff */}
                      <td style={{ padding: '12px 12px' }}>{renderNaturalDescription(row)}</td>

                      {/* Trạng thái */}
                      <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                        {row.success ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 10px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: '#ECFDF5',
                              color: '#047857',
                              border: '1px solid #A7F3D0',
                            }}
                          >
                            <IconCheckCircle size={12} color="#047857" /> Thành công
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 10px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: '#FFF1F2',
                              color: '#BE123C',
                              border: '1px solid #FECDD3',
                            }}
                            title={row.errorMessage || ''}
                          >
                            <IconXCircle size={12} color="#BE123C" /> Thất bại
                          </span>
                        )}
                      </td>

                      {/* Người thực hiện / IP */}
                      <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          @{row.actorUsername || 'SYSTEM'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                          {row.source || row.actorRole || 'SYSTEM'}
                        </div>
                      </td>

                      {/* Nút Xem */}
                      <td
                        style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedLog(row)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '5px 10px',
                            borderRadius: '7px',
                            backgroundColor: '#ECFDF5',
                            color: '#047857',
                            border: '1px solid #A7F3D0',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <IconEye size={13} color="#047857" />
                          <span>Xem</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Phân trang */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '12px',
            color: '#64748B',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>
              Tổng <strong style={{ color: '#0F172A' }}>{totalElements}</strong> bản ghi — Trang{' '}
              <strong style={{ color: '#0F172A' }}>{page + 1}</strong> / {Math.max(totalPages, 1)}
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                backgroundColor: '#FFFFFF',
                color: '#334155',
              }}
            >
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                opacity: page === 0 ? 0.45 : 1,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <IconChevronLeft size={14} color="#334155" />
            </button>
            <button
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              disabled={page + 1 >= totalPages}
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                cursor: page + 1 >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page + 1 >= totalPages ? 0.45 : 1,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <IconChevronRight size={14} color="#334155" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal chi tiết Snapshot */}
      <LogSnapshotModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
};

export default AuditLogModule;
