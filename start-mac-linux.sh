#!/bin/bash
echo "=============================================================="
echo " OPA-CMS - Restaurant Management System"
echo " Lokaler Start (Mac / Linux)"
echo "=============================================================="
echo ""

# --- Voraussetzungen prüfen ---
echo "[0/3] Prüfe Voraussetzungen..."

# Node.js
if ! command -v node &>/dev/null; then
    echo "❌ Node.js nicht gefunden! Bitte Node.js >= 18 installieren: https://nodejs.org"
    exit 1
fi
NODE_VER=$(node -e "process.exit(parseInt(process.versions.node.split('.')[0]) < 18 ? 1 : 0)" 2>/dev/null; echo $?)
if [ "$NODE_VER" = "1" ]; then
    echo "❌ Node.js >= 18 erforderlich! Aktuelle Version: $(node -v)"
    exit 1
fi
echo "   ✅ Node.js $(node -v) gefunden."

# Native Build Tools (benötigt von better-sqlite3)
BUILD_OK=true
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    BUILD_OK=false
    echo "   ⚠️  Python nicht gefunden (benötigt für better-sqlite3)."
fi
if ! command -v make &>/dev/null; then
    BUILD_OK=false
    echo "   ⚠️  make nicht gefunden (benötigt für better-sqlite3)."
fi
if ! command -v gcc &>/dev/null && ! command -v cc &>/dev/null; then
    BUILD_OK=false
    echo "   ⚠️  C-Compiler (gcc) nicht gefunden (benötigt für better-sqlite3)."
fi

if [ "$BUILD_OK" = "false" ]; then
    echo ""
    echo "   ❌ Native Build-Tools fehlen – npm install wird fehlschlagen!"
    echo "   Bitte installieren:"
    echo ""
    echo "   Ubuntu / Debian:  sudo apt install -y build-essential python3"
    echo "   Fedora / RHEL:    sudo dnf install -y gcc make python3"
    echo "   macOS:            xcode-select --install"
    echo ""
    echo "   Danach dieses Skript erneut ausführen."
    exit 1
fi
echo "   ✅ Build-Tools vorhanden."

# --- .env automatisch anlegen wenn nicht vorhanden ---
if [ ! -f ".env" ]; then
    echo "[SETUP] Keine .env gefunden – wird automatisch aus .env.example erstellt..."
    cp .env.example .env
    # Für lokale Entwicklung einen zufälligen Secret generieren
    if command -v openssl &>/dev/null; then
        SECRET=$(openssl rand -hex 32)
        sed -i.bak "s|^ADMIN_SECRET=.*|ADMIN_SECRET=${SECRET}|" .env && rm -f .env.bak
    fi
    echo "[OK] .env erstellt."
else
    echo "[OK] .env gefunden."
fi

echo "[2/3] Installiere Abhängigkeiten (Node.js Modules)..."
npm install --silent
if [ $? -ne 0 ]; then
    echo "❌ Fehler bei npm install!"
    echo "   Stelle sicher, dass Build-Tools installiert sind:"
    echo "   Ubuntu/Debian: sudo apt install -y build-essential python3"
    echo "   macOS:         xcode-select --install"
    exit 1
fi

echo "[3/3] Starte Server..."
echo ""
echo "=============================================================="
echo " CMS erreichbar unter:"
echo " → Admin-Panel:  http://localhost:5000/admin"
echo " → Gäste-Seite:  http://localhost:5000/"
echo ""
echo " Beim ersten Aufruf startet der Setup-Wizard automatisch."
echo " Dort Admin-Zugangsdaten, SMTP & Lizenz einrichten –"
echo " alles im Browser, keine weiteren Konsolenbefehle nötig."
echo "=============================================================="
echo ""

npm run dev
