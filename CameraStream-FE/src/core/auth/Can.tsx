import React from 'react';
import { useAuth } from './AuthContext';

interface CanProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Component Can: Kiểm soát hiển thị nút bấm/nội dung theo quyền hạn.
 * Nếu user có quyền (hoặc Super Admin/Admin) -> render children
 * Nếu không có -> render fallback (mặc định null)
 */
export const Can: React.FC<CanProps> = ({ permission, fallback = null, children }) => {
  const { can } = useAuth();
  if (can(permission)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
};

export default Can;

