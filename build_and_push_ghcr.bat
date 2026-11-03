@echo off
chcp 65001 >nul
title DONG GOI VA PUSH DOCKER IMAGES LEN GITHUB PACKAGES (GHCR)
echo =========================================================================
echo    [CONG TY] BUILD VA PUSH DOCKER IMAGES LEN GITHUB PACKAGES (GHCR.IO)
echo =========================================================================
echo.

cd /d "%~dp0"

:: 1. Thiet lap thong tin GitHub Organization / Username
set "GH_USER=hoangphat"
if exist ".env" (
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if "%%a"=="DOCKER_REGISTRY" set "GH_USER=%%b"
    )
)

echo [1/5] Thiet lap dia chi GitHub Packages Container Registry:
set /p GH_USER="Nhap GitHub Username hoac Org (Mac dinh: %GH_USER%): "
set "TAG=latest"
set /p TAG="Nhap Image Tag (Mac dinh: latest): "

:: Loai bo ky tu thua neu nguoi dung nhap ca ghcr.io/
set "GH_USER=%GH_USER:ghcr.io/=%"
set "GH_USER=%GH_USER:/=%"
set "REGISTRY=ghcr.io/%GH_USER%"

echo.
echo => Target Registry: %REGISTRY%
echo => Image Tag:       %TAG%
echo.

:: 2. Dang nhap ghcr.io neu can
echo [2/5] Kiem tra dang nhap GitHub Container Registry (ghcr.io)...
echo Neu chua dang nhap, ban hay dung GitHub Personal Access Token (PAT) co quyen write:packages.
set /p DO_LOGIN="Ban co muon dang nhap lai ghcr.io khong? (y/n, mac dinh n): "
if /i "%DO_LOGIN%"=="y" (
    docker login ghcr.io
    if %errorlevel% neq 0 (
        echo [LOI] Dang nhap ghcr.io that bai!
        pause
        exit /b 1
    )
)

:: 3. Build 3 service
echo.
echo [3/5] Dang build 3 Docker Images (Backend, AI ALPR, Frontend)...
echo.
echo --- (1/3) Build Backend Spring Boot ---
docker build -t camerastream-backend:latest ./CameraStream
if %errorlevel% neq 0 goto :build_err

echo.
echo --- (2/3) Build AI Service (ONNX ALPR) ---
docker build -t camerastream-ai:latest ./ai_service
if %errorlevel% neq 0 goto :build_err

echo.
echo --- (3/3) Build Frontend React Web ---
docker build -t camerastream-frontend:latest ./CameraStream-FE
if %errorlevel% neq 0 goto :build_err

:: 4. Tag Images
echo.
echo [4/5] Dang gan tag GitHub Packages...
docker tag camerastream-backend:latest "%REGISTRY%/camerastream-backend:%TAG%"
docker tag camerastream-ai:latest "%REGISTRY%/camerastream-ai:%TAG%"
docker tag camerastream-frontend:latest "%REGISTRY%/camerastream-frontend:%TAG%"

:: 5. Push Images
echo.
echo [5/5] Dang day (PUSH) Images len GitHub Packages: %REGISTRY% ...
docker push "%REGISTRY%/camerastream-backend:%TAG%"
if %errorlevel% neq 0 goto :push_err

docker push "%REGISTRY%/camerastream-ai:%TAG%"
if %errorlevel% neq 0 goto :push_err

docker push "%REGISTRY%/camerastream-frontend:%TAG%"
if %errorlevel% neq 0 goto :push_err

:: Cap nhat deploy\.env
powershell -NoProfile -Command ^
    "$envPath = 'deploy\.env';" ^
    "if (Test-Path $envPath) {" ^
    "  $lines = Get-Content $envPath;" ^
    "  $newLines = @();" ^
    "  foreach($l in $lines) {" ^
    "    if ($l -match '^DOCKER_REGISTRY=') { $newLines += 'DOCKER_REGISTRY=%REGISTRY%/' } " ^
    "    elseif ($l -match '^IMAGE_TAG=') { $newLines += 'IMAGE_TAG=%TAG%' } " ^
    "    else { $newLines += $l }" ^
    "  };" ^
    "  [System.IO.File]::WriteAllLines($envPath, $newLines, [System.Text.Encoding]::UTF8);" ^
    "}"

echo.
echo =========================================================================
echo    HOAN TAT! DA PUSH THANH CONG LEN GITHUB PACKAGES!
echo =========================================================================
echo  - %REGISTRY%/camerastream-backend:%TAG%
echo  - %REGISTRY%/camerastream-ai:%TAG%
echo  - %REGISTRY%/camerastream-frontend:%TAG%
echo.
echo File deploy\.env da duoc cap nhat Registry: %REGISTRY%/
echo Ban chi can copy thu muc 'deploy' sang may khach la chay duoc!
echo =========================================================================
pause
exit /b 0

:build_err
echo.
echo [LOI] Qua trinh Build Docker Image that bai!
pause
exit /b 1

:push_err
echo.
echo [LOI] Qua trinh Push len ghcr.io that bai! Hay kiem tra Token hoac quyen write:packages.
pause
exit /b 1

