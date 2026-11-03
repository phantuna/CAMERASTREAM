import type { FC } from 'react';

export interface CardSkeletonProps {
  count?: number;
  minWidth?: number;
}

export const CardSkeleton: FC<CardSkeletonProps> = ({ count = 8, minWidth = 240 }) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
      gap: '14px',
      width: '100%'
    }}>
      <style>{`
        @keyframes csShimmerPulse {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .cs-shimmer-box {
          background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 37%, #F1F5F9 63%);
          background-size: 400% 100%;
          animation: csShimmerPulse 1.4s ease infinite;
        }
      `}</style>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            backgroundColor: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
          }}
        >
          {/* Top image placeholder */}
          <div className="cs-shimmer-box" style={{ width: '100%', height: '140px', position: 'relative' }}>
            {/* Mock badges */}
            <div style={{ position: 'absolute', top: '8px', left: '8px', width: '60px', height: '18px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.6)' }} />
            <div style={{ position: 'absolute', top: '8px', right: '8px', width: '40px', height: '18px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.6)' }} />
          </div>

          {/* Body content */}
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Plate / title banner */}
            <div className="cs-shimmer-box" style={{ width: '100%', height: '36px', borderRadius: '6px' }} />

            {/* Sub-info rows */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="cs-shimmer-box" style={{ width: '55%', height: '12px', borderRadius: '4px' }} />
              <div className="cs-shimmer-box" style={{ width: '30%', height: '12px', borderRadius: '4px' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CardSkeleton;
