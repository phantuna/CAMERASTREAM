import { useRef, useEffect, useState, type FC, type ChangeEvent } from 'react';
import {
  IconFilter,
  IconSearch,
  IconClose,
  IconRefresh
} from '../../../components/SurveillanceIcons';

export interface CameraWallToolbarProps {
  areas: string[];
  selectedArea: string;
  onAreaChange: (area: string) => void;
  totalCamerasCount: number;
  areaCounts: Record<string, number>;
  searchInput: string;
  onSearchChange: (value: string) => void;
  isSearching: boolean;
  gridCols: number;
  gridRows: number;
  onApplyGrid: (cols: number, rows: number) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const CameraWallToolbar: FC<CameraWallToolbarProps> = ({
  areas,
  selectedArea,
  onAreaChange,
  totalCamerasCount,
  areaCounts,
  searchInput,
  onSearchChange,
  isSearching,
  gridCols,
  gridRows,
  onApplyGrid,
  onRefresh,
  isLoading
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [tempCols, setTempCols] = useState<number>(gridCols);
  const [tempRows, setTempRows] = useState<number>(gridRows);

  useEffect(() => {
    setTempCols(gridCols);
    setTempRows(gridRows);
  }, [gridCols, gridRows]);

  // Phím tắt Ctrl+K để focus tìm kiếm
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

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderBottom: '1px solid #E2E8F0',
      padding: '10px 20px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '12px',
      alignItems: 'center'
    }}>
      {/* 1. Lọc địa điểm */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
          <IconFilter size={14} color="#0284C7" />
          Lọc Địa Điểm:
        </span>

        <select
          value={selectedArea}
          onChange={(e) => onAreaChange(e.target.value)}
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #CBD5E1',
            color: '#0F172A',
            padding: '6px 10px',
            borderRadius: '7px',
            fontSize: '12px',
            fontWeight: 600,
            outline: 'none'
          }}
        >
          <option value="ALL">Tất cả địa điểm ({totalCamerasCount} camera)</option>
          {areas.map((loc) => (
            <option key={loc} value={loc}>
              {loc} ({areaCounts[loc] || 0} camera)
            </option>
          ))}
        </select>
      </div>

      {/* 2. Ô tìm kiếm chuẩn Search Flow (Ctrl+K) */}
      <div style={{ flex: 1, minWidth: '240px', maxWidth: '420px', position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: '10px', color: '#94A3B8', fontSize: '13px', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
          {isSearching ? (
            <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '2px solid rgba(2, 132, 199, 0.3)', borderTopColor: '#0284C7', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <IconSearch size={14} color="#64748B" />
          )}
        </span>

        <input
          ref={searchInputRef}
          type="text"
          placeholder="Tìm theo tên camera, IP, địa điểm... (Ctrl+K)"
          value={searchInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: '7px 32px 7px 32px',
            backgroundColor: '#F8FAFC',
            border: searchInput ? '1px solid #0284C7' : '1px solid #CBD5E1',
            borderRadius: '7px',
            color: '#0F172A',
            fontSize: '12px',
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
        />

        {searchInput ? (
          <button
            onClick={() => {
              onSearchChange('');
              searchInputRef.current?.focus();
            }}
            style={{
              position: 'absolute',
              right: '8px',
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Xóa tìm kiếm"
          >
            <IconClose size={13} color="#94A3B8" />
          </button>
        ) : (
          <kbd style={{
            position: 'absolute',
            right: '8px',
            backgroundColor: '#F1F5F9',
            color: '#64748B',
            borderRadius: '4px',
            padding: '2px 5px',
            fontSize: '10px',
            border: '1px solid #E2E8F0',
            pointerEvents: 'none'
          }}>
            Ctrl+K
          </kbd>
        )}
      </div>

      {/* 3. Cấu hình Cột x Hàng ma trận & Bố cục nhanh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Bố cục:</span>
        <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', borderRadius: '7px', padding: '2px', gap: '2px' }}>
          {[
            { label: '1×1', cols: 1, rows: 1 },
            { label: '2×2', cols: 2, rows: 2 },
            { label: '3×3', cols: 3, rows: 3 },
            { label: '4×4', cols: 4, rows: 4 },
            { label: '5×5', cols: 5, rows: 5 },
            { label: '6×6', cols: 6, rows: 6 }
          ].map((preset) => {
            const isActive = gridCols === preset.cols && gridRows === preset.rows;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setTempCols(preset.cols);
                  setTempRows(preset.rows);
                  onApplyGrid(preset.cols, preset.rows);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  border: 'none',
                  backgroundColor: isActive ? '#0284C7' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#475569',
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title={`Hiển thị ${preset.cols * preset.rows} camera`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Custom Input */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
          <input
            type="number"
            min={1}
            max={8}
            value={tempCols}
            onChange={(e) => setTempCols(Math.max(1, Math.min(8, Number(e.target.value))))}
            style={{ width: '38px', padding: '3px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', borderRadius: '5px', textAlign: 'center', fontWeight: 700, fontSize: '11px' }}
            title="Số cột"
          />
          <span style={{ color: '#94A3B8', fontSize: '11px' }}>×</span>
          <input
            type="number"
            min={1}
            max={8}
            value={tempRows}
            onChange={(e) => setTempRows(Math.max(1, Math.min(8, Number(e.target.value))))}
            style={{ width: '38px', padding: '3px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', color: '#0F172A', borderRadius: '5px', textAlign: 'center', fontWeight: 700, fontSize: '11px' }}
            title="Số hàng"
          />
          <button
            onClick={() => onApplyGrid(tempCols, tempRows)}
            style={{ padding: '4px 8px', backgroundColor: '#E2E8F0', color: '#334155', border: 'none', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
          >
            Áp dụng
          </button>
        </div>
      </div>

      {/* 4. Refresh Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            color: '#0284C7',
            borderRadius: '7px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
          title="Tải lại danh sách camera từ Database"
        >
          <IconRefresh size={13} color="#0284C7" style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          <span>{isLoading ? 'Đang tải...' : 'Làm mới DB'}</span>
        </button>
      </div>
    </div>
  );
};

export default CameraWallToolbar;
