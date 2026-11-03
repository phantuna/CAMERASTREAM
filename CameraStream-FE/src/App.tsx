import { useState, useMemo, useEffect } from 'react';
import { moduleRegistry } from './core/modules.registry';
import { useEventStream } from './core/websocket/useEventStream';
import { AuthProvider, useAuth } from './core/auth/AuthContext';
import LoginScreen from './features/auth/LoginScreen';
import {
  IconMenu,
  IconChevronRight,
  IconChevronDown,
  IconLogOut
} from './components/SurveillanceIcons';
import { ToastContainer } from './shared/components/ToastContainer';
import { getBackendBaseUrl, getWebSocketUrl } from './shared/utils/envConfig';

function AppContent() {
  const apiBaseUrl = getBackendBaseUrl();
  const { user, isAuthenticated, isLoading, logout, can } = useAuth();

  // Filter modules and sub-modules based on user permissions (RBAC)
  const enabledModules = useMemo(() => {
    return moduleRegistry.getEnabled()
      .map((m) => {
        if (!m.children) return m;
        const allowedChildren = m.children.filter((c) => !c.permission || can(c.permission));
        return { ...m, children: allowedChildren };
      })
      .filter((m) => (!m.permission || can(m.permission)) && (!m.children || m.children.length > 0));
  }, [can]);

  // State: active parent module and active sub-page
  const [activeModuleId, setActiveModuleId] = useState<string>(
    enabledModules[0]?.id || 'CORE_SURVEILLANCE'
  );

  useEffect(() => {
    if (enabledModules.length > 0 && !enabledModules.some((m) => m.id === activeModuleId)) {
      setActiveModuleId(enabledModules[0].id);
    }
  }, [enabledModules, activeModuleId]);

  const [subModuleState, setSubModuleState] = useState<Record<string, string>>({
    CORE_SURVEILLANCE: 'WALL',
    DEVICE_MANAGEMENT: 'CAMERAS',
    FACE_MODULE: 'LIVE',
    ALERT_CENTER: 'ALERTS_LIST',
    SYSTEM_IAM: 'ROLES'
  });

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    CORE_SURVEILLANCE: true
  });

  useEffect(() => {
    if (activeModuleId) {
      setOpenSections({ [activeModuleId]: true });
    }
  }, [activeModuleId]);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const toggleSection = (moduleId: string) => {
    setOpenSections((prev) => {
      const willOpen = !prev[moduleId];
      return willOpen ? { [moduleId]: true } : {};
    });
  };


  // Universal Realtime Event Stream Hook (Connects to Spring Boot /ws-camera)
  const { isConnected: isWsConnected } = useEventStream({
    wsUrl: getWebSocketUrl(),
    onEventReceived: (ev) => {
      if (ev.eventType === 'BACKUP_COMPLETED') {
        const payload = ev.payload as any;
        window.dispatchEvent(new CustomEvent('toast_notification', {
          detail: {
            title: 'Sao Lưu CSDL Hoàn Tất',
            message: payload?.message || `Bản sao lưu ${payload?.backupId || ''} đã sẵn sàng tải về.`,
            type: 'success'
          }
        }));
      } else if (ev.eventType === 'BACKUP_FAILED') {
        const payload = ev.payload as any;
        window.dispatchEvent(new CustomEvent('toast_notification', {
          detail: {
            title: 'Sao Lưu Thất Bại',
            message: payload?.errorMessage || 'Tiến trình sao lưu gặp sự cố.',
            type: 'error'
          }
        }));
      } else if (ev.eventType === 'RESTORE_COMPLETED') {
        const payload = ev.payload as any;
        window.dispatchEvent(new CustomEvent('toast_notification', {
          detail: {
            title: 'Khôi Phục CSDL Thành Công',
            message: `Hệ thống đã phục hồi hoàn tất từ bản sao lưu ${payload?.backupId || ''}.`,
            type: 'success'
          }
        }));
      } else if (ev.eventType === 'RESTORE_FAILED') {
        const payload = ev.payload as any;
        window.dispatchEvent(new CustomEvent('toast_notification', {
          detail: {
            title: 'Khôi Phục Thất Bại',
            message: payload?.error || 'Không thể khôi phục CSDL từ bản sao lưu.',
            type: 'error'
          }
        }));
      }
    }
  });

  // Current active parent module
  const currentModule = useMemo(() => {
    return enabledModules.find((m) => m.id === activeModuleId) || enabledModules[0];
  }, [enabledModules, activeModuleId]);

  // Current active sub-item
  const activeSubId = subModuleState[currentModule?.id] || currentModule?.children?.[0]?.id;

  const currentSubItem = useMemo(() => {
    if (!currentModule?.children) return null;
    return currentModule.children.find((c) => c.id === activeSubId) || currentModule.children[0];
  }, [currentModule, activeSubId]);

  const handleSelectSub = (moduleId: string, subId: string) => {
    setActiveModuleId(moduleId);
    setOpenSections({ [moduleId]: true });
    setSubModuleState((prev) => ({
      ...prev,
      [moduleId]: subId
    }));
  };

  const getRoleBadgeStyle = (code?: string) => {
    switch (code) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return { bg: 'rgba(124, 58, 237, 0.1)', color: '#7C3AED', border: 'rgba(124, 58, 237, 0.25)' };
      case 'MANAGER':
      case 'OPERATOR':
        return { bg: 'rgba(2, 132, 199, 0.1)', color: '#0284C7', border: 'rgba(2, 132, 199, 0.25)' };
      case 'SECURITY':
        return { bg: 'rgba(245, 158, 11, 0.1)', color: '#D97706', border: 'rgba(245, 158, 11, 0.25)' };
      case 'AUDITOR':
        return { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: 'rgba(16, 185, 129, 0.25)' };
      default:
        return { bg: 'rgba(100, 116, 139, 0.1)', color: '#475569', border: 'rgba(100, 116, 139, 0.25)' };
    }
  };

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0F172A',
        color: '#FFFFFF',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(16, 185, 129, 0.2)',
            borderTopColor: '#10B981',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px auto'
          }} />
          <div style={{ fontSize: '14px', fontWeight: 700 }}>Đang khởi tạo phiên làm việc CameraStream...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      backgroundColor: '#F8FAFC',
      color: '#0F172A',
      fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif'
    }}>
      {/* 1. LEFT SIDEBAR (HIERARCHICAL ACCORDION MENU) */}
      {/* 1. LEFT SIDEBAR (SYNCHRONIZED WITH HOANG PHAT SYSTEM STANDARDS) */}
      <aside style={{
        width: isCollapsed ? '64px' : '260px',
        minWidth: isCollapsed ? '64px' : '260px',
        height: '100%',
        backgroundColor: '#FFFFFF',
        borderRight: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 50,
        boxShadow: '1px 0 8px rgba(0, 0, 0, 0.03)'
      }}>
        {/* Top: Sidebar Section Header (Logo & Brand) */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{
            padding: isCollapsed ? '12px 8px' : '12px 14px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            backgroundColor: '#FFFFFF',
            minHeight: '60px',
            boxSizing: 'border-box'
          }}>
            {isCollapsed ? (
              <button
                onClick={() => setIsCollapsed(false)}
                title="HOÀNG PHÁT - Bấm để mở rộng menu"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '4px',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)'
                }}
              >
                <img
                  src="/favicon.png"
                  alt="Hoàng Phát Logo"
                  style={{ width: '26px', height: '26px', objectFit: 'contain' }}
                />
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                  <img
                    src="/hoang-phat-logo.jpg"
                    alt="Hoàng Phát Technology Era"
                    style={{ height: '36px', maxWidth: '170px', objectFit: 'contain', flexShrink: 0 }}
                  />
                </div>
                <button
                  onClick={() => setIsCollapsed(true)}
                  title="Thu gọn menu"
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '6px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                    flexShrink: 0
                  }}
                >
                  <IconMenu size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Module items */}
          <div style={{ padding: isCollapsed ? '8px 4px' : '10px 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {enabledModules.map((item) => {
              const Icon = item.icon;
              const isParentActive = activeModuleId === item.id;
              const hasMultipleChildren = item.children && item.children.length > 1;
              const isSectionOpen = openSections[item.id] !== false;

              if (hasMultipleChildren) {
                return (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Section Accordion Header */}
                    <button
                      onClick={() => {
                        toggleSection(item.id);
                        if (!isParentActive) {
                          setActiveModuleId(item.id);
                          const currentSub = subModuleState[item.id] || item.children![0].id;
                          handleSelectSub(item.id, currentSub);
                        }
                      }}
                      title={isCollapsed ? item.label : undefined}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'space-between',
                        padding: isCollapsed ? '10px 0' : '9px 10px',
                        borderRadius: '9px',
                        border: '1px solid transparent',
                        backgroundColor: isParentActive ? '#F0FDF4' : 'transparent',
                        color: isParentActive ? '#065F46' : '#334155',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: isParentActive ? 700 : 600,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                        <div style={{
                          color: isParentActive ? '#059669' : '#64748B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Icon size={17} color={isParentActive ? '#059669' : '#64748B'} />
                        </div>
                        {!isCollapsed && (
                          <span style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '12.5px'
                          }}>
                            {item.label}
                          </span>
                        )}
                      </div>

                      {!isCollapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.badge && (
                            <span style={{
                              fontSize: '8.5px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              backgroundColor: item.badgeColor === '#10B981' ? '#ECFDF5' : item.badgeColor === '#7C3AED' ? '#F5F3FF' : '#EFF6FF',
                              color: item.badgeColor === '#10B981' ? '#059669' : item.badgeColor === '#7C3AED' ? '#7C3AED' : '#0284C7'
                            }}>
                              {item.badge}
                            </span>
                          )}
                          {isSectionOpen ? (
                            <IconChevronDown size={14} color="#94A3B8" />
                          ) : (
                            <IconChevronRight size={14} color="#94A3B8" />
                          )}
                        </div>
                      )}
                    </button>

                    {/* Sub-Items with vertical connecting line */}
                    {!isCollapsed && isSectionOpen && (
                      <div style={{
                        marginLeft: '15px',
                        paddingLeft: '11px',
                        borderLeft: '1.5px solid #E2E8F0',
                        marginTop: '2px',
                        marginBottom: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}>
                        {item.children!.map((sub) => {
                          const isSubActive = isParentActive && activeSubId === sub.id;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => handleSelectSub(item.id, sub.id)}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6.5px 9px',
                                borderRadius: '7px',
                                backgroundColor: isSubActive ? '#059669' : 'transparent',
                                border: 'none',
                                color: isSubActive ? '#FFFFFF' : '#475569',
                                fontSize: '11.5px',
                                fontWeight: isSubActive ? 700 : 500,
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.12s ease',
                                boxShadow: isSubActive ? '0 2px 6px rgba(5, 150, 105, 0.28)' : 'none'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                                <span style={{
                                  width: '4px',
                                  height: '4px',
                                  borderRadius: '50%',
                                  backgroundColor: isSubActive ? '#FFFFFF' : '#94A3B8'
                                }} />
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {sub.label}
                                </span>
                              </div>
                              {sub.badge && (
                                <span style={{
                                  fontSize: '8px',
                                  fontWeight: 700,
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  backgroundColor: isSubActive ? 'rgba(255,255,255,0.2)' : '#F1F5F9',
                                  color: isSubActive ? '#FFFFFF' : '#64748B'
                                }}>
                                  {sub.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Single-item module (e.g. Trung Tâm Cảnh Báo) -> Direct 1-click Navigation
              const singleSubId = item.children?.[0]?.id || item.id;
              const isDirectActive = isParentActive;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    handleSelectSub(item.id, singleSubId);
                  }}
                  title={isCollapsed ? item.label : undefined}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    padding: isCollapsed ? '10px 0' : '9px 10px',
                    borderRadius: '9px',
                    border: '1px solid transparent',
                    backgroundColor: isDirectActive ? '#059669' : 'transparent',
                    color: isDirectActive ? '#FFFFFF' : '#334155',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: isDirectActive ? 700 : 600,
                    transition: 'all 0.15s ease',
                    boxShadow: isDirectActive ? '0 2px 6px rgba(5, 150, 105, 0.28)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                    <div style={{
                      color: isDirectActive ? '#FFFFFF' : '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Icon size={17} color={isDirectActive ? '#FFFFFF' : '#64748B'} />
                    </div>
                    {!isCollapsed && (
                      <span style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: '12.5px'
                      }}>
                        {item.label}
                      </span>
                    )}
                  </div>

                  {!isCollapsed && item.badge && (
                    <span style={{
                      fontSize: '8.5px',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      backgroundColor: isDirectActive ? 'rgba(255,255,255,0.2)' : '#FEE2E2',
                      color: isDirectActive ? '#FFFFFF' : '#EF4444'
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom System Status */}
        <div style={{
          borderTop: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
          padding: isCollapsed ? '12px 6px' : '12px 14px'
        }}>
          {!isCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Event Hub (WS)</span>
                <span style={{
                  fontSize: '9.5px',
                  padding: '1.5px 6px',
                  borderRadius: '10px',
                  backgroundColor: isWsConnected ? '#ECFDF5' : '#FEF3C7',
                  color: isWsConnected ? '#059669' : '#D97706',
                  border: isWsConnected ? '1px solid #A7F3D0' : '1px solid #FDE68A',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 700
                }}>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: isWsConnected ? '#10B981' : '#F59E0B'
                  }} />
                  {isWsConnected ? 'CONNECTED' : 'STANDBY'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: '#94A3B8' }}>
                <span>CameraStream AI</span>
                <span style={{ fontWeight: 700 }}>v2.4.0</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span
                title={isWsConnected ? "Event Hub WebSocket đã kết nối" : "Đang chờ kết nối WebSocket..."}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isWsConnected ? '#10B981' : '#F59E0B',
                  boxShadow: isWsConnected ? '0 0 6px #10B981' : '0 0 6px #F59E0B'
                }}
              />
            </div>
          )}
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main style={{
        flex: 1,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        backgroundColor: '#F8FAFC'
      }}>
        {/* Top Header / Breadcrumb Bar Synchronized with Hoang Phat Standards */}
        <header style={{
          height: '60px',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          boxSizing: 'border-box',
          width: '100%'
        }}>
          {/* Left: Clean Breadcrumb Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
            {currentModule?.icon && (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669',
                flexShrink: 0
              }}>
                <currentModule.icon size={17} color="#059669" />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>
                {currentModule?.label || 'CameraStream'}
              </span>
              <IconChevronRight size={13} color="#94A3B8" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {currentSubItem?.label || currentModule?.sublabel || ''}
              </span>
            </div>
          </div>

          {/* Right: Live Status, User Profile Pill, Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {/* Live AI Engine Status Pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '16px',
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)'
              }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                AI Trực Tuyến
              </span>
            </div>

            {/* User Profile Pill */}
            {user && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '3px 10px 3px 5px',
                  borderRadius: '20px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  flexShrink: 0,
                  whiteSpace: 'nowrap'
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: getRoleBadgeStyle(user.role).bg,
                    color: getRoleBadgeStyle(user.role).color,
                    border: `1.5px solid ${getRoleBadgeStyle(user.role).border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '11px',
                    flexShrink: 0
                  }}
                >
                  {(user.username || 'AD').substring(0, 2).toUpperCase()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0F172A',
                    whiteSpace: 'nowrap'
                  }}>
                    {user.username}
                  </span>
                  <span style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: getRoleBadgeStyle(user.role).bg,
                    color: getRoleBadgeStyle(user.role).color,
                    border: `1px solid ${getRoleBadgeStyle(user.role).border}`,
                    whiteSpace: 'nowrap'
                  }}>
                    {(user.role as string) === 'SUPER_ADMIN' || (user.role as string) === 'ROLE_SUPER_ADMIN'
                      ? 'Super Admin'
                      : ((user.role as string) === 'ADMIN' || (user.role as string) === 'ROLE_ADMIN'
                        ? 'Admin'
                        : (user.roleName || user.role))}
                  </span>
                </div>
              </div>
            )}

            {/* Logout Button */}
            <button
              onClick={logout}
              title="Đăng xuất khỏi hệ thống"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #FCA5A5',
                color: '#DC2626',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0,
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FEE2E2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              <IconLogOut size={13} color="#DC2626" />
              <span style={{ whiteSpace: 'nowrap' }}>Đăng Xuất</span>
            </button>
          </div>
        </header>

        {/* Dynamic Sub-page Render */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {currentSubItem ? (
            currentSubItem.render({ apiBaseUrl })
          ) : currentModule?.render ? (
            currentModule.render({ apiBaseUrl, activeSubId })
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
              Không tìm thấy trang nào.
            </div>
          )}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
