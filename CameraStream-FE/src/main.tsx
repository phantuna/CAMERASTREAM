import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// TỰ ĐỘNG ĐÍNH KÈM BEARER TOKEN & COOKIE CREDENTIALS CHO BACKEND API (ADR 0008)
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = typeof input === 'string' 
    ? input 
    : (input instanceof URL ? input.href : (input instanceof Request ? input.url : ''));

  // BỎ QUA các yêu cầu tới MediaMTX (WHEP/WHIP port 8889) hoặc AI Service (port 5000 / api/roi-config) để tránh vi phạm CORS credentials wildcard (*)
  const isExcluded = urlStr.includes(':8889') || urlStr.includes('/whep') || urlStr.includes('/whip') || urlStr.includes(':5000') || urlStr.includes('/api/roi-config');
  if (isExcluded) {
    return originalFetch(input, init);
  }

  // Chỉ gắn token và credentials cho API backend của hệ thống
  const token = localStorage.getItem('camerastream_token');
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const reqInit: RequestInit = {
    ...init,
    headers,
    credentials: init?.credentials || 'include'
  };
  return originalFetch(input, reqInit);
};

// TỰ ĐỘNG LÀM MỚI KHI BẢN BUILD MỚI THAY ĐỔI HASH CHUNK (CHỐNG LỖI 404 LAZY LOAD KHI DEPLOY)
window.addEventListener('vite:preloadError', () => {
  const lastReload = sessionStorage.getItem('last_chunk_reload');
  const now = Date.now();
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    sessionStorage.setItem('last_chunk_reload', String(now));
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)


