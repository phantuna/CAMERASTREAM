import React, { useState } from 'react';
import { useAuth } from '../../core/auth/AuthContext';
import {
  IconKey,
  IconUser,
  IconEye,
  IconEyeOff,
  IconCheck,
  IconAlertTriangle,
  IconArrowRight
} from '../../components/SurveillanceIcons';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const result = await login(username, password);
      if (result.success) {
        setSuccessMsg('Đăng nhập thành công! Đang tải dữ liệu hệ thống...');
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess();
          }
        }, 800);
      } else {
        setErrorMsg(result.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi kết nối tới máy chủ (cổng 8080). Vui lòng kiểm tra lại!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#F8FAFC',
        backgroundImage: "url('/bg-office.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif"
      }}
    >
      {/* Background decorations - Overlay mờ nhẹ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.35)',
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none'
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          position: 'relative',
          zIndex: 10
        }}
      >
        {/* Logo/Brand matching HPTicket */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 28px',
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              boxShadow: '0 20px 35px -10px rgba(148, 163, 184, 0.45)',
              marginBottom: '14px',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              backdropFilter: 'blur(8px)'
            }}
          >
            <img
              src="/hoang-phat-invoice-logo.png"
              alt="Hoàng Phát Technology Era"
              style={{ height: '76px', width: 'auto', maxWidth: '220px', objectFit: 'contain' }}
            />
          </div>
          <p style={{ color: '#334155', margin: 0, fontSize: '13.5px', fontWeight: 700, textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)' }}>
            Hệ Thống Giám Sát Camera & Kiểm Soát Xe Thông Minh
          </p>
        </div>

        {/* Login Box (matching HPTicket Box) */}
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid #E2E8F0',
            padding: '32px',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(148, 163, 184, 0.35)'
          }}
        >
          <h2 style={{ fontSize: '19px', fontWeight: 700, color: '#1E293B', marginBottom: '22px' }}>
            Đăng nhập hệ thống
          </h2>

          {/* Messages */}
          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#DC2626',
                fontSize: '13px',
                padding: '12px 14px',
                borderRadius: '14px',
                marginBottom: '20px',
                fontWeight: 500
              }}
            >
              <IconAlertTriangle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#059669',
                fontSize: '13px',
                padding: '12px 14px',
                borderRadius: '14px',
                marginBottom: '20px',
                fontWeight: 600
              }}
            >
              <IconCheck size={18} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Username Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '8px'
                }}
              >
                Tài khoản (Username)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
                  <IconUser size={18} />
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(e); }}
                  placeholder="Nhập tên tài khoản..."
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 46px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '16px',
                    color: '#1E293B',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#10B981';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#CBD5E1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '8px'
                }}
              >
                Mật khẩu (Password)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
                  <IconKey size={18} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(e); }}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '12px 44px 12px 46px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '16px',
                    color: '#1E293B',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    transition: 'all 0.15s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#10B981';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#CBD5E1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>
            </div>

            {/* Login Button matching HPTicket Emerald Gradient */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: '16px',
                border: 'none',
                background: loading
                  ? '#94A3B8'
                  : 'linear-gradient(to right, #10B981, #0D9488)',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 8px 18px rgba(16, 185, 129, 0.28)',
                transition: 'all 0.2s ease',
                marginTop: '6px'
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.boxShadow = '0 12px 24px rgba(16, 185, 129, 0.38)';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.boxShadow = '0 8px 18px rgba(16, 185, 129, 0.28)';
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: '#FFFFFF',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }}
                  />
                  <span>Đang tải dữ liệu hệ thống...</span>
                </>
              ) : (
                <>
                  <span>Đăng Nhập</span>
                  <IconArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Clean system notice without unnecessary demo switcher */}
          <div
            style={{
              marginTop: '22px',
              paddingTop: '16px',
              borderTop: '1px solid #F1F5F9',
              textAlign: 'center',
              fontSize: '11px',
              color: '#94A3B8'
            }}
          >
            Tài khoản quản trị khởi tạo: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>admin</span>
          </div>
        </div>

        {/* Footer info matching HPTicket */}
        <div style={{ textAlign: 'center', marginTop: '24px', color: '#64748B', fontSize: '12px' }}>
          &copy; {new Date().getFullYear()} Công ty TNHH Phát Triển Kỹ Thuật Công Nghệ Hoàng Phát
        </div>
      </div>
    </div>
  );
};
export default LoginScreen;
