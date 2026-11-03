@echo off
chcp 65001 >nul
title [CONG CU] TRICH XUAT CSDL TU DOCKER RA DEPLOY\INIT_DB.SQL
cd /d "%~dp0"
call "%~dp0deploy\TRICH_XUAT_CSDL.bat"
exit /b %errorlevel%

