import { useState, useEffect, type FC, type FormEvent } from 'react';
import { SingleCameraPlayer, type CameraDto } from '../../components/CameraStreamView';
import { getBackendBaseUrl } from '../../shared/utils/envConfig';
import { toast } from '../../shared/utils/toast';
import {
  listGates,
  createGate,
  updateGate,
  deleteGate,
  type GateDto,
  type GateInput
} from './gates';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconRefresh,
  IconCamera,
  IconMapPin,
  IconClose,
  IconCheck
} from '../../components/SurveillanceIcons';

export interface VehicleGateModuleProps {
  apiBaseUrl?: string;
}

const EMPTY_FORM: GateInput = {
  code: '',
  name: '',
  location: '',
  description: '',
  active: true
};

/**
 * Phân hệ "Làn Cổng Gate" (KỊCH BẢN §1.2 / Q13)
 *
 * Bản quản lý danh mục cổng/khu vực (bảng `gates`, V16):
 *  - Danh sách gate + thêm / sửa / xóa (gọi API /api/gates)
 *  - Camera được gắn "địa điểm" = gate mà ta chọn (Code + Tên)
 *    → camera.location được gán bằng name của gate (gán lại khi edit)
 *  - Dưới cùng: xem trực tiếp các camera đã gán theo Làn Cổng (CameraStreamView)
 */
export const VehicleGateModule: FC<VehicleGateModuleProps> = ({
  apiBaseUrl = getBackendBaseUrl()
}) => {
  const [gates, setGates] = useState<GateDto[]>([]);
  const [cameras, setCameras] = useState<CameraDto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Form gate (add mới hoặc sửa)
  const [form, setForm] = useState<GateInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [assignedCamIds, setAssignedCamIds] = useState<number[]>([]);

  // Camera gắn cho gate đang chọn (để xem trực tiếp)
  const [selectedGateId, setSelectedGateId] = useState<number | null>(null);

  /** Camera đã gắn Làn Cổng này (camera.location === gate.name hoặc gate.code). */
  const camerasOfGate = (gate: GateDto) =>
    cameras.filter((c) => {
      const loc = (c.location || '').trim().toLowerCase();
      if (!loc) return false;
      return (
        loc === gate.name.trim().toLowerCase() ||
        loc === gate.code.trim().toLowerCase()
      );
    });

  const updateCameraLocation = async (cam: CameraDto, newLocation: string, gateCode?: string) => {
    const validTypes = new Set(['IN_GATE', 'OUT_GATE', 'OVERVIEW', 'TRAFFIC', 'FIXED', 'PERIMETER', 'SURVEILLANCE', 'CUSTOM']);
    const nextType = gateCode && validTypes.has(gateCode) ? gateCode : (cam.type || 'IN_GATE');
    const res = await fetch(`${apiBaseUrl}/api/cameras/${cam.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cam.name,
        ipAddress: cam.ipAddress,
        location: newLocation,
        onvifPort: cam.onvifPort || 80,
        rtspPort: cam.rtspPort || 554,
        username: cam.username || 'admin',
        type: nextType,
        rtspSourceUrl: cam.rtspSourceUrl || ''
      })
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.message || `Không thể gán camera #${cam.id} (HTTP ${res.status})`);
    }
  };

  const reload = async () => {
    setLoading(true);
    try {
      const [gatesRes, camsRes] = await Promise.all([
        listGates(apiBaseUrl),
        fetch(`${apiBaseUrl}/api/cameras`).then((r) => r.json())
      ]);
      setGates(gatesRes);
      const cams = camsRes?.data;
      setCameras(Array.isArray(cams) ? cams : []);
    } catch (err: any) {
      toast.error(err?.message || 'Không tải được danh mục Làn Cổng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAssignedCamIds([]);
    setShowForm(true);
  };

  const openEdit = (g: GateDto) => {
    setForm({
      code: g.code,
      name: g.name,
      location: g.location || '',
      description: g.description || '',
      active: g.active
    });
    setEditingId(g.id);
    setAssignedCamIds(camerasOfGate(g).map((c) => c.id));
    setShowForm(true);
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let savedGate: GateDto;
      const prevGate = editingId != null ? gates.find((g) => g.id === editingId) : null;
      const previouslyAssignedIds = prevGate ? new Set(camerasOfGate(prevGate).map((c) => c.id)) : new Set<number>();

      if (editingId != null) {
        savedGate = await updateGate(editingId, form, apiBaseUrl);
      } else {
        savedGate = await createGate(form, apiBaseUrl);
      }

      // Đồng bộ gán / gỡ Camera cho Làn Cổng vừa lưu
      const targetIds = new Set(assignedCamIds);
      const camUpdates: Promise<void>[] = [];

      for (const cam of cameras) {
        if (targetIds.has(cam.id)) {
          if ((cam.location || '').trim() !== savedGate.name.trim()) {
            camUpdates.push(updateCameraLocation(cam, savedGate.name, savedGate.code));
          }
        } else if (previouslyAssignedIds.has(cam.id)) {
          camUpdates.push(updateCameraLocation(cam, ''));
        }
      }

      if (camUpdates.length > 0) {
        await Promise.all(camUpdates);
      }

      toast.success(
        editingId != null
          ? `Đã cập nhật Làn Cổng "${savedGate.name}" và đồng bộ ${assignedCamIds.length} camera.`
          : `Đã tạo Làn Cổng "${savedGate.name}" và gán ${assignedCamIds.length} camera.`
      );

      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      setAssignedCamIds([]);
      setSelectedGateId(savedGate.id);
      await reload();
    } catch (err: any) {
      toast.error(err?.message || 'Không lưu được Làn Cổng.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: GateDto) => {
    if (!window.confirm(`Bạn có chắc muốn xóa Làn Cổng "${g.name}" (mã ${g.code})?`)) return;
    try {
      await deleteGate(g.id, apiBaseUrl);
      toast.success(`Đã xóa Làn Cổng "${g.name}".`);
      if (selectedGateId === g.id) setSelectedGateId(null);
      await reload();
    } catch (err: any) {
      toast.error(err?.message || 'Không xóa được Làn Cổng.');
    }
  };

  const selectedGate = gates.find((g) => g.id === selectedGateId) || null;
  const selectedCameras = selectedGate ? camerasOfGate(selectedGate) : [];
  const unassignedOrOtherCameras = selectedGate
    ? cameras.filter((c) => !selectedCameras.some((sc) => sc.id === c.id))
    : [];

  const handleQuickAssignCamera = async (camIdStr: string) => {
    if (!selectedGate || !camIdStr) return;
    const cam = cameras.find((c) => String(c.id) === camIdStr);
    if (!cam) return;
    try {
      await updateCameraLocation(cam, selectedGate.name, selectedGate.code);
      toast.success(`Đã gán camera "${cam.name}" vào Làn Cổng "${selectedGate.name}".`);
      await reload();
    } catch (err: any) {
      toast.error(err?.message || 'Không gán được camera vào cổng.');
    }
  };

  const handleQuickUnassignCamera = async (cam: CameraDto) => {
    if (!selectedGate) return;
    try {
      await updateCameraLocation(cam, '');
      toast.success(`Đã gỡ camera "${cam.name}" khỏi Làn Cổng "${selectedGate.name}".`);
      await reload();
    } catch (err: any) {
      toast.error(err?.message || 'Không gỡ được camera khỏi cổng.');
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: '20px 24px', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ==================== PHẦN 1: QUẢN LÝ DANH MỤC LÀN CỔNG ==================== */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingBottom: '14px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconCamera size={19} color="#0284C7" />
              <span>Làn Cổng Gate — Danh Mục Địa Điểm</span>
            </h2>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
              Quản lý các cổng/khu vực để gán "địa điểm" cho camera. Camera sẽ chọn Làn Cổng ở đây (theo Code + Tên).
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={openCreate}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', backgroundColor: '#059669', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 3px rgba(5,150,105,0.25)' }}
            >
              <IconPlus size={14} color="#FFF" />
              <span>Thêm Làn Cổng</span>
            </button>
            <button
              onClick={reload}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', backgroundColor: '#FFF', border: '1px solid #CBD5E1', color: '#0284C7', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              title="Tải lại"
            >
              <IconRefresh size={14} color="#0284C7" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
            </button>
          </div>
        </div>

        {/* Form thêm/sửa */}
        {showForm && (
          <form onSubmit={submitForm} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px 0', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#475569', fontWeight: 700, marginBottom: '4px' }}>Mã (Code) (*)</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="VD: IN_GATE"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#475569', fontWeight: 700, marginBottom: '4px' }}>Tên Làn Cổng / Địa Điểm (*)</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: Cổng Vào Chính"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #93C5FD', borderRadius: '8px', fontSize: '13px', fontWeight: 700, color: '#1D4ED8', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#475569', fontWeight: 700, marginBottom: '4px' }}>Khu Vực / Mô Tả</label>
                <input
                  type="text"
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="VD: Làn xe vào cổng chính"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '12.5px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', fontWeight: 700, marginTop: '18px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.active !== false}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: '#059669', cursor: 'pointer' }}
                  />
                  Đang hoạt động
                </label>
              </div>
            </div>

            {/* Gán Camera trực tiếp vào Làn Cổng này */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconCamera size={14} color="#0284C7" />
                <span>Gán Thiết Bị Camera Vào Làn Cổng Này ({assignedCamIds.length}/{cameras.length} camera đã chọn)</span>
              </div>
              {cameras.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>
                  Chưa có camera nào trong hệ thống.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                  {cameras.map((cam) => {
                    const checked = assignedCamIds.includes(cam.id);
                    return (
                      <label
                        key={cam.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: checked ? '1.5px solid #0284C7' : '1px solid #CBD5E1',
                          backgroundColor: checked ? '#EFF6FF' : '#FFFFFF',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAssignedCamIds((prev) => [...prev, cam.id]);
                            } else {
                              setAssignedCamIds((prev) => prev.filter((id) => id !== cam.id));
                            }
                          }}
                          style={{ width: '15px', height: '15px', accentColor: '#0284C7', cursor: 'pointer' }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            #{cam.id} • {cam.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                            {cam.ipAddress} {cam.location ? `• [${cam.location}]` : '• [Chưa gán]'}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setEditingId(null); setAssignedCamIds([]); }}
                style={{ padding: '8px 14px', backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: saving ? '#94A3B8' : '#059669', color: '#FFF', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}
              >
                {saving ? <IconRefresh size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <IconCheck size={13} color="#FFF" />}
                <span>{editingId != null ? 'Cập Nhật & Gán Cam' : 'Lưu Làn Cổng & Gán Cam'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Bảng danh sách Làn Cổng */}
        <div style={{ marginTop: '14px', overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '12px' }}>MÃ (CODE)</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '12px' }}>TÊN / ĐỊA ĐIỂM</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '12px' }}>MÔ TẢ</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '12px', textAlign: 'center' }}>CAMERA GÁN</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '12px', textAlign: 'center' }}>TRẠNG THÁI</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, fontSize: '12px', textAlign: 'right' }}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {gates.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>
                    Chưa có Làn Cổng nào. Nhấn "Thêm Làn Cổng" để tạo mới.
                  </td>
                </tr>
              ) : (
                gates.map((g) => (
                  <tr key={g.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#1E293B' }}>{g.code}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <IconMapPin size={14} color="#0284C7" />
                      {g.name}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748B', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '10px', backgroundColor: '#F1F5F9', color: '#334155', fontSize: '11px', fontWeight: 700 }}>
                        {camerasOfGate(g).length} camera
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: g.active ? '#DCFCE7' : '#FEE2E2',
                        color: g.active ? '#15803D' : '#991B1B'
                      }}>
                        {g.active ? 'HOẠT ĐỘNG' : 'TẮT'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setSelectedGateId(g.id === selectedGateId ? null : g.id)}
                        title="Xem camera đã gán Làn Cổng này"
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: selectedGateId === g.id ? '#0284C7' : '#FFF', color: selectedGateId === g.id ? '#FFF' : '#0284C7', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Xem
                      </button>
                      <button
                        onClick={() => openEdit(g)}
                        title="Sửa Làn Cổng & Gán Camera"
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', color: '#475569', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <IconEdit size={12} /> Sửa & Gán Cam
                      </button>
                      <button
                        onClick={() => handleDelete(g)}
                        title="Xóa Làn Cổng"
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #FECACA', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <IconTrash size={12} /> Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== PHẦN 2: CAMERA ĐÃ GÁN LÀN CỔNG (XEM TRỰC TIẾP) ==================== */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconCamera size={17} color="#059669" />
              <span>Camera Đã Gán Làn Cổng</span>
            </h3>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
              {selectedGate
                ? `Làn Cổng "${selectedGate.name}" (mã ${selectedGate.code}) — ${selectedCameras.length} camera`
                : 'Chọn một Làn Cổng ở trên (nút "Xem") để xem và gán nhanh camera.'}
            </div>
          </div>
          {selectedGate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {unassignedOrOtherCameras.length > 0 && (
                <select
                  value=""
                  onChange={(e) => handleQuickAssignCamera(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1.5px solid #93C5FD',
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="">+ Gán nhanh Camera vào cổng "{selectedGate.name}"...</option>
                  {unassignedOrOtherCameras.map((cam) => (
                    <option key={cam.id} value={String(cam.id)}>
                      #{cam.id} — {cam.name} ({cam.ipAddress}) {cam.location ? `[Đang ở: ${cam.location}]` : '[Chưa gán]'}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setSelectedGateId(null)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                <IconClose size={13} color="#64748B" />
                <span>Bỏ chọn</span>
              </button>
            </div>
          )}
        </div>

        {selectedGate && selectedCameras.length > 0 ? (
          <div
            style={{
              marginTop: '14px',
              display: 'grid',
              gridTemplateColumns: selectedCameras.length > 1 ? 'repeat(auto-fit, minmax(380px, 1fr))' : '1fr',
              gap: '16px'
            }}
          >
            {selectedCameras.map((cam) => (
              <div key={cam.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                    #{cam.id} • {cam.name} ({cam.ipAddress})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQuickUnassignCamera(cam)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid #FECACA',
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Gỡ khỏi cổng
                  </button>
                </div>
                <SingleCameraPlayer
                  camera={cam}
                  apiBaseUrl={apiBaseUrl}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: '14px', padding: '28px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic', fontSize: '13px', border: '1px dashed #E2E8F0', borderRadius: '10px' }}>
            {selectedGate
              ? `Chưa có camera nào gán Làn Cổng "${selectedGate.name}". Hãy chọn "+ Gán nhanh Camera..." ở góc phải bên trên hoặc bấm "Sửa & Gán Cam".`
              : '—'}
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleGateModule;
