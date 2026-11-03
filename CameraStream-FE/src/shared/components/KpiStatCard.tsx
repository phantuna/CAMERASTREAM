import type { FC, ReactNode } from 'react';

export interface KpiStatCardProps {
  title: string;
  value: number | string;
  sublabel?: string;
  icon?: FC<{ size?: number; color?: string }> | ReactNode;
  color?: string;
  bgColor?: string;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export const KpiStatCard: FC<KpiStatCardProps> = ({
  title,
  value,
  sublabel,
  icon: IconComponent,
  color = '#0284C7',
  bgColor,
  isActive = false,
  onClick,
  className
}) => {
  const activeBg = bgColor || `${color}0F`; // 6% opacity
  const activeBorder = color;
  const activeShadow = `0 2px 8px ${color}20`;

  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        backgroundColor: isActive ? activeBg : '#FFFFFF',
        border: `1.5px solid ${isActive ? activeBorder : '#E2E8F0'}`,
        borderRadius: '9px',
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        boxShadow: isActive ? activeShadow : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: color,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          {title}
        </span>
        {IconComponent && (
          <div
            style={{
              padding: '5px',
              borderRadius: '7px',
              backgroundColor: `${color}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {typeof IconComponent === 'function' ? (
              <IconComponent size={15} color={color} />
            ) : (
              IconComponent
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
          {value}
        </span>
        {sublabel && (
          <span style={{ fontSize: '11.5px', color: '#64748B' }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};

export default KpiStatCard;
