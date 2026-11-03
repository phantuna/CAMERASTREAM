import type { FC } from 'react';
import { IconGrid, IconTable } from '../../components/SurveillanceIcons';

export type ViewMode = 'GRID' | 'TABLE';

export interface ViewModeToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  activeColor?: string;
  className?: string;
}

export const ViewModeToggle: FC<ViewModeToggleProps> = ({
  viewMode,
  onChange,
  activeColor = '#0284C7',
  className
}) => {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        border: '1px solid #CBD5E1',
        borderRadius: '6px',
        overflow: 'hidden',
        backgroundColor: '#F8FAFC'
      }}
    >
      <button
        type="button"
        onClick={() => onChange('GRID')}
        style={{
          padding: '5px 8px',
          backgroundColor: viewMode === 'GRID' ? activeColor : '#F8FAFC',
          color: viewMode === 'GRID' ? '#FFFFFF' : '#64748B',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease'
        }}
        title="Xem dạng Lưới thẻ"
      >
        <IconGrid size={13} color={viewMode === 'GRID' ? '#FFFFFF' : '#64748B'} />
      </button>

      <button
        type="button"
        onClick={() => onChange('TABLE')}
        style={{
          padding: '5px 8px',
          backgroundColor: viewMode === 'TABLE' ? activeColor : '#F8FAFC',
          color: viewMode === 'TABLE' ? '#FFFFFF' : '#64748B',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease'
        }}
        title="Xem dạng Bảng chi tiết"
      >
        <IconTable size={13} color={viewMode === 'TABLE' ? '#FFFFFF' : '#64748B'} />
      </button>
    </div>
  );
};

export default ViewModeToggle;
