import type {
  ParkingSessionDto,
  ParkingSessionFilter,
  VehicleDto,
  VehicleFilter,
  CompanyDto,
  DepartmentDto,
  ContractorDto,
  LaneDto,
  SpringPageResponse
} from '../types/parking.types';

// Helper build query string
function toQueryString(params: Record<string, any>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      q.append(key, String(val));
    }
  }
  const str = q.toString();
  return str ? `?${str}` : '';
}

// ==========================================
// PARKING SESSIONS
// ==========================================

export async function fetchParkingSessions(
  baseUrl: string,
  filter: ParkingSessionFilter,
  page: number,
  size: number
): Promise<SpringPageResponse<ParkingSessionDto>> {
  const query = toQueryString({
    ...filter,
    page,
    size
  });
  const res = await fetch(`${baseUrl}/api/v1/parking-sessions${query}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Lỗi tải lịch sử xe`);
  const json = await res.json();
  return json.data;
}

export async function fetchParkingSessionById(baseUrl: string, id: number): Promise<ParkingSessionDto> {
  const res = await fetch(`${baseUrl}/api/v1/parking-sessions/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Lỗi tải chi tiết phiên`);
  const json = await res.json();
  return json.data;
}

export function getExportParkingSessionsUrl(baseUrl: string, filter: ParkingSessionFilter): string {
  const query = toQueryString(filter);
  return `${baseUrl}/api/v1/parking-sessions/export-excel${query}`;
}

// ==========================================
// VEHICLES
// ==========================================

export async function fetchVehicles(
  baseUrl: string,
  filter: VehicleFilter,
  page: number,
  size: number
): Promise<SpringPageResponse<VehicleDto>> {
  const query = toQueryString({
    ...filter,
    page,
    size
  });
  const res = await fetch(`${baseUrl}/api/v1/vehicles${query}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Lỗi tải danh bạ phương tiện`);
  const json = await res.json();
  return json.data;
}

export async function createVehicle(baseUrl: string, dto: VehicleDto): Promise<VehicleDto> {
  const res = await fetch(`${baseUrl}/api/v1/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include'
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) {
    throw new Error(json.message || `HTTP ${res.status}: Thêm phương tiện thất bại`);
  }
  return json.data;
}

export async function updateVehicle(baseUrl: string, id: number, dto: VehicleDto): Promise<VehicleDto> {
  const res = await fetch(`${baseUrl}/api/v1/vehicles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include'
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) {
    throw new Error(json.message || `HTTP ${res.status}: Cập nhật phương tiện thất bại`);
  }
  return json.data;
}

export async function deleteVehicle(baseUrl: string, id: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/vehicles/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Xóa phương tiện thất bại`);
}

export function getExportVehiclesUrl(baseUrl: string, filter: VehicleFilter): string {
  const query = toQueryString(filter);
  return `${baseUrl}/api/v1/vehicles/export-excel${query}`;
}

// ==========================================
// ORGANIZATIONS (Companies, Departments, Contractors)
// ==========================================

export async function fetchCompanies(baseUrl: string): Promise<CompanyDto[]> {
  const res = await fetch(`${baseUrl}/api/v1/organizations/companies`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Lỗi tải danh sách công ty`);
  const json = await res.json();
  return json.data || [];
}

export async function saveCompany(baseUrl: string, dto: CompanyDto): Promise<CompanyDto> {
  const isEdit = Boolean(dto.id);
  const url = isEdit ? `${baseUrl}/api/v1/organizations/companies/${dto.id}` : `${baseUrl}/api/v1/organizations/companies`;
  const res = await fetch(url, {
    method: isEdit ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include'
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) throw new Error(json.message || `HTTP ${res.status}`);
  return json.data;
}

export async function deleteCompany(baseUrl: string, id: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/organizations/companies/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Xóa công ty thất bại`);
}

export async function fetchDepartments(baseUrl: string, companyId?: number): Promise<DepartmentDto[]> {
  const query = companyId ? `?companyId=${companyId}` : '';
  const res = await fetch(`${baseUrl}/api/v1/organizations/departments${query}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Lỗi tải danh sách phòng ban`);
  const json = await res.json();
  return json.data || [];
}

export async function saveDepartment(baseUrl: string, dto: DepartmentDto): Promise<DepartmentDto> {
  const isEdit = Boolean(dto.id);
  const url = isEdit ? `${baseUrl}/api/v1/organizations/departments/${dto.id}` : `${baseUrl}/api/v1/organizations/departments`;
  const res = await fetch(url, {
    method: isEdit ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include'
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) throw new Error(json.message || `HTTP ${res.status}`);
  return json.data;
}

export async function deleteDepartment(baseUrl: string, id: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/organizations/departments/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Xóa phòng ban thất bại`);
}

export async function fetchContractors(baseUrl: string): Promise<ContractorDto[]> {
  const res = await fetch(`${baseUrl}/api/v1/organizations/contractors`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Lỗi tải danh sách nhà thầu`);
  const json = await res.json();
  return json.data || [];
}

export async function saveContractor(baseUrl: string, dto: ContractorDto): Promise<ContractorDto> {
  const isEdit = Boolean(dto.id);
  const url = isEdit ? `${baseUrl}/api/v1/organizations/contractors/${dto.id}` : `${baseUrl}/api/v1/organizations/contractors`;
  const res = await fetch(url, {
    method: isEdit ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include'
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) throw new Error(json.message || `HTTP ${res.status}`);
  return json.data;
}

export async function deleteContractor(baseUrl: string, id: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/organizations/contractors/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Xóa nhà thầu thất bại`);
}

// ==========================================
// LANES
// ==========================================

export async function fetchLanes(baseUrl: string): Promise<LaneDto[]> {
  const res = await fetch(`${baseUrl}/api/v1/parking-lanes`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Lỗi tải cấu hình làn xe`);
  const json = await res.json();
  return json.data || [];
}

export async function saveLane(baseUrl: string, dto: LaneDto): Promise<LaneDto> {
  const isEdit = Boolean(dto.id);
  const url = isEdit ? `${baseUrl}/api/v1/parking-lanes/${dto.id}` : `${baseUrl}/api/v1/parking-lanes`;
  const res = await fetch(url, {
    method: isEdit ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include'
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) throw new Error(json.message || `HTTP ${res.status}`);
  return json.data;
}

export async function deleteLane(baseUrl: string, id: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/parking-lanes/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Xóa làn thất bại`);
}

