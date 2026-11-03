import type { ApiResponse } from '../../components/CameraStreamView';
import { getBackendBaseUrl } from '../../shared/utils/envConfig';

export interface GateDto {
  id: number;
  code: string;
  name: string;
  location: string;
  description: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GateInput {
  code: string;
  name: string;
  location?: string;
  description?: string;
  active?: boolean;
}

export async function listGates(apiBaseUrl?: string): Promise<GateDto[]> {
  const base = apiBaseUrl ?? getBackendBaseUrl();
  const res = await fetch(`${base}/api/gates`);
  const json = (await res.json()) as ApiResponse<GateDto[] | null>;
  if (!res.ok || !Array.isArray(json.data)) {
    throw new Error(json.message || 'Không tải được danh mục Làn Cổng.');
  }
  return json.data;
}

export async function createGate(input: GateInput, apiBaseUrl?: string): Promise<GateDto> {
  const base = apiBaseUrl ?? getBackendBaseUrl();
  const res = await fetch(`${base}/api/gates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const json = (await res.json()) as ApiResponse<GateDto>;
  if (json.code !== 200) {
    throw new Error(json.message || 'Không tạo được Làn Cổng.');
  }
  return json.data;
}

export async function updateGate(
  id: number,
  input: Partial<GateInput>,
  apiBaseUrl?: string
): Promise<GateDto> {
  const base = apiBaseUrl ?? getBackendBaseUrl();
  const res = await fetch(`${base}/api/gates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const json = (await res.json()) as ApiResponse<GateDto>;
  if (json.code !== 200) {
    throw new Error(json.message || 'Không cập nhật được Làn Cổng.');
  }
  return json.data;
}

export async function deleteGate(id: number, apiBaseUrl?: string): Promise<void> {
  const base = apiBaseUrl ?? getBackendBaseUrl();
  const res = await fetch(`${base}/api/gates/${id}`, { method: 'DELETE' });
  const json = (await res.json()) as ApiResponse<null>;
  if (json.code !== 200) {
    throw new Error(json.message || 'Không xóa được Làn Cổng.');
  }
}
