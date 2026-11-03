import type { FC } from 'react';

export interface VideoWallSkeletonProps {
  cols: number;
  rows: number;
}

export const VideoWallSkeleton: FC<VideoWallSkeletonProps> = ({ cols, rows }) => {
  const total = cols * rows;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: '10px',
        backgroundColor: '#070B11',
        padding: '10px',
        borderRadius: '8px',
        border: '1px solid #1E293B',
        width: '100%'
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'relative',
            backgroundColor: '#0F172A',
            borderRadius: '6px',
            border: '1px solid #1E293B',
            aspectRatio: '16 / 9',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '10px'
          }}
        >
          {/* Top badges shimmer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <div style={{ width: '55px', height: '16px', borderRadius: '4px', backgroundColor: '#1E293B', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
          </div>

          {/* Center icon placeholder */}
          <div style={{ alignSelf: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#1E293B', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />

          {/* Bottom title shimmer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: '60%', height: '14px', borderRadius: '4px', backgroundColor: '#1E293B', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
            <div style={{ width: '25px', height: '12px', borderRadius: '4px', backgroundColor: '#1E293B', animation: 'skeletonPulse 1.5s infinite ease-in-out' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default VideoWallSkeleton;
