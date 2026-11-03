export interface CameraDto {
  id: number;
  name: string;
  ipAddress: string;
  onvifPort?: number;
  rtspPort?: number;
  username?: string;
  password?: string;
  streamPath: string;
  type: string;
  location: string;
  status: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';
  lastError?: string;
  rtspSourceUrl?: string;
  rtspSubStreamUrl?: string;
  webrtcUrl: string;
  hlsUrl: string;
  rtspRelayUrl: string;
  snapshotApiUrl: string;
  activeAiModules?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export type AiFilterType = 'ALL' | 'VEHICLE_ANPR' | 'FACE_RECOGNITION' | 'INTRUSION_ROI' | 'NONE';
