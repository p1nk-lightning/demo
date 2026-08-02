@echo off
REM ====================================
REM  Readai v1.0 Dev Launcher (double-click)
REM ====================================

chcp 65001 >nul

echo.
echo ========================================
echo   Readai v1.0 - Dev Environment
echo ========================================
echo.

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "WORKER_DIR=%PROJECT_ROOT%\worker"

if not exist "%WORKER_DIR%\package.json" (
    echo [ERROR] Worker dir not found: %WORKER_DIR%
    echo Place this bat at project root.
    pause
    exit /b 1
)
if not exist "%PROJECT_ROOT%\package.json" (
    echo [ERROR] package.json not found at: %PROJECT_ROOT%
    pause
    exit /b 1
)

echo [1/2] Starting Worker (port 8787)...
start "Readai-Worker" cmd /k "cd /d "%WORKER_DIR%" && npm run dev"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend (port 5173)...
start "Readai-Frontend" cmd /k "cd /d "%PROJECT_ROOT%" && npm run dev"

echo.
echo ========================================
echo   Both windows are starting.
echo   - Worker health:  http://localhost:8787/healthz
echo   - Frontend:       http://localhost:5173
echo ========================================
echo.
echo Do NOT close the two black windows.
echo This window will close in 5 seconds.
echo.

timeout /t 5 /nobreak >nul
exit
