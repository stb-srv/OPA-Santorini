@echo off
echo ==============================================================
echo OPA-CMS - Restaurant Management System
echo Lokaler Start (Windows)
echo ==============================================================
echo.

REM --- Node.js pruefen ---
echo [0/3] Pruefe Voraussetzungen...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo X  Node.js nicht gefunden!
    echo    Bitte Node.js ^>= 18 installieren: https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=1" %%v in ('node -v') do set NODE_VER=%%v
echo    OK Node.js %NODE_VER% gefunden.

REM --- Build-Tools Hinweis (benötigt von better-sqlite3) ---
where python >nul 2>&1
if %errorlevel% neq 0 (
    where python3 >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo    WARNUNG: Python nicht gefunden!
        echo    better-sqlite3 benoetigt native Build-Tools.
        echo    Falls npm install fehlschlaegt, bitte installieren:
        echo      1. Python: https://python.org/downloads
        echo      2. In einer Admin-PowerShell ausfuehren:
        echo         npm install -g windows-build-tools
        echo    Oder Visual Studio Build Tools installieren:
        echo      https://visualstudio.microsoft.com/visual-cpp-build-tools/
        echo.
    )
)

REM --- .env automatisch anlegen wenn nicht vorhanden ---
if not exist ".env" (
    echo [SETUP] Keine .env gefunden - wird automatisch aus .env.example erstellt...
    copy .env.example .env >nul
    echo [OK] .env erstellt.
) else (
    echo [OK] .env gefunden.
)

echo [2/3] Installiere Abhaengigkeiten (Node.js Modules)...
call npm install --silent
if %errorlevel% neq 0 (
    echo.
    echo X  Fehler bei npm install!
    echo    Falls der Fehler mit better-sqlite3 zusammenhaengt:
    echo    1. Python installieren: https://python.org/downloads
    echo    2. In Admin-PowerShell: npm install -g windows-build-tools
    echo    3. Oder Visual Studio Build Tools installieren:
    echo       https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo.
    pause
    exit /b %errorlevel%
)

echo [3/3] Starte Server...
echo.
echo ==============================================================
echo CMS erreichbar unter:
echo   Admin-Panel:  http://localhost:5000/admin
echo   Gaeste-Seite: http://localhost:5000/
echo.
echo Beim ersten Aufruf startet der Setup-Wizard automatisch.
echo Dort Admin-Zugangsdaten, SMTP ^& Lizenz einrichten -
echo alles im Browser, keine weiteren Konsolenbefehle noetig.
echo ==============================================================
echo.

call npm run dev
pause
