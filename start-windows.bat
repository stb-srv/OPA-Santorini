@echo off
echo ==============================================================
echo OPA! Santorini - Restaurant CMS
echo Automatisches Setup-Skript (Windows)
echo ==============================================================
echo.

REM --- .env automatisch anlegen wenn nicht vorhanden ---
if not exist ".env" (
    echo [SETUP] Keine .env gefunden - wird automatisch aus .env.example erstellt...
    copy .env.example .env >nul
    echo.
    echo  +-------------------------------------------------------------+
    echo  ^|  WICHTIG: .env wurde erstellt. Bitte jetzt anpassen:        ^|
    echo  ^|                                                              ^|
    echo  ^|    ADMIN_SECRET   = langen zufaelligen String eintragen      ^|
    echo  ^|    SMTP_HOST/USER = E-Mail-Zugangsdaten fuer Reservierungen  ^|
    echo  ^|    CORS_ORIGINS   = Domain(s) die auf den Server zugreifen   ^|
    echo  ^|                                                              ^|
    echo  ^|  Datei oeffnen mit:  notepad .env                            ^|
    echo  +-------------------------------------------------------------+
    echo.
    echo  Öffne .env in Notepad...
    start notepad .env
    echo.
    pause
    echo.
) else (
    echo [OK] .env gefunden.
)

echo [1/2] Installiere Abhaengigkeiten (Node.js Modules)...
call npm install --silent
if %errorlevel% neq 0 (
    echo Fehler bei npm install. Bitte Node.js pruefen!
    pause
    exit /b %errorlevel%
)

echo [2/2] Installation erfolgreich! Starte Server...
echo.
echo ==============================================================
echo Das CMS ist erreichbar unter:
echo - Admin:       http://localhost:5000/admin
echo - Speisekarte: http://localhost:5000/
echo Beim ersten Aufruf startet der Setup-Wizard automatisch.
echo ==============================================================
echo.

call npm run dev
pause
