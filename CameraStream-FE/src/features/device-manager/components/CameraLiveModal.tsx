import { useEffect, useRef, useState, type FC } from 'react';
import type { CameraDto } from '../types';
import { IconClose, IconMaximize, IconRefresh } from '../../../components/SurveillanceIcons';

export interface CameraLiveModalProps {
  camera: CameraDto | null;
  onClose: () => void;
}

export const CameraLiveModal: FC<CameraLiveModalProps> = ({ camera, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!camera) return;

    let isCancelled = false;
    let activeStream: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;

    const connectWebRtc = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!camera.webrtcUrl) {
          throw new Error('Camera không có đường dẫn luồng WebRTC WHEP');
        }

        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (!isCancelled && videoRef.current && event.streams[0]) {
            activeStream = event.streams[0];
            videoRef.current.srcObject = activeStream;
            setLoading(false);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise<void>((resolve) => {
          if (pc?.iceGatheringState === 'complete') {
            resolve();
            return;
          }
          const t = setTimeout(() => {
            pc?.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }, 1500);
          const checkState = () => {
            if (pc?.iceGatheringState === 'complete') {
              clearTimeout(t);
              pc?.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc?.addEventListener('icegatheringstatechange', checkState);
        });

        const res = await fetch(camera.webrtcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp || offer.sdp
        });

        if (!res.ok) {
          throw new Error(`MediaMTX WHEP trả về mã ${res.status}`);
        }

        const answerSdp = await res.text();
        if (!isCancelled && pc) {
          await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
          setLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.message || 'Lỗi kết nối WebRTC');
          setLoading(false);
        }
      }
    };

    connectWebRtc();

    return () => {
      isCancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {
            // ignore
          }
        });
        activeStream = null;
      }
      if (pc) {
        try {
          pc.getSenders?.().forEach((s) => s.track?.stop());
          pc.getReceivers?.().forEach((r) => r.track?.stop());
          pc.close();
        } catch (e) {
          // ignore
        }
        pcRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [camera]);

  if (!camera) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#0F172A',
          border: '1.5px solid #38BDF8',
          borderRadius: '12px',
          width: '90vw',
          maxWidth: '900px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 18px',
          backgroundColor: '#1E293B',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconMaximize size={16} color="#38BDF8" />
            <span style={{ color: '#FFF', fontWeight: 700, fontSize: '14px' }}>
              Trực Tiếp: {camera.name} (#{camera.id})
            </span>
            <span style={{
              backgroundColor: '#0369A1',
              color: '#E0F2FE',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 600
            }}>
              {camera.ipAddress}:{camera.rtspPort || 554}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <IconClose size={18} color="#94A3B8" />
          </button>
        </div>

        {/* Video Player */}
        <div style={{
          position: 'relative',
          backgroundColor: '#000000',
          aspectRatio: '16 / 9',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {loading && (
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#38BDF8' }}>
              <IconRefresh size={28} color="#38BDF8" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Đang khởi tạo luồng WebRTC WHEP...</span>
            </div>
          )}

          {error && (
            <div style={{ position: 'absolute', padding: '16px', textAlign: 'center', color: '#F87171' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Không thể kết nối luồng trực tiếp</div>
              <div style={{ fontSize: '12px', color: '#CBD5E1' }}>{error}</div>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: error ? 'none' : 'block'
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px',
          backgroundColor: '#1E293B',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#94A3B8'
        }}>
          <span>Vị trí: <strong style={{ color: '#E2E8F0' }}>{camera.location || 'Chưa đặt'}</strong></span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: '#334155',
              color: '#FFF',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraLiveModal;
