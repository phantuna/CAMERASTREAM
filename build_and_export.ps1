# PowerShell Script - Đóng gói Docker Images
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "   [MÁY DEV] ĐÓNG GÓI TOÀN BỘ HỆ THỐNG CAMERASTREAM SANG DOCKER IMAGES" -ForegroundColor Cyan
Write-Host "=========================================================================`n" -ForegroundColor Cyan

if (-not (Test-Path "deploy")) {
    New-Item -ItemType Directory -Path "deploy" | Out-Null
}

Write-Host "[1/4] Đang build 3 service: AI, Backend, Frontend..." -ForegroundColor Yellow
docker compose build
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[LỖI] Build Docker thất bại! Vui lòng kiểm tra Docker Desktop." -ForegroundColor Red
    pause
    exit 1
}

Write-Host "`n[2/4] Đang xuất toàn bộ Docker Images ra file deploy\images.tar..." -ForegroundColor Yellow
Write-Host "Xin chờ khoảng 2-5 phút (dung lượng ~2GB - 3GB)..." -ForegroundColor Gray
docker save camerastream-ai:latest camerastream-backend:latest camerastream-frontend:latest postgres:15-alpine bluenviron/mediamtx:latest -o deploy\images.tar
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[LỖI] Xuất file images.tar thất bại!" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "`n[3/4] Cập nhật các file cấu hình vào thư mục deploy..." -ForegroundColor Yellow
Copy-Item "mediamtx\mediamtx.yml" "deploy\mediamtx.yml" -Force
Copy-Item ".env" "deploy\.env" -Force

Write-Host "`n[4/4] HOÀN TẤT ĐÓNG GÓI THÀNH CÔNG!" -ForegroundColor Green
Write-Host "-------------------------------------------------------------------------"
Write-Host "Thư mục 'deploy' đã sẵn sàng! Bạn chỉ cần:"
Write-Host " 1. Nén toàn bộ thư mục 'deploy' thành .zip hoặc chép sang USB."
Write-Host " 2. Trên máy khách: Mở thư mục deploy và chạy '1_CHAY_HE_THONG.bat'."
Write-Host "-------------------------------------------------------------------------"
pause

