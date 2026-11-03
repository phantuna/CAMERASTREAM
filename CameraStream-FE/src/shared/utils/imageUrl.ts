/**
 * Chuẩn hoá URL ảnh snapshot về dạng tuyệt đối để <img src> load được.
 *
 * Ảnh giờ được lưu ra file và tham chiếu bằng URL, thay vì nhúng base64.
 * Backend trả về URL tuyệt đối (http://localhost:8080/snapshots/xxx.jpg), nhưng
 * dữ liệu cũ hoặc dữ liệu từ AI service có thể còn dạng tương đối (/snapshots/xxx.jpg)
 * hoặc data URL (data:image/jpeg;base64,...).
 */

import { getBackendBaseUrl, getAiServiceBaseUrl } from './envConfig';

/** Base URL của AI service Python, dùng để gắn tiền tố cho URL tương đối. */
export const AI_SERVICE_BASE_URL = getAiServiceBaseUrl();

/**
 * Base URL của Spring Boot backend.
 *
 * Ảnh snapshot được phục vụ từ đây (`/snapshots/{name}`), và Event Hub là
 * nguồn sự thật cho danh sách phát hiện.
 */
export const BACKEND_BASE_URL = getBackendBaseUrl();

/**
 * Trả về URL ảnh dùng được cho thẻ <img>.
 *
 * @param url giá trị URL ảnh từ backend
 * @param baseUrl base URL dùng để gắn tiền tố khi `url` là URL tương đối
 * @returns URL tuyệt đối, hoặc chuỗi rỗng nếu không có ảnh
 */
export function resolveImageUrl(url: string | undefined | null, baseUrl?: string): string {
  if (!url) return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  // Đã là data URL hoặc URL tuyệt đối -> giữ nguyên
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // URL tương đối -> gắn base URL
  const prefix = (baseUrl || AI_SERVICE_BASE_URL).replace(/\/+$/, '');
  return `${prefix}/${trimmed.replace(/^\/+/, '')}`;
}
