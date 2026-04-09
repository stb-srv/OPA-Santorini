#!/bin/bash
echo "=============================================================="
echo " OPA! Santorini - Restaurant CMS"
echo " Automatisches Setup-Skript (Mac/Linux)"
echo "=============================================================="
echo ""

# --- .env automatisch anlegen wenn nicht vorhanden ---
if [ ! -f ".env" ]; then
    echo "[SETUP] Keine .env gefunden – wird automatisch aus .env.example erstellt..."
    cp .env.example .env
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │  WICHTIG: .env wurde erstellt. Bitte jetzt anpassen:        │"
    echo "  │                                                               │"
    echo "  │    ADMIN_SECRET   = langen zufälligen String eintragen       │"
    echo "  │    SMTP_HOST/USER = E-Mail-Zugangsdaten für Reservierungen   │"
    echo "  │    CORS_ORIGINS   = Domain(s) die auf den Server zugreifen   │"
    echo "  │                                                               │"
    echo "  │  Datei öffnen mit:  nano .env                                │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
    read -rp "  .env jetzt anpassen? Dann Enter drücken sobald fertig... "
    echo ""
else
    echo "[OK] .env gefunden."
fi

echo "[1/2] Installiere Abhängigkeiten (Node.js Modules)..."
npm install --silent
if [ $? -ne 0 ]; then
    echo "Fehler bei npm install. Bitte Node.js prüfen!"
    exit 1
fi

echo "[2/2] Installation erfolgreich! Starte Server..."
echo ""
echo "=============================================================="
echo " Das CMS ist erreichbar unter:"
echo " - Admin:    http://localhost:5000/admin"
echo " - Speisekarte: http://localhost:5000/"
echo " Beim ersten Aufruf startet der Setup-Wizard automatisch."
echo "=============================================================="
echo ""

npm run dev
