import type { FC } from 'react';

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  colWidths?: string[];
}

export const TableSkeleton: FC<TableSkeletonProps> = ({
  rows = 6,
  cols = 6,
  colWidths
}) => {
  return (
    <div style={{
      width: '100%',
      border: '1px solid #E2E8F0',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
    }}>
      <style>{`
        @keyframes csTableShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .cs-table-shimmer {
          background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 37%, #F1F5F9 63%);
          background-size: 400% 100%;
          animation: csTableShimmer 1.4s ease infinite;
        }
      `}</style>

      {/* Header Placeholder */}
      <div style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0'
      }}>
        {Array.from({ length: cols }).map((_, cIdx) => (
          <div
            key={cIdx}
            className="cs-table-shimmer"
            style={{
              width: colWidths?.[cIdx] || (cIdx === 0 ? '48px' : '100%'),
              flex: colWidths?.[cIdx] ? 'none' : 1,
              height: '14px',
              borderRadius: '4px'
            }}
          />
        ))}
      </div>

      {/* Rows Placeholder */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div
            key={rIdx}
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: rIdx === rows - 1 ? 'none' : '1px solid #F1F5F9',
              backgroundColor: rIdx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
            }}
          >
            {Array.from({ length: cols }).map((_, cIdx) => (
              <div
                key={cIdx}
                className="cs-table-shimmer"
                style={{
                  width: colWidths?.[cIdx] || (cIdx === 0 ? '48px' : '100%'),
                  flex: colWidths?.[cIdx] ? 'none' : 1,
                  height: cIdx === 1 ? '32px' : '16px',
                  borderRadius: cIdx === 1 ? '6px' : '4px'
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableSkeleton;
