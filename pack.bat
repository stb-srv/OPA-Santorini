@echo off
setlocal
echo 📦 Verpacke Grieche-CMS Projekt für den Server...

set "ZIP_NAME=grieche-cms-bundle.zip"

REM Lösche alte Zip falls vorhanden
if exist "%ZIP_NAME%" del "%ZIP_NAME%"

echo 🔍 Erstelle Datei-Liste (node_modules, .git etc. werden ignoriert)...

REM Nutze PowerShell für das Komprimieren, da es auf jedem modernen Windows vorhanden ist.
REM Wir kopieren die relevanten Dateien in einen temporären Ordner, um sicherzugehen, dass node_modules etc. nicht drin sind.

set "TEMP_DIR=dist_temp"
if exist "%TEMP_DIR%" rd /s /q "%TEMP_DIR%"
mkdir "%TEMP_DIR%"

echo 📂 Kopiere Dateien...
xcopy /E /I /Y "cms" "%TEMP_DIR%\cms"
xcopy /E /I /Y "license-server" "%TEMP_DIR%\license-server"
xcopy /E /I /Y "menu-app" "%TEMP_DIR%\menu-app"
xcopy /E /I /Y "plugins" "%TEMP_DIR%\plugins"
xcopy /E /I /Y "server" "%TEMP_DIR%\server"
xcopy /E /I /Y "scripts" "%TEMP_DIR%\scripts"
copy "config.js" "%TEMP_DIR%\"
copy "install-ubuntu.sh" "%TEMP_DIR%\"
copy "package.json" "%TEMP_DIR%\"
copy "package-lock.json" "%TEMP_DIR%\"
copy "server.js" "%TEMP_DIR%\"

REM Entferne DB und Config aus dem Temp, falls mitkopiert
if exist "%TEMP_DIR%\config.json" del "%TEMP_DIR%\config.json"
if exist "%TEMP_DIR%\server\database.sqlite" del "%TEMP_DIR%\server\database.sqlite"

echo 🤐 Komprimiere zu %ZIP_NAME%...
powershell -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%ZIP_NAME%' -Force"

echo 🧹 Räume auf...
rd /s /q "%TEMP_DIR%"

echo.
echo ✅ Fertig! Die Datei '%ZIP_NAME%' kann nun auf deinen Server hochgeladen werden.
echo.
pause
