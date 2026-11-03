import { useState, useEffect, useRef, useMemo, type FC } from 'react';
import type { CameraDto, AiFilterType } from '../types';
import {
  IconGrid,
  IconCar,
  IconUser,
  IconShield,
  IconCamera,
  IconSearch,
  IconMapPin,
  IconMaximize,
  IconEdit,
  IconTrash,
  IconHardHat,
  IconFlame,
  IconClose
} from '../../../components/SurveillanceIcons';
import TableSkeleton from '../../../shared/components/TableSkeleton';
import EmptyState from '../../../shared/components/EmptyState';
import PaginationBar from '../../../shared/components/PaginationBar';
import { useAuth } from '../../../core/auth/AuthContext';

export interface CameraTableProps {
  cameras: CameraDto[];
  isLoading: boolean;
  aiFilter: AiFilterType;
  onFilterChange: (filter: AiFilterType) => void;
  cameraAiModulesMap: Record<number, string[]>;
  onEditCamera: (camera: CameraDto) => void;
  onDeleteCamera: (id: number) => void;
  onAssignAi: (camera: CameraDto) => void;
  onLiveView?: (camera: CameraDto) => void;
}

/**
 * Helper hàm highlight ký tự trùng khớp theo chuẩn Search Flow
 */
function highlightMatch(text: string, query: string) {
  if (!query || !query.trim() || !text) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            style={{
              backgroundColor: '#FEF08A',
              color: '#854D0E',
              padding: '0 2px',
              borderRadius: '2px',
              fontWeight: 700
            }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export const CameraTable: FC<CameraTableProps> = ({
  cameras,
  isLoading,
  aiFilter,
  onFilterChange,
  cameraAiModulesMap,
  onEditCamera,
  onDeleteCamera,
  onAssignAi,
  onLiveView
}) => {
  const { can } = useAuth();
  // Search Flow States: IDLE -> TYPING -> LOADING -> RESULTS
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce 300ms
  useEffect(() => {
    if (searchQuery !== debouncedQuery) {
      setIsTyping(true);
      const timer = setTimeout(() => {
        setDebouncedQuery(searchQuery);
        setIsTyping(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setIsTyping(false);
    }
  }, [searchQuery, debouncedQuery]);

  // Reset trang về 1 khi đổi bộ lọc hoặc tìm kiếm
  useEffect(() => {
    setCurrentPage(1);
  }, [aiFilter, debouncedQuery]);

  // Phím tắt Ctrl+K / Cmd+K theo chuẩn Search Flow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Thống kê số lượng theo từng loại AI
  const aiStats = useMemo(() => {
    let anprCount = 0;
    let faceCount = 0;
    let roiCount = 0;
    let noneCount = 0;

    cameras.forEach((c) => {
      const mods = cameraAiModulesMap[c.id] || [];
      if (mods.length === 0) noneCount++;
      if (mods.includes('VEHICLE_ANPR')) anprCount++;
      if (mods.includes('FACE_RECOGNITION')) faceCount++;
      if (mods.includes('INTRUSION_ROI')) roiCount++;
    });

    return { anprCount, faceCount, roiCount, noneCount };
  }, [cameras, cameraAiModulesMap]);

  // Lọc danh sách theo filter phân loại VÀ từ khóa tìm kiếm
  const filteredCameras = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return cameras.filter((cam) => {
      // 1. Lọc theo Phân loại AI
      if (aiFilter !== 'ALL') {
        const mods = cameraAiModulesMap[cam.id] || [];
        if (aiFilter === 'NONE') {
          if (mods.length > 0) return false;
        } else if (!mods.includes(aiFilter)) {
          return false;
        }
      }

      // 2. Lọc theo Từ khóa tìm kiếm
      if (q) {
        const matchName = cam.name?.toLowerCase().includes(q);
        const matchIp = cam.ipAddress?.toLowerCase().includes(q);
        const matchLoc = cam.location?.toLowerCase().includes(q);
        const matchPort = String(cam.rtspPort || '').includes(q);
        const matchId = String(cam.id).includes(q);
        if (!matchName && !matchIp && !matchLoc && !matchPort && !matchId) {
          return false;
        }
      }

      return true;
    });
  }, [cameras, aiFilter, debouncedQuery, cameraAiModulesMap]);

  const paginatedCameras = useMemo(() => {
    return filteredCameras.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredCameras, currentPage, pageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Thanh điều khiển Bộ lọc & Ô Tìm kiếm Chuẩn Search Flow */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Segmented AI Filter Control */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: '#F1F5F9',
          padding: '3px',
          borderRadius: '8px',
          flexWrap: 'wrap'
        }}>
          {[
            { id: 'ALL', label: 'Tất Cả', count: cameras.length, icon: IconGrid },
            { id: 'VEHICLE_ANPR', label: 'Camera Xe (ALPR)', count: aiStats.anprCount, icon: IconCar },
            { id: 'FACE_RECOGNITION', label: 'Camera Người (FaceID)', count: aiStats.faceCount, icon: IconUser },
            { id: 'INTRUSION_ROI', label: 'Camera An Ninh (ROI)', count: aiStats.roiCount, icon: IconShield },
            { id: 'NONE', label: 'Chưa Gán AI', count: aiStats.noneCount, icon: IconCamera }
          ].map((tab) => {
            const isActive = aiFilter === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onFilterChange(tab.id as AiFilterType)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? '#0284C7' : '#64748B',
                  boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <TabIcon size={14} color={isActive ? '#0284C7' : '#64748B'} />
                <span>{tab.label}</span>
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: isActive ? '#EFF6FF' : '#E2E8F0',
                  color: isActive ? '#0284C7' : '#64748B'
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Flow Input */}
        <div style={{
          position: 'relative',
          minWidth: '280px',
          maxWidth: '380px',
          flex: '1 1 280px'
        }}>
          {/* Icon Kính lúp hoặc Mini Spinner Loading */}
          <span style={{
            position: 'absolute',
            left: '11px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            color: '#94A3B8',
            pointerEvents: 'none'
          }}>
            {isTyping ? (
              <span style={{
                width: '14px',
                height: '14px',
                border: '2px solid #0284C7',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.6s linear infinite'
              }} />
            ) : (
              <IconSearch size={14} color="#64748B" />
            )}
          </span>

          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, IP, vị trí..."
            style={{
              width: '100%',
              padding: '7px 62px 7px 32px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#0F172A',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#0284C7';
              e.target.style.boxShadow = '0 0 0 3px rgba(2, 132, 199, 0.15)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#CBD5E1';
              e.target.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
            }}
          />

          {/* Phím tắt Ctrl+K hoặc Nút Xóa 'X' */}
          <div style={{
            position: 'absolute',
            right: '9px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: '#E2E8F0',
                  color: '#475569',
                  cursor: 'pointer',
                  padding: 0
                }}
                title="Xóa tìm kiếm (Esc)"
              >
                <IconClose size={11} color="#475569" />
              </button>
            ) : (
              <kbd style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                backgroundColor: '#F1F5F9',
                color: '#64748B',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                padding: '2px 5px',
                lineHeight: 1
              }}>
                Ctrl+K
              </kbd>
            )}
          </div>
        </div>
      </div>

      {/* 2. Harmonious Data Table / Skeleton / Empty State */}
      {isLoading ? (
        <TableSkeleton
          rows={6}
          cols={6}
          colWidths={['60px', '25%', '20%', '22%', '110px', '160px']}
        />
      ) : filteredCameras.length === 0 ? (
        <div style={{
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden'
        }}>
          <EmptyState
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery('')}
            description={
              cameras.length === 0
                ? 'Chưa có camera nào trong cơ sở dữ liệu. Bấm nút "Thêm Camera Mới" ở phía trên để bắt đầu.'
                : 'Không tìm thấy camera nào khớp với tiêu chí tìm kiếm hoặc bộ lọc hiện tại.'
            }
          />
        </div>
      ) : (
        <div style={{
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          overflowX: 'auto',
          backgroundColor: '#FFFFFF'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{
                backgroundColor: '#F8FAFC',
                color: '#475569',
                borderBottom: '1px solid #E2E8F0',
                fontSize: '12px',
                fontWeight: 700
              }}>
                <th style={{ padding: '10px 10px', width: '44px', textAlign: 'center', whiteSpace: 'nowrap' }}>ID</th>
                <th style={{ padding: '10px 12px', minWidth: '140px' }}>Camera & Vị Trí</th>
                <th style={{ padding: '10px 12px', minWidth: '130px', whiteSpace: 'nowrap' }}>Địa Chỉ IP & Cổng</th>
                <th style={{ padding: '10px 12px', minWidth: '140px' }}>Module AI Gán Cho Cam</th>
                <th style={{ padding: '10px 10px', width: '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>Trạng Thái</th>
                <th style={{
                  padding: '10px 12px',
                  width: '210px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  position: 'sticky',
                  right: 0,
                  zIndex: 2,
                  backgroundColor: '#F8FAFC',
                  boxShadow: '-3px 0 8px rgba(15, 23, 42, 0.04)'
                }}>Hành Động</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCameras.map((c, idx) => {
                const activeModules = cameraAiModulesMap[c.id] || [];
                const isOnline = c.status === 'ONLINE';
                const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA';

                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: rowBg,
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    {/* 1. ID */}
                    <td style={{ padding: '10px 10px', textAlign: 'center', color: '#64748B', fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      #{c.id}
                    </td>

                    {/* 2. Camera Name & Location (Có Highlight Match) */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '13px' }}>
                        {highlightMatch(c.name, debouncedQuery)}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <IconMapPin size={13} color="#64748B" />
                        <span>{highlightMatch(c.location || 'Chưa đặt địa điểm', debouncedQuery)}</span>
                      </div>
                    </td>

                    {/* 3. IP & Ports (Có Highlight Match) */}
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A', fontSize: '12.5px' }}>
                        {highlightMatch(c.ipAddress, debouncedQuery)}:{c.rtspPort || 554}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                        ONVIF :{c.onvifPort || 80} • {c.username || 'admin'}
                      </div>
                    </td>

                    {/* 4. Active AI Modules & Status */}
                    <td style={{ padding: '10px 12px' }}>
                      {activeModules.length === 0 ? (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#94A3B8',
                          backgroundColor: '#F8FAFC',
                          padding: '3px 9px',
                          borderRadius: '6px',
                          border: '1px dashed #CBD5E1',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          whiteSpace: 'nowrap'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#CBD5E1' }} />
                          <span>Đã Tắt AI (Chưa Gán)</span>
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                            {activeModules.map((mod) => {
                              const isVehicle = mod === 'VEHICLE_ANPR';
                              const isFace = mod === 'FACE_RECOGNITION';
                              const isRoi = mod === 'INTRUSION_ROI';
                              const isPpe = mod === 'SAFETY_PPE';
                              const isFire = mod === 'FIRE_DETECT';

                              const label = isVehicle ? 'Nhận diện Xe (ALPR)'
                                : isFace ? 'Nhận diện Người (FaceID)'
                                  : isPpe ? 'Mũ Bảo Hộ'
                                    : isFire ? 'Báo Cháy'
                                      : 'Hàng Rào (ROI)';

                              const color = isVehicle ? '#059669' : isFace ? '#7C3AED' : isFire ? '#DC2626' : isPpe ? '#EA580C' : '#0284C7';
                              const bg = isVehicle ? '#ECFDF5' : isFace ? '#F5F3FF' : isFire ? '#FEF2F2' : isPpe ? '#FFF7ED' : '#EFF6FF';
                              const border = isVehicle ? '#A7F3D0' : isFace ? '#DDD6FE' : isFire ? '#FECACA' : isPpe ? '#FED7AA' : '#BAE6FD';

                              return (
                                <span
                                  key={mod}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '3px 7px',
                                    borderRadius: '4px',
                                    backgroundColor: bg,
                                    color: color,
                                    border: `1px solid ${border}`,
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {isVehicle && <IconCar size={11} color={color} />}
                                  {isFace && <IconUser size={11} color={color} />}
                                  {isRoi && <IconShield size={11} color={color} />}
                                  {isPpe && <IconHardHat size={11} color={color} />}
                                  {isFire && <IconFlame size={11} color={color} />}
                                  <span>{label}</span>
                                </span>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                            <span>Đang hoạt động ({activeModules.length} module AI)</span>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 5. Status */}
                    <td style={{ padding: '10px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: '12px',
                        backgroundColor: isOnline ? '#ECFDF5' : '#FEF2F2',
                        color: isOnline ? '#059669' : '#DC2626',
                        border: `1px solid ${isOnline ? '#A7F3D0' : '#FECACA'}`,
                        whiteSpace: 'nowrap'
                      }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: isOnline ? '#10B981' : '#EF4444'
                        }} />
                        <span>{isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
                      </span>
                    </td>

                    {/* 6. Cohesive Action Buttons (Sticky Right khi thu nhỏ màn hình) */}
                    <td style={{
                      padding: '10px 12px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      right: 0,
                      zIndex: 1,
                      backgroundColor: rowBg,
                      boxShadow: '-3px 0 8px rgba(15, 23, 42, 0.04)'
                    }}>
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                        {/* Nút Xem Live */}
                        {onLiveView && (
                          <button
                            onClick={() => onLiveView(c)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              backgroundColor: '#0284C7',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              transition: 'background-color 0.15s ease'
                            }}
                            title="Xem luồng trực tiếp Main Stream Full HD"
                          >
                            <IconMaximize size={12} color="#FFF" />
                            <span>Live</span>
                          </button>
                        )}

                        {/* Nút Gán Module AI */}
                        <button
                          onClick={() => onAssignAi(c)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 9px',
                            backgroundColor: '#F5F3FF',
                            border: '1px solid #DDD6FE',
                            color: '#7C3AED',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            transition: 'all 0.15s ease'
                          }}
                          title="Cấu hình & gán Module AI (Biển số xe, Khuôn mặt, Hàng rào)"
                        >
                          <IconCamera size={12} color="#7C3AED" />
                          <span>Gán AI</span>
                        </button>

                        {/* Nút Sửa Thông Tin Camera */}
                        {can('DEVICE_MANAGE') && (
                          <button
                            onClick={() => onEditCamera(c)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #CBD5E1',
                              color: '#334155',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              transition: 'all 0.15s ease'
                            }}
                            title="Chỉnh sửa thông tin camera"
                          >
                            <IconEdit size={12} color="#475569" />
                            <span>Sửa</span>
                          </button>
                        )}

                        {/* Nút Xóa Camera */}
                        {can('DEVICE_MANAGE') && (
                          <button
                            onClick={() => onDeleteCamera(c.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '5px 8px',
                              backgroundColor: '#FEF2F2',
                              border: '1px solid #FECACA',
                              color: '#DC2626',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              transition: 'all 0.15s ease'
                            }}
                            title="Xóa camera khỏi cơ sở dữ liệu"
                          >
                            <IconTrash size={12} color="#DC2626" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Phân trang danh sách Camera */}
      {filteredCameras.length > 0 && (
        <PaginationBar
          currentPage={currentPage}
          totalPages={Math.max(1, Math.ceil(filteredCameras.length / pageSize))}
          totalItems={filteredCameras.length}
          pageSize={pageSize}
          pageSizeOptions={[6, 10, 20, 50]}
          itemLabel="camera"
          activeColor="#0284C7"
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
        />
      )}

      {/* 3. Hint footer */}
      <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: '#0284C7', fontWeight: 600 }}>Hướng dẫn:</span>
        <span>Bấm nút <strong>Gán AI</strong> để bật/tắt nhận diện Biển số (ANPR), FaceID hoặc Hàng rào ảo cho từng camera cụ thể; bấm <strong>Sửa</strong> để thay đổi IP, tài khoản kết nối. Dùng <strong>Ctrl+K</strong> để tìm kiếm nhanh.</span>
      </div>
    </div>
  );
};

export default CameraTable;
