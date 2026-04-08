#!/bin/bash

# ==============================================================================
# OPA! Santorini - Grieche-CMS Ubuntu Installation Script
# ==============================================================================
# Dieses Skript installiert alle Abhängigkeiten, Node.js und setzt das CMS
# als Hintergrundprozess (PM2) auf einem Ubuntu-Server auf.
#
# Nutzung: 
# 1. Datei auf den Server kopieren
# 2. chmod +x install-ubuntu.sh
# 3. sudo ./install-ubuntu.sh
# ==============================================================================

set -e

echo "🚀 Starte Installation von Grieche-CMS..."

# 1. System Update
echo "🔄 Update Systempakete..."
sudo apt update && sudo apt upgrade -y

# 2. Installiere Basis-Abhängigkeiten
echo "📦 Installiere Basis-Pakete (Build-Tools für SQLite)..."
sudo apt install -y curl git build-essential python3

# 3. Installiere Node.js (Version 20 LTS)
echo "🟢 Installiere Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Installiere PM2 (Process Manager)
echo "⚙️ Installiere PM2 globally..."
sudo npm install -g pm2

# 5. CMS Abhängigkeiten installieren
echo "📥 Installiere CMS npm-Pakete..."
npm install

# 6. Lizenz-Server Abhängigkeiten installieren
if [ -d "license-server" ]; then
    echo "🔑 Installiere Lizenz-Server npm-Pakete..."
    cd license-server && npm install && cd ..
fi

# 7. Verzeichnisse & Berechtigungen
echo "📁 Setze Berechtigungen für Uploads..."
mkdir -p uploads
chmod -R 775 uploads

# 8. PM2 Service Setup
echo "🚀 Starte CMS mit PM2..."
pm2 start server.js --name "grieche-cms"

if [ -d "license-server" ]; then
    echo "🚀 Starte Lizenz-Server mit PM2..."
    pm2 start license-server/server.js --name "license-server"
fi

# 9. PM2 Autostart konfigurieren
echo "💾 Speichere PM2 Prozess-Liste für Autostart..."
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# 10. Optional: Nginx Installation (Info)
echo ""
echo "=============================================================================="
echo "🎉 INSTALLATION ABGESCHLOSSEN!"
echo "=============================================================================="
echo "Dein CMS läuft nun im Hintergrund über PM2."
echo "- Status prüfen: pm2 status"
echo "- Logs einsehen: pm2 logs grieche-cms"
echo ""
echo "TIPP: Installiere Nginx für SSL (HTTPS):"
echo "sudo apt install nginx -y"
echo "=============================================================================="
