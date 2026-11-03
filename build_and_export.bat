@echo off
chcp 65001 >nul
title [MAY DEV] DONG GOI TOAN BO HE THONG CAMERASTREAM SANG DOCKER IMAGES
cd /d "%~dp0"

echo =========================================================================
echo    [MAY DEV] DONG GOI TOAN BO HE THONG CAMERASTREAM SANG DOCKER IMAGES
echo =========================================================================
echo.

if not exist "deploy" mkdir "deploy"
if not exist "deploy\license" mkdir "deploy\license"

echo [1/5] Dang pull Postgres va MediaMTX...
docker pull postgres:15-alpine >nul 2>&1
docker pull bluenviron/mediamtx:latest >nul 2>&1

echo.
echo [2/5] Dang build 3 Docker Images (Backend, AI ALPR, Frontend)...
echo.
echo --- (1/3) Build Backend Spring Boot ---
docker build -t camerastream-backend:latest ./CameraStream
if errorlevel 1 goto :build_error

echo.
echo --- (2/3) Build AI Service (ONNX ALPR) ---
docker build -t camerastream-ai:latest ./ai_service
if errorlevel 1 goto :build_error

echo.
echo --- (3/3) Build Frontend React Web ---
docker build -t camerastream-frontend:latest ./CameraStream-FE
if errorlevel 1 goto :build_error

echo.
echo [3/5] Dang trich xuat CSDL hien tai ra deploy\init_db.sql...
docker exec camerastream-postgres pg_dump -U postgres -d camerastream_db --clean --if-exists > "deploy\init_db.sql" 2>nul
if errorlevel 1 (
    echo [THONG BAO] Container postgres khong hoat dong, may khach se khoi tao DB moi.
    if not exist "deploy\init_db.sql" type nul > "deploy\init_db.sql"
) else (
    echo [OK] Da sao luu toan bo du lieu CSDL vao deploy\init_db.sql!
)

echo.
echo [4/5] Dang xuat toan bo 5 Docker Images ra file deploy\images.tar...
echo Xin cho khoang 1-3 phut tuy toc do o cung, dung luong khoang 2GB - 3GB...
docker save camerastream-ai:latest camerastream-backend:latest camerastream-frontend:latest postgres:15-alpine bluenviron/mediamtx:latest -o deploy\images.tar
if errorlevel 1 goto :save_error

echo.
echo [5/5] Sao chep file cau hinh mediamtx.yml vao thu muc deploy...
copy /Y "mediamtx\mediamtx.yml" "deploy\mediamtx.yml" >nul

echo.
echo =========================================================================
echo    HOAN TAT DONG GOI THANH CONG!
echo =========================================================================
echo Thu muc deploy da san sang 100%% de mang sang may khach:
echo  1. images.tar: Chua ca 5 Docker Images (AI, Backend, Frontend, Postgres, MediaMTX).
echo  2. init_db.sql: CSDL khoi tao.
echo  3. 1_CHAY_HE_THONG.bat: May khach chi can nhap dup file nay de nap va chay!
echo  4. 3_LAY_MA_MAY_KHACH.bat: Lay ma may khach de cap ban quyen license.lic.
echo =========================================================================
pause
exit /b 0

:build_error
echo.
echo [LOI] Build Docker that bai! Vui long kiem tra Docker Desktop da bat va thu lai.
pause
exit /b 1

:save_error
echo.
echo [LOI] Xuat file images.tar that bai! Kiem tra dung luong o dia con trong.
pause
exit /b 1
