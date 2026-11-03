/**
 * Toast Utility - CameraStream-FE
 * Adapter từ pattern hpticket-management-system.
 * Sử dụng CustomEvent để phát sự kiện toast toàn cục mà không gây re-render không cần thiết.
 */

export interface ToastPayload {
  message: string;
  title?: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export const toast = {
  success: (message: string, title = 'Thành công') => {
    window.dispatchEvent(
      new CustomEvent<ToastPayload>('toast_notification', {
        detail: { message, title, type: 'success' }
      })
    );
  },
  error: (message: string, title = 'Thất bại') => {
    window.dispatchEvent(
      new CustomEvent<ToastPayload>('toast_notification', {
        detail: { message, title, type: 'error' }
      })
    );
  },
  warning: (message: string, title = 'Cảnh báo') => {
    window.dispatchEvent(
      new CustomEvent<ToastPayload>('toast_notification', {
        detail: { message, title, type: 'warning' }
      })
    );
  },
  info: (message: string, title = 'Thông báo') => {
    window.dispatchEvent(
      new CustomEvent<ToastPayload>('toast_notification', {
        detail: { message, title, type: 'info' }
      })
    );
  }
};
