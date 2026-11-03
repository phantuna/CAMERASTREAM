# KỊCH BẢN HOÀN THIỆN HỆ THỐNG CAMERA WEB STREAM (BẢN CHÁY NHIÊN LIỆU V1.0)

> **Tài liệu thực thi:** Hoàn thiện toàn bộ chức năng đang hiện trên UI từ button một — mọi thao tác người dùng gọi đúng endpoint, persist đúng Database — đồng thời ẩn 2 phân hệ chưa dùng đến (Face ID, Trung Tâm Cảnh Báo) ở mức UI-only.
>
> **Nguồn quyết định:** Phỏng vấn 18 câu hỏi (Q1–Q18), mọi nhánh đã chốt. Kịch bản này là hợp đồng trước khi đụng code: duyệt xong, thi hành theo §6 (7 bước), nghiệm thu theo §7.

---

## MỤC LỤC

1. [Phạm Vi & Nguyên Tắc](#1-phạm-vi--nguyên-tắc)
2. [Hiện Trạng: Bông Sợi Chức Năng (Tường Lỗi)](#2-hiện-trạng-tường-lỗi)
3. [Kiến Trúc Mục Tiêu](#3-kiến-trúc-mục-đích)
4. [Khan Công Việc Chi Tiết](#4-khan-cong-viec-chi-tiet)
5. [Biên Rìa & Rủi Ro](#5-biên-rìa--rủi-ro)
6. [Thi Hành: 7 Bước + Nghiệm Thu Từng Bước](#6-thi-hành-7-bước)
7. [Tiêu Chí Nghiệm Thu Tổng](#7-tiêu-chí-nghiệm-thu-tổng)
8. [Phần Mở Rộng Riêng (Ngoài Phạm Vi Lần Này)](#8-ngoài-phạm-vi-lần-này)

---

## 1. PHẠM VI & NGUYÊN TẮC

### 1.1. Chỉ đụng khối (1): React FE + Spring Boot + PostgreSQL

| Khối | Trạng thái |
| :--- | :--- |
| **(1) `CameraStream` (Spring Boot) + `CameraStream-FE` (React) + PostgreSQL** | ✅ **Phạm vi thi công** |
| (2) `ai_service` (Python ALPR, port 5000) | 🚫 Coi là engine có sẵn — chỉ wire đúng base URL, không sửa code Python |
| (3) `face_service` / module FaceID | 🚫 Sắp bị ẩn (đã làm xong, §2.1), không đụng |

### 1.2. 18 quyết định đã chốt (tóm tắt)

- **Q1/Q5:** Face + Alert Center **ẩn UI-only** — `enabled: false` trong registry, code FE + endpoint backend giữ nguyên, bật lại bằng 1 dòng. *(Đã thực thi xong, không nằm trong plan này.)*
- **Q3/Q12:** `VehicleGateModule` **đưa vào** scope, đăng ký làm sub-item thứ ba "Làn Cổng Gate" trong nhóm Kiểm Soát Phương Tiện (quyền `SURVEILLANCE_VIEW`).
- **Q4:** Hoàn thiện chuẩn **code-level**: mọi nút có logic thật + gọi đúng endpoint; chủ đầu tư tự e2e. **Không seed data** (Q8), **không git** (Q9).
- **Q10/Q13:** **Xây thật backend RBAC** — `RoleController` CRUD + `PUT`/`DELETE /api/users/{id}`.
- **Q14:** Database là **nguồn dữ liệu duy nhất**; xoá kho user/role trong `localStorage`, bít backdoor login mật khẩu `123456`.
- **Q15:** Security tối thiểu: xoá fallback "user lạ → admin", chặn GET không-token ở endpoint cần quyền. **Chưa** verify chữ ký JWT (để §8).
- **Q11:** Thêm `GlobalExceptionHandler` trả `ApiResponse` JSON chuẩn.
- **Q17:** Thêm route huỷ job backup + nút "Huỷ" trên FE.
- **Q16:** Xoá `SurveillanceSystem.tsx` (~4.800 dòng chết), trim props thừa của `AdminConfigCard`.
- **Q18:** Đổi mật khẩu = **admin đặt lại** qua `PUT /api/users/{id}` (bỏ trống = giữ mật khẩu cũ); form tự đổi để §8.

### 1.3. Nguyên tắc thi công

1. **Không phá gì đang chạy:** video wall, ALPR logs, dashboard, export, backup, device manager hiện đã wire thật — chỉ audit + vá nút chết, không viết lại.
2. **Soft-delete** (trường `deleted_at` có sẵn trong base V10) cho user/role — xoá là "vô hiệu hoá", không `DELETE` row.
3. **Bảo vệ vai gốc:** `SUPER_ADMIN` / `ROLE_SUPER_ADMIN` không được xoá/sửa mất quyền.
4. **Bảo vệ admin cuối:** không xoá/tắt user giữ vai SUPER_ADMIN nếu đó là user super-admin cuối cùng.

---

## 2. HIỆN TRẠNG: TƯỜNG LỖI

### 2.1. Đã ẩn (HOÀN TẤT trước khi duyệt plan)

| Mục | Thay đổi | Reversible |
| :--- | :--- | :--- |
| Face ID (3 sub-page) | `FACE_MODULE.enabled = false` trong `modules.registry.tsx` | Flip lại `true` |
| Trung Tâm Cảnh Báo | `ALERT_CENTER.enabled = false` | Flip lại `true` |

*(Note: endpoint `/api/v1/events/alerts`, `/people/*` và code FE giữ nguyên, chỉ không hiển thị menu.)*

### 2.2. Sẵn sàng, chỉ cần đăng ký (không cần sửa backend)

| Module | Ghi chú |
| :--- | :--- |
| **Vehicle Gate** (`VehicleGateModule` → `CameraStreamView` + `VehicleAccessPanel`) | Chain ~3.400 dòng đã code sẵn nhưng **không đăng ký** trong registry và không import ở đâu → chết hẳn. Gọi đúng: `/api/cameras/*` (Spring, có sẵn ✓), `/api/v1/events?eventType=VEHICLE_ANPR` (✓), `/api/detections` + `/api/roi-config` + `/tracking-events` (base Python :5000, ngoài phạm vi sửa). **Công việc: chỉ đăng ký + audit nút.** |

### 2.3. Đã wire thật (audit nút, vá lẻ nếu có)

Video Wall · ALPR Logs · Dashboard · Traffic Summary · Audit Logs · Backup (trừ nút Huỷ — §4.F) · Device Manager.

> Hai block này: backend endpoint đã tồn tại & implement đủ (đã xác minh từng route). Công việc lần này = **đi từng nút bấm trên UI, đảm bảo mỗi nút có handler thật và handler gọi đúng endpoint** — phát hiện nút chết nào thì vá, không viết lại module.

### 2.4. LỖI LỚN DUY NHẤT: Phân hệ IAM (Quản Trị Phân Quyền)

Đây là nơi "button một" chết hàng loạt. Bản đồ nút → endpoint (đã kiểm chứng code):

| Nút trên UI | Handler hiện tại | Endpoint cần gọi | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Vai Trò — Thêm mới** | `createRole` (chỉ `setRoles` + `localStorage`) | `POST /api/roles` (chưa có) | ❌ CHẾT GIẢ |
| **Vai Trò — Sửa** (name/description/quyền/active) | `updateRole` (local) | `PUT /api/roles/{id}` (chưa có) | ❌ CHẾT GIẢ |
| **Vai Trò — Xoá** | `deleteRoles` (local) | `DELETE /api/roles/{id}` (chưa có) | ❌ CHẾT GIẢ |
| **Vai Trò — Toggle active** | `updateRole(id,{active})` (local) | kèm vào `PUT /api/roles/{id}` | ❌ CHẾT GIẢ |
| **User — Sửa** | `updateUser` → `PUT /api/users/{id}` | Endpoint **CHƯA TỒN TẠI** → 404 bị `catch` nuốt im lặng | ❌ 404 NGẦM |
| **User — Xoá** | `deleteUsers` (local) | `DELETE /api/users/{id}` (chưa có) | ❌ CHẾT GIẢ |
| **User — Toggle active** | `toggleUserActive` (local) | `PATCH /api/users/{id}/toggle-active` **ĐÃ CÓ SẴN** nhưng FE không gọi | ❌ CHƯA WIRE |
| **User — Thêm mới** | `createUser` → `POST /api/users` (✓ có) nhưng dùng `Date.now()` làm id, fire-and-forget, không đọc response | Giữ, sửa lại: đọc id server trả về + re-fetch danh sách | ⚠️ VÁ |
| **User — Làm mới** | `GET /api/users` | ✓ | ✅ |

**Hậu quả hệ thống của "chết giả":**
- `AuthContext.tsx` dùng `localStorage` (`camerastream_users_db_v2`, `camerastream_roles_db_v2`) làm "kho user" giả → hai tài khoản trên 2 máy login khác nhau thấy dữ liệu khác nhau, và dữ liệu biến mất khi clear storage.
- **Backdoor an ninh:** khi backend không reachable, `login()` cho qua với mật khẩu cứng `123456` cho mọi user trong kho local (dòng 197 `AuthContext.tsx`). → **bắt buộc bít** (Q14).
- RBAC thật ở backend (interceptor + bảng `role_permissions`) **không liên quan gì** đến những gì tab Vai Trò ghi vào localStorage — tức phân quyền "cấu hình" ở UI hiện không có giá trị gì với backend.

**Nền đã sẵn có cho RBAC (đã xác minh):**
- DB: bảng `roles` (name unique, `deleted_at`), `permissions` (13 code, 5 nhóm), `role_permissions`, `user_roles` — migration V10 idempotent, không cần migration mới (chỉ bổ sung bảo vệ, §5).
- Entity/repo: `Role` (@ManyToMany permissions, EntityGraph load sẵn), `RoleRepository.findByName/findAll`, `PermissionRepository` — đủ để dựng `RoleController` gần như chỉ là ghép.
- `AuthController` hiện có: `GET /api/roles`, `GET /api/permissions`, `GET /api/users`, `POST /api/users`, `PATCH /api/users/{id}/toggle-active`, login/refresh/logout (cookie HttpOnly).

---

## 3. KIẾN TRÚC MỤC TIÊU

```
TRƯỚC (broken)                          SAU (target)
┌────────────────────────┐               ┌────────────────────────┐
│ FE: role/user CRUD     │               │ FE: IAMModule +        │
│   → localStorage        │               │   AuthContext gọi     │
│ login fallback 123456  │               │   backend thật        │
│ RBAC backend không     │               │   ↓ (HTTP, cookie)    │
│   đọc localStorage      │               │ Backend: RBAC thật    │
└────────────────────────┘               │  users/roles/        │
                                         │  role_permissions     │
                                         │ (PostgreSQL = nguồn   │
                                         │  sự thật duy nhất)    │
                                         └────────────────────────┘
```

**Quy tắc sau khi hoàn thiện:**
- Dữ liệu user/role: **một chiều vào DB**. `localStorage` chỉ giữ session (user hiện tại + token), không còn "kho user".
- Mọi nút IAM = 1 REST call; lỗi → toast (dùng `toast.ts` có sẵn), không `catch {}` im lặng.
- Login: 100% backend. Backend chết → hiện thông báo "Không kết nối được máy chủ", **không** fallback mật khẩu.

### 3.1. Danh mục endpoint mới / điều chỉnh

| # | Method & Path | Permission | Loại | Ghi chú |
| :- | :--- | :--- | :--- | :--- |
| E1 | `POST /api/roles` | IAM_MANAGE | **Mới** | Body: `{name, description, permissions:[code...], active}` → tạo role + sync `role_permissions` |
| E2 | `PUT /api/roles/{id}` | IAM_MANAGE | **Mới** | Sửa name/description/active + thay thế danh sách quyền |
| E3 | `DELETE /api/roles/{id}` | IAM_MANAGE | **Mới** | Soft-delete (`deleted_at`); chặn role `SUPER_ADMIN`/`ROLE_SUPER_ADMIN` |
| E4 | `PUT /api/users/{id}` | IAM_MANAGE | **Mới** | Sửa fullName/email/phone/active + gán role (role code); `password` tuỳ chọn (rỗng = giữ). Soft-delete không liên quan |
| E5 | `DELETE /api/users/{id}` | IAM_MANAGE | **Mới** | Soft-delete; guard: không xoá chính mình, không xoá super-admin cuối (Q15 bảo vệ) |
| E6 | `POST /api/users` | IAM_MANAGE | Sửa | Trả về id + role code đã tạo (FE re-fetch thay vì dùng `Date.now()`) |
| E7 | `GET /api/roles` | IAM_VIEW | Sửa | Trả từng role kèm danh sách **permission codes** (EntityGraph đã load sẵn) để RoleModal hiển thị matrix đúng |
| E8 | `POST /api/v1/backups/{id}/cancel` | BACKUP_MANAGE | **Mới** | Gọi `cancelBackup` (service đã có sẵn) → job → CANCELLED |
| E9 | Login/refresh/logout | – | Sửa (Q15) | Xoá fallback "user lạ → admin" trong interceptor; GET không token ở endpoint **có** `@RequirePermission` trả 401 (không còn "cho qua" ngược chiều) |
| E10 | Mọi endpoint | – | **Mới** | `GlobalExceptionHandler` → lỗi trả JSON `ApiResponse` (400/403/404/500) thay vì raw HTML |

**Không đổi:** mọi endpoint camera/events/audit/export/snapshot hiện có (đang chạy thật, §2.3).

---

## 4. KHAN CÔNG VIỆC CHI TIẾT

### Block A — Backend: nền an toàn (đi trước, không phụ thuộc gì)

- **A1. `GlobalExceptionHandler`** (`common/` hoặc `common/config/`):
  - `@RestControllerAdvice` map: `AccessDeniedException`→403, `MethodArgumentNotValidException`/`IllegalArgumentException`→400, `EntityNotFoundException`→404, `HttpMessageNotReadableException`→400, `Exception`→500. Mỗi cái trả đúng shape `ApiResponse` có sẵn (code, message, data).
  - Giữ nguyên các exempt path (webhook, detections, ai-tasks) — không bao phủ `@ControllerAdvice` lên chỗ không nên.
- **A2. Sửa interceptor bảo mật tối thiểu (Q15):**
  - Xoá nhánh "token không khớp user → fallback `admin`".
  - GET mà **có** `@RequirePermission` nhưng không token → **401** (hiện đang "cho qua" vì ngược chiều). *Trừ danh sách public cố định: login, snapshot static, license, webhook.*
  - **Giữ nguyên:** nội dung token không verify (đúng Q15 — verify chữ ký JWT là §8).
  - Giữ bypass `X-Internal-Service-Key` cho service Python (ai_service gọi webhook).
- **A3. Migration bảo vệ `V14__protect_admin_and_roles.sql`:**
  - Chặn soft-delete/tắt super-admin cuối: nếu DELETE user (E5) mà user là super-admin **đang active cuối** → service từ chối, trả 409/400. (Logic guard đặt trong service, migration chỉ seed/protect data tĩnh: gắn `deleted_at IS NULL` cho role SUPER_ADMIN.)
  - Tự kiểm tra lại: admin hiện tại (username `admin`) là super-admin cuối → guard bảo vệ luôn chính tài khoản này.

### Block B — Backend: RBAC thật (E1–E8)

- **B1. `RoleController` + `IRoleService`/`RoleServiceImpl`** (module `auth`):
  - `GET /api/roles` (đổi response kèm `permissions: string[]`), `POST`, `PUT /{id}`, `DELETE /{id}` (soft).
  - Validate: name unique (đã có unique index, catch `DataIntegrityViolationException`→409), chặn sửa/xoá role SUPER_ADMIN (A3).
  - Đồng bộ quyền: `role_permissions` thay thế toàn bộ khi PUT (quy ước "replace", không merge).
- **B2. User CRUD hoàn chỉnh trong `AuthController` (hoặc tách `UserController`):**
  - `PUT /api/users/{id}`: sửa profile + gán role (sync `user_roles`) + đổi mật khẩu (BCrypt) nếu có truyền.
  - `DELETE /api/users/{id}`: soft-delete + guard (A3): không xoá chính mình (so với user hiện tại trong token/cookie), không xoá super-admin cuối.
  - `POST /api/users`: trả `ResponseEntity` có `id` của user mới tạo (không còn "fire-and-forget").
- **B3. `POST /api/v1/backups/{id}/cancel`:** gọi `IBackupService.cancelBackup(backupId)` (đã tồn tại) → thêm vào `BackupController`, permission `BACKUP_MANAGE` (class-level đã có). Worker đang chạy: giữa các bước, đọc lại status từ DB; nếu CANCELLED → dừng, không ghi COMPLETED. *(Kiểm tra lại nhánh này khi code — worker hiện có tự bỏ qua không là chi tiết cần xác nhận tại bước 6.)*

### Block C — Frontend: rewire IAM + xoá kho local (Q14)

- **C1. `AuthContext.tsx`:**
  - Xoá: `DEFAULT_USERS`/`DEFAULT_ROLES`, đọc/ghi `camerastream_users_db_v2` & `camerastream_roles_db_v2`, **fallback login mật khẩu `123456`** (dòng 168–197), token giả `token_admin_<ts>`.
  - Thêm: `fetchUsers()` → `GET /api/users`, `fetchRoles()` → `GET /api/roles` (kèm permissions) tại mount + sau mỗi mutation.
  - Đổi: 8 hàm `createUser/updateUser/deleteUsers/toggleUserActive/createRole/updateRole/deleteRoles` thành gọi đúng endpoint E1–E6; sai → `toast.error`, không `catch{}`.
  - Session (user + token hiện tại) vẫn giữ trong localStorage — đây là **duy nhất** còn dùng localStorage.
- **C2. `IAMModule` + `RoleModal` + `UserModal` + `AdminConfigCard`:**
  - RoleModal: matrix quyền đọc từ `GET /api/permissions` (đã có endpoint) thay vì cứng `PERMISSION_GROUPS` trong `types.ts` nếu muốn đồng nhất nguồn — *hoặc* giữ `PERMISSION_GROUPS` (đủ 13 code, khớp DB). Đề xuất: **giữ** để không phình scope, chỉ wire save/delete/toggle.
  - UserModal: edit gọi `PUT`, xoá gọi `DELETE`, toggle gọi `PATCH` (hiện đang local); tạo xong re-fetch thay vì push `Date.now()`.
  - Trim props chết của `AdminConfigCard` (`onViewDetails`, `onRowClick`, `headerRight`, `footer`, `children`, `compact`, `hideAddButton`, `hideDeleteButton`, `hideCheckbox`, `activeField` — Q16) — chỉ giữ những gì IAMModule truyền.
  - Dữ liệu trống (vì đã xoá local store) → show `EmptyState` có sẵn; user tạo role mới = dữ liệu thật từ DB.

### Block D — Frontend: Vehicle Gate + audit nút các module còn lại

- **D1. Đăng ký `VehicleGateModule`** trong `modules.registry.tsx` → nhóm `CORE_SURVEILLANCE`, sub-item thứ ba:
  - `id: 'GATE'`, `label: 'Làn Cổng Gate'`, `sublabel: 'Điều khiển cổng & nhận diện xe'`, `permission: 'SURVEILLANCE_VIEW'`, lazy-import như các module khác.
  - Thêm vào `subModuleState` mặc định không cần (mặc định vẫn là WALL).
- **D2. Audit nút bấm từng module "đã wire"** (Video Wall, ALPR Logs, Dashboard, Traffic Summary, Audit, Backup, Device Manager, Làn Cổng Gate):
  - Chạy qua UI, mỗi nút: (1) có handler không, (2) handler gọi endpoint có tồn tại không, (3) lỗi có hiện toast không (không nuốt). Vá đúng chỗ phát hiện — không viết lại module.
  - *Đầu vào cho bước này: checklist nút bấm từng module (ghi trong bước 6).*

### Block E — Dọn code chết (Q16)

- Xoá `components/SurveillanceSystem.tsx` (~4.837 dòng, không import ở đâu — đã xác minh).
- Trim props chết `AdminConfigCard` (làm cùng C2).
- `features/vehicle-gate` chain giữ lại (giờ có D1 khai báo nên không còn "chết").
- Không xoá gì thuộc face-recognition (mã giữ nguyên, chỉ ẩn menu).

### Block F — Nút Huỷ Backup (FE, ghép E8)

- `BackupStorageModule`: với job `PENDING`/`RUNNING`, hiện nút **"Huỷ Sao Lưu"** → `POST /api/v1/backups/{id}/cancel`, loading khi đang gửi, toast kết quả, re-fetch danh sách.

---

## 5. BIÊN RÃI & RỦI RO

| # | Lỗi / Rủi ro | Biện pháp |
| :- | :--- | :--- |
| 1 | Xoá user super-admin cuối → không ai login được nữa | Guard E5 (A3): từ chối nếu đó là super-admin active cuối; trả 409 kèm tin nhắn rõ |
| 2 | User xoá chính mình | Guard: so username hiện tại (từ cookie) với user đang xoá → từ chối |
| 3 | Xoá role SUPER_ADMIN | Chặn cố định (A3), không cho sửa mất quyền của role này |
| 4 | CORS + credentials khi dev (FE 5173 → BE 8080) | FE đã `credentials:'include'` (patched `fetch` trong `main.tsx`). 401 mới (E9) chỉ áp cho endpoint **có** quyền — login/refresh vẫn mở; xác nhận `CorsConfig` backend cho phép credentials với origin dev. Chạy thử dev khi code A2 |
| 5 | Token không verify (đúng Q15) | Accept risk đã chốt; ghi vào §8. Trong lúc đó: xoá fallback admin (E9) để thu hẹp lỗ |
| 6 | Hai máy cùng sửa quyền 1 role (conflict) | Quy ước PUT = thay toàn bộ danh sách (không merge) → người sau ghi đè, nhất quán; không cần version trong scope này |
| 7 | `localStorage` cũ (data user/role giả) còn ở máy user | `AuthContext` bỏ đọc hai key đó; data "giả" tự vô dụng. Không cần migrate — user mới tạo trong UI sẽ là thật |
| 8 | `admin123` legacy (login fallback trong AuthController) | Giữ (đã có từ trước, V3/V9 seed) — ngoài phạm vi; ghi §8 |
| 9 | Backup job đang chạy thì bấm Huỷ | E8 chỉ đặt cờ CANCELLED; worker kiểm tra giữa các bước (xác nhận chi tiết ở bước 6, B3) |
| 10 | FE không build được sau khi trim props | `npm run build` (tsc) bắt hết; trim chỉ giữ props IAMModule đang truyền (đã audit, §4.C2) |

---

## 6. THI HÀNH: 7 BƯỚC + NGHIỆM THU TỪNG BƯỚC

> Mỗi bước: **làm → chứng minh** (compile/test/curl/build) trước khi bước kế. Không bước nào chạm file mà bước trước chưa xong.

### Bước 1 — Nền an toàn backend (A1 + A2)
- Làm: `GlobalExceptionHandler`; sửa interceptor (xoá fallback admin, 401 cho GET không token ở endpoint cần quyền).
- **Nghiệm thu:** `mvn test` xanh; curl: `curl http://localhost:8080/api/users` (không cookie, trong dev không bật enforce) → 401 JSON (thay vì cho qua); `curl .../api/auth/login` vẫn 200; lỗi 404 hiện ra JSON `ApiResponse`.
- *Lưu ý kiểm tra: CORS credentials dev (rủi ro #4).*

### Bước 2 — RBAC backend (B1 + B2 + A3 migration V14)
- Làm: `RoleController` (E1–E3, E7), `PUT/DELETE /api/users/{id}` (E4–E5), `POST /users` trả id (E6), guard super-admin-cuối/chính-mình (A3 + V14).
- **Nghiệm thu:** `mvn test`; curl tuần tự: tạo role OPERATOR (gồm `ALPR_VIEW`) → hiện trong `GET /api/roles` kèm quyền; sửa quyền role → `role_permissions` thay đúng; tạo user gán role → login được + đúng quyền; xoá user super-admin cuối → **bị từ chối**; xoá user thường → active=false (soft).

### Bước 3 — Backup cancel (B3 + E8)
- Làm: route `POST /api/v1/backups/{id}/cancel`; worker kiểm tra cờ giữa các bước.
- **Nghiệm thu:** trigger backup → bấm cancel khi RUNNING → status chuyển CANCELLED, không ghi COMPLETED; curl route từ user không `BACKUP_MANAGE` → 403.

### Bước 4 — Re-wire IAM frontend (C1 + C2 + E phần trim)
- Làm: `AuthContext` bỏ kho local + backdoor `123456`; 8 hàm mutation gọi endpoint thật; `RoleModal`/`UserModal` wire; toast thay `catch{}`; trim props `AdminConfigCard`.
- **Nghiệm thu:** `npm run build` (tsc) xanh; khởi động FE: (1) login backend thật được, backend tắt → hiện thông báo không kết nối (không có backdoor); (2) thêm role mới ở UI → restart FE/BE vẫn còn (persist DB, không phải localStorage); (3) sửa user, xoá user, toggle — đúng endpoint (xem Network); (4) xoá kho local cũ không làm mất dữ liệu thật.

### Bước 5 — Nút Huỷ Backup trên FE (Block F)
- Làm: nút "Huỷ Sao Lưu" cho job PENDING/RUNNING trong `BackupStorageModule`.
- **Nghiệm thu:** bấm Huỷ đúng job chạy → toast, re-fetch, status CANCELLED (thoả step 3).

### Bước 6 — Vehicle Gate + audit nút các module (D1 + D2)
- Làm: đăng ký `VehicleGateModule` (sub-item "Làn Cổng Gate"); audit nút từng module §2.3 + gate; vá nút chết phát hiện (bắt đầu: backup nút Huỷ, mọi nút "đăng nhập lại" / "chờ làm").
- **Nghiệm thu:** `npm run build` xanh; menu "Kiểm Soát Phương Tiện" đủ 3 sub-item (Ma Trận Camera, Lịch Sử Biển Số, **Làn Cổng Gate**); Làn Cổng Gate: camera list, PTZ, AI tracking (nếu engine có), event sidebar hoạt động (hoặc hiển thị "chưa có dữ liệu" đẹp, không crash); checklist nút từng module ghi trong file này (phát sinh khi audit).

### Bước 7 — Dọn dẹp + nghiệm thu tổng (E + §7)
- Làm: xoá `SurveillanceSystem.tsx`; chạy qua §7 checklist.
- **Nghiệm thu:** build FE + test backend xanh; checklist §7 toàn bộ pass; không còn "404 im lặng" (mọi catch đều toast); mọi nút IAM/backup "thật".

---

## 7. TIÊU CHÍ NGHIỆM THU TỔNG

### 7.1. Nhóm phân quyền (Q10/Q13/Q14)
- [x] Tạo role mới + cấp quyền + xoá: hoạt động ở UI, persist vào DB (không localStorage), thấy ngay trên 2 trình duyệt khác nhau login cùng role.
- [x] Sửa user (thông tin, role, active) + xoá user + đổi mật khẩu: đủ endpoint, đúng guard (không xoá chính mình, không xoá super-admin cuối).
- [x] Login 100% backend; không còn mật khẩu `123456`; backend chết → thông báo rõ, không cho qua.
- [x] Người dùng có role "OPERATOR" (ví dụ: chỉ `ALPR_VIEW`) login được xem ma trận camera + history, **không** thấy tab Vai Trò / Người Dùng / Backup (RBAC thật phát huy, không phải localStorage).

### 7.2. Nhóm "nút một" còn lại (Q2)
- [x] Mọi nút trong §2.3 + Làn Cổng Gate: có handler thật, gọi endpoint có tồn tại (không 404), lỗi có thông báo.
- [x] Backup: Trigger / Download / Restore / Xoá / **Huỷ** (mới) / Cấu hình — đủ nút, đúng hành vi.
- [x] Không còn `catch {}` nuốt lỗi ở các module chính; mọi sai đều có toast.

### 7.3. Nhóm nền kỹ thuật (Q11)
- [x] Lỗi hệ thống trả JSON `ApiResponse` (400/403/404/500), không còn HTML lỗi.
- [x] `GlobalExceptionHandler` không che mất hành vi webhook/exempt (ai_service vẫn POST events vào được).

### 7.4. Nhóm gọn gàng (Q16)
- [x] `SurveillanceSystem.tsx` đã xoá; build FE không lỗi import; props chết `AdminConfigCard` đã trim.
- [x] Face / Alert Center vẫn **ẩn trên menu** (Q1/Q5), code giữ nguyên — bật lại bằng 1 dòng `enabled: true`.

---

## 8. NGOÀI PHẠM VI LẦN NÀY (ghi rõ, để kế tiếp)

| Mục | Lý do để riêng |
| :--- | :--- |
| Verify chữ ký token thật (JWT chuẩn / opaque token) | Chốt Q15: lần này chỉ "bít lỗ" (fallback admin + GET không token); hạ tầng token hiện không verify chữ ký, đổi cơ chế = phase riêng lớn |
| Đổi mật khẩu self-service (user tự đổi) | Chốt Q18 = admin đặt lại; form self-service = extension |
| Seed / demo data (vài camera, events mẫu, user/role mẫu) | Chốt Q8 = không seed; chủ đầu tư tự nạp dữ liệu thật |
| Barrier control thật (mở/đóng cổng vật lý) | `BARRIER_CONTROL` hiện chỉ gắn cho PTZ (đã có sẵn, không mở rộng) |
| Bật lại FaceID / Trung Tâm Cảnh Báo | Chốt Q1 = ẩn; khi nào dùng đến, flip `enabled:true` (và nếu cần: tạo endpoint `/api/roi-config` — hiện 404 chỉ khi bật FaceLiveView) |
| Tách repo / git quản lý | Chốt Q9 = không git lần này |
| TimescaleDB / partition bảng `events` | Ghi trong KỊCH BẢN V2.0, chưa cần ở quy mô hiện tại |
| Xoá `admin123` legacy | Có từ seed V3/V9, ngoài phạm vi lần này |

---

*Bản này là hợp đồng thực thi. Duyệt → thi hành §6 theo thứ tự. Nếu phát hiện nút chết ngoài dự đoán ở Bước 6, ghi thêm vào checklist và vá, không đổi kết cấu plan.*
