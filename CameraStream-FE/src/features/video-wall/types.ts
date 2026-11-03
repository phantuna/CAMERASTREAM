export type { CameraDto } from '../device-manager/types';

export interface SpotlightAiTrackItem {
  trackId: number;
  bbox: [number, number, number, number];
  vehicleBbox?: [number, number, number, number] | null;
  plate?: string;
  confidence: number;
  inRoi?: boolean;
  module?: 'ALPR' | 'FACE_ID' | 'SAFETY_PPE' | 'FIRE_DETECT' | string;
  type?: string;
  label?: string;
  personName?: string;
  vehicleType?: 'CAR' | 'MOTO' | 'TRUCK' | 'BUS' | 'BICYCLE' | 'PERSON' | string;
  color?: string;
  isViolation?: boolean;
  known?: boolean;
}

export interface CameraAiMetadata {
  tracks: SpotlightAiTrackItem[];
  roi?: [number, number][];
  activeInRoi?: boolean;
  fps?: number;
  frameDim?: { w: number; h: number };
}

export type GridDimension = 1 | 2 | 3 | 4 | 5;
export type ModuleMode = 'VEHICLE' | 'FACE' | 'SAFETY' | 'ALL';
