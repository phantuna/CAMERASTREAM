/**
 * Dynamic Environment & URL Resolution Module
 * 
 * Đảm bảo hệ thống tự động nhận diện đúng Host IP khi chạy trên:
 * - Máy Localhost (Dev Server cổng 5173 hoặc 80)
 * - Mạng LAN (Khách truy cập qua 192.168.x.x)
 * - Domain hoặc Docker Container gộp
 */

export const isDev = import.meta.env.DEV;

/**
 * Lấy Hostname hiện tại của máy chủ đang phục vụ trang Web
 */
export function getCurrentHostname(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }
  return 'localhost';
}

/**
 * Lấy Base URL của Spring Boot Backend
 * - Nếu đang chạy Nginx Reverse Proxy (cổng 80 hoặc cổng khác 5173): dùng origin hiện tại
 * - Nếu đang chạy Vite Dev Server (:5173): dùng http://<hostname>:8080
 */
export function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8080';

  const { protocol, hostname, port } = window.location;
  // Nếu đang dev trực tiếp trên Vite port 5173: dùng relative path rỗng để Vite proxy tự forward sang :8080 (tránh hoàn toàn CORS và preflight)
  if (port === '5173') {
    return '';
  }
  // Khi chạy trong Docker Nginx: Backend được reverse proxy qua chính origin hiện tại
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

/**
 * Lấy WebSocket URL kết nối Spring Boot Event Hub
 */
export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8080/ws-camera';

  const { protocol, hostname, port } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  if (port === '5173') {
    return `${wsProto}//${hostname}:8080/ws-camera`;
  }
  return `${wsProto}//${hostname}${port ? `:${port}` : ''}/ws-camera`;
}

/**
 * Lấy Base URL của AI Service (Python)
 */
export function getAiServiceBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:5000';

  const { protocol, hostname, port } = window.location;
  if (port === '5173' || port === '8080') {
    return `${protocol}//${hostname}:5000`;
  }
  // Khi qua Nginx (port 80/443), các endpoint /tracking-events và /api/roi-config được proxy trực tiếp
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

/**
 * Chuẩn hóa URL WebRTC (WHEP) từ MediaMTX
 * Tự động chuyển đổi 'localhost' hoặc '127.0.0.1' thành IP của máy chủ hiện tại
 * để client trong mạng LAN có thể xem mượt mà WebRTC.
 */
export function resolveWebRtcUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl) return '';

  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const currentHost = getCurrentHostname();
  // Nếu URL trỏ tới localhost/127.0.0.1 nhưng client đang mở bằng IP LAN khác
  if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
    return trimmed.replace(/\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, `//${currentHost}$2`);
  }

  return trimmed;
}
