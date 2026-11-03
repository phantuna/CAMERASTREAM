import { useState, type FC, type CSSProperties } from 'react';

export interface SnapshotImageProps {
  /** URL ảnh (tuyệt đối hoặc tương đối — xem `resolveImageUrl`). */
  src?: string;
  alt: string;
  /** Nội dung hiển thị khi ảnh không tải được. */
  fallbackText?: string;
  style?: CSSProperties;
  className?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  priority?: boolean;
  onClick?: () => void;
}

/**
 * Ảnh snapshot có fallback.
 *
 * Ảnh lưu ra file và bị job retention xóa sau 30 ngày, nhưng DB vẫn giữ URL.
 * Khi đó `<img>` bắn `onError` — nếu không xử lý, giao diện hiện icon ảnh vỡ.
 * Đây là trạng thái BÌNH THƯỜNG, không phải lỗi, nên không log ra console.
 */
export const SnapshotImage: FC<SnapshotImageProps> = ({
  src,
  alt,
  fallbackText = 'Không có hình ảnh',
  style,
  className,
  loading,
  fetchPriority,
  priority = false,
  onClick
}) => {
  // Lưu URL đã hỏng thay vì boolean: danh sách detection thay đổi liên tục,
  // nếu chỉ giữ cờ `failed` thì ảnh MỚI cũng bị hiện placeholder.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94A3B8',
          fontSize: '11px',
          ...style
        }}
        className={className}
        onClick={onClick}
      >
        {fallbackText}
      </div>
    );
  }

  const effectiveLoading = priority ? 'eager' : (loading || 'lazy');
  const effectiveFetchPriority = priority ? 'high' : (fetchPriority || (effectiveLoading === 'eager' ? 'high' : 'auto'));

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      className={className}
      loading={effectiveLoading}
      fetchPriority={effectiveFetchPriority}
      decoding={priority ? 'sync' : 'async'}
      onClick={onClick}
      onError={() => setFailedSrc(src)}
    />
  );
};

export default SnapshotImage;
