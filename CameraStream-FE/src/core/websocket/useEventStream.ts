import { useState, useEffect, useRef, useCallback } from 'react';
import type { SystemEvent } from '../types';
import { getWebSocketUrl } from '../../shared/utils/envConfig';

interface UseEventStreamOptions {
  wsUrl?: string;
  maxRecentEvents?: number;
  onEventReceived?: (event: SystemEvent) => void;
}

export function useEventStream(options: UseEventStreamOptions = {}) {
  const {
    wsUrl = getWebSocketUrl(),
    maxRecentEvents = 50,
    onEventReceived
  } = options;

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [recentEvents, setRecentEvents] = useState<SystemEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<SystemEvent | null>(null);

  const listenersRef = useRef<Map<string, Set<(event: SystemEvent) => void>>>(new Map());
  const onEventReceivedRef = useRef(onEventReceived);
  onEventReceivedRef.current = onEventReceived;

  const registerEventListener = useCallback((eventType: string, callback: (event: SystemEvent) => void) => {
    const key = eventType.toUpperCase();
    if (!listenersRef.current.has(key)) {
      listenersRef.current.set(key, new Set());
    }
    listenersRef.current.get(key)!.add(callback);

    return () => {
      listenersRef.current.get(key)?.delete(callback);
    };
  }, []);

  useEffect(() => {
    let isDestroyed = false;
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      if (isDestroyed) return;
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isDestroyed) {
            try { ws?.close(); } catch (_) {}
            return;
          }
          setIsConnected(true);

          // STOMP CONNECT frame
          const connectFrame = 'CONNECT\naccept-version:1.2,1.1,1.0\nheart-beat:10000,10000\n\n\0';
          ws?.send(connectFrame);
        };

        ws.onmessage = (messageEvent: MessageEvent) => {
          if (isDestroyed) return;
          const msg = messageEvent.data;
          if (typeof msg !== 'string') return;

          // Once connected, subscribe to universal event topics
          if (msg.startsWith('CONNECTED')) {
            // 1. Universal Events topic (Phase 1)
            const subEventsFrame = 'SUBSCRIBE\nid:sub-universal-events\ndestination:/topic/events\n\n\0';
            ws?.send(subEventsFrame);

            // 2. Camera events topic (Backward compatibility)
            const subCameraFrame = 'SUBSCRIBE\nid:sub-camera-events\ndestination:/topic/cameras/events\n\n\0';
            ws?.send(subCameraFrame);
            return;
          }

          if (msg.includes('MESSAGE')) {
            try {
              const bodyIndex = msg.indexOf('\n\n');
              if (bodyIndex !== -1) {
                const rawBody = msg.slice(bodyIndex + 2).replace(/\0$/, '').trim();
                const data = JSON.parse(rawBody);

                let normalizedEvent: SystemEvent | null = null;

                if (data && data.eventType) {
                  // Direct SystemEventDto from /topic/events
                  normalizedEvent = {
                    id: data.id || Date.now(),
                    eventType: data.eventType,
                    moduleSource: data.moduleSource || 'SYSTEM',
                    cameraId: data.cameraId,
                    cameraName: data.cameraName,
                    snapshotUrl: data.snapshotUrl,
                    confidence: data.confidence,
                    severity: data.severity || 'INFO',
                    payload: data.payload,
                    acknowledged: data.acknowledged || false,
                    createdAt: data.createdAt || new Date().toISOString()
                  };
                } else if (data && data.payload && msg.includes('/topic/cameras/events')) {
                  // Converted from CameraEventMessage
                  normalizedEvent = {
                    id: Date.now(),
                    eventType: data.eventType || 'CAMERA_EVENT',
                    moduleSource: 'CAMERA_CORE',
                    cameraId: data.cameraId,
                    cameraName: data.cameraName,
                    severity: 'INFO',
                    payload: data.payload,
                    createdAt: new Date().toISOString()
                  };
                }

                if (normalizedEvent) {
                  setLastEvent(normalizedEvent);
                  setRecentEvents((prev) => [normalizedEvent!, ...prev.slice(0, maxRecentEvents - 1)]);

                  if (onEventReceivedRef.current) {
                    onEventReceivedRef.current(normalizedEvent);
                  }

                  // Trigger listeners for specific eventType or wildcard '*'
                  const specificListeners = listenersRef.current.get(normalizedEvent.eventType.toUpperCase());
                  if (specificListeners) {
                    specificListeners.forEach((fn) => fn(normalizedEvent!));
                  }
                  const wildcardListeners = listenersRef.current.get('*');
                  if (wildcardListeners) {
                    wildcardListeners.forEach((fn) => fn(normalizedEvent!));
                  }
                }
              }
            } catch (err) {
              console.warn('[EventStream] Failed to parse message body:', err);
            }
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          if (!isDestroyed) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          if (isDestroyed) return;
          setIsConnected(false);
        };
      } catch (err) {
        setIsConnected(false);
        if (!isDestroyed) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      isDestroyed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      // Capture vào biến const: TypeScript không giữ narrowing của `ws` bên
      // trong closure, nên `ws.close()` sẽ báo "'ws' is possibly 'null'".
      const socket = ws;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === WebSocket.OPEN) {
          try { socket.close(); } catch (_) {}
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => {
            try { socket.close(); } catch (_) {}
          };
        }
      }
    };
  }, [wsUrl, maxRecentEvents]);

  return {
    isConnected,
    recentEvents,
    lastEvent,
    registerEventListener
  };
}
