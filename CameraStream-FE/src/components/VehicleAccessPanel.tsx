import { useState, useEffect, useRef, useMemo, type FC, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  IconBarChart,
  IconCar,
  IconMoto,
  IconTruck,
  IconSearch,
  IconClose,
  IconCamera,
  IconTarget,
  IconZoomIn,
  IconEye,
  IconRadio,
  IconArrowUp,
  IconArrowDown
} from './SurveillanceIcons';
import { resolveImageUrl, BACKEND_BASE_URL } from '../shared/utils/imageUrl';
import { getWebSocketUrl } from '../shared/utils/envConfig';

export interface VehicleLog {
  id: string;
  plateNumber: string;
  vehicleType: 'CAR' | 'MOTO' | 'TRUCK';
  gateName: string;
  gateType: 'IN' | 'OUT';
  timestamp: string;
  confidence: number;
  snapshotUrl: string;
  plateCropUrl?: string;
  ticketCode?: string;
  status: 'VALID' | 'WARNING' | 'VIP';
  note?: string;
  detectedAt?: string;
  _receivedAt?: number;
}

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function formatDetectionTime(detectedAt?: string, fallbackTimestamp?: string): string {
  if (!detectedAt && !fallbackTimestamp) return 'Vừa xong';

  let date: Date | null = null;
  if (detectedAt) {
    const d = new Date(detectedAt);
    if (!isNaN(d.getTime())) date = d;
  }

  if (!date && fallbackTimestamp) {
    return fallbackTimestamp;
  }

  if (!date) return fallbackTimestamp || 'Vừa xong';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const timeOnly = `${hh}:${mm}:${ss}`;

  // Trong vòng 60 giây và cùng ngày
  if (diffMs >= 0 && diffMs < 60000 && isSameDay(date, now)) {
    return `${timeOnly} - Vừa xong`;
  }

  if (isSameDay(date, now)) {
    return `${timeOnly} - Hôm nay`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `${timeOnly} - Hôm qua`;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${timeOnly} ${day}/${month}/${year}`;
}

interface HighlightMatchProps {
  text: string;
  query: string;
}

const HighlightText: FC<HighlightMatchProps> = ({ text, query }) => {
  if (!query || !query.trim() || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: '#2563EB', color: '#FFFFFF', padding: '1px 3px', borderRadius: '3px' }}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

export const VehicleAccessPanel: FC = () => {
  // Lịch sử lượt xe thật từ Backend (Khởi tạo mảng rỗng, không dùng dữ liệu mock)
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [filterGate, setFilterGate] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  // Phân trang danh sách xe để chống tràn giao diện và chống rò rỉ bộ nhớ (Memory Leak)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 6;

  // Search State Machine (Theo chuẩn skill search-flow: IDLE -> TYPING -> LOADING -> RESULTS)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Lightbox Modal phóng to ảnh xe & đối soát chuyên nghiệp
  const [selectedPhoto, setSelectedPhoto] = useState<VehicleLog | null>(null);
  const [modalTab, setModalTab] = useState<'SPLIT' | 'CROP' | 'FULL'>('SPLIT');
  const [cropZoom, setCropZoom] = useState<number>(1);

  // Tải danh sách lượt xe nhận diện thực tế từ Backend (Spring Boot Event Hub) khi mở trang
  useEffect(() => {
    let isCancelled = false;
    const fetchRealDetections = async () => {
      // Nguồn chính: Spring Boot Event Hub — ảnh đã lưu ra file, trả URL tuyệt đối.
      try {
        const res = await fetch(
          `${BACKEND_BASE_URL}/api/v1/events?eventType=VEHICLE_ANPR&size=100`
        );
        if (res.ok) {
          const json = await res.json();
          const items = json?.data?.content || [];
          if (!isCancelled && items.length > 0) {
            // Giới hạn tối đa 100 bản ghi gần nhất để tránh phình bộ nhớ Heap
            setLogs(
              items.slice(0, 100).map((ev: any) => ({
                id: String(ev.id),
                plateNumber: ev.payload?.plateNumber || 'CHƯA RÕ BIỂN',
                vehicleType: ev.payload?.vehicleType || 'CAR',
                confidence: ev.confidence ? Math.round(ev.confidence * 100) : 95,
                snapshotUrl: resolveImageUrl(ev.snapshotUrl, BACKEND_BASE_URL),
                plateCropUrl: resolveImageUrl(ev.payload?.plateCropUrl || ev.snapshotUrl, BACKEND_BASE_URL),
                detectedAt: ev.createdAt || ev.detectedAt,
                gateName: ev.cameraName || `Camera #${ev.cameraId}`,
                status: ev.severity === 'WARNING' ? 'CẢNH BÁO' : 'HỢP LỆ'
              }))
            );
            return;
          }
        }
      } catch (err) {
        console.warn('Lỗi kết nối CSDL Event Hub:', err);
      }
    };
    fetchRealDetections();
    return () => { isCancelled = true; };
  }, []);

  // Phím tắt Ctrl+F hoặc "/" để focus tìm kiếm
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search simulation
  useEffect(() => {
    if (!searchQuery.trim()) {
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      setIsSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Trạng thái kết nối WebSocket Live AI
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  // KẾT NỐI WEBSOCKET THỜI GIAN THỰC TỚI CAMERA STREAM BACKEND (SPRING BOOT)
  useEffect(() => {
    let isDestroyed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWebSocket = () => {
      if (isDestroyed) return;
      try {
        const wsUrl = getWebSocketUrl();
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isDestroyed) {
            try { ws?.close(); } catch (_) {}
            return;
          }
          setIsWsConnected(true);
          // Gửi frame STOMP CONNECT
          const connectFrame = 'CONNECT\naccept-version:1.2,1.1,1.0\nheart-beat:10000,10000\n\n\0';
          ws?.send(connectFrame);
        };

        ws.onmessage = (event: MessageEvent) => {
          if (isDestroyed) return;
          const msg = event.data;
          if (typeof msg === 'string') {
            if (msg.startsWith('CONNECTED')) {
              // Đăng ký nhận sự kiện phát hiện biển số từ Spring Boot
              const subFrame = 'SUBSCRIBE\nid:sub-plates\ndestination:/topic/cameras/events\n\n\0';
              ws?.send(subFrame);
            } else if (msg.includes('MESSAGE') && msg.includes('PLATE_DETECTED')) {
              try {
                const bodyIndex = msg.indexOf('\n\n');
                if (bodyIndex !== -1) {
                  const rawBody = msg.slice(bodyIndex + 2).replace(/\0$/, '').trim();
                  const data = JSON.parse(rawBody);

                  if (data && data.payload) {
                    const p = data.payload;
                    const now = new Date();
                    const nowMs = now.getTime();
                    const detectedAt = p.detectedAt || now.toISOString();
                    const incomingPlate = (p.plateNumber || 'UNKNOWN').trim();

                    const rawSnap = p.fullImageFile
                      ? `/snapshots/${p.fullImageFile}`
                      : (p.snapshotUrl || p.fullImageBase64 || '');
                    const rawCrop = p.plateCropFile
                      ? `/snapshots/${p.plateCropFile}`
                      : (p.plateCropUrl || p.plateCropBase64 || rawSnap);

                    const newLog: VehicleLog = {
                      id: `AI-LOG-${nowMs}-${Math.floor(100 + Math.random() * 900)}`,
                      plateNumber: incomingPlate,
                      vehicleType: (p.vehicleType as any) || 'CAR',
                      gateName: data.cameraName || 'Cổng Camera AI',
                      gateType: 'IN',
                      timestamp: formatDetectionTime(detectedAt),
                      confidence: Number(((p.confidence || 0.95) * (p.confidence <= 1 ? 100 : 1)).toFixed(1)),
                      snapshotUrl: resolveImageUrl(rawSnap, BACKEND_BASE_URL),
                      plateCropUrl: resolveImageUrl(rawCrop, BACKEND_BASE_URL),
                      ticketCode: `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
                      status: 'VALID',
                      note: `Module YOLOX + ONNX LPR phát hiện tại ${data.cameraName || 'Camera'}`,
                      detectedAt: detectedAt,
                      _receivedAt: nowMs
                    };

                    setLogs((prev) => {
                      // BỘ LỌC CHỐNG DOUBLE EVENT CHO CÙNG 1 BIỂN SỐ (KHÔNG CHẶN BIỂN SỐ THỨ 2 XUẤT HIỆN LIÊN TIẾP):
                      const cleanIncoming = incomingPlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                      if (!cleanIncoming) return prev;

                      const getLevenshtein = (s1: string, s2: string): number => {
                        const m = s1.length, n = s2.length;
                        const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
                        for (let i = 0; i <= m; i++) dp[i][0] = i;
                        for (let j = 0; j <= n; j++) dp[0][j] = j;
                        for (let i = 1; i <= m; i++) {
                          for (let j = 1; j <= n; j++) {
                            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
                          }
                        }
                        return dp[m][n];
                      };

                      const isSimilar = (a: string, b: string): boolean => {
                        if (a === b) return true;
                        if (Math.abs(a.length - b.length) > 1) return false;
                        if (a.length !== b.length) {
                          const shortS = a.length < b.length ? a : b;
                          const longS = a.length < b.length ? b : a;
                          return shortS.length >= 7 && (longS.startsWith(shortS) || longS.endsWith(shortS));
                        }
                        if (a.length >= 7 && a.slice(-5) === b.slice(-5) && getLevenshtein(a, b) <= 1) {
                          return true;
                        }
                        return false;
                      };

                      const existingIndex = prev.slice(0, 15).findIndex((log) => {
                        if (log.gateName !== newLog.gateName) return false;
                        const cleanExisting = (log.plateNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                        if (!cleanExisting) return false;
                        const diffMs = nowMs - (log._receivedAt || 0);
                        return isSimilar(cleanIncoming, cleanExisting) && diffMs < 15000;
                      });

                      if (existingIndex !== -1) {
                        // Xe đang đứng yên tại cổng: Cập nhật ảnh/độ nét nếu lần này nhận diện nét hơn
                        const updated = [...prev];
                        const oldLog = updated[existingIndex];
                        if (newLog.confidence > oldLog.confidence) {
                          updated[existingIndex] = {
                            ...oldLog,
                            confidence: newLog.confidence,
                            plateCropUrl: newLog.plateCropUrl || oldLog.plateCropUrl,
                            snapshotUrl: newLog.snapshotUrl || oldLog.snapshotUrl
                          };
                        }
                        return updated;
                      }

                      // Lượt xe mới thực sự: Thêm vào đầu danh sách (tối đa 50 phần tử)
                      return [newLog, ...prev].slice(0, 50);
                    });
                  }
                }
              } catch (parseErr) {
                console.error('[STOMP] Lỗi giải mã sự kiện xe:', parseErr);
              }
            }
          }
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          if (!isDestroyed) {
            reconnectTimer = setTimeout(connectWebSocket, 4000);
          }
        };

        ws.onerror = () => {
          setIsWsConnected(false);
          if (!isDestroyed) {
            try { ws?.close(); } catch (_) {}
          }
        };
      } catch (err) {
        setIsWsConnected(false);
        if (!isDestroyed) {
          reconnectTimer = setTimeout(connectWebSocket, 4000);
        }
      }
    };

    connectWebSocket();

    return () => {
      isDestroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch (_) {}
        ws = null;
      }
    };
  }, []);

  // Lọc danh sách theo từ khóa và bộ lọc cổng Vào/Ra
  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const matchSearch =
        !searchQuery.trim() ||
        item.plateNumber.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        item.gateName.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (item.ticketCode && item.ticketCode.toLowerCase().includes(searchQuery.trim().toLowerCase())) ||
        (item.note && item.note.toLowerCase().includes(searchQuery.trim().toLowerCase()));

      const matchGate = filterGate === 'ALL' || item.gateType === filterGate;

      return matchSearch && matchGate;
    });
  }, [logs, searchQuery, filterGate]);

  // Phân trang danh sách (Tránh render hàng trăm DOM ảnh gây Memory Leak & phình giao diện)
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));

  // Tự động quay về trang 1 khi đổi bộ lọc hoặc tìm kiếm
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterGate]);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Thống kê nhanh: Ưu tiên ngày hôm nay, nếu không có lượt mới hôm nay thì tính trên toàn bộ logs hiện có
  const stats = useMemo(() => {
    const now = new Date();
    const todayLogs = logs.filter((l) => {
      if (l.detectedAt) {
        const d = new Date(l.detectedAt);
        if (!isNaN(d.getTime())) {
          return isSameDay(d, now);
        }
      }
      return l.timestamp && (l.timestamp.includes('Vừa xong') || l.timestamp.includes('Hôm nay'));
    });

    const isAllTime = todayLogs.length === 0 && logs.length > 0;
    const targetLogs = isAllTime ? logs : todayLogs;

    const totalToday = targetLogs.length;
    const inCount = targetLogs.filter((l) => l.gateType === 'IN').length;
    const outCount = targetLogs.filter((l) => l.gateType === 'OUT').length;
    const insideCount = Math.max(0, inCount - outCount);
    return { totalToday, inCount, outCount, insideCount, isAllTime };
  }, [logs]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 120px)',
      maxHeight: '860px',
      backgroundColor: '#FFFFFF',
      borderRadius: '16px',
      border: '1px solid #E2E8F0',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
      overflow: 'hidden'
    }}>
      {/* 1. Header & Thống kê nhanh */}
      <div style={{
        padding: '16px 20px',
        background: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.15)'
            }}>
              <IconBarChart size={19} color="#0284C7" />
            </div>
            <div>
              <h2 style={{ fontSize: '15.5px', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                Kiểm Soát & Thống Kê Xe Vào Ra
              </h2>
              <div style={{ fontSize: '12px', color: '#334155', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Module AI Biển Số (YOLOX + VietOCR)</span>
                <span style={{
                  fontSize: '10.5px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: isWsConnected ? '#DCFCE7' : '#F1F5F9',
                  color: isWsConnected ? '#15803D' : '#334155',
                  border: isWsConnected ? '1px solid #86EFAC' : '1px solid #CBD5E1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontWeight: 700
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: isWsConnected ? '#16A34A' : '#64748B'
                  }} />
                  {isWsConnected ? 'Live AI Stream' : 'Chờ kết nối...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Thẻ chỉ số trực quan */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          <div style={{ background: '#FFFFFF', padding: '8px 4px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stats.isAllTime ? 'Tổng Lượt' : 'Lượt Hôm Nay'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0284C7', marginTop: '2px' }}>{stats.totalToday}</div>
          </div>
          <div style={{ background: '#FFFFFF', padding: '8px 4px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Xe Vào (IN)</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#16A34A', marginTop: '2px' }}>{stats.inCount}</div>
          </div>
          <div style={{ background: '#FFFFFF', padding: '8px 4px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Xe Ra (OUT)</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>{stats.outCount}</div>
          </div>
          <div style={{ background: '#FFFFFF', padding: '8px 4px', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Trong Bãi</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#D97706', marginTop: '2px' }}>{stats.insideCount}</div>
          </div>
        </div>
      </div>

      {/* 2. Complete Search Flow Input (Tuân thủ search-flow Skill) */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          background: '#FFFFFF',
          border: '1.5px solid #CBD5E1',
          borderRadius: '10px',
          padding: '0 12px'
        }}>
          {/* Icon State: Search hoặc Spinner */}
          <span style={{ color: '#475569', fontSize: '13px', marginRight: '8px', display: 'flex', alignItems: 'center' }}>
            {isSearching ? (
              <div style={{
                width: '13px',
                height: '13px',
                border: '2px solid rgba(2, 132, 199, 0.25)',
                borderTopColor: '#0284C7',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
            ) : (
              <IconSearch size={15} color="#475569" />
            )}
          </span>

          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            placeholder="Tìm biển số xe (VD: 29A-888)... (Ctrl+F)"
            style={{
              width: '100%',
              padding: '9px 0',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#0F172A',
              fontSize: '13px',
              fontWeight: 600
            }}
          />

          {/* Typing State: Nút X xóa nhanh */}
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              style={{
                background: '#E2E8F0',
                border: 'none',
                color: '#475569',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '6px'
              }}
            >
              <IconClose size={12} color="#475569" />
            </button>
          )}

          {!searchQuery && (
            <kbd style={{
              background: '#F1F5F9',
              color: '#334155',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 700,
              border: '1px solid #CBD5E1',
              marginLeft: '6px'
            }}>
              Ctrl+F
            </kbd>
          )}
        </div>

        {/* Bộ lọc Tabs: Cổng Vào/Ra & Loại Xe */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['ALL', 'IN', 'OUT'] as const).map((gate) => {
              const isActive = filterGate === gate;
              return (
                <button
                  key={gate}
                  onClick={() => setFilterGate(gate)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '7px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: isActive ? '1.5px solid #0284C7' : '1.5px solid #CBD5E1',
                    background: isActive ? '#0284C7' : '#FFFFFF',
                    color: isActive ? '#FFF' : '#0F172A',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {gate === 'IN' && (
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: isActive ? '#FFF' : '#16A34A' }} />
                  )}
                  {gate === 'OUT' && (
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: isActive ? '#FFF' : '#DC2626' }} />
                  )}
                  <span>{gate === 'ALL' ? 'Tất cả cổng' : gate === 'IN' ? 'Cổng vào' : 'Cổng ra'}</span>
                </button>
              );
            })}
          </div>

          <div style={{
            fontSize: '12px',
            color: '#1E293B',
            fontWeight: 700,
            background: '#F1F5F9',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #CBD5E1'
          }}>
            {filteredLogs.length} lượt xe
          </div>
        </div>
      </div>

      {/* 3. Lịch Sử Xe Vào Ra (Live Access History Stream - Phân Trang) */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {filteredLogs.length === 0 ? (
          // Empty State: Phân biệt rõ giữa lúc đang tìm kiếm và lúc chưa có xe nào qua cổng
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748B',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            {searchQuery ? (
              <>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#38BDF8'
                }}>
                  <IconSearch size={24} color="#38BDF8" />
                </div>
                <div style={{ fontWeight: 600, color: '#94A3B8', fontSize: '13.5px' }}>
                  Không tìm thấy lượt xe nào khớp với "{searchQuery}"
                </div>
                <div style={{ fontSize: '11.5px', maxWidth: '300px' }}>
                  Hãy thử kiểm tra lại định dạng biển số hoặc chọn lại bộ lọc Cổng vào / Cổng ra.
                </div>
              </>
            ) : (
              <>
                <div style={{
                  position: 'relative',
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22C55E'
                }}>
                  <IconRadio size={26} color="#22C55E" />
                  <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#22C55E',
                    boxShadow: '0 0 10px #22C55E'
                  }} />
                </div>
                <div style={{ fontWeight: 700, color: '#E2E8F0', fontSize: '14.5px' }}>
                  Hệ Thống Đang Giám Sát Luồng Camera
                </div>
                <div style={{ fontSize: '12px', maxWidth: '320px', lineHeight: 1.6, color: '#94A3B8' }}>
                  Chưa có lượt xe mới. Module AI (YOLOX + VietOCR) đang quét và bám biển số thời gian thực từ các cổng camera trong hệ thống.
                </div>
              </>
            )}
          </div>
        ) : (
          paginatedLogs.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedPhoto(item)}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                padding: '9px 11px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: '100%',
                minWidth: 0,
                flexShrink: 0,
                overflow: 'hidden',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0284C7';
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              {/* Cụm hình ảnh: Ảnh toàn cảnh xe + Ảnh CẬN CẢNH BIỂN SỐ (YOLOX CROP) */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                {/* 1. Ảnh toàn cảnh hiện trường */}
                <div
                  onClick={() => setSelectedPhoto(item)}
                  title="Ảnh toàn cảnh xe lúc qua cổng (Bấm để phóng to)"
                  style={{
                    position: 'relative',
                    width: '68px',
                    height: '48px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#0F172A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {item.snapshotUrl ? (
                    <img
                      src={item.snapshotUrl}
                      alt={item.plateNumber}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                      {item.vehicleType === 'MOTO' ? (
                        <IconMoto size={22} color="#64748B" />
                      ) : item.vehicleType === 'TRUCK' ? (
                        <IconTruck size={22} color="#64748B" />
                      ) : (
                        <IconCar size={22} color="#64748B" />
                      )}
                    </div>
                  )}
                  <div style={{
                    position: 'absolute',
                    bottom: '2px',
                    left: '2px',
                    background: 'rgba(0,0,0,0.75)',
                    color: '#94A3B8',
                    fontSize: '8px',
                    fontWeight: 700,
                    padding: '1px 3px',
                    borderRadius: '2px'
                  }}>
                    Toàn cảnh
                  </div>
                </div>

                {/* 2. Ảnh CROP CẬN CẢNH BIỂN SỐ TỪ YOLOX ĐỂ ĐỐI CHIẾU */}
                {item.plateCropUrl && (
                  <div
                    onClick={() => setSelectedPhoto(item)}
                    title="Ảnh cận cảnh biển số do AI cắt ra (Bấm để phóng to đối chiếu)"
                    style={{
                      position: 'relative',
                      width: '60px',
                      height: '48px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: '1px solid #BAE6FD',
                      backgroundColor: '#F8FAFC',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1px'
                    }}
                  >
                    <img
                      src={item.plateCropUrl}
                      alt="Crop biển số"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: '7.5px',
                      fontWeight: 800,
                      padding: '0 3px',
                      borderRadius: '2px',
                      border: '0.5px solid #BFDBFE'
                    }}>
                      CROP
                    </div>
                  </div>
                )}
              </div>

              {/* Thông tin biển số & sự kiện */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  {/* Biển số xe thiết kế kiểu biển số thực tế */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: '#FFFFFF',
                    color: '#0F172A',
                    padding: '2px 7px',
                    borderRadius: '5px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '13px',
                    border: '1px solid #0F172A',
                    letterSpacing: '0.5px',
                    whiteSpace: 'nowrap',
                    wordBreak: 'keep-all',
                    flexShrink: 0
                  }}>
                    <HighlightText text={item.plateNumber} query={searchQuery} />
                  </div>

                  {/* Badge Loại phương tiện: Ô TÔ vs XE MÁY */}
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '5px',
                    backgroundColor: item.vehicleType === 'MOTO' ? '#ECFDF5' : (item.vehicleType === 'TRUCK' ? '#FFFBEB' : '#EFF6FF'),
                    color: item.vehicleType === 'MOTO' ? '#047857' : (item.vehicleType === 'TRUCK' ? '#B45309' : '#1D4ED8'),
                    border: `1px solid ${item.vehicleType === 'MOTO' ? '#A7F3D0' : (item.vehicleType === 'TRUCK' ? '#FDE68A' : '#BFDBFE')}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}>
                    <span>{item.vehicleType === 'MOTO' ? 'XE MÁY' : (item.vehicleType === 'TRUCK' ? 'XE TẢI' : 'Ô TÔ')}</span>
                  </span>

                  {/* Badge Cổng Vào / Ra */}
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: '6px',
                    backgroundColor: item.gateType === 'IN' ? '#DCFCE7' : '#FEE2E2',
                    color: item.gateType === 'IN' ? '#15803D' : '#B91C1C',
                    border: `1px solid ${item.gateType === 'IN' ? '#86EFAC' : '#FCA5A5'}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}>
                    {item.gateType === 'IN' ? (
                      <IconArrowDown size={10} color="#15803D" />
                    ) : (
                      <IconArrowUp size={10} color="#B91C1C" />
                    )}
                    <span>{item.gateType === 'IN' ? 'VÀO' : 'RA'}</span>
                  </span>
                </div>

                {/* Dòng metadata */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginTop: '4px', fontSize: '11px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#334155', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {item.vehicleType === 'MOTO' ? (
                      <IconMoto size={13} color="#0284C7" />
                    ) : item.vehicleType === 'TRUCK' ? (
                      <IconTruck size={13} color="#0284C7" />
                    ) : (
                      <IconCar size={13} color="#0284C7" />
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.gateName}</span>
                  </span>
                  <span style={{ color: '#64748B', fontSize: '10.5px', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {formatDetectionTime(item.detectedAt, item.timestamp)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <span style={{
                    color: '#64748B',
                    fontSize: '10.5px',
                    fontWeight: 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0
                  }}>
                    {item.note || item.ticketCode}
                  </span>
                  <span style={{
                    color: '#0369A1',
                    fontWeight: 600,
                    fontSize: '10px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}>
                    AI: {item.confidence}%
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 4. Thanh Phân Trang (Pagination Controls) */}
      {filteredLogs.length > 0 && (
        <div style={{
          padding: '10px 16px',
          background: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#334155'
        }}>
          <div style={{ fontWeight: 600 }}>
            Hiển thị <strong>{(currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, filteredLogs.length)}</strong> / <strong>{filteredLogs.length}</strong> lượt
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1.5px solid #CBD5E1',
                background: currentPage === 1 ? '#F1F5F9' : '#FFFFFF',
                color: currentPage === 1 ? '#94A3B8' : '#0F172A',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '11.5px',
                transition: 'all 0.15s ease'
              }}
            >
              ‹ Trước
            </button>

            <span style={{ padding: '0 6px', fontWeight: 800, color: '#0F172A' }}>
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1.5px solid #CBD5E1',
                background: currentPage === totalPages ? '#F1F5F9' : '#FFFFFF',
                color: currentPage === totalPages ? '#94A3B8' : '#0F172A',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '11.5px',
                transition: 'all 0.15s ease'
              }}
            >
              Tiếp ›
            </button>
          </div>
        </div>
      )}

      {/* 4. Modal Lightbox Xem Ảnh Chụp Xe & Đối Soát Biển Số Chuyên Nghiệp (Portal ra document.body chống che khuất bởi luồng video) */}
      {selectedPhoto && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => {
            setSelectedPhoto(null);
            setCropZoom(1);
            setModalTab('SPLIT');
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              maxWidth: '960px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.18), 0 0 1px 1px rgba(0, 0, 0, 0.05)'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '16.5px', color: '#0F172A', fontWeight: 800 }}>
                    Đối Soát & Kiểm Tra Biển Số: {selectedPhoto.plateNumber}
                  </h3>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: selectedPhoto.gateType === 'IN' ? '#DCFCE7' : '#FEE2E2',
                    color: selectedPhoto.gateType === 'IN' ? '#15803D' : '#B91C1C',
                    border: `1px solid ${selectedPhoto.gateType === 'IN' ? '#86EFAC' : '#FCA5A5'}`
                  }}>
                    {selectedPhoto.gateType === 'IN' ? 'XE VÀO' : 'XE RA'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                  {selectedPhoto.gateName} • {formatDetectionTime(selectedPhoto.detectedAt, selectedPhoto.timestamp)} • Độ chính xác AI: <strong style={{ color: '#0284C7' }}>{selectedPhoto.confidence}%</strong>
                </div>
              </div>

              {/* Tab Selector & Close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedPhoto.plateCropUrl && (
                  <div style={{
                    display: 'flex',
                    background: '#F1F5F9',
                    padding: '3px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0'
                  }}>
                    <button
                      onClick={() => setModalTab('SPLIT')}
                      style={{
                        padding: '6px 12px',
                        background: modalTab === 'SPLIT' ? '#0284C7' : 'transparent',
                        color: modalTab === 'SPLIT' ? '#FFF' : '#475569',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <IconEye size={13} color={modalTab === 'SPLIT' ? '#FFF' : '#475569'} />
                      <span>Song song</span>
                    </button>
                    <button
                      onClick={() => setModalTab('CROP')}
                      style={{
                        padding: '6px 12px',
                        background: modalTab === 'CROP' ? '#16A34A' : 'transparent',
                        color: modalTab === 'CROP' ? '#FFF' : '#475569',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <IconZoomIn size={13} color={modalTab === 'CROP' ? '#FFF' : '#475569'} />
                      <span>Biển số (Zoom)</span>
                    </button>
                    <button
                      onClick={() => setModalTab('FULL')}
                      style={{
                        padding: '6px 12px',
                        background: modalTab === 'FULL' ? '#334155' : 'transparent',
                        color: modalTab === 'FULL' ? '#FFF' : '#475569',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <IconCamera size={13} color={modalTab === 'FULL' ? '#FFF' : '#475569'} />
                      <span>Toàn cảnh</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={() => {
                    setSelectedPhoto(null);
                    setCropZoom(1);
                    setModalTab('SPLIT');
                  }}
                  style={{
                    background: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    color: '#475569',
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#E2E8F0';
                    e.currentTarget.style.color = '#0F172A';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#F1F5F9';
                    e.currentTarget.style.color = '#475569';
                  }}
                >
                  <IconClose size={15} color="currentColor" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, backgroundColor: '#FFFFFF' }}>
              {/* CHẾ ĐỘ 1: SONG SONG (SPLIT VIEW) */}
              {modalTab === 'SPLIT' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                  {/* Cột 1: Ảnh toàn cảnh camera */}
                  <div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px'
                    }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <IconCamera size={15} color="#0284C7" />
                        <span>ẢNH TOÀN CẢNH CAMERA</span>
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>Góc rộng hiện trường</span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '320px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {selectedPhoto.snapshotUrl ? (
                        <img
                          src={selectedPhoto.snapshotUrl}
                          alt="Toàn cảnh"
                          loading="eager"
                          decoding="async"
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#94A3B8' }}>
                          <IconCamera size={36} color="#CBD5E1" />
                          <span style={{ fontSize: '13px', fontWeight: 500 }}>Chưa có ảnh toàn cảnh</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cột 2: Ảnh cận cảnh biển số do YOLOX crop & Thông tin đối soát */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px'
                      }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#15803D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <IconTarget size={15} color="#16A34A" />
                          <span>CẬN CẢNH BIỂN SỐ (YOLOX CROP)</span>
                        </span>
                        {/* Zoom control */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {[1, 1.5, 2].map((z) => (
                            <button
                              key={z}
                              onClick={() => setCropZoom(z)}
                              style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                borderRadius: '5px',
                                border: cropZoom === z ? '1px solid #16A34A' : '1px solid #CBD5E1',
                                background: cropZoom === z ? '#16A34A' : '#FFFFFF',
                                color: cropZoom === z ? '#FFF' : '#334155',
                                cursor: 'pointer'
                              }}
                            >
                              {z}x
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Khung ảnh CROP Biển số */}
                      <div style={{
                        width: '100%',
                        height: '180px',
                        borderRadius: '12px',
                        border: '1.5px solid #86EFAC',
                        backgroundColor: '#F8FAFC',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(34, 197, 94, 0.08)',
                        position: 'relative',
                        padding: '8px'
                      }}>
                        {selectedPhoto.plateCropUrl ? (
                          <img
                            src={selectedPhoto.plateCropUrl}
                            alt="Crop biển số"
                            loading="eager"
                            decoding="async"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              transform: `scale(${cropZoom})`,
                              transition: 'transform 0.2s ease',
                              objectFit: 'contain',
                              imageRendering: 'crisp-edges'
                            }}
                          />
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: '12px' }}>Chưa có ảnh crop</span>
                        )}
                        <span style={{
                          position: 'absolute',
                          top: '8px',
                          left: '8px',
                          background: '#DCFCE7',
                          color: '#15803D',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          border: '1px solid #86EFAC'
                        }}>
                          ẢNH THỰC TẾ
                        </span>
                      </div>
                    </div>

                    {/* Thẻ biển số kết quả AI */}
                    <div style={{
                      backgroundColor: '#F8FAFC',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0'
                    }}>
                      <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '6px', fontWeight: 700 }}>
                        BIỂN SỐ NHẬN DIỆN (VIETOCR):
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        backgroundColor: '#FFFFFF',
                        color: '#0F172A',
                        padding: '4px 14px',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontWeight: 900,
                        fontSize: '22px',
                        border: '2px solid #0F172A',
                        letterSpacing: '1px'
                      }}>
                        {selectedPhoto.plateNumber}
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                          <span>Độ tin cậy AI:</span>
                          <span style={{ color: '#16A34A', fontWeight: 800 }}>{selectedPhoto.confidence}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                          <span>Loại phương tiện:</span>
                          <span style={{ color: '#0284C7', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {selectedPhoto.vehicleType === 'MOTO' ? (
                              <>
                                <IconMoto size={13} color="#0284C7" />
                                <span>Xe máy</span>
                              </>
                            ) : (
                              <>
                                <IconCar size={13} color="#0284C7" />
                                <span>Ô tô</span>
                              </>
                            )}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                          <span>Thời gian chụp/lưu:</span>
                          <span style={{ color: '#0F172A', fontWeight: 700 }}>
                            {formatDetectionTime(selectedPhoto.detectedAt, selectedPhoto.timestamp)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', alignItems: 'center' }}>
                          <span>Lệnh Barie:</span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '5px',
                            backgroundColor: '#DCFCE7',
                            color: '#15803D',
                            border: '1px solid #86EFAC'
                          }}>
                            MỞ TỰ ĐỘNG
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CHẾ ĐỘ 2: PHÓNG TO BIỂN SỐ CỰC ĐẠI (CROP ONLY) */}
              {modalTab === 'CROP' && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '380px',
                  gap: '16px'
                }}>
                  <div style={{
                    width: '100%',
                    maxWidth: '680px',
                    height: '280px',
                    borderRadius: '16px',
                    border: '2px solid #86EFAC',
                    backgroundColor: '#F8FAFC',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(34, 197, 94, 0.1)',
                    padding: '16px'
                  }}>
                    {selectedPhoto.plateCropUrl && (
                      <img
                        src={selectedPhoto.plateCropUrl}
                        alt="Crop biển số cực đại"
                        loading="eager"
                        decoding="async"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          imageRendering: 'crisp-edges'
                        }}
                      />
                    )}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    padding: '6px 20px',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontWeight: 900,
                    fontSize: '26px',
                    border: '2.5px solid #0F172A'
                  }}>
                    {selectedPhoto.plateNumber}
                  </div>
                </div>
              )}

              {/* CHẾ ĐỘ 3: TOÀN CẢNH FULL (FULL ONLY) */}
              {modalTab === 'FULL' && (
                <div style={{
                  width: '100%',
                  height: '480px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <img
                    src={selectedPhoto.snapshotUrl}
                    alt="Toàn cảnh"
                    loading="eager"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC',
              borderTop: '1px solid #E2E8F0',
              fontSize: '12.5px'
            }}>
              <span style={{ color: '#64748B' }}>
                Mã bản ghi: <strong style={{ color: '#0F172A' }}>{selectedPhoto.id}</strong> ({selectedPhoto.note})
              </span>
              <button
                onClick={() => {
                  setSelectedPhoto(null);
                  setCropZoom(1);
                  setModalTab('SPLIT');
                }}
                style={{
                  padding: '7px 20px',
                  background: '#0284C7',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  boxShadow: '0 1px 3px rgba(2, 132, 199, 0.3)',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0369A1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0284C7'; }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default VehicleAccessPanel;
