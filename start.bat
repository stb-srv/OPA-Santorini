@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title OPA! Santorini - Starter

REM ============================================================
REM  OPA! Santorini - Windows Start Script
REM  Startet CMS und (optional) Lizenzserver
REM ============================================================

call :header

REM --- Node.js prüfen ---
where node >nul 2>&1
if %errorlevel% neq 0 (
    call :error "Node.js wurde nicht gefunden!"
    echo   Bitte Node.js 20 LTS installieren: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
call :info "Node.js gefunden: !NODE_VER!"

REM --- node_modules prüfen ---
if not exist "node_modules" (
    call :warn "node_modules nicht gefunden - installiere Abhängigkeiten..."
    call npm install
    if %errorlevel% neq 0 (
        call :error "npm install fehlgeschlagen!"
        pause
        exit /b 1
    )
    call :ok "Abhängigkeiten installiert"
)

REM --- config.json prüfen ---
if not exist "config.json" (
    call :warn "Keine config.json gefunden - Setup wird gestartet..."
    call :start_cms_setup
    goto :wait_for_enter
)

REM --- Lizenzserver starten? ---
set START_LICENSE=N
if exist "license-server\server.js" (
    if exist "license-server\node_modules" (
        set START_LICENSE=Y
    ) else (
        echo.
        set /p START_LICENSE="  Lizenzserver-Abhängigkeiten installieren und starten? [J/N]: "
        if /i "!START_LICENSE!"=="J" set START_LICENSE=Y
    )
)

if /i "!START_LICENSE!"=="Y" (
    if not exist "license-server\node_modules" (
        call :info "Installiere Lizenzserver-Abhängigkeiten..."
        cd license-server
        call npm install
        cd ..
        call :ok "Lizenzserver-Abhängigkeiten installiert"
    )
    call :info "Starte Lizenzserver in separatem Fenster..."
    start "OPA License Server" cmd /k "title OPA License Server && cd /d "%~dp0license-server" && node server.js"
    timeout /t 2 /nobreak >nul
)

REM --- CMS starten ---
echo.
call :ok "Starte OPA! Santorini CMS..."
echo.
echo  ┌─────────────────────────────────────────────────┐
echo  │   CMS:      http://localhost:5000               │
echo  │   Admin:    http://localhost:5000/admin         │
if /i "!START_LICENSE!"=="Y" (
echo  │   Lizenzen: http://localhost:4000               │
)
echo  │                                                 │
echo  │   Fenster schliessen = Server stoppen           │
echo  └─────────────────────────────────────────────────┘
echo.

node server.js

:wait_for_enter
echo.
call :error "Server wurde beendet oder Fehler aufgetreten."
pause
goto :eof

REM ============================================================
REM  Hilfs-Funktionen
REM ============================================================

:start_cms_setup
    start "OPA CMS" cmd /k "title OPA CMS Setup && node server.js"
    timeout /t 2 /nobreak >nul
    start "" http://localhost:5000/setup
    call :info "Browser geöffnet: http://localhost:5000/setup"
goto :eof

:header
    cls
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║         OPA! Santorini - Restaurant CMS          ║
    echo  ║              Windows Starter v2.0                ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
goto :eof

:info
    echo  [INFO]  %~1
goto :eof

:ok
    echo  [ OK ]  %~1
goto :eof

:warn
    echo  [WARN]  %~1
goto :eof

:error
    echo  [FAIL]  %~1
goto :eof
