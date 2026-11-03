import type { FC } from 'react';
import VideoWallView from './VideoWallView';

export interface VideoWallModuleProps {
  apiBaseUrl: string;
}

export const VideoWallModule: FC<VideoWallModuleProps> = ({ apiBaseUrl }) => {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <VideoWallView
        apiBaseUrl={apiBaseUrl}
        moduleMode="VEHICLE"
      />
    </div>
  );
};

export default VideoWallModule;
