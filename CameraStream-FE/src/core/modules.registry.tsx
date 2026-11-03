import { Suspense, lazy } from 'react';
import ModuleSkeleton from '../components/ModuleSkeleton';
import {
  IconGrid,
  IconCctv,
  IconCamera,
  IconAlertTriangle,
  IconUsers,
  IconBarChart
} from '../components/SurveillanceIcons';
import type { AppModuleConfig } from './types';

// ============================================================================
// HIERARCHICAL MODULE REGISTRY (ĐĂNG KÝ PHÂN HỆ VỚI REACT.LAZY CODE SPLITTING)
// Ánh xạ 100% RBAC Permissions theo chuẩn HPTicket Architecture & Security Rules
// ============================================================================

const VideoWallModule = lazy(() => import('../features/video-wall/VideoWallModule'));
const VehicleGateModule = lazy(() => import('../features/vehicle-gate/VehicleGateModule'));
const DeviceManagerModule = lazy(() => import('../features/device-manager/DeviceManagerModule'));
const AlprLogsModule = lazy(() => import('../features/alpr-logs/AlprLogsModule'));
const BackupStorageModule = lazy(() => import('../features/backup/BackupStorageModule'));
const FaceRecognitionModule = lazy(() => import('../features/face-recognition/FaceRecognitionModule'));
const FacePeopleView = lazy(() => import('../features/face-recognition/FacePeopleView'));
const CameraMatrixWall = lazy(() => import('../components/CameraMatrixWall'));
const AlertCenterModule = lazy(() => import('../features/alerts/AlertCenterModule'));
const IAMModule = lazy(() => import('../features/iam/IAMModule'));
const DashboardModule = lazy(() => import('../features/dashboard/DashboardModule'));
const TrafficSummaryModule = lazy(() => import('../features/dashboard/TrafficSummaryModule'));
const AuditLogModule = lazy(() => import('../features/dashboard/AuditLogModule'));

const CORE_MODULES: AppModuleConfig[] = [
  {
    id: 'CORE_SURVEILLANCE',
    label: 'Kiểm Soát Phương Tiện',
    sublabel: 'Làn Ô tô & Xe máy AI',
    icon: IconGrid,
    badge: 'LIVE',
    badgeColor: '#10B981',
    permission: 'SURVEILLANCE_VIEW',
    enabled: true,
    order: 1,
    children: [
      {
        id: 'WALL',
        label: 'Ma Trận Camera',
        sublabel: 'Xem trực tiếp đa kênh & ALPR',
        badge: 'LIVE',
        badgeColor: '#10B981',
        permission: 'SURVEILLANCE_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="grid" />}>
            <VideoWallModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      },
      {
        id: 'LOGS',
        label: 'Lịch Sử Biển Số',
        sublabel: 'Tra cứu Ô tô & Xe máy',
        permission: 'ALPR_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <AlprLogsModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      },
      {
        id: 'GATE',
        label: 'Làn Cổng Gate',
        sublabel: 'Điều khiển cổng & nhận diện xe',
        permission: 'SURVEILLANCE_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="grid" />}>
            <VehicleGateModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      }
    ]
  },
  {
    id: 'FACE_MODULE',
    label: 'Kiểm Soát Người (FaceID)',
    sublabel: 'Điểm Danh & Khách Ra Vào',
    icon: IconCamera,
    badge: 'FACE ID',
    badgeColor: '#7C3AED',
    permission: 'FACE_VIEW',
    // KỊCH BẢN §1.2 / §2.1 / §7.4 (Q1/Q5): Ẩn UI-only, bật lại bằng 1 dòng enabled: true
    enabled: false,
    order: 2,
    children: [
      {
        id: 'LIVE',
        label: 'Giám Sát Người Trực Tiếp',
        sublabel: 'Ma trận bám mặt & người realtime',
        badge: 'LIVE',
        badgeColor: '#7C3AED',
        permission: 'FACE_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="grid" />}>
            <CameraMatrixWall
              apiBaseUrl={apiBaseUrl}
              preset="FACE"
            />
          </Suspense>
        )
      },
      {
        id: 'LOGS',
        label: 'Lịch Sử Người Vào/Ra',
        sublabel: 'Nhật ký vào/ra & cảnh báo',
        permission: 'FACE_LOGS',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <FaceRecognitionModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      },
      {
        id: 'PEOPLE',
        label: 'Danh Sách Nhân Sự',
        sublabel: 'Hồ sơ khuôn mặt mẫu',
        permission: 'FACE_MANAGE',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <FacePeopleView apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      }
    ]
  },
  {
    id: 'ALERT_CENTER',
    label: 'Trung Tâm Cảnh Báo',
    sublabel: 'Cảnh Báo Khẩn & Xác Nhận',
    icon: IconAlertTriangle,
    badge: 'ALERTS',
    badgeColor: '#EF4444',
    permission: 'ALERTS_VIEW',
    // KỊCH BẢN §1.2 / §2.1 / §7.4 (Q1/Q5): Ẩn UI-only, bật lại bằng 1 dòng enabled: true
    enabled: false,
    order: 3,
    children: [
      {
        id: 'ALERTS_LIST',
        label: 'Danh Sách Cảnh Báo',
        sublabel: 'Cảnh báo mức độ WARNING / CRITICAL',
        badge: 'ACTIVE',
        badgeColor: '#EF4444',
        permission: 'ALERTS_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <AlertCenterModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      }
    ]
  },
  {
    id: 'REPORTING_DASHBOARD',
    label: 'Báo Cáo & Thống Kê',
    sublabel: 'Dashboard, Lưu Lượng & Audit',
    icon: IconBarChart,
    badge: 'NEW',
    badgeColor: '#0284C7',
    permission: 'ALPR_VIEW',
    enabled: true,
    order: 4,
    children: [
      {
        id: 'DASHBOARD',
        label: 'Tổng Quan Hệ Thống',
        sublabel: 'KPIs & Biểu đồ lưu lượng',
        badge: 'LIVE',
        badgeColor: '#10B981',
        permission: 'ALPR_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <DashboardModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      },
      {
        id: 'TRAFFIC_SUMMARY',
        label: 'Tổng Hợp Lưu Lượng',
        sublabel: 'Báo cáo lượt xe & Xuất Excel',
        permission: 'ALPR_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <TrafficSummaryModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      },
      {
        id: 'AUDIT_LOGS',
        label: 'Nhật Ký Thao Tác',
        sublabel: 'Audit Trail & Truy vết hệ thống',
        permission: 'ALERTS_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <AuditLogModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      }
    ]
  },
  {
    id: 'DEVICE_MANAGEMENT',
    label: 'Quản Lý Thiết Bị',
    sublabel: 'Camera & Phân Loại AI',
    icon: IconCctv,
    badge: 'ADMIN',
    badgeColor: '#0284C7',
    permission: 'DEVICE_VIEW',
    enabled: true,
    order: 5,
    children: [
      {
        id: 'CAMERAS',
        label: 'Danh Sách Camera',
        sublabel: 'Thêm bớt & gán module AI',
        badge: 'AI HUB',
        badgeColor: '#7C3AED',
        permission: 'DEVICE_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <DeviceManagerModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      },
      {
        id: 'BACKUP_STORAGE',
        label: 'Sao Lưu & Lưu Trữ',
        sublabel: 'Backup CSDL & Phục hồi hệ thống',
        badge: 'BACKUP',
        badgeColor: '#059669',
        permission: 'BACKUP_MANAGE',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <BackupStorageModule apiBaseUrl={apiBaseUrl} />
          </Suspense>
        )
      }
    ]
  },
  {
    id: 'SYSTEM_IAM',
    label: 'Quản Trị Phân Quyền',
    sublabel: 'Phân Quyền & Tài Khoản',
    icon: IconUsers,
    badge: 'ADMIN',
    badgeColor: '#7C3AED',
    permission: 'IAM_VIEW',
    enabled: true,
    order: 6,
    children: [
      {
        id: 'ROLES',
        label: 'Phân Quyền & Vai Trò',
        sublabel: 'Cấu hình vai trò & nhóm quyền',
        permission: 'IAM_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <IAMModule apiBaseUrl={apiBaseUrl} initialTab="KhaiBaoPhanQuyen" />
          </Suspense>
        )
      },
      {
        id: 'USERS',
        label: 'Quản Trị Người Dùng',
        sublabel: 'Khai báo tài khoản & mật khẩu',
        permission: 'IAM_VIEW',
        render: ({ apiBaseUrl }) => (
          <Suspense fallback={<ModuleSkeleton type="table" />}>
            <IAMModule apiBaseUrl={apiBaseUrl} initialTab="KhaibaoDangNhap" />
          </Suspense>
        )
      }
    ]
  }
];

class ModuleRegistry {
  private modules: Map<string, AppModuleConfig> = new Map();

  constructor(initialModules: AppModuleConfig[]) {
    initialModules.forEach((m) => this.modules.set(m.id, m));
  }

  public register(module: AppModuleConfig): void {
    this.modules.set(module.id, module);
  }

  public unregister(moduleId: string): void {
    this.modules.delete(moduleId);
  }

  public get(moduleId: string): AppModuleConfig | undefined {
    return this.modules.get(moduleId);
  }

  public getAll(): AppModuleConfig[] {
    return Array.from(this.modules.values()).sort(
      (a, b) => (a.order ?? 99) - (b.order ?? 99)
    );
  }

  public getEnabled(): AppModuleConfig[] {
    return this.getAll().filter((m) => m.enabled !== false);
  }
}

export const moduleRegistry = new ModuleRegistry(CORE_MODULES);
