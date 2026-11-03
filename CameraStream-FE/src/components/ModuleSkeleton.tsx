import type { FC } from 'react';

interface ModuleSkeletonProps {
  type?: 'grid' | 'table';
}

export const ModuleSkeleton: FC<ModuleSkeletonProps> = ({ type = 'grid' }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      overflow: 'hidden',
      backgroundColor: '#F8FAFC'
    }}>
      <style>{`
        @keyframes skeletonShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .cs-skeleton-shimmer {
          background: linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 37%, #E2E8F0 63%);
          background-size: 400% 100%;
          animation: skeletonShimmer 1.5s ease infinite;
        }
      `}</style>

      {/* Top Header Placeholder */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        padding: '16px 20px',
        borderRadius: '14px',
        border: '1px solid #E2E8F0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="cs-skeleton-shimmer" style={{ width: '42px', height: '42px', borderRadius: '12px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="cs-skeleton-shimmer" style={{ width: '220px', height: '18px', borderRadius: '6px' }} />
            <div className="cs-skeleton-shimmer" style={{ width: '320px', height: '12px', borderRadius: '4px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="cs-skeleton-shimmer" style={{ width: '100px', height: '36px', borderRadius: '8px' }} />
          <div className="cs-skeleton-shimmer" style={{ width: '120px', height: '36px', borderRadius: '8px' }} />
        </div>
      </div>

      {/* Content Area Placeholder */}
      {type === 'grid' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '16px',
          flex: 1,
          overflow: 'hidden'
        }}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div className="cs-skeleton-shimmer" style={{ width: '100%', height: '200px' }} />
              <div style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className="cs-skeleton-shimmer" style={{ width: '140px', height: '14px', borderRadius: '4px' }} />
                  <div className="cs-skeleton-shimmer" style={{ width: '90px', height: '10px', borderRadius: '4px' }} />
                </div>
                <div className="cs-skeleton-shimmer" style={{ width: '60px', height: '24px', borderRadius: '6px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '20px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="cs-skeleton-shimmer" style={{ flex: 1, height: '16px', borderRadius: '4px' }} />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
              {Array.from({ length: 5 }).map((_, cIdx) => (
                <div key={cIdx} className="cs-skeleton-shimmer" style={{ flex: 1, height: '14px', borderRadius: '4px' }} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModuleSkeleton;
