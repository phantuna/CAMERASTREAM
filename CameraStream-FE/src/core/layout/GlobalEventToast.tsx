import { useState, useEffect } from 'react';
import type { SystemEvent } from '../types';
import {
  IconCar,
  IconAlertTriangle,
  IconShield,
  IconClose
} from '../../components/SurveillanceIcons';

interface GlobalEventToastProps {
  lastEvent: SystemEvent | null;
}

interface ToastItem {
  id: string;
  event: SystemEvent;
  receivedAt: number;
}

export default function GlobalEventToast({ lastEvent }: GlobalEventToastProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (!lastEvent) return;

    const newToast: ToastItem = {
      id: `${lastEvent.id}-${Date.now()}`,
      event: lastEvent,
      receivedAt: Date.now()
    };

    setToasts((prev) => [newToast, ...prev.slice(0, 3)]); // Keep maximum 4 toasts visible

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 6000);

    return () => clearTimeout(timer);
  }, [lastEvent]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '380px',
        width: '100%',
        pointerEvents: 'none'
      }}
    >
      {toasts.map((toast) => {
        const { event } = toast;
        const isVehicle = event.eventType === 'VEHICLE_ANPR';
        const isCritical = event.severity === 'CRITICAL';

        const plate = event.payload?.plateNumber;
        const vehicleType = event.payload?.vehicleType || 'XE';

        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: 'auto',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '12px 14px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
              border: isCritical ? '1px solid #FECACA' : '1px solid #E2E8F0',
              borderLeft: isCritical ? '4px solid #EF4444' : isVehicle ? '4px solid #0284C7' : '4px solid #10B981',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              animation: 'slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: isCritical ? '#FEE2E2' : isVehicle ? '#E0F2FE' : '#ECFDF5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {isCritical ? (
                <IconAlertTriangle size={18} color="#DC2626" />
              ) : isVehicle ? (
                <IconCar size={18} color="#0284C7" />
              ) : (
                <IconShield size={18} color="#059669" />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: isCritical ? '#DC2626' : isVehicle ? '#0284C7' : '#059669',
                    letterSpacing: '0.5px'
                  }}
                >
                  {isVehicle ? 'Nhận Diện Biển Số' : event.eventType}
                </span>
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>Vừa xong</span>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {plate ? (
                  <span style={{ fontFamily: 'monospace', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                    {plate}
                  </span>
                ) : (
                  event.cameraName || 'Cảnh báo hệ thống'
                )}
                {plate && <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748B', marginLeft: '6px' }}>({vehicleType})</span>}
              </div>

              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                {event.cameraName ? `Vị trí: ${event.cameraName}` : `Nguồn: ${event.moduleSource}`}
              </div>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                color: '#94A3B8',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Đóng"
            >
              <IconClose size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
