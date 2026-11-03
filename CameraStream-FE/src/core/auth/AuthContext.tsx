import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Role, UserRole } from './types';
import { getBackendBaseUrl } from '../../shared/utils/envConfig';
import { toast } from '../../shared/utils/toast';

/**
 * AuthContext (KỊCH BẢN §4 Block C1 — Q14: DB là nguồn sự thật duy nhất)
 *
 * Thay đổi so với bản cũ:
 *  - XÓA hoàn toàn kho user/role giả trong localStorage
 *    (camerastream_users_db_v2 / camerastream_roles_db_v2 / DEFAULT_*).
 *  - XÓA backdoor login: không còn fallback mật khẩu '123456' / 'admin123'
 *    khi backend không reachable. Login 100% qua backend thật.
 *  - 8 hàm mutation (user/role) gọi đúng endpoint backend (E1–E6).
 *    Lỗi -> toast.error (KHÔNG catch {} im lặng), sau đó re-fetch danh sách.
 *  - Thành công: không toast ở đây (component IAMModule tự toast success),
 *    mutation THROW khi lỗi để component không hiển thị toast success sai.
 *  - Session (user hiện tại + token) VẪN giữ trong localStorage —
 *    đây là thứ duy nhất còn dùng localStorage.
 */
interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  can: (permissionCode: string) => boolean;
  users: User[];
  roles: Role[];
  createUser: (userData: Partial<User> & { password?: string }) => Promise<void>;
  updateUser: (id: string | number, userData: Partial<User> & { password?: string }) => Promise<void>;
  deleteUsers: (ids: (string | number)[]) => Promise<void>;
  toggleUserActive: (id: string | number) => Promise<void>;
  createRole: (roleData: Partial<Role>) => Promise<void>;
  updateRole: (id: string | number, roleData: Partial<Role>) => Promise<void>;
  deleteRoles: (ids: (string | number)[]) => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Đọc `json.message` từ thân response (khi lỗi), hoặc fallback. */
const extractError = async (res: Response, fallback: string): Promise<string> => {
  try {
    const json = await res.json();
    if (json && typeof json.message === 'string' && json.code !== 200) return json.message;
  } catch {
    /* body không phải json */
  }
  return fallback;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Danh sách lấy TỪ CSDL (không còn localStorage). Khởi đầu rỗng.
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const base = getBackendBaseUrl();

  /** Lấy danh sách user từ backend (GET /api/users). */
  const refreshUsers = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/users`, { credentials: 'include' });
      if (!res.ok) return; // 401/403: không có quyền, giữ nguyên danh sách hiện có
      const json = await res.json();
      if (json.code === 200 && Array.isArray(json.data)) {
        setUsers(json.data as User[]);
      }
    } catch {
      /* offline / backend chết: giữ nguyên */
    }
  }, [base]);

  /** Lấy danh sách role (kèm permissions) từ backend (GET /api/roles). */
  const refreshRoles = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/roles`, { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.code === 200 && Array.isArray(json.data)) {
        setRoles(json.data as Role[]);
      }
    } catch {
      /* offline / backend chết: giữ nguyên */
    }
  }, [base]);

  // Kiểm tra session đã lưu (user + token) trên mount + tải danh sách từ DB
  useEffect(() => {
    const savedUser = localStorage.getItem('camerastream_user');
    const savedToken = localStorage.getItem('camerastream_token');
    if (savedUser && savedToken) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        setToken(savedToken);
        void refreshUsers();
        void refreshRoles();
      } catch {
        localStorage.removeItem('camerastream_user');
        localStorage.removeItem('camerastream_token');
      }
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // LOGIN — 100% backend. Không còn fallback mật khẩu (Q14).
  // ------------------------------------------------------------------
  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json && json.code === 200 && json.data) {
        const d = json.data;
        const authUser: User = {
          id: d.id,
          username: d.username || username,
          fullName: d.fullName || username,
          email: d.email,
          phone: d.phone,
          role: (d.role || 'SUPER_ADMIN') as UserRole,
          roleName: d.roleName,
          permissions: d.permissions || [],
          active: d.active ?? true,
          lastLoginAt: d.lastLoginAt,
          createdAt: d.createdAt
        };
        const authToken: string = d.token || `jwt_${authUser.username}_${Date.now()}`;
        setUser(authUser);
        setToken(authToken);
        localStorage.setItem('camerastream_user', JSON.stringify(authUser));
        localStorage.setItem('camerastream_token', authToken);
        setIsLoading(false);
        void refreshUsers();
        void refreshRoles();
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, message: json?.message || 'Đăng nhập thất bại.' };
    } catch {
      // Q14: backend không reachable -> báo rõ, KHÔNG fallback mật khẩu
      setIsLoading(false);
      return { success: false, message: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.' };
    }
  };

  const logout = () => {
    fetch(`${base}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
    setToken(null);
    setUsers([]);
    setRoles([]);
    localStorage.removeItem('camerastream_user');
    localStorage.removeItem('camerastream_token');
  };

  const can = useCallback((permissionCode: string): boolean => {
    if (!user) return false;
    const r = (user.role || '').toUpperCase();
    if (
      r === 'SUPER_ADMIN' ||
      r === 'ADMIN' ||
      r === 'ROLE_SUPER_ADMIN' ||
      r === 'ROLE_ADMIN' ||
      user.username?.toLowerCase() === 'admin'
    ) {
      return true;
    }
    return user.permissions?.includes(permissionCode) || false;
  }, [user]);

  // ------------------------------------------------------------------
  // USER MUTATIONS — E6 (POST), E4 (PUT), E5 (DELETE), toggle (PATCH)
  // ------------------------------------------------------------------
  const createUser = async (userData: Partial<User> & { password?: string }) => {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: userData.username,
        fullName: userData.fullName,
        email: userData.email,
        phone: userData.phone,
        role: userData.role,
        active: userData.active,
        password: userData.password
      })
    });
    if (!res.ok) {
      const msg = await extractError(res, 'Không tạo được tài khoản.');
      toast.error(msg);
      throw new Error(msg);
    }
    await refreshUsers();
  };

  const updateUser = async (id: string | number, userData: Partial<User> & { password?: string }) => {
    const res = await fetch(`${base}/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fullName: userData.fullName,
        email: userData.email,
        phone: userData.phone,
        role: userData.role,
        active: userData.active,
        // password rỗng/undefined = giữ mật khẩu cũ (Q18: admin đặt lại)
        ...(userData.password ? { password: userData.password } : {})
      })
    });
    if (!res.ok) {
      const msg = await extractError(res, 'Không cập nhật được tài khoản.');
      toast.error(msg);
      throw new Error(msg);
    }
    await refreshUsers();
    // Nếu vừa sửa chính mình, cập nhật lại session + localStorage
    if (user && String(user.id) === String(id)) {
      const fresh = await refreshUsersAndGet(id);
      if (fresh) {
        setUser(fresh);
        localStorage.setItem('camerastream_user', JSON.stringify(fresh));
      }
    }
  };

  const refreshUsersAndGet = async (id: string | number): Promise<User | null> => {
    try {
      const res = await fetch(`${base}/api/users`, { credentials: 'include' });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.code !== 200 || !Array.isArray(json.data)) return null;
      const list = json.data as User[];
      setUsers(list);
      return list.find((u) => String(u.id) === String(id)) || null;
    } catch {
      return null;
    }
  };

  const deleteUsers = async (ids: (string | number)[]) => {
    for (const id of ids) {
      const res = await fetch(`${base}/api/users/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const msg = await extractError(res, 'Không xóa được tài khoản.');
        toast.error(msg);
        throw new Error(msg); // dừng tại lỗi đầu tiên (vd guard "không xoá admin cuối"); component không toast success giả
      }
    }
    await refreshUsers();
  };

  const toggleUserActive = async (id: string | number) => {
    const res = await fetch(`${base}/api/users/${id}/toggle-active`, {
      method: 'PATCH',
      credentials: 'include'
    });
    if (!res.ok) {
      const msg = await extractError(res, 'Không đổi được trạng thái tài khoản.');
      toast.error(msg);
      throw new Error(msg);
    }
    await refreshUsers();
  };

  // ------------------------------------------------------------------
  // ROLE MUTATIONS — E1 (POST), E2 (PUT), E3 (DELETE), E7 (GET kèm perm)
  // ------------------------------------------------------------------
  const createRole = async (roleData: Partial<Role>) => {
    const res = await fetch(`${base}/api/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        code: roleData.code,
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions || [],
        active: roleData.active
      })
    });
    if (!res.ok) {
      const msg = await extractError(res, 'Không tạo được nhóm quyền.');
      toast.error(msg);
      throw new Error(msg);
    }
    await refreshRoles();
  };

  const updateRole = async (id: string | number, roleData: Partial<Role>) => {
    const res = await fetch(`${base}/api/roles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        code: roleData.code,
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions,
        active: roleData.active
      })
    });
    if (!res.ok) {
      const msg = await extractError(res, 'Không cập nhật được nhóm quyền.');
      toast.error(msg);
      throw new Error(msg);
    }
    await refreshRoles();
  };

  const deleteRoles = async (ids: (string | number)[]) => {
    for (const id of ids) {
      const res = await fetch(`${base}/api/roles/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const msg = await extractError(res, 'Không xóa được nhóm quyền.');
        toast.error(msg);
        throw new Error(msg);
      }
    }
    await refreshRoles();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        can,
        users,
        roles,
        createUser,
        updateUser,
        deleteUsers,
        toggleUserActive,
        createRole,
        updateRole,
        deleteRoles,
        refreshUsers,
        refreshRoles
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
