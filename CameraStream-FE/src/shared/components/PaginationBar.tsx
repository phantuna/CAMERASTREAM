import type { FC } from 'react';
import { IconChevronLeft, IconChevronRight } from '../../components/SurveillanceIcons';

export interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  activeColor?: string;
  className?: string;
}

export const PaginationBar: FC<PaginationBarProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  itemLabel = 'sự kiện',
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [12, 24, 48],
  activeColor = '#0284C7',
  className
}) => {
  if (totalItems <= 0) return null;

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  // Tính toán dãy trang thông minh (tối đa 7 nút)
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  const pages = getPageNumbers();

  return (
    <div
      className={className}
      style={{
        marginTop: '16px',
        padding: '12px 16px',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px'
      }}
    >
      {/* Thông tin số lượng bản ghi & chọn PageSize */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '12px', color: '#64748B' }}>
          Hiển thị{' '}
          <strong style={{ color: '#0F172A' }}>
            {startIdx} - {endIdx}
          </strong>{' '}
          trên tổng số <strong style={{ color: activeColor }}>{totalItems}</strong> {itemLabel}
        </div>

        {onPageSizeChange && pageSizeOptions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>•</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                padding: '4px 6px',
                fontSize: '11.5px',
                color: '#334155',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '5px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / trang
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Cụm nút chuyển trang */}
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
        {/* Nút Trước */}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 10px',
            backgroundColor: currentPage <= 1 ? '#F1F5F9' : '#FFFFFF',
            color: currentPage <= 1 ? '#94A3B8' : '#334155',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            fontSize: '11.5px',
            fontWeight: 500,
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Trang trước"
        >
          <IconChevronLeft size={13} />
          <span>Trước</span>
        </button>

        {/* Các số trang */}
        {pages.map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`dots-${idx}`} style={{ color: '#94A3B8', fontSize: '12px', padding: '0 4px' }}>
                ...
              </span>
            );
          }

          const pageNum = Number(p);
          const isActive = currentPage === pageNum;

          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isActive ? activeColor : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#334155',
                border: `1px solid ${isActive ? activeColor : '#CBD5E1'}`,
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {pageNum}
            </button>
          );
        })}

        {/* Nút Sau */}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 10px',
            backgroundColor: currentPage >= totalPages ? '#F1F5F9' : '#FFFFFF',
            color: currentPage >= totalPages ? '#94A3B8' : '#334155',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            fontSize: '11.5px',
            fontWeight: 500,
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Trang sau"
        >
          <span>Sau</span>
          <IconChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

export default PaginationBar;
