# OPA-Santorini Projekt-Gedächtnis

## 📌 Übersicht
OPA-CMS ist ein modulares Restaurant-Management-System (Node.js/Express) mit Speisekarte, Tisch-Reservierung und Admin-Dashboard.

## 📂 Wichtige Orte
- **Backend:** `server.js` (Einstieg), `server/` (Logik, Routen, DB)
- **Routen:** `server/routes/` (auth, menu, orders, reservations, settings, tables, upload, users)
- **Admin-Dashboard (CMS):** `cms/` (HTML/JS/CSS) – Einstieg: `cms/index.html`
- **Gäste-Frontend:** `menu-app/`
- **Konfiguration:** `config.js` (Zentraler Export, mergt `.env` und `server/config.json`)
- **Datenbank:** `server/database.sqlite` (wenn SQLite) oder MySQL. Logik in `server/database.js` & `server/database-mysql.js`.

## 🔑 Konfiguration & API Keys
Werte werden primär in der `.env` Datei (nicht im Git) verwaltet:
- `ADMIN_SECRET`: JWT-Geheimnis für Admin-Sessions.
- `DB_TYPE`: `sqlite` (Standard) oder `mysql`.
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`: MySQL-Zugangsdaten.
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`: E-Mail-Einstellungen (für Reservierungen).
- `LICENSE_SERVER_URL`: URL zur Lizenzprüfung.

## 🚀 Wichtige Befehle
- `npm start` / `npm run dev`: Startet den Server auf Port 5000 (Standard).
- `npm run reset-admin`: Setzt Admin-Zugangsdaten zurück (`reset-admin.js`).
- `npm run update`: Führt `git pull && npm install` aus.
- `install-ubuntu.sh`: Komplett-Setup für Linux-Server.
- `migrate-to-mysql.sh`: Migriert Daten von SQLite zu MySQL.

## 🛠 Features & Module
- **Tischplaner:** Visueller Editor in der CMS.
- **Reservierungssystem:** Mit E-Mail-Bestätigung und Zeit-Slots.
- **Speisekarte:** Dynamisch verwaltbar mit Upload-Funktion für Bilder.
- **Lizenz-System:** Prüft Gültigkeit gegen `stb-srv.de`.

## 📝 Architektur-Notizen
- Das CMS nutzt Glassmorphism Design (Vanilla CSS/JS).
- Authentifizierung erfolgt via JWT (HttpOnly Cookies / Bearer).
- Bilder werden standardmäßig in `uploads/` gespeichert.
- Middleware (`server/middleware.js`) prüft Berechtigungen und Ratenbegrenzung.

---
*Stand: April 2026*
