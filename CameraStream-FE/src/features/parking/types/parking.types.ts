export type VehicleType = 'CAR' | 'BIKE' | 'TRUCK' | 'OTHER';

export type ParkingSessionStatus = 'ACTIVE' | 'COMPLETED' | 'UNMATCHED_OUT';

export interface ParkingSessionDto {
  id: number;
  sessionCode?: string;
  plateNumber: string;
  vehicleType: VehicleType;
  status: ParkingSessionStatus;

  inTime?: string;
  inLaneId?: number;
  inLaneName?: string;
  inPlateImagePath?: string;
  inOverviewImagePath?: string;

  outTime?: string;
  outLaneId?: number;
  outLaneName?: string;
  outPlateImagePath?: string;
  outOverviewImagePath?: string;

  durationMinutes?: number;
  durationFormatted?: string;

  companyName?: string;
  departmentName?: string;
  contractorName?: string;
  notes?: string;

  createdAt?: string;
  updatedAt?: string;
}

export interface ParkingSessionFilter {
  plateNumber?: string;
  status?: string;
  vehicleType?: string;
  inLaneId?: number;
  outLaneId?: number;
  fromTime?: string;
  toTime?: string;
}

export interface VehicleDto {
  id?: number;
  plateNumber: string;
  vehicleType: VehicleType;
  brand?: string;
  model?: string;
  color?: string;
  companyId?: number;
  companyName?: string;
  departmentId?: number;
  departmentName?: string;
  ownerName?: string;
  ownerPhone?: string;
  active: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleFilter {
  keyword?: string;
  vehicleType?: string;
  companyId?: number;
  departmentId?: number;
  active?: boolean;
}

export interface CompanyDto {
  id?: number;
  code: string;
  name: string;
  taxCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  active: boolean;
  notes?: string;
}

export interface DepartmentDto {
  id?: number;
  companyId?: number;
  companyName?: string;
  code: string;
  name: string;
  active: boolean;
  notes?: string;
}

export interface ContractorDto {
  id?: number;
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  active: boolean;
  notes?: string;
}

export interface LaneDto {
  id?: number;
  laneCode: string;
  laneName: string;
  laneType: 'IN' | 'OUT' | 'BIDIRECTIONAL';
  inCameraId?: number;
  outCameraId?: number;
  active: boolean;
  description?: string;
}

export interface SpringPageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number; // 0-based page index
  first: boolean;
  last: boolean;
  empty: boolean;
}

