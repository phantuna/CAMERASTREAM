import type { FC } from 'react';
import VideoWallView from '../features/video-wall/VideoWallView';
import type { CameraDto } from '../features/device-manager/types';
import type { SpotlightAiTrackItem, ModuleMode } from '../features/video-wall/types';
import { getBackendBaseUrl } from '../shared/utils/envConfig';

export type CameraModulePreset = 'VEHICLE' | 'FACE' | 'SAFETY' | 'FIRE' | 'ALL';

export interface CameraMatrixWallProps {
  preset?: CameraModulePreset;
  apiBaseUrl?: string;
  aiServiceUrl?: string;
  sseUrl?: string;
  moduleMode?: ModuleMode;
  aiType?: string;
  moduleTitle?: string;
  themeColor?: string;
  activeTabOverride?: string;
  hideHeaderTabs?: boolean;
}

const PRESETS_CONFIG: Record<CameraModulePreset, {
  moduleMode: ModuleMode;
  aiType: string;
  defaultPort: number;
  moduleTitle: string;
  themeColor: string;
}> = {
  VEHICLE: {
    moduleMode: 'VEHICLE',
    aiType: 'VEHICLE_ANPR',
    defaultPort: 5000,
    moduleTitle: 'Ma Trận Giám Sát Phương Tiện & Biển Số (ANPR)',
    themeColor: '#0284C7'
  },
  FACE: {
    moduleMode: 'FACE',
    aiType: 'FACE_RECOGNITION',
    defaultPort: 5001,
    moduleTitle: 'Ma Trận Giám Sát Người & Điểm Danh (FaceID)',
    themeColor: '#7C3AED'
  },
  SAFETY: {
    moduleMode: 'SAFETY',
    aiType: 'SAFETY_PPE',
    defaultPort: 5002,
    moduleTitle: 'Ma Trận Giám Sát An Toàn Lao Động & PPE',
    themeColor: '#F59E0B'
  },
  FIRE: {
    moduleMode: 'SAFETY',
    aiType: 'FIRE_SMOKE_DETECT',
    defaultPort: 5003,
    moduleTitle: 'Ma Trận Giám Sát Cảnh Báo Cháy & Khói',
    themeColor: '#EF4444'
  },
  ALL: {
    moduleMode: 'ALL',
    aiType: 'ALL',
    defaultPort: 5000,
    moduleTitle: 'Trung Tâm Giám Sát Đa Phân Hệ Camera Matrix',
    themeColor: '#10B981'
  }
};

export const CameraMatrixWall: FC<CameraMatrixWallProps> = ({
  preset = 'VEHICLE',
  apiBaseUrl = getBackendBaseUrl(),
  aiServiceUrl,
  sseUrl,
  moduleMode,
  aiType
}) => {
  const currentConfig = PRESETS_CONFIG[preset] || PRESETS_CONFIG.VEHICLE;

  const effectiveAiApiBaseUrl = aiServiceUrl || `http://localhost:${currentConfig.defaultPort}`;
  const effectiveSseUrl = sseUrl || `${effectiveAiApiBaseUrl}/tracking-events`;
  const effectiveModuleMode = moduleMode || currentConfig.moduleMode;
  const effectiveAiType = aiType || currentConfig.aiType;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <VideoWallView
        apiBaseUrl={apiBaseUrl}
        aiApiBaseUrl={effectiveAiApiBaseUrl}
        aiSseUrl={effectiveSseUrl}
        moduleMode={effectiveModuleMode}
        aiType={effectiveAiType}
      />
    </div>
  );
};

export default CameraMatrixWall;
export { type CameraDto, type SpotlightAiTrackItem };
