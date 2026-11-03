export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'SECURITY' | 'AUDITOR';

export interface User {
  id: string | number;
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: UserRole;
  roleName?: string;
  permissions: string[];
  active: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface Role {
  id: string | number;
  code: UserRole;
  name: string;
  description: string;
  permissions: string[];
  active: boolean;
}

export interface PermissionGroup {
  groupName: string;
  permissions: {
    code: string;
    label: string;
    description: string;
  }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    groupName: 'Kiểm Soát Phương Tiện (ALPR)',
    permissions: [
      { code: 'SURVEILLANCE_VIEW', label: 'Xem ma trận camera trực tiếp', description: 'Xem trực tiếp đa kênh RTSP/WebRTC' },
      { code: 'ALPR_VIEW', label: 'Tra cứu lịch sử biển số xe', description: 'Xem danh sách xe vào/ra nhận diện bằng AI' },
      { code: 'ALPR_EXPORT', label: 'Xuất báo cáo & file Excel ALPR', description: 'Tải file Excel/CSV lịch sử phương tiện' },
      { code: 'BARRIER_CONTROL', label: 'Điều khiển Barrier / Cổng', description: 'Kích hoạt mở/đóng barrier thủ công' }
    ]
  },
  {
    groupName: 'Kiểm Soát Người (FaceID)',
    permissions: [
      { code: 'FACE_VIEW', label: 'Giám sát FaceID trực tiếp', description: 'Xem ma trận nhận diện khuôn mặt realtime' },
      { code: 'FACE_LOGS', label: 'Lịch sử người vào/ra & điểm danh', description: 'Tra cứu nhật ký điểm danh và nhận dạng người' },
      { code: 'FACE_MANAGE', label: 'Quản lý danh sách nhân sự & khuôn mặt', description: 'Thêm, sửa, xóa hồ sơ nhân viên và ảnh mẫu' }
    ]
  },
  {
    groupName: 'Trung Tâm Cảnh Báo',
    permissions: [
      { code: 'ALERTS_VIEW', label: 'Xem danh sách cảnh báo', description: 'Xem danh sách cảnh báo vi phạm, xe lạ, SOS' },
      { code: 'ALERTS_ACK', label: 'Xác nhận & xử lý cảnh báo', description: 'Ghi chú và đóng cảnh báo sự cố' }
    ]
  },
  {
    groupName: 'Thiết Bị & Hệ Thống',
    permissions: [
      { code: 'DEVICE_VIEW', label: 'Xem danh sách Camera & Hub AI', description: 'Xem thông số kết nối và trạng thái hoạt động' },
      { code: 'DEVICE_MANAGE', label: 'Cấu hình thiết bị & Model AI', description: 'Thêm mới camera, chỉnh sửa RTSP, đổi model AI' },
      { code: 'BACKUP_MANAGE', label: 'Sao lưu & Phục hồi CSDL', description: 'Tạo bản sao lưu và khôi phục CSDL hệ thống' }
    ]
  },
  {
    groupName: 'Quản Trị Người Dùng (IAM)',
    permissions: [
      { code: 'IAM_VIEW', label: 'Xem danh sách tài khoản & nhóm quyền', description: 'Xem danh sách tài khoản và vai trò trong hệ thống' },
      { code: 'IAM_MANAGE', label: 'Toàn quyền cấu hình tài khoản & phân quyền', description: 'Tạo mới, sửa, xóa tài khoản và phân quyền vai trò tối cao' }
    ]
  }
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.code));
