import { useState, type FC } from 'react';
import { IconRefresh, IconFileSpreadsheet } from '../../components/SurveillanceIcons';
import { toast } from '../utils/toast';

export type ExportProgressCallback = (loadedRows: number, totalRows: number) => void;

export interface ExportExcelButtonProps {
  /** Hàm async thực hiện xuất (nhận callback onProgress để cập nhật tiến độ chia chunk 500 dòng). Throw Error nếu thất bại. */
  onExport: (onProgress: ExportProgressCallback) => Promise<void> | void;
  /** Class CSS tùy chỉnh (override toàn bộ class mặc định) */
  className?: string;
  /** Text hiển thị trên nút */
  buttonText?: string;
  /** Text khi đang xuất */
  loadingText?: string;
  toastStartMessage?: string;
  toastSuccessMessage?: string;
  toastErrorMessage?: string;
}

/**
 * Nút Xuất Excel tái sử dụng (chuẩn hóa theo HPticket FE + Chunked 500 dòng/lần).
 * - Tự quản lý trạng thái isExporting & hiển thị tiến độ % (loaded/total) theo từng chunk 500 dòng
 * - Tự động phát Toast bắt đầu / thành công / lỗi
 * - Tự disable + đổi icon xoay khi đang xuất
 */
export const ExportExcelButton: FC<ExportExcelButtonProps> = ({
  onExport,
  className,
  buttonText = 'Xuất Excel',
  loadingText = 'Đang xuất...',
  toastStartMessage = 'Đang tải dữ liệu theo từng cụm (500 dòng/lần), vui lòng đợi...',
  toastSuccessMessage = 'Xuất dữ liệu Excel thành công!',
  toastErrorMessage = 'Lỗi khi xuất file Excel. Vui lòng thử lại sau.'
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState<string>('');

  const handleClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setProgressText('');
    toast.info(toastStartMessage);

    try {
      await onExport((loaded, total) => {
        if (total > 0) {
          const pct = Math.min(100, Math.round((loaded / total) * 100));
          setProgressText(`${pct}% (${loaded}/${total})`);
        } else if (loaded > 0) {
          setProgressText(`${loaded} dòng`);
        }
      });
      toast.success(toastSuccessMessage);
    } catch (error: any) {
      console.error('[ExportExcelButton] Lỗi xuất Excel:', error);
      toast.error(error?.message || toastErrorMessage);
    } finally {
      setIsExporting(false);
      setProgressText('');
    }
  };

  const defaultStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: isExporting ? '#ECFDF5' : '#059669',
    border: `1px solid ${isExporting ? '#6EE7B7' : '#059669'}`,
    borderRadius: '6px',
    fontSize: '11.5px',
    fontWeight: 600,
    color: isExporting ? '#059669' : '#FFFFFF',
    cursor: isExporting ? 'wait' : 'pointer',
    transition: 'all 0.15s ease',
    opacity: isExporting ? 0.85 : 1,
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 1px 2px rgba(5, 150, 105, 0.2)'
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isExporting}
      className={className}
      style={!className ? defaultStyle : undefined}
      title={isExporting ? 'Đang xuất file, vui lòng chờ...' : 'Xuất dữ liệu ra file Excel'}
    >
      {isExporting ? (
        <IconRefresh size={13} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        <IconFileSpreadsheet size={13} />
      )}
      <span>
        {isExporting
          ? progressText
            ? `Đang tải ${progressText}`
            : loadingText
          : buttonText}
      </span>
    </button>
  );
};

export default ExportExcelButton;
