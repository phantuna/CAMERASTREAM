import { useState, useEffect, useRef, type FC, type ReactNode } from 'react';
import {
  IconSearch,
  IconClose,
  IconCalendar,
  IconRefresh,
  IconFilter,
  IconChevronDown
} from './SurveillanceIcons';
import { ExportExcelButton, type ExportProgressCallback } from '../shared/components/ExportExcelButton';

export interface HistoryTimeFilter {
  /** Ngày bắt đầu định dạng YYYY-MM-DD */
  startDate: string;
  /** Ngày kết thúc định dạng YYYY-MM-DD */
  endDate: string;
  /** Giờ bắt đầu định dạng HH:mm */
  startTime: string;
  /** Giờ kết thúc định dạng HH:mm */
  endTime: string;
  /** Từ khóa tìm kiếm (biển số, tên nhân sự, camera, ...) */
  searchQuery: string;
  /** Bộ lọc phân loại phụ (VD: 'ALL' | 'CAR' | 'MOTO' hoặc 'ALL' | 'EMPLOYEE' | 'STRANGER') */
  categoryFilter: string;
  /** Chuỗi ISO tương ứng */
  startIso?: string;
  endIso?: string;
}

export interface TypeOption {
  value: string;
  label: string;
  icon?: FC<{ size?: number; color?: string }>;
}

export interface HistoryFilterBarProps {
  /** Tiêu đề thanh lọc */
  title?: string;
  /** Màu chủ đạo theo module (VD: #0284C7 cho ANPR, #7C3AED cho FaceID) */
  themeColor?: string;
  /** Placeholder cho ô tìm kiếm từ khóa */
  searchPlaceholder?: string;
  /** Danh sách bộ lọc phân loại phụ */
  categoryOptions?: TypeOption[];
  /** Giá trị mặc định */
  initialValues?: Partial<HistoryTimeFilter>;
  /** Callback kích hoạt khi bộ lọc thay đổi */
  onFilterChange: (filters: HistoryTimeFilter) => void;
  /** Callback làm mới dữ liệu */
  onRefresh?: () => void;
  /** Trạng thái đang tải dữ liệu */
  loading?: boolean;
  /** Tổng số kết quả tìm thấy */
  totalResults?: number;
  /** Tên danh mục kết quả (VD: "lượt xe", "sự kiện", "lượt vào/ra") */
  resultLabel?: string;
  /** Các nút hành động bổ sung (VD: Xuất CSV, Chế độ Lưới/Bảng) */
  extraActions?: ReactNode;
  /** Callback xuất Excel (hỗ trợ tiến độ chia chunk 500 dòng) – nếu có sẽ hiện nút Xuất Excel ở khối bên phải */
  onExport?: (onProgress: ExportProgressCallback) => Promise<void> | void;
  /** Text cho nút xuất (mặc định: "Xuất Excel") */
  exportButtonText?: string;
}

const getFormattedDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * ============================================================================
 * COMPACT SLIM HISTORY FILTER BAR (OPTIMIZED UX/UI & LCP READY)
 * ============================================================================
 * Thiết kế phẳng (Flat), tinh gọn, chiều cao chỉ 52px, không lồng card rườm rà.
 * Dữ liệu xuất hiện ngay trong tầm nhìn (Above-the-fold) mà không cần cuộn chuột.
 */
export const HistoryFilterBar: FC<HistoryFilterBarProps> = ({
  themeColor = '#0284C7',
  searchPlaceholder = 'Tìm biển số, họ tên, camera...',
  categoryOptions,
  initialValues,
  onFilterChange,
  onRefresh,
  loading = false,
  totalResults,
  resultLabel = 'bản ghi',
  extraActions,
  onExport,
  exportButtonText = 'Xuất Excel'
}) => {
  const todayStr = getFormattedDate(new Date());

  const [startDate, setStartDate] = useState<string>(initialValues?.startDate || todayStr);
  const [endDate, setEndDate] = useState<string>(initialValues?.endDate || todayStr);
  const [startTime, setStartTime] = useState<string>(initialValues?.startTime || '00:00');
  const [endTime, setEndTime] = useState<string>(initialValues?.endTime || '23:59');

  const [searchInput, setSearchInput] = useState<string>(initialValues?.searchQuery || '');
  const [debouncedSearch, setDebouncedSearch] = useState<string>(initialValues?.searchQuery || '');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<string>(initialValues?.categoryFilter || 'ALL');

  // Shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounce 300ms
  useEffect(() => {
    if (!searchInput.trim()) {
      setDebouncedSearch('');
      setIsTyping(false);
      return;
    }
    setIsTyping(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setIsTyping(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const lastEmittedFilterRef = useRef<string>('');

  useEffect(() => {
    let startIso: string | undefined;
    let endIso: string | undefined;
    try {
      if (startDate) {
        startIso = new Date(`${startDate}T${startTime || '00:00'}:00`).toISOString();
      }
      if (endDate) {
        endIso = new Date(`${endDate}T${endTime || '23:59'}:59`).toISOString();
      }
    } catch {
      // ignore
    }

    const nextFilter: HistoryTimeFilter = {
      startDate,
      endDate,
      startTime,
      endTime,
      searchQuery: debouncedSearch,
      categoryFilter: category,
      startIso,
      endIso
    };

    const nextFilterJson = JSON.stringify(nextFilter);
    if (lastEmittedFilterRef.current === nextFilterJson) {
      return;
    }
    lastEmittedFilterRef.current = nextFilterJson;

    onFilterChange(nextFilter);
  }, [startDate, endDate, startTime, endTime, debouncedSearch, category, onFilterChange]);

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: '10px',
      padding: '8px 12px',
      marginBottom: '14px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none'
    }}>
      {/* 1. KHỐI TRÁI: TÌM KIẾM + PHÂN LOẠI + CHỌN NGÀY GIỜ TRỰC TIẾP */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0
      }}>
        {/* 1.1 Ô TÌM KIẾM TỪ KHÓA COMPACT */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '170px',
          minWidth: '130px'
        }}>
          <span style={{
            position: 'absolute',
            left: '8px',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none'
          }}>
            {isTyping ? (
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                border: `2px solid ${themeColor}33`,
                borderTopColor: themeColor,
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block'
              }} />
            ) : (
              <IconSearch size={13} color="#64748B" />
            )}
          </span>

          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: '100%',
              padding: searchInput ? '5px 24px 5px 26px' : '5px 44px 5px 26px',
              backgroundColor: '#F8FAFC',
              border: `1px solid ${isTyping || searchInput ? themeColor : '#CBD5E1'}`,
              borderRadius: '6px',
              fontSize: '11px',
              color: '#0F172A',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease'
            }}
          />

          {searchInput ? (
            <button
              onClick={() => {
                setSearchInput('');
                searchInputRef.current?.focus();
              }}
              style={{
                position: 'absolute',
                right: '5px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94A3B8',
                padding: '2px',
                display: 'flex'
              }}
              title="Xóa tìm kiếm"
            >
              <IconClose size={12} />
            </button>
          ) : (
            <kbd style={{
              position: 'absolute',
              right: '5px',
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              borderRadius: '4px',
              padding: '1px 4px',
              fontSize: '9px',
              fontWeight: 600,
              border: '1px solid #CBD5E1',
              pointerEvents: 'none',
              fontFamily: 'monospace'
            }}>
              Ctrl+K
            </kbd>
          )}
        </div>

        {/* 1.2 DROPDOWN PHÂN LOẠI ĐỐI TƯỢNG (CATEGORY DROPDOWN) */}
        {categoryOptions && categoryOptions.length > 0 && (
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            <span style={{
              position: 'absolute',
              left: '7px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 1
            }}>
              <IconFilter size={11} color={category !== 'ALL' ? themeColor : '#64748B'} />
            </span>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                padding: '5px 16px 5px 20px',
                backgroundColor: category !== 'ALL' ? `${themeColor}10` : '#F8FAFC',
                border: `1px solid ${category !== 'ALL' ? themeColor : '#CBD5E1'}`,
                borderRadius: '6px',
                fontSize: '10.5px',
                fontWeight: category !== 'ALL' ? 700 : 500,
                color: category !== 'ALL' ? themeColor : '#334155',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
              title="Lọc theo phân loại đối tượng"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value === 'ALL' ? 'Tất cả loại' : opt.label}
                </option>
              ))}
            </select>

            <span style={{
              position: 'absolute',
              right: '5px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none'
            }}>
              <IconChevronDown size={11} color={category !== 'ALL' ? themeColor : '#94A3B8'} />
            </span>
          </div>
        )}

        {/* 1.3 CỤM CHỌN NGÀY & GIỜ TRỰC TIẾP (MẶC ĐỊNH HÔM NAY) */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          backgroundColor: '#F8FAFC',
          border: '1px solid #CBD5E1',
          borderRadius: '6px',
          padding: '3px 6px',
          fontSize: '11.5px',
          flexShrink: 0
        }}>
          <IconCalendar size={13} color={themeColor} style={{ flexShrink: 0, marginRight: '2px' }} />

          {/* Ngày Bắt Đầu */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontSize: '11.5px',
              color: '#0F172A',
              outline: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              width: '120px'
            }}
            title="Từ ngày"
          />

          {/* Giờ Bắt Đầu */}
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={{
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontSize: '11.5px',
              color: '#475569',
              outline: 'none',
              cursor: 'pointer',
              padding: '2px 3px',
              width: '84px'
            }}
            title="Từ giờ"
          />

          <span style={{ color: '#94A3B8', margin: '0 2px', fontWeight: 700, fontSize: '11.5px' }}>→</span>

          {/* Ngày Kết Thúc */}
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontSize: '11.5px',
              color: '#0F172A',
              outline: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              width: '120px'
            }}
            title="Đến ngày"
          />

          {/* Giờ Kết Thúc */}
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={{
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              backgroundColor: '#FFFFFF',
              fontSize: '11.5px',
              color: '#475569',
              outline: 'none',
              cursor: 'pointer',
              padding: '2px 3px',
              width: '84px'
            }}
            title="Đến giờ"
          />
        </div>
      </div>

      {/* 2. KHỐI PHẢI: KẾT QUẢ + ĐẶT LẠI + LÀM MỚI + EXTRA ACTIONS */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0
      }}>
        {totalResults !== undefined && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '3px 6px',
            borderRadius: '6px',
            backgroundColor: `${themeColor}12`,
            border: `1px solid ${themeColor}30`,
            fontSize: '10.5px',
            fontWeight: 600,
            color: themeColor,
            whiteSpace: 'nowrap'
          }}>
            <strong style={{ fontSize: '11px' }}>{totalResults}</strong>
            <span>{resultLabel}</span>
          </div>
        )}

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#334155',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Làm mới danh sách dữ liệu"
          >
            <IconRefresh size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Làm mới</span>
          </button>
        )}

        {onExport && (
          <ExportExcelButton
            onExport={onExport}
            buttonText={exportButtonText}
          />
        )}

        {extraActions}
      </div>
    </div>
  );
};

export default HistoryFilterBar;
