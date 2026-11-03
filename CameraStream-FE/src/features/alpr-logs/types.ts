export interface RealDetectionEvent {
  id: string;
  cameraId?: number;
  cameraName?: string;
  plateNumber?: string;
  vehicleType?: 'CAR' | 'MOTO' | 'TRUCK' | 'BUS' | string;
  confidence?: number;
  snapshotUrl?: string;
  plateCropUrl?: string;
  timestamp?: string;
  location?: string;
  detectedAt?: string;
  gateName?: string;
  gateType?: string;
  laneDirection?: 'IN' | 'OUT' | string;
  laneId?: number | string;
  status?: string;
  ticketCode?: string;
  note?: string;
  personName?: string;
  isViolation?: boolean;
}
