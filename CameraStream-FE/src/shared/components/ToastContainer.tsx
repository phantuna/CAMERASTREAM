import { useState, useEffect, type FC } from 'react';
import type { ToastPayload } from '../utils/toast';

interface ToastItem extends ToastPayload {
  id: string;
}

export const ToastContainer: FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastPayload>;
      if (!customEvent.detail) return;

      const newToast: ToastItem = {
        ...customEvent.detail,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      };

      setToasts((prev) => [...prev.slice(-3), newToast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener('toast_notification', handleToast);
    return () => window.removeEventListener('toast_notification', handleToast);
  }, []);

  if (toasts.length === 0) return null;

  const getStyleByType = (type: ToastPayload['type']) => {
    switch (type) {
      case 'success':
        return {
          bg: '#ECFDF5',
          border: '#6EE7B7',
          text: '#065F46',
          titleColor: '#047857',
          icon: '✓'
        };
      case 'error':
        return {
          bg: '#FEF2F2',
          border: '#FCA5A5',
          text: '#991B1B',
          titleColor: '#B91C1C',
          icon: '✕'
        };
      case 'warning':
        return {
          bg: '#FFFBEB',
          border: '#FDE68A',
          text: '#92400E',
          titleColor: '#B45309',
          icon: '⚠'
        };
      case 'info':
      default:
        return {
          bg: '#EFF6FF',
          border: '#BFDBFE',
          text: '#1E40AF',
          titleColor: '#1D4ED8',
          icon: 'ℹ'
        };
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '24px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '360px',
        pointerEvents: 'none'
      }}
    >
      {toasts.map((t) => {
        const theme = getStyleByType(t.type);
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              color: theme.text,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              animation: 'fadeIn 0.2s ease-out',
              fontSize: '12.5px'
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: theme.titleColor,
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
                marginTop: '1px'
              }}
            >
              {theme.icon}
            </span>
            <div style={{ flex: 1 }}>
              {t.title && (
                <div style={{ fontWeight: 700, color: theme.titleColor, marginBottom: '2px' }}>
                  {t.title}
                </div>
              )}
              <div style={{ lineHeight: '1.4' }}>{t.message}</div>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              style={{
                background: 'none',
                border: 'none',
                color: theme.text,
                opacity: 0.6,
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 2px',
                lineHeight: 1
              }}
              title="Đóng"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
