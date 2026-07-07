@echo off
setlocal
title Asset Metadata Tool - Dev Launcher
cd /d "%~dp0"

REM --- Force-close any stale instance so the NEW main process loads ---
taskkill /F /IM electron.exe /T >nul 2>&1
taskkill /F /IM electronmon.exe /T >nul 2>&1

echo ========================================
echo   Asset Metadata Tool - Dev Mode
echo ========================================
echo.

REM --- 1. Check for Node.js (do NOT try to install it) ---
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js was not found on your PATH.
    echo.
    echo If you JUST installed Node, RESTART your PC so Windows picks up
    echo the new PATH, then double-click this file again.
    echo.
    echo If Node is not installed yet, get the LTS installer from:
    echo   https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo Node.js found: %NODEVER%
echo.

REM --- 2. Install dependencies the first time only ---
if not exist "node_modules" (
    echo First run: installing dependencies. This can take a few minutes...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo.
)

REM --- 3. Start the Vite dev server in its own window ---
echo Starting the dev server...
start "Asset Tool - Vite (leave open)" cmd /k "npm run dev"

REM --- 4. Give Vite a few seconds to boot, then launch the app ---
echo Waiting for the dev server to come up...
timeout /t 8 /nobreak >nul

REM --- Ensure electronmon (auto-restarts the main process on save) ---
if not exist "node_modules\electronmon" (
    echo Installing electronmon for auto-reload ^(one-time^)...
    call npm install --save-dev electronmon
)

echo Launching the app...
echo (Main-process edits now auto-restart the app. Renderer edits hot-reload.)
echo.
set NODE_ENV=development
if exist "node_modules\electronmon" (
    call npm run electron:watch
) else (
    echo electronmon not available - falling back to plain electron.
    call npm run electron:dev
)

REM --- 5. App closed ---
echo.
echo App closed. You can close the "Asset Tool - Vite" window now too.
pause
