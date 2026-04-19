# CLAUDE.md – Projektkontext für KI-Agenten

## Projektübersicht
OPA-Santorini ist ein modulares Restaurant-CMS. Backend: Node.js/Express. Frontend: Vanilla JS (ES Modules, kein Framework). Datenbank: SQLite (Standard) oder MySQL/MariaDB (via DB_TYPE=mysql).

## Wichtigste Dateien & Einstiegspunkte

| Datei | Zweck |
|---|---|
| server.js | Express-Server Entry Point, alle Route-Mounts |
| config.js | Konfiguration (Prio: server/config.json > .env) |
| server/database.js | DB-Adapter-Loader (wählt SQLite oder MySQL) |
| server/database-mysql.js | MySQL/MariaDB Adapter |
| server/routes/*.js | Alle API-Routen (auth, menu, orders, reservations, tables, settings, upload, cookie, cart, backup, users) |
| server/middleware.js | requireAuth, requireLicense, requireMenuLimit, Rate-Limiter |
| server/license.js | Lizenz-Logik & PLAN_DEFINITIONS |
| server/mailer.js | E-Mail-Versand via Nodemailer |
| cms/index.html | Admin-Panel HTML-Einstieg |
| cms/app.js | Admin-Panel Haupt-JS (ES Modules) |
| cms/modules/ | CMS-Module (menu.js, reservations.js, settings.js etc.) |
| menu-app/index.html | Gäste-Frontend (Speisekarte) |
| menu-app/app.js | Gäste-Frontend Haupt-JS |
| menu-app/cart.js | Warenkorb-Logik (komplett clientseitig) |
| menu-app/cart.css | Warenkorb-Styles |

## Architektur-Regeln (WICHTIG)

- **Kein Framework im Frontend** – nur Vanilla JS mit ES Modules (`import/export`). Kein React, Vue, Angular.
- **Datenbank-Adapter-Interface**: Beide Adapter (SQLite + MySQL) exportieren exakt dieselben Methoden. Neue DB-Funktionen immer in BEIDEN Adaptern implementieren: `server/database.js` (SQLite-Block) UND `server/database-mysql.js`.
- **Migrationen**: Neue Datenbankspalten müssen als Migration eingetragen werden – in `database.js` im `migrations`-Array (SQLite) UND in `database-mysql.js` im `initSchema()`-try-Block mit `SHOW COLUMNS`-Check (MySQL).
- **Auth**: Alle Admin-API-Routen brauchen `requireAuth` als Middleware. Gäste-Routen (menu-app, cart) sind öffentlich.
- **Lizenz-Check**: Feature-Routen die einen Plan benötigen nutzen `requireLicense(moduleName)`.
- **Config-Priorität**: `server/config.json` (Setup-Wizard) überschreibt `.env`. Nie `server/config.json` committen.
- **KV-Store**: Allgemeine Einstellungen (Settings, License, SMTP etc.) werden als JSON in der `kv_store`-Tabelle gespeichert via `DB.getKV(key)` / `DB.setKV(key, value)`.

## .env Variablen-Referenz

```env
PORT=5000
ADMIN_SECRET=zufälliger-langer-string   # JWT-Signing-Key
CORS_ORIGINS=https://meinrestaurant.de  # Komma-getrennt für mehrere Origins

# Datenbank (Standard: SQLite)
DB_TYPE=mysql          # oder: sqlite
DB_HOST=localhost
DB_PORT=3306
DB_USER=opa_user
DB_PASS=passwort
DB_NAME=opa_cms
DB_SSL=false           # true für SSL-Verbindung

# Automatische Speisefotos (nur Scripts, optional)
PEXELS_API_KEY=...
UNSPLASH_ACCESS_KEY=...
```

## Häufige Fehlerquellen

- **DB_TYPE nicht gesetzt** → App startet mit SQLite statt MySQL, alle MySQL-Daten unsichtbar
- **Neue Spalte nur in einem Adapter** → Funktioniert lokal (SQLite) aber nicht auf Prod (MySQL) oder umgekehrt
- **`server/config.json` fehlt** → Setup-Wizard startet neu, alle Einstellungen weg
- **CORS_ORIGINS nicht gesetzt** → API-Calls vom Frontend werden blockiert in Produktion
- **`JSON_VALID()` in MySQL** → Zum Prüfen ob JSON-Felder (translations, allergens etc.) valide sind: `SELECT id FROM menu WHERE JSON_VALID(translations) = 0`

## Routen-Übersicht

| Prefix | Datei | Auth |
|---|---|---|
| /api/admin | routes/auth.js | Nein (Login-Endpunkt) |
| /api/users | routes/users.js | requireAuth |
| /api/menu, /api/categories | routes/menu.js | requireAuth (schreiben), öffentlich (lesen) |
| /api/orders | routes/orders.js | requireAuth |
| /api/reservations | routes/reservations.js | requireAuth + requireLicense |
| /api/tables | routes/tables.js | requireAuth |
| /api/settings | routes/settings.js | requireAuth |
| /api/upload | routes/upload.js | requireAuth |
| /api/cookie | routes/cookie.js | requireAuth |
| /api/cart | routes/cart.js | Öffentlich (Gäste) |
| /api/backup | routes/backup.js | requireAuth |
