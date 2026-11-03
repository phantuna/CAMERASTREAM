# NGHIÊN CỨU MÔI TRƯỜNG BUILD & CHẠY DỰ ÁN (Windows — máy dev của Tuna)

> **Mục tiêu:** Trả lời chính xác câu hỏi: trên máy này, cách nào **nhanh & tin cậy nhất** để
> (1) biên dịch backend Spring Boot (`CameraStream`), và (2) chạy full-stack nếu cần.
>
> **Thời điểm khảo sát:** `cmd //c`, `netstat`, `docker ps`, `curl` thực thi trực tiếp trên máy.
> Mọi khẳng định bên dưới đều ghi nguồn (file hoặc lệnh + output). **Không file nào khác được sửa.**

---

## 1. Tóm tắt nhanh (TL;DR)

| Câu hỏi | Trả lời |
| :--- | :--- |
| **(a) Lệnh compile backend đúng trên máy này?** | `$env:JAVA_HOME="C:\Users\Tuna\.jdks\ms-17.0.18"` rồi `.\mvnw.cmd -q -DskipTests compile` trong thư mục `CameraStream` (Maven 3.9.16 **đã cache sẵn** trong `~\.m2\wrapper`, không tải lại). **NHƯNG** code hiện tại `BUILD FAILURE` do 2 lỗi thật trong `GlobalExceptionHandler.java` (§5) — phải sửa code trước, không phải lỗi môi trường. |
| **(b) Docker Desktop đã cài & đang chạy?** | **Có.** Docker Desktop 4.95.0, client/engine 29.8.2, server đang chạy. Chỉ đúng 1 container đang `Up`: `camerastream-postgres` (postgres:15-alpine, cổng 5432 host). |
| **(c) Postgres ở đâu, cổng nào đang listen?** | Postgres = container Docker theo `docker-compose.yml` (không cài local, `psql` không tồn tại). Đang listen: **5432** (postgres container), **8080** (Spring Boot đang chạy từ IntelliJ, java `ms-17.0.18`), **5173** (vite dev server, node v24.15.0). **KHÔNG** listen: 5000, 8554, 8889, 9997, 8189, 80. |
| **(d) Luồng đóng gói production build backend bằng gì?** | 2 luồng: `build_and_export.bat/.ps1` = **toàn Docker** (multi-stage Maven trong image `maven:3.9.6-temurin-17-alpine` → runtime `eclipse-temurin:17-jre-alpine` — JRE nằm trong image, host không cần maven/java) ; `release_tools\build_release.ps1` = **build trên host** (đặt `JAVA_HOME=C:\Users\Tuna\.jdks\ms-17.0.18` + `.\mvnw.cmd package`, không bundle JRE, không cần Docker). |
| **(e) Đường verify nhanh nhất cho plan 7 bước?** | Sửa 2 lỗi §5 → chạy `.\mvnw.cmd -q -DskipTests compile` (cache ấm ~362MB, chạy lại chỉ ~10s) → chạy lại instance backend (IDE đang giữ cổng 8080 — hoặc để IDE run tiếp) → smoke: `curl http://localhost:8080/api/license/status` và `curl http://localhost:8080/api/cameras` (hiện trả 200 từ bản build cũ). Full-stack: `docker compose up -d` (chú ý giải phóng 8080 trước nếu IDE vẫn chạy). |

---

## 2. Toolchain thực sự có trên máy

### 2.1 Java (JDK)

- `cmd //c "where java"` / `where javac` / `where mvn`: **đều trả về "Could not find files"** — `java`, `javac`, `mvn` **KHÔNG có trên PATH**.
- `cmd //c "echo %JAVA_HOME%"` trả về chuỗi rỗng; Git-Bash: biến `JAVA_HOME` **không set**.
- **JDKs thật nằm ở `C:\Users\Tuna\.jdks\`** (do IntelliJ tải về), gồm:
  - `ms-17.0.18` — **Microsoft OpenJDK 17.0.18 (LTS, build 17.0.18+8)**. Xác minh trực tiếp:
    chạy `C:\Users\Tuna\.jdks\ms-17.0.18\bin\java.exe -version` → `openjdk version "17.0.18" 2026-01-20 LTS ... Microsoft-13106358`.
  - `ms-21.0.10`, `openjdk-26.0.1` (không dùng cho dự án này — `pom.xml` khai báo `<java.version>17</java.version>`).
- Vị trí JDK 17 này **được chính project ghi nhận**: `release_tools\build_release.ps1` dòng 6:
  `` `$env:JAVA_HOME = "C:\Users\Tuna\.jdks\ms-17.0.18"` `` và `release_tools\HUONG_DAN_TUNG_BUOC.md`
  Bước 0: *"JDK 17 có tại `C:\Users\Tuna\.jdks\ms-17.0.18`"*.
- Không có JDK ở `C:\Program Files\Java`, `Eclipse Adoptium`, `Microsoft` (thư mục không tồn tại).
- Chocolatey (chạy `choco list`, 20 package) **không có** Java/Maven.

### 2.2 Maven

- Maven **không cài standalone**. Nguồn Maven trên máy này (3 vị trí, tất cả cache):
  1. **Maven Wrapper cache**: `C:\Users\Tuna\.m2\wrapper\dists\` chứa sẵn `apache-maven-3.9.12` **và** `apache-maven-3.9.16` (đầy đủ, có `bin\mvn.cmd`) — wrapper của project khai báo `distributionUrl=.../apache-maven-3.9.16-bin.zip` (`CameraStream\.mvn\wrapper\maven-wrapper.properties`, `distributionType=only-script`). Vì vậy **`mvnw.cmd` chạy offline được, không tải gì**.
  2. Maven "embedded" của IntelliJ: `C:\Users\Tuna\IntelliJ IDEA 2025.3.3\plugins\maven\lib\maven3\` (3.9.11 — chỉ IDE dùng, không chạy CLI).
- **Kho cache `C:\Users\Tuna\.m2\repository` = 362MB**, đã có sẵn `spring-boot-* 4.1.1`, `spring-* 7.0.9`, `hibernate-core 7.4.5`, `postgresql 42.7.13`, `lombok 1.18.46`... (xác minh bằng `ls` + classpath dump `mvn dependency:build-classpath`). Không có `.m2` riêng trong thư mục project.
- Kiểm chứng: chạy `mvn -v` từ cache dist 3.9.16 (chưa set JAVA_HOME) → báo `The JAVA_HOME environment variable is not defined correctly` — tức Maven hoạt động, **thiếu duy nhất JAVA_HOME**. Sau khi set:
  `Apache Maven 3.9.16 ... Java version: 17.0.18, vendor: Microsoft, runtime: C:\Users\Tuna\.jdks\ms-17.0.18`.

### 2.3 Docker

- `where docker` → `C:\Program Files\Docker\Docker\resources\bin\docker.exe` (2 bản native + shim).
- `docker version`: Client 29.8.2; **Server: Docker Desktop 4.95.0 (242831), Engine 29.8.2 — ĐANG CHẠY** (context `desktop-linux`).
- Tiến trình `com.docker.backend.exe` (PID 9308) đang chạy và chính nó giữ cổng 5432 (bridge container).
- Images có sẵn: `camerastream-backend:latest`, `camerastream-frontend:latest`, `camerastream-ai:latest`, `postgres:15-alpine`, `bluenviron/mediamtx:latest` (bản `camera_web_stream-*` cũ và nhiều image dự án khác).

### 2.4 PostgreSQL / Node / Python

- **Postgres KHÔNG cài host**: `where psql` → "not recognized". PostgreSQL của project là **container Docker** (chi tiết §3.1).
- **Node**: `C:\Program Files\nodejs\node.exe` — `node --version` = **v24.15.0**, `npm --version` = 11.12.1. `CameraStream-FE\node_modules` **đã tồn tại** → `npm run dev` / `vite` chạy được ngay.
- **Python 3.14.4** (qua `choco list`).
- Vite dev server **đang chạy** ở cổng 5173 (PID 4964 = `C:\Program Files\nodejs\node.exe`, `curl http://localhost:5173/` trả HTML React có `@react-refresh`).

---

## 3. Trạng thái hệ thống lúc khảo sát

### 3.1 PostgreSQL — theo thiết kế là container, hiện ĐANG CHẠY

- `docker-compose.yml` (root) định nghĩa service `postgres` = image `postgres:15-alpine`,
  `POSTGRES_DB=camerastream_db`, user/pass `postgres/postgres`, port host `5432:5432`.
  `.env` (root) khớp: `DB_NAME=camerastream_db`, `DB_USER=postgres`, `DB_PASSWORD=postgres`.
- `docker compose ls` → project **`camera_web_stream` : running(1)**; `docker ps` →
  **`camerastream-postgres` (0182b5011337) : `Up About an hour`**, ports `0.0.0.0:5432->5432`.
- `netstat -ano | findstr :5432` → LISTENING PID 9308 = `com.docker.backend`.
- Backend (IDE hoặc JAR) chỉ cần chạy host-local với defaults trong
  `CameraStream\src\main\resources\application.properties` dòng 5:
  `spring.datasource.url=jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:camerastream_db}`
  → trỏ thẳng vào container này.

### 3.2 Các cổng đang listen (lệnh `netstat -ano | findstr LISTENING` + `Get-Process`)

| Cổng | Tiến trình | Kết luận |
| :--- | :--- | :--- |
| **5432** | `com.docker.backend` (PID 9308) | Container `camerastream-postgres` đang chạy |
| **8080** | `java.exe` (PID 13648) = `C:\Users\Tuna\.jdks\ms-17.0.18\bin\java.exe -javaagent:...IntelliJ IDEA...\idea_rt.jar ... CameraStreamApplication` | **Backend Spring Boot đang chạy từ IntelliJ** (classpath `target\classes` + jar trong `~\.m2`). `curl http://localhost:8080/api/cameras` → **HTTP 200**; `/api/license/status` → `{"valid":false,"status":"NOT_FOUND","enforced":false,"machineCode":"PX-6409-37D5-6CB9-41FD"}` (chạy IDE → không enforce license, đúng doc `HUONG_DAN_TUNG_BUOC.md` Bước 7) |
| **5173** | `node.exe` (PID 4964) | Vite dev server React |
| 5000 | — (curl connect fail) | `ai_service` **CHƯA chạy** (container `camerastream-ai` = `Exited (137) 2 days ago`) |
| 8554 / 8889 / 9997 / 8189 | — | `mediamtx` **CHƯA chạy** (container `camerastream-mediamtx` = `Exited (0) 2 days ago`) |
| 80 | — | container `camerastream-frontend` (nginx) đã `Exited (137)` 2 ngày |

→ Hiện trạng: **DB + backend-cũ (IDE) + FE-dev (vite) đang chạy; AI, MediaMTX, FE-prod thì tắt.**

### 3.3 Ý nghĩa với "Step 1 code chưa compile"

Instance 8080 hiện chạy từ **`target\classes` build cũ** trong IDE. Code step-1 mới viết **chưa
thể biên dịch lại** bằng maven CLI do lỗi §5 (và IDE cũng sẽ đỏ nếu build trong IDE).
Sau khi sửa code, cách nhanh nhất là build lại trong IntelliJ (nó đã sẵn sàng: JDK 17, maven
embedded, cache ấm) hoặc dùng lệnh CLI §4.

---

## 4. (a) Lệnh biên dịch backend — xác minh trên máy này

### 4.1 Lệnh chuẩn (chạy trong PowerShell)

```powershell
$env:JAVA_HOME = "C:\Users\Tuna\.jdks\ms-17.0.18"
Set-Location D:\HOANGPHAT-PROJECT\CAMERA_WEB_STREAM\CameraStream
.\mvnw.cmd -q -DskipTests compile
```

- `mvnw.cmd` là wrapper script (Maven Wrapper 3.3.4, `distributionType=only-script`); nó tự giải
  Maven 3.9.16 từ cache `~\.m2\wrapper\dists\apache-maven-3.9.16\0daed3be...\` — đã xác minh
  `.\mvnw.cmd -v` (với JAVA_HOME set) in ra `Apache Maven 3.9.16 ... Java version: 17.0.18,
  runtime: C:\Users\Tuna\.jdks\ms-17.0.18`, **không có bước tải mạng**.
- Dạng tương đương không cần wrapper (truy cập thẳng dist đã cache, Git-Bash/CMD đều được):

```bash
export JAVA_HOME="/c/Users/Tuna/.jdks/ms-17.0.18"
cd /d/HOANGPHAT-PROJECT/CAMERA_WEB_STREAM/CameraStream
/c/Users/Tuna/.m2/wrapper/dists/apache-maven-3.9.16-bin/5grr65jo27hi51sujmtcldfovl/apache-maven-3.9.16/bin/mvn -q -DskipTests compile
```

- Thời gian: lần chạy đã đo = **~10s** (chỉ compile 129 source files, dependencies nằm sẵn
  trong `.m2` 362MB). Build `package` (thêm spring-boot repackage) sẽ lâu hơn một chút nhưng
  cũng không tải thêm gì.

### 4.2 ⚠️ Nhưng build HIỆN TẠI đang THẤT BẠI — do lỗi code thật, không phải môi trường

Chạy `.\mvnw.cmd -DskipTests compile` (đã thử cả `-o` offline lẫn online, kết quả như nhau):

```
[INFO] Compiling 129 source files with javac [debug parameters release 17] to target\classes
[ERROR] /D:/.../common/config/GlobalExceptionHandler.java:[3,26] package jakarta.validation does not exist
[ERROR] /D:/.../common/config/GlobalExceptionHandler.java:[14,62] package org.springframework.web.bind.support.method.annotation does not exist
[ERROR]   symbol: class ConstraintViolationException
[ERROR]   symbol: class MethodArgumentTypeMismatchException
[INFO] BUILD FAILURE
```

Chẩn đoán (xác minh từng mục bằng source + jar):

1. **`package jakarta.validation does not exist`** — `pom.xml` **không có** dependency
   `spring-boot-starter-validation` (grep toàn pom: không có từ "validation"), và
   `dependency:build-classpath` xác nhận classpath compile không chứa `jakarta.validation-api`
   hay `hibernate-validator` (jar `jakarta.validation-api-3.1.1` có nằm trong `~\.m2` nhưng là
   của dự án khác, không được pom nào của project này kéo vào).
2. **`org.springframework.web.bind.support.method.annotation.MethodArgumentTypeMismatchException`
   không tồn tại** — trong Spring 7 (`spring-web-7.0.9.jar`, thuộc Spring Boot 4.1.1 của pom),
   class này đã **chuyển gói** sang `org.springframework.web.method.annotation` (xác minh bằng
   `unzip -l spring-web-7.0.9.jar | grep MethodArgumentTypeMismatch` →
   `org/springframework/web/method/annotation/MethodArgumentTypeMismatchException.class`).

→ **File `CameraStream\src\main\java\org\example\camerastream\common\config\GlobalExceptionHandler.java`
(phải viết theo kịch bản Q11 trong `KICH_BAN_HOAN_THIEN_CAMERASTREAM.md` §2) đang import 2 thứ sai
cho Spring Boot 4.1.1/Spring 7.** Hai cách sửa (chọn 1, chưa thực thi vì task này chỉ read-only):

- (i) Đổi import `MethodArgumentTypeMismatchException` về `org.springframework.web.method.annotation.*`,
  và **bỏ** handler `ConstraintViolationException` (hoặc
- (ii) Thêm dependency `spring-boot-starter-validation` vào `pom.xml` để có `jakarta.validation`.

Sau khi sửa: `.\mvnw.cmd -q -DskipTests compile` chạy lại ~10s trên cache ấm.

> Ghi chú quan trọng: tiến trình 8080 đang chạy (IDE) dùng `target\classes` build trước đó —
> nên API vẫn trả 200 dù maven CLI compile fail. Điều đó **không** chứng minh code step-1
> mới đã biên dịch được.

---

## 5. (b) & (c) Docker / Postgres / cổng — chi tiết

### 5.1 Docker Desktop: **đã cài, ĐANG CHẠY**

- `docker version`: `Server: Docker Desktop 4.95.0 (242831)` — engine trả lời ⇒ daemon sống.
- `docker compose ls`: `camera_web_stream | running(1) | D:\HOANGPHAT-PROJECT\CAMERA_WEB_STREAM\docker-compose.yml`.
- `docker ps -a` (group camerastream):
  - `camerastream-postgres` — **Up** (chỉ container này).
  - `camerastream-backend` — `Exited (143) 2 days ago`.
  - `camerastream-ai` — `Exited (137) 2 days ago`.
  - `camerastream-frontend` — `Exited (137) 2 days ago`.
  - `camerastream-mediamtx` — `Exited (0) 2 days ago`.

### 5.2 PostgreSQL: **container, không phải local install**

- Theo `docker-compose.yml` (service `postgres`: image `postgres:15-alpine`, mount volume
  `postgres_data`, port `5432`). Khẳng định thêm: `where psql` → không tồn tại, không có
  Windows service postgres (không `sc query` cần thiết — không có local psql để probe).
- `.env` / `.env.example`: `DB_NAME=camerastream_db`, `DB_USER=postgres`, `DB_PASSWORD=postgres`.
- **Đang chạy thật**: container `camerastream-postgres` up ~1h, cổng 5432 host đã map.
- Với backend chạy host-local (IDE/JAR), `application.properties` default
  `DB_HOST:localhost` + `DB_PORT:5432` **khớp đúng** container đang chạy — không cần set gì thêm.

### 5.3 Full-stack còn thiếu nếu muốn chạy hết

Chỉ cần `docker compose up -d` (image đã build sẵn cả 5) **NHƯNG** có 2 xung đột cổng phải
giải quyết trước:

- **8080**: bị giữ bởi tiến trình IDE java (PID 13648) → phải dừng instance IDE (hoặc để IDE
  chạy tiếp và chỉ `docker compose up -d postgres mediamtx ai-service` — nhưng ai-service cũng
  gọi backend nên thường giữ nguyên một instance duy nhất).
- **80 (FRONTEND_PORT trong .env = 80)**: chưa thấy ai listen ở thời điểm khảo sát
  (`netstat` không có `:80`), nhưng IIS/Skype hay chiếm — `.env.example` đã cảnh báo điều này.
- `5000`/`8554`/`8889`/`9997`/`8189`: đều trống → `ai-service` + `mediamtx` `up -d` không va cổng.
- FE dev (vite :5173, PID 4964) có thể giữ nguyên song song container frontend (:80).

---

## 6. (d) Luồng đóng gói production — backend được build bằng cách nào

### 6.1 `build_and_export.bat` / `build_and_export.ps1` (thư mục gốc) — **toàn Docker**

NỘI DUNG (đọc trực tiếp `build_and_export.bat`):
1. `docker compose pull postgres mediamtx` rồi `docker compose build` (build 3 image:
   backend/ai/frontend theo `docker-compose.yml` root).
2. `docker exec camerastream-postgres pg_dump -U postgres -d camerastream_db --clean --if-exists > deploy\init_db.sql`.
3. `docker save camerastream-ai:latest camerastream-backend:latest camerastream-frontend:latest postgres:15-alpine bluenviron/mediamtx:latest -o deploy\images.tar` (~2–3GB).
4. Copy `mediamtx\mediamtx.yml` + `.env` vào `deploy\`.

→ **Không cần maven/java trên host** — Maven chạy *bên trong* image build
(`CameraStream\Dockerfile` Stage 1: `maven:3.9.6-eclipse-temurin-17-alpine` →
`mvn dependency:go-offline` + `mvn clean package -DskipTests`), và **runtime bundle JRE 17**
trong image (Stage 2: `eclipse-temurin:17-jre-alpine`, copy `app.jar`). Máy khách chỉ cần
Docker Desktop + `deploy\1_CHAY_HE_THONG.bat` (đọc `deploy\HUONG_DAN.txt`: *"Máy khách KHÔNG CẦN
cài Python, Java, Node.js"*; bat: `docker load -i images.tar` → `docker compose up -d`).

### 6.2 `release_tools\build_release.ps1` (bản giao mã nguồn) — **build trên host, giả định wrapper + JDK có sẵn**

- Dòng 6–7: `` `$env:JAVA_HOME = "C:\Users\Tuna\.jdks\ms-17.0.18"` `` + prepend `bin` vào PATH
  → **script này ghi cứng chính đường dẫn JDK 17 dùng trong mục (a)**.
- Dòng 18: `` `.\mvnw.cmd -q -DskipTests package` `` → copy `target\*.jar` thành
  `CAMERA_WEB_STREAM_RELEASE\backend\CameraStream.jar`.
- FE: `npx vite build`; AI: `python -m nuitka main.py --standalone ...` (Nuitka → exe, có `MSVC`
  từ `visualstudio2026buildtools` trong `choco list`); `encrypt_models.py` (cryptography) +
  `sign_manifest.py`.
- ProGuard (nén/làm rối JAR, `HUONG_DAN_TUNG_BUOC.md` Bước 3) dùng `-libraryjars
  C:\Users\Tuna\.jdks\ms-17.0.18\jmods` — cũng trỏ cùng JDK.

→ **Không bundle JRE ở host, không cần docker** — chỉ cần JDK 17 ở vị trí `ms-17.0.18`
(correct — vị trí thật trên máy này) + maven wrapper (đã cache) + Node + Python/Nuitka.

### 6.3 `packaging\`

`packaging\build_ai_service.bat` chỉ build **AI service** (Nuitka standalone →
`build\ai_service.dist`), không liên quan backend.

---

## 7. (e) Đề xuất đường verify nhanh nhất cho kế hoạch 7 bước

Thứ tự tối ưu (đo thực tế trên máy này):

1. **Sửa 2 lỗi trong `GlobalExceptionHandler.java`** (§4.2) — đây là điểm block duy nhất;
   mọi thứ khác (JDK, Maven, cache, DB) đã sẵn sàng.
2. **Compile** (~10–15s, cache ấm 362MB, không tải):
   ```powershell
   $env:JAVA_HOME="C:\Users\Tuna\.jdks\ms-17.0.18"
   Set-Location D:\HOANGPHAT-PROJECT\CAMERA_WEB_STREAM\CameraStream
   .\mvnw.cmd -q -DskipTests compile
   ```
   (Tương đương build + đóng gói JAR: `.\mvnw.cmd -q -DskipTests package`.)
3. **Chạy lại backend**: instance IDE đang chiếm 8080 (PID 13648). Hoặc (i) Stop + Run lại trong
   IntelliJ (nhanh nhất vì IDE đã có JDK/maven sẵn, license không enforce khi chạy IDE), hoặc
   (ii) `.\mvnw.cmd spring-boot:run` sau khi tắt instance IDE, hoặc (iii) `java -jar target\*.jar`
   (lúc này license **BẮT BUỘC** có file hợp lệ, xem `application.properties` dòng 75
   `license.enforce=${LICENSE_ENFORCE:auto}` + doc `HUONG_DAN_TUNG_BUOC.md` Bước 7).
4. **Smoke test curl** (đã xác minh mẫu lệnh hoạt động trên build cũ):
   ```powershell
   curl.exe http://localhost:8080/api/license/status   # JSON {"valid":false,"enforced":false,...}
   curl.exe http://localhost:8080/api/cameras          # HTTP 200
   ```
5. **FE**: vite dev đã chạy ở :5173 (`npm run dev` trong `CameraStream-FE`, `node_modules`
   có sẵn, node v24.15.0) — proxy `/api` → 8080, `/tracking-events` → 5000 theo
   `CameraStream-FE\vite.config.ts`.
6. **Full-stack (tùy chọn, chỉ khi cần thật sự)**: `cd` thư mục gốc rồi
   `docker compose up -d` — postgres đã chạy (không đổi), mediamtx/ai/frontend/backend sẽ lên.
   **Lưu ý cổng**: 8080 đang bị instance IDE chiếm → dừng IDE trước; FE dev (5173) giữ nguyên
   song song với FE container (:80) không xung đột.

   **Không nên** dùng `build_and_export.bat` để verify thường nhật: nó `docker compose build`
   cả 3 image (AI image ~2GB) rồi `docker save` ~3GB — đắt đỏ, chỉ dành cho đóng gói giao khách.

---

## 8. Nguồn & bằng chứng (chốt)

| Khẳng định | Nguồn |
| :--- | :--- |
| `java`/`javac`/`mvn` không trên PATH, `JAVA_HOME` rỗng | `cmd //c "where java|javac|mvn"` → "Could not find files"; `echo %JAVA_HOME%` → rỗng |
| JDK 17 ở `C:\Users\Tuna\.jdks\ms-17.0.18` (Microsoft OpenJDK 17.0.18 LTS) | `java.exe -version` trực tiếp; `release_tools\build_release.ps1` dòng 6; `release_tools\HUONG_DAN_TUNG_BUOC.md` Bước 0 |
| Maven 3.9.16 cache sẵn trong `~\.m2\wrapper\dists`; chạy `mvn -v` thành công khi có JAVA_HOME | `ls .m2\wrapper\dists`; output `mvn -v` (Maven home = dist hash `0daed3be...`) |
| Cache repo `.m2` 362MB, đủ dependencies Spring Boot 4.1.1 / Spring 7.0.9 | `du -sh .m2`; `mvn dependency:build-classpath` |
| `GlobalExceptionHandler.java` gây 4 ERROR, build fail (code, không phải env) | `mvn -DskipTests compile` output (chạy 2 lần: offline + online, cùng lỗi) |
| Spring 7 dời `MethodArgumentTypeMismatchException` sang `org.springframework.web.method.annotation` | `unzip -l spring-web-7.0.9.jar` |
| `jakarta.validation` không nằm trong classpath (pom không khai báo validation starter) | grep `pom.xml`; `dependency:build-classpath` (0 hit "validation") |
| Docker Desktop 4.95.0 đang chạy; chỉ `camerastream-postgres` Up | `docker version`; `docker compose ls` (running(1)); `docker ps -a` |
| 5432=postgres container (PID 9308 `com.docker.backend`), 8080=IDE java (PID 13648, classpath `target\classes` + idea_rt.jar), 5173=node vite (PID 4964) | `netstat -ano` + `Get-Process`/`Get-CimInstance Win32_Process` |
| 5000 không listen; 8554/8889/9997/8189/80 không listen | `curl`/`netstat` tại thời điểm khảo sát |
| 8080 trả 200: `/api/cameras`, `/api/license/status` (machineCode `PX-6409-37D5-6CB9-41FD`, `enforced:false`) | `curl -s http://localhost:8080/...` |
| Postgres thiết kế = container `postgres:15-alpine` DB `camerastream_db` user/pass `postgres/postgres` | `docker-compose.yml` service `postgres`; `.env`; `.env.example` |
| Backend chạy host-local mặc định trỏ `localhost:5432` | `application.properties` dòng 5 |
| `build_and_export` = `docker compose build` + `docker save` 5 image → `deploy\images.tar`; JRE 17 bundle trong `Dockerfile` stage 2 | `build_and_export.bat` dòng 11–28; `CameraStream\Dockerfile` |
| `build_release.ps1` = host build: `JAVA_HOME=ms-17.0.18` + `.\mvnw.cmd -q -DskipTests package`, không cần docker | `release_tools\build_release.ps1` dòng 6–20 |
| FE dev: `npm run dev` (vite, port 5173, proxy `/api`→8080, `/tracking-events`→5000), `node_modules` có sẵn | `CameraStream-FE\package.json`; `CameraStream-FE\vite.config.ts`; `ls node_modules`; node v24.15.0 |
| Python 3.14.4 + VS2026 Build Tools (MSVC) có sẵn (yêu cầu Nuitka) | `choco list` |
| Cổng 80 có thể bị IIS/Skype chiếm → `FRONTEND_PORT` | `.env.example` + `HUONG_DAN_CAI_DAT_MAY_KHACH.md` §2 |
