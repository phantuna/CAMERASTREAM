/**
 * Statistics & Reporting API Client – CameraStream-FE
 * Typed fetcher cho nhóm endpoint báo cáo / dashboard mới (Spring Boot EventHub):
 *  - /api/v1/events/dashboard           (KPI + series thời gian)
 *  - /api/v1/events/reports/traffic-summary  (JSON)
 *  - /api/v1/events/export/traffic-summary   (XLSX blob)
 *  - /api/v1/audit-logs  + /stats
 *
 * Convension: mọi response được bọc trong ApiResponse<T> = { code, message, data } —
 * unwrap .data khi code === 200 (giống AuthContext + AlprLogsModule).
 */

import { getBackendBaseUrl } from '../utils/envConfig';

// ============================ TYPES ============================

export interface DashboardStats {
  totalEvents: number;
  activeCameraCount: number;
  totalCameraCount?: number;
  inCount?: number;
  outCount?: number;
  totalGates: number;
  totalLanes: number;
  activeLanes: number;
  eventsByVehicleType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  hourlyEventCounts: { bucket: string; value: number }[];
  criticalRatePct: number;
  unacknowledgedAlertCount: number;
}

export interface DashboardQuery {
  granularity?: 'HOUR' | 'DAY';
  fromDate?: string; // yyyy-MM-dd
  toDate?: string;   // yyyy-MM-dd
}

export interface TrafficSummaryItem {
  plateNumber: string;
  vehicleType?: string;
  cameraId?: number;
  cameraName?: string;
  inCount: number;
  outCount: number;
  totalEvents: number;
  confidenceAvg: number | null;
  lastSeenAt?: string;
  lastLane?: string;
}

export interface TrafficSummaryResult {
  items: TrafficSummaryItem[];
  isTruncated: boolean;
  totalRows: number;
  page?: number;
  size?: number;
  totalPages?: number;
  totalPlates?: number;
  totalIns?: number;
  totalOuts?: number;
}

export interface TrafficSummaryQuery {
  fromDate?: string;
  toDate?: string;
  eventType?: string;
  cameraId?: number | null;
  plateKeyword?: string;
  actor?: string;
  page?: number;
  size?: number;
}

export interface AuditRow {
  id: number;
  actorUsername: string;
  actorRole?: string;
  source?: string;
  actionType: string;
  targetEntity?: string;
  targetId?: number;
  targetDisplay?: string;
  reason?: string;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
}

export type AuditLogItem = AuditRow;

export interface AuditLogQuery {
  actionType?: string;
  targetEntity?: string;
  actorUsername?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;   // 0-based (Spring Pageable)
  size?: number;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

// ============================ HELPERS ============================

function buildQueryString(params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) return '';
  const filtered: Record<string, string> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      filtered[k] = String(v);
    }
  });
  const qs = new URLSearchParams(filtered).toString();
  return qs ? `?${qs}` : '';
}

async function getJson<T>(
  apiBaseUrl: string,
  endpoint: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  signal?: AbortSignal
): Promise<T | null> {
  const token = localStorage.getItem('camerastream_token');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${apiBaseUrl}${endpoint}${buildQueryString(params)}`, {
    headers,
    credentials: 'same-origin',
    signal
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json && json.code === 200 && json.data) {
    return json.data as T;
  }
  return null;
}

// ============================ DASHBOARD ============================

export async function getDashboardStats(
  apiBaseUrl: string,
  query?: DashboardQuery,
  signal?: AbortSignal
): Promise<DashboardStats | null> {
  return getJson<DashboardStats>(
    apiBaseUrl,
    '/api/v1/events/dashboard',
    {
      granularity: query?.granularity,
      fromDate: query?.fromDate,
      toDate: query?.toDate
    },
    signal
  );
}

// ============================ TRAFFIC SUMMARY ============================

export async function getTrafficSummary(
  apiBaseUrl: string,
  query?: TrafficSummaryQuery,
  signal?: AbortSignal
): Promise<TrafficSummaryResult | null> {
  return getJson<TrafficSummaryResult>(
    apiBaseUrl,
    '/api/v1/events/reports/traffic-summary',
    {
      fromDate: query?.fromDate,
      toDate: query?.toDate,
      eventType: query?.eventType,
      cameraId: query?.cameraId,
      plateKeyword: query?.plateKeyword,
      page: query?.page,
      size: query?.size
    },
    signal
  );
}

/**
 * Tải file XLSX từ backend + trigger browser download.
 * Trả về { fileName, truncated } (lấy từ header X-Is-Truncated + Content-Disposition).
 */
export async function downloadTrafficSummaryXlsx(
  apiBaseUrl: string,
  query?: TrafficSummaryQuery
): Promise<{ fileName: string; truncated: boolean; totalRows: number }> {
  const qs = buildQueryString({
    fromDate: query?.fromDate,
    toDate: query?.toDate,
    eventType: query?.eventType,
    cameraId: query?.cameraId,
    plateKeyword: query?.plateKeyword,
    actor: query?.actor
  });

  const token = localStorage.getItem('camerastream_token');
  const headers: Record<string, string> = {
    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${apiBaseUrl}/api/v1/events/export/traffic-summary${qs}`, {
    headers,
    credentials: 'same-origin'
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.message) msg = err.message;
    } catch {
      // ignore
    }
    throw new Error(`Không thể tải báo cáo: ${msg}`);
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', 'Bao_Cao_Luot_Xe.xlsx');
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  requestAnimationFrame(() => {
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  });

  return {
    fileName: link.getAttribute('download') || 'Bao_Cao_Luot_Xe.xlsx',
    truncated: res.headers.get('X-Is-Truncated') === 'true',
    totalRows: Number(res.headers.get('X-Total-Rows') || 0)
  };
}

// ============================ AUDIT LOGS ============================

export async function getAuditLogs(
  apiBaseUrl: string,
  query?: AuditLogQuery,
  signal?: AbortSignal
): Promise<PageResponse<AuditRow> | null> {
  return getJson<PageResponse<AuditRow>>(
    apiBaseUrl,
    '/api/v1/audit-logs',
    {
      actionType: query?.actionType,
      targetEntity: query?.targetEntity,
      actorUsername: query?.actorUsername,
      fromDate: query?.fromDate,
      toDate: query?.toDate,
      page: query?.page ?? 0,
      size: query?.size ?? 20
    },
    signal
  );
}

export async function getAuditLogStats(
  apiBaseUrl: string,
  signal?: AbortSignal
): Promise<Record<string, number> | null> {
  return getJson<Record<string, number>>(apiBaseUrl, '/api/v1/audit-logs/stats', undefined, signal);
}

export const statisticsApi = {
  getAuditLogs: (query?: AuditLogQuery, signal?: AbortSignal) =>
    getAuditLogs(getBackendBaseUrl(), query, signal),
  getAuditStats: (signal?: AbortSignal) =>
    getAuditLogStats(getBackendBaseUrl(), signal),
};
