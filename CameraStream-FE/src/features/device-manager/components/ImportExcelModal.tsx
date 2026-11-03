import { useState, type FC, type ChangeEvent } from 'react';
import {
  IconClose,
  IconUpload,
  IconFileSpreadsheet,
  IconTable,
  IconCheck
} from '../../../components/SurveillanceIcons';

export interface ImportCameraItem {
  name: string;
  ipAddress: string;
  rtspPort: number;
  onvifPort: number;
  location: string;
  username?: string;
  password?: string;
  type: string;
  rtspSourceUrl?: string;
}

export interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBaseUrl: string;
  onImportSuccess: () => Promise<void>;
}

export const ImportExcelModal: FC<ImportExcelModalProps> = ({
  isOpen,
  onClose,
  apiBaseUrl,
  onImportSuccess
}) => {
  const [importMode, setImportMode] = useState<'FILE' | 'PASTE'>('FILE');
  const [pastedText, setPastedText] = useState<string>('');
  const [importPreviewList, setImportPreviewList] = useState<ImportCameraItem[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  if (!isOpen) return null;

  const normalizeCameraType = (rawType: string): string => {
    if (!rawType) return 'IN_GATE';
    const lower = rawType.toLowerCase().trim();
    if (lower.includes('vào') || lower === 'in_gate' || lower === 'in') return 'IN_GATE';
    if (lower.includes('ra') || lower === 'out_gate' || lower === 'out') return 'OUT_GATE';
    if (lower.includes('toàn cảnh') || lower === 'overview') return 'OVERVIEW';
    if (lower.includes('giao thông') || lower === 'traffic') return 'TRAFFIC';
    if (lower.includes('cố định') || lower === 'fixed') return 'FIXED';
    if (lower.includes('hàng rào') || lower === 'perimeter') return 'PERIMETER';
    if (lower.includes('giám sát') || lower === 'surveillance') return 'SURVEILLANCE';
    if (lower.includes('tùy chỉnh') || lower === 'custom') return 'CUSTOM';
    return rawType.toUpperCase().replace(/\s+/g, '_');
  };

  const parseRawText = (raw: string): ImportCameraItem[] => {
    if (!raw || !raw.trim()) return [];
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return [];

    let delimiter = ',';
    if (lines[0].includes('\t')) delimiter = '\t';
    else if (lines[0].includes(';') && !lines[0].includes(',')) delimiter = ';';

    const parseLine = (line: string): string[] => {
      if (delimiter === '\t') {
        return line.split('\t').map((c) => c.replace(/^["']|["']$/g, '').trim());
      }
      const pattern = new RegExp(`(?:^|${delimiter})(?:"([^"]*)"|([^"${delimiter}]*))`, 'g');
      const cells: string[] = [];
      let match;
      while ((match = pattern.exec(line)) !== null) {
        cells.push((match[1] !== undefined ? match[1] : match[2] || '').trim());
      }
      return cells;
    };

    const firstCells = parseLine(lines[0]).map((c) => c.toLowerCase());
    const isHeader = firstCells.some((c) =>
      c.includes('tên') || c.includes('name') || c.includes('ip') || c.includes('địa điểm') || c.includes('location')
    );

    // Phát hiện cột theo header nếu có
    let nameIdx = -1;
    let ipIdx = -1;
    let rtspIdx = -1;
    let onvifIdx = -1;
    let locIdx = -1;
    let userIdx = -1;
    let passIdx = -1;
    let typeIdx = -1;
    let rtspUrlIdx = -1;

    if (isHeader) {
      firstCells.forEach((c, idx) => {
        if (c.includes('tên') || c.includes('name')) nameIdx = idx;
        else if (c.includes('ip')) ipIdx = idx;
        else if (c.includes('onvif')) onvifIdx = idx;
        else if ((c.includes('rtsp') || c.includes('cổng')) && !c.includes('luồng') && !c.includes('url')) rtspIdx = idx;
        else if (c.includes('địa điểm') || c.includes('khu vực') || c.includes('location')) locIdx = idx;
        else if (c.includes('tài khoản') || c.includes('user') || c.includes('acc')) userIdx = idx;
        else if (c.includes('mật khẩu') || c.includes('pass') || c.includes('pwd')) passIdx = idx;
        else if (c.includes('loại') || c.includes('type')) typeIdx = idx;
        else if (c.includes('luồng') || c.includes('url') || c.includes('source')) rtspUrlIdx = idx;
      });
    }

    const dataLines = isHeader ? lines.slice(1) : lines;

    return dataLines.map((line) => {
      const c = parseLine(line);
      // Nếu có header map được thì dùng theo map, ngược lại dùng vị trí mặc định
      if (nameIdx !== -1 && ipIdx !== -1) {
        return {
          name: c[nameIdx] || 'Camera Import',
          ipAddress: c[ipIdx] || '192.168.1.1',
          rtspPort: rtspIdx !== -1 && c[rtspIdx] ? parseInt(c[rtspIdx], 10) || 554 : 554,
          onvifPort: onvifIdx !== -1 && c[onvifIdx] ? parseInt(c[onvifIdx], 10) || 80 : 80,
          location: locIdx !== -1 ? (c[locIdx] || '') : '',
          username: userIdx !== -1 ? (c[userIdx] || '') : 'admin',
          password: passIdx !== -1 ? (c[passIdx] || '') : '',
          type: typeIdx !== -1 ? normalizeCameraType(c[typeIdx] || 'IN_GATE') : 'IN_GATE',
          rtspSourceUrl: rtspUrlIdx !== -1 ? (c[rtspUrlIdx] || '') : ''
        };
      }

      // Nhận diện theo số lượng cột (độ dài >= 7: định dạng mới 9 cột, độ dài < 7: định dạng cũ 4 cột)
      if (c.length >= 7) {
        return {
          name: c[0] || 'Camera Import',
          ipAddress: c[1] || '192.168.1.1',
          rtspPort: c[2] ? parseInt(c[2], 10) || 554 : 554,
          onvifPort: c[3] ? parseInt(c[3], 10) || 80 : 80,
          location: c[4] || '',
          username: c[5] || 'admin',
          password: c[6] || '',
          type: normalizeCameraType(c[7] || 'IN_GATE'),
          rtspSourceUrl: c[8] || ''
        };
      }

      // Hỗ trợ ngược file mẫu cũ 4 cột: [Tên Camera, Địa chỉ IP, Địa Điểm / Khu Vực, Cổng RTSP]
      return {
        name: c[0] || 'Camera Import',
        ipAddress: c[1] || '192.168.1.1',
        location: c[2] || '',
        rtspPort: c[3] ? parseInt(c[3], 10) || 554 : 554,
        onvifPort: 80,
        username: 'admin',
        password: '',
        type: 'IN_GATE',
        rtspSourceUrl: ''
      };
    }).filter((item) => Boolean(item.name && item.ipAddress));
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseRawText(text);
        if (parsed.length === 0) {
          setImportError('Không tìm thấy dữ liệu camera hợp lệ trong file.');
          return;
        }
        setImportPreviewList(parsed);
      } catch (err: any) {
        setImportError('Lỗi đọc file: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handlePasteParse = () => {
    setImportError(null);
    const parsed = parseRawText(pastedText);
    if (parsed.length === 0) {
      setImportError('Dữ liệu dán chưa đúng định dạng bảng.');
      return;
    }
    setImportPreviewList(parsed);
  };

  const downloadTemplate = () => {
    const headers = [
      'Tên Camera (*)',
      'Địa Chỉ IP (*)',
      'Cổng RTSP',
      'Cổng ONVIF',
      'Địa Điểm / Khu Vực',
      'Tài Khoản',
      'Mật Khẩu',
      'Phân Loại Luồng (Type)',
      'Luồng RTSP Nguồn (Tùy chọn)'
    ];
    const sample = [
      [
        'Camera Cổng Vào 01',
        '192.168.1.101',
        '554',
        '80',
        'Cổng Chính - Làn Xe Vào',
        'admin',
        'Admin@123',
        'IN_GATE',
        'rtsp://admin:Admin@123@192.168.1.101:554/Streaming/Channels/101'
      ],
      [
        'Camera Cổng Ra 02',
        '192.168.1.102',
        '554',
        '80',
        'Cổng Phụ - Làn Xe Ra',
        'admin',
        'Admin@123',
        'OUT_GATE',
        ''
      ],
      [
        'Camera Toàn Cảnh Sân Bãi',
        '192.168.1.103',
        '554',
        '80',
        'Bãi Đỗ Xe Trung Tâm',
        'admin',
        'Admin@123',
        'OVERVIEW',
        ''
      ]
    ];
    const csvContent = '\uFEFF' + [headers.join(','), ...sample.map((r) => r.map((c) => `"${c}"`).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau_danh_sach_camera_db.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExecuteImportToDb = async () => {
    if (importPreviewList.length === 0) return;

    setImportProgress({ current: 0, total: importPreviewList.length });
    let successCount = 0;

    for (let i = 0; i < importPreviewList.length; i++) {
      const item = importPreviewList[i];
      setImportProgress({ current: i + 1, total: importPreviewList.length });

      try {
        const res = await fetch(`${apiBaseUrl}/api/cameras`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name,
            ipAddress: item.ipAddress,
            location: item.location || '',
            onvifPort: item.onvifPort || 80,
            rtspPort: item.rtspPort || 554,
            username: item.username || '',
            password: item.password || '',
            type: item.type || 'IN_GATE',
            rtspSourceUrl: item.rtspSourceUrl || ''
          })
        });

        if (res.ok) {
          successCount++;
        }
      } catch (e) {
        console.error('Import error row', i, e);
      }
    }

    setImportProgress(null);
    setImportPreviewList([]);
    setPastedText('');

    await onImportSuccess();
    alert(`Đã lưu thành công ${successCount}/${importPreviewList.length} camera vào Cơ Sở Dữ Liệu!`);
    onClose();
  };

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
          backgroundColor: '#1E242E',
          border: '2px solid #0284C7',
          borderRadius: '12px',
          width: '90vw',
          maxWidth: '800px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 20px', backgroundColor: '#11161D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconUpload size={17} color="#38BDF8" />
            <span>Nhập Danh Sách Camera & Địa Điểm Vào Database</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
            }}
            title="Đóng cửa sổ"
          >
            <IconClose size={16} color="#94A3B8" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <button
              onClick={() => setImportMode('FILE')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px',
                backgroundColor: importMode === 'FILE' ? '#0284C7' : '#11161D',
                color: '#FFF',
                border: '1px solid #334155',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px'
              }}
            >
              <IconFileSpreadsheet size={15} color="#FFF" />
              <span>Tải Lên File Excel (.csv, .xlsx)</span>
            </button>
            <button
              onClick={() => setImportMode('PASTE')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px',
                backgroundColor: importMode === 'PASTE' ? '#0284C7' : '#11161D',
                color: '#FFF',
                border: '1px solid #334155',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px'
              }}
            >
              <IconTable size={15} color="#FFF" />
              <span>Dán Bảng Tính (Ctrl + V)</span>
            </button>
          </div>

          {importMode === 'FILE' ? (
            <div style={{ border: '2px dashed #0284C7', borderRadius: '8px', padding: '24px', textAlign: 'center', backgroundColor: 'rgba(2, 132, 199, 0.05)' }}>
              <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} id="import-file" style={{ display: 'none' }} />
              <label htmlFor="import-file" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#0284C7', color: '#FFF', padding: '9px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                <IconUpload size={15} color="#FFF" />
                <span>Chọn file CSV / Excel từ máy tính</span>
              </label>
              <div style={{ marginTop: '10px' }}>
                <button onClick={downloadTemplate} style={{ background: 'none', border: 'none', color: '#38BDF8', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' }}>
                  Tải file mẫu tại đây
                </button>
              </div>
            </div>
          ) : (
            <div>
              <textarea
                rows={5}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Quét chọn các dòng trong Excel -> Bấm Ctrl + C -> Dán vào đây..."
                style={{ width: '100%', padding: '10px', backgroundColor: '#11161D', border: '1px solid #334155', color: '#FFF', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}
              />
              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <button onClick={handlePasteParse} style={{ padding: '6px 14px', backgroundColor: '#0284C7', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                  Phân Tích
                </button>
              </div>
            </div>
          )}

          {importError && (
            <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#F87171', borderRadius: '4px', fontSize: '12px' }}>
              {importError}
            </div>
          )}

          {/* Bảng Preview */}
          {importPreviewList.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#34D399', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconCheck size={15} color="#34D399" />
                <span>Sẵn sàng lưu {importPreviewList.length} camera vào Database:</span>
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #334155', borderRadius: '4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: '#0B0F17', color: '#94A3B8', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '6px 10px' }}>STT</th>
                      <th style={{ padding: '6px 10px' }}>Tên Camera</th>
                      <th style={{ padding: '6px 10px' }}>IP & Cổng</th>
                      <th style={{ padding: '6px 10px' }}>Địa Điểm</th>
                      <th style={{ padding: '6px 10px' }}>Tài Khoản</th>
                      <th style={{ padding: '6px 10px' }}>Phân Loại</th>
                      <th style={{ padding: '6px 10px' }}>RTSP Nguồn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewList.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #283242' }}>
                        <td style={{ padding: '6px 10px' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: '#FFF' }}>{item.name}</td>
                        <td style={{ padding: '6px 10px', color: '#FDE047', fontFamily: 'monospace' }}>
                          {item.ipAddress}:{item.rtspPort}
                          <span style={{ color: '#94A3B8', fontSize: '10.5px', marginLeft: '4px' }}>
                            (ONVIF:{item.onvifPort})
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', color: '#38BDF8' }}>{item.location || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#CBD5E1' }}>{item.username || 'admin'}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 600,
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                            color: '#38BDF8'
                          }}>
                            {item.type}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', color: '#94A3B8', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.rtspSourceUrl || ''}>
                          {item.rtspSourceUrl ? item.rtspSourceUrl : <span style={{ color: '#64748B' }}>Tự sinh</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importProgress && (
            <div style={{ marginTop: '16px', textAlign: 'center', color: '#38BDF8', fontSize: '13px', fontWeight: 600 }}>
              Đang lưu dữ liệu vào Database: {importProgress.current} / {importProgress.total} camera...
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', backgroundColor: '#11161D', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onClose}
            disabled={Boolean(importProgress)}
            style={{ padding: '6px 14px', backgroundColor: '#334155', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
          >
            Hủy
          </button>
          <button
            onClick={handleExecuteImportToDb}
            disabled={importPreviewList.length === 0 || Boolean(importProgress)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 18px',
              backgroundColor: importPreviewList.length > 0 ? '#10B981' : '#475569',
              color: '#FFF',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '12px',
              cursor: importPreviewList.length > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            <IconCheck size={14} color="#FFF" />
            <span>Xác Nhận Lưu {importPreviewList.length} Camera Vào Database</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportExcelModal;
