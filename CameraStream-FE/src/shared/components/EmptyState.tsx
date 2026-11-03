import type { FC, ReactNode } from 'react';
import { IconSearch, IconClose } from '../../components/SurveillanceIcons';

export interface EmptyStateProps {
  icon?: FC<{ size?: number; color?: string }>;
  title?: string;
  description?: string;
  searchQuery?: string;
  onClearSearch?: () => void;
  actionText?: string;
  onAction?: () => void;
  extraContent?: ReactNode;
}

export const EmptyState: FC<EmptyStateProps> = ({
  icon: IconComponent = IconSearch,
  title,
  description,
  searchQuery,
  onClearSearch,
  actionText,
  onAction,
  extraContent
}) => {
  const isSearchEmpty = Boolean(searchQuery && searchQuery.trim());

  return (
    <div style={{
      padding: '48px 24px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px'
    }}>
      {/* Icon Circle */}
      <div style={{
        width: '54px',
        height: '54px',
        borderRadius: '50%',
        backgroundColor: '#F1F5F9',
        border: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '4px'
      }}>
        <IconComponent size={26} color="#64748B" />
      </div>

      {/* Title */}
      <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A', maxWidth: '460px' }}>
        {title || (
          isSearchEmpty
            ? `Không tìm thấy kết quả nào phù hợp với "${searchQuery}"`
            : 'Chưa có dữ liệu nào'
        )}
      </div>

      {/* Description */}
      <div style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '420px', lineHeight: 1.5 }}>
        {description || (
          isSearchEmpty
            ? 'Hãy thử kiểm tra lại lỗi chính tả hoặc tìm kiếm với từ khóa ngắn gọn hơn.'
            : 'Dữ liệu sẽ tự động hiển thị tại đây khi hệ thống ghi nhận sự kiện mới.'
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '6px' }}>
        {isSearchEmpty && onClearSearch && (
          <button
            onClick={onClearSearch}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              backgroundColor: '#0284C7',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(2, 132, 199, 0.2)',
              transition: 'all 0.15s ease'
            }}
          >
            <IconClose size={13} color="#FFF" />
            <span>Xóa bộ lọc tìm kiếm</span>
          </button>
        )}

        {actionText && onAction && (
          <button
            onClick={onAction}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {actionText}
          </button>
        )}
      </div>

      {extraContent}
    </div>
  );
};

export default EmptyState;
