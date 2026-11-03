import type { FC, ReactNode } from 'react';
import type { IconProps } from '../components/SurveillanceIcons';

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface SystemEvent {
  id: number;
  eventType: string; // 'VEHICLE_ANPR' | 'FACE_RECOGNITION' | 'INTRUSION' | 'SMOKE_FIRE' | string
  moduleSource: string;
  cameraId?: number;
  cameraName?: string;
  snapshotUrl?: string;
  confidence?: number;
  severity: EventSeverity;
  payload?: any;
  acknowledged?: boolean;
  createdAt: string;
}

export interface SubModuleItem {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  permission?: string;
  render: (props: { apiBaseUrl: string }) => ReactNode;
}

export interface AppModuleConfig {
  id: string;
  label: string;
  sublabel: string;
  icon: FC<IconProps>;
  badge?: string;
  badgeColor?: string;
  enabled?: boolean;
  order?: number;
  permission?: string;
  children?: SubModuleItem[];
  render?: (props: { apiBaseUrl: string; activeSubId?: string }) => ReactNode;
}

