import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  LabelList
} from 'recharts';
import KpiStatCard from '../../shared/components/KpiStatCard';
import {
  IconBarChart,
  IconCctv,
  IconCar,
  IconLogOut,
  IconRefresh
} from '../../components/SurveillanceIcons';
import { getDashboardStats, type DashboardStats, type DashboardQuery } from '../../shared/api/statisticsApi';
import { toast } from '../../shared/utils/toast';

interface DashboardModuleProps {
  apiBaseUrl: string;
}

type QuickPreset = 'TODAY' | '7DAYS' | '30DAYS' | 'QUARTER' | 'CUSTOM';

const toLocalIso = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDateVN = (isoStr: string) => {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return isoStr;
};

/** Giá trị mặc định rỗng khi chưa tải xong hoặc backend chưa có dữ liệu (không dùng mock). */
const EMPTY_STATS: DashboardStats = {
  totalEvents: 0,
  activeCameraCount: 0,
  totalGates: 0,
  totalLanes: 0,
  activeLanes: 0,
  eventsByVehicleType: {},
  eventsBySeverity: {},
  hourlyEventCounts: [],
  criticalRatePct: 0,
  unacknowledgedAlertCount: 0
};

/** Màu series cố định theo thứ tự palette đã validate (dataviz): blue → orange → aqua → violet. */
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6'];
/** Label thân thiện cho key phân loại (fallback về key gốc). */
const VEHICLE_LABELS: Record<string, string> = {
  CAR: 'Ô tô',
  MOTO: 'Xe máy',
  TRUCK: 'Xe tải',
  BUS: 'Xe buýt',
  PERSON: 'Người'
};

export const DashboardModule: FC<DashboardModuleProps> = ({ apiBaseUrl }) => {
  const today = toLocalIso(new Date());
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickPreset, setQuickPreset] = useState<QuickPreset>('TODAY');
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);
  const [granularity, setGranularity] = useState<'HOUR' | 'DAY'>('HOUR');

  const applyPreset = (preset: QuickPreset) => {
    setQuickPreset(preset);
    const now = new Date();
    if (preset === 'TODAY') {
      const curToday = toLocalIso(now);
      setFromDate(curToday);
      setToDate(curToday);
      setGranularity('HOUR');
    } else if (preset === '7DAYS') {
      const from = toLocalIso(new Date(now.getTime() - 6 * 86400000));
      const to = toLocalIso(now);
      setFromDate(from);
      setToDate(to);
      setGranularity('DAY');
    } else if (preset === '30DAYS') {
      const from = toLocalIso(new Date(now.getTime() - 29 * 86400000));
      const to = toLocalIso(now);
      setFromDate(from);
      setToDate(to);
      setGranularity('DAY');
    } else if (preset === 'QUARTER') {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
      const from = toLocalIso(startOfQuarter);
      const to = toLocalIso(now);
      setFromDate(from);
      setToDate(to);
      setGranularity('DAY');
    }
  };

  const handleCustomDate = (newFrom: string, newTo: string) => {
    setFromDate(newFrom);
    setToDate(newTo);
    setQuickPreset('CUSTOM');
    if (newFrom === newTo) {
      setGranularity('HOUR');
    } else {
      setGranularity('DAY');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const query: DashboardQuery = {
      granularity,
      fromDate,
      toDate
    };

    const controller = new AbortController();
    try {
      const data = await getDashboardStats(apiBaseUrl, query, controller.signal);
      if (data) {
        setStats(data);
      } else {
        setStats(EMPTY_STATS);
        toast.warning('Không nhận được dữ liệu từ hệ thống.');
      }
    } catch {
      setStats(EMPTY_STATS);
      toast.error('Lỗi khi kết nối đến máy chủ lấy dữ liệu thống kê.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, fromDate, toDate, granularity]);

  const s = stats || EMPTY_STATS;

  /** Label trục X theo bucket: "HH:00" (HOUR) hoặc "dd/MM" (DAY). */
  const bucketLabel = (bucket: string) => {
    if (granularity === 'DAY') {
      return bucket.slice(5).replace('-', '/');
    }
    return bucket.slice(11, 16);
  };

  const seriesData = useMemo(
    () => s.hourlyEventCounts.map((d) => ({ ...d, label: bucketLabel(d.bucket) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.hourlyEventCounts, granularity]
  );

  const vehicleChartData = useMemo(
    () =>
      Object.entries(s.eventsByVehicleType || {}).map(([key, value]) => ({
        key,
        name: VEHICLE_LABELS[key] || key,
        value
      })),
    [s.eventsByVehicleType]
  );

  const severityChartData = useMemo(
    () =>
      Object.entries(s.eventsBySeverity || {}).map(([level, value]) => ({
        name: level,
        value
      })),
    [s.eventsBySeverity]
  );

  const sublabel = useMemo(() => {
    if (quickPreset === 'TODAY' || fromDate === toDate) {
      return {
        total: 'trong ngày hôm nay',
        in: 'lượt vào trong ngày hôm nay',
        out: 'lượt ra trong ngày hôm nay'
      };
    }
    if (quickPreset === '7DAYS') {
      return {
        total: 'trong 7 ngày qua',
        in: 'lượt vào trong 7 ngày qua',
        out: 'lượt ra trong 7 ngày qua'
      };
    }
    if (quickPreset === '30DAYS') {
      return {
        total: 'trong 30 ngày qua',
        in: 'lượt vào trong 30 ngày qua',
        out: 'lượt ra trong 30 ngày qua'
      };
    }
    if (quickPreset === 'QUARTER') {
      return {
        total: 'trong quý này',
        in: 'lượt vào trong quý này',
        out: 'lượt ra trong quý này'
      };
    }
    const fVn = formatDateVN(fromDate);
    const tVn = formatDateVN(toDate);
    return {
      total: `từ ${fVn} đến ${tVn}`,
      in: `lượt vào (${fVn} - ${tVn})`,
      out: `lượt ra (${fVn} - ${tVn})`
    };
  }, [quickPreset, fromDate, toDate]);

  const tickStyle = { fontSize: 10, fill: '#64748B' };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header + Toolbar Bộ Lọc Thời Gian */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
            Tổng Quan Hệ Thống
          </h2>
          <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px' }}>
            Chỉ số KPI realtime & xu hướng phát hiện phương tiện
          </div>
        </div>

        {/* Thanh Điều Khiển Bộ Lọc: Nút Chọn Nhanh + Từ Ngày / Đến Ngày + Làm Mới */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          backgroundColor: '#FFFFFF',
          padding: '6px 12px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          {/* 1. Nút Chọn Nhanh: Hôm Nay | 7 Ngày | 30 Ngày | Quý Này */}
          <div style={{
            display: 'flex',
            gap: '4px',
            backgroundColor: '#F1F5F9',
            borderRadius: '7px',
            padding: '3px'
          }}>
            {[
              { id: 'TODAY', label: 'Hôm nay' },
              { id: '7DAYS', label: '7 ngày' },
              { id: '30DAYS', label: '30 ngày' },
              { id: 'QUARTER', label: 'Quý này' }
            ].map((p) => {
              const active = quickPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id as QuickPreset)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: active ? 700 : 600,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: active ? '#0284C7' : 'transparent',
                    color: active ? '#FFFFFF' : '#475569',
                    boxShadow: active ? '0 1px 3px rgba(2, 132, 199, 0.3)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div style={{ width: '1px', height: '22px', backgroundColor: '#E2E8F0' }} />

          {/* 2. Bộ Lọc Khoảng Ngày: Từ Ngày -> Đến Ngày */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Từ:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleCustomDate(e.target.value, toDate)}
              style={{
                padding: '4px 8px',
                fontSize: '11.5px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#1E293B',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>Đến:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleCustomDate(fromDate, e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: '11.5px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#1E293B',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* 3. Nút Làm Mới */}
          <button
            type="button"
            onClick={fetchData}
            title="Làm mới dữ liệu"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              color: '#0284C7',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E0F2FE')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      {/* KPI card row - 4 Thẻ Quản Lý Phương Tiện & Làn Cổng Gate */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        <KpiStatCard
          title="Tổng Lượt Xe"
          value={s.totalEvents}
          sublabel={sublabel.total}
          icon={IconBarChart}
          color="#0284C7"
        />
        <KpiStatCard
          title="Xe Vào Cổng (IN)"
          value={s.inCount ?? 0}
          sublabel={sublabel.in}
          icon={IconCar}
          color="#059669"
        />
        <KpiStatCard
          title="Xe Ra Cổng (OUT)"
          value={s.outCount ?? 0}
          sublabel={sublabel.out}
          icon={IconLogOut}
          color="#2563EB"
        />
        <KpiStatCard
          title="Camera Hoạt Động"
          value={s.totalCameraCount && s.totalCameraCount > 0 ? `${s.activeCameraCount} / ${s.totalCameraCount}` : `${s.activeCameraCount}`}
          sublabel="thiết bị trực tuyến"
          icon={IconCctv}
          color="#0D9488"
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
        {/* Line chart: event counts over time */}
        <div style={{
          backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: '10px', padding: '14px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
            {granularity === 'HOUR' ? 'Số Lượt Phát Hiện / Giờ' : 'Số Lượt Phát Hiện / Ngày'}
          </div>
          <div style={{ width: '100%', height: '220px' }}>
            {seriesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={seriesData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#EEF2F7" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={tickStyle}
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                    interval={granularity === 'HOUR' ? 3 : 4}
                  />
                  <YAxis
                    tick={tickStyle}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #E2E8F0',
                      fontSize: 11,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                    }}
                    labelStyle={{ color: '#64748B', fontWeight: 700 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#2a78d6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#2a78d6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#94A3B8', fontSize: '12px'
              }}>
                Chưa có dữ liệu thống kê
              </div>
            )}
          </div>
        </div>

        {/* Bar chart: events by vehicle type */}
        <div style={{
          backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0',
          borderRadius: '10px', padding: '14px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
            Phân Loại Phương Tiện
          </div>
          <div style={{ width: '100%', height: '170px' }}>
            {vehicleChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicleChartData} margin={{ top: 18, right: 4, bottom: 0, left: -24 }}>
                  <XAxis
                    dataKey="name"
                    tick={tickStyle}
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                  />
                  <YAxis tick={tickStyle} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#F1F5F9', opacity: 0.5 }}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #E2E8F0',
                      fontSize: 11,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28}>
                    <LabelList dataKey="value" position="top" style={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} />
                    {vehicleChartData.map((entry, i) => (
                      <Cell key={entry.key} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#94A3B8', fontSize: '12px'
              }}>
                Chưa có dữ liệu phân loại
              </div>
            )}
          </div>

          {/* Mini severity strip */}
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {severityChartData.map((row) => {
              const pct = s.totalEvents > 0 ? Math.round((row.value / s.totalEvents) * 1000) / 10 : 0;
              const color = row.name === 'CRITICAL' ? '#DC2626' : row.name === 'WARNING' ? '#D97706' : '#059669';
              return (
                <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', width: '52px' }}>{row.name}</span>
                  <div style={{ flex: 1, height: '6px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
                  </div>
                  <span style={{ fontSize: '10px', color: '#64748B', width: '34px', textAlign: 'right' }}>
                    {row.value} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '8px', fontSize: '11.5px', color: '#94A3B8' }}>
          Đang tải dữ liệu mới...
        </div>
      )}
    </div>
  );
};

export default DashboardModule;
