# 🏛️ OPA! Santorini – Restaurant Management System

> Modulares CMS für Restaurants: Speisekarte, Reservierungen, Website-Editor, Lizenz-System & Plugin-API.

---

## 📋 Inhaltsverzeichnis

- [Voraussetzungen](#voraussetzungen)
- [Installation](#installation)
- [Konfiguration (.env)](#konfiguration-env)
- [Starten](#starten)
- [Server-Deployment (Ubuntu/Linux)](#server-deployment-ubuntulinux)
- [System aktualisieren](#system-aktualisieren)
- [Admin-Passwort zurücksetzen](#admin-passwort-zurücksetzen)
- [CMS-Navigation](#cms-navigation)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Projektstruktur](#projektstruktur)
- [Roadmap](#roadmap)

---

## Voraussetzungen

- **Node.js** ≥ 18 ([nodejs.org](https://nodejs.org))
- **npm** ≥ 9
- Optional für Produktivbetrieb: **PM2** (`npm install -g pm2`)

---

## Installation

### Option A – 1-Klick (Windows / Mac / Linux)

Repository klonen oder als ZIP herunterladen, dann:

**Windows:**
```cmd
start-windows.bat
```

**Mac / Linux:**
```bash
chmod +x start-mac-linux.sh
./start-mac-linux.sh
```

Das Skript installiert alle Abhängigkeiten und startet den Server automatisch.

---

### Option B – Manuell

```bash
git clone https://github.com/stb-srv/OPA-Santorini.git /opt/opa-santorini
cd /opt/opa-santorini

# Abhängigkeiten installieren
npm run install-all

# .env anlegen (siehe nächster Abschnitt!)
cp .env.example .env
nano .env

# Server starten
npm run dev
```

Das CMS ist erreichbar unter: **`http://localhost:5000/admin`**

> Beim ersten Aufruf startet der **Setup-Wizard** automatisch. Dort werden Restaurantname, Admin-Account und Lizenzschlüssel konfiguriert.

---

## Konfiguration (.env)

**Wichtig:** Die Datei `.env` muss vor dem ersten Start erstellt werden.

```bash
cp .env.example .env
```

Anschließend `.env` mit einem Texteditor öffnen und alle Werte anpassen:

```env
# Server
PORT=5000                          # Port des CMS (Standard: 5000)
ADMIN_SECRET=LANGEN_ZUFAELLIGEN_STRING_HIER_EINTRAGEN   # JWT-Secret, mind. 32 Zeichen!
LICENSE_SERVER_URL=https://licens-prod.stb-srv.de
DEV_MODE=false                     # Auf true setzen für lokale Entwicklung

# SMTP – E-Mail-Versand (für Reservierungsbestätigungen)
SMTP_HOST=smtp.dein-provider.de
SMTP_PORT=465
SMTP_SECURE=true                   # true = SSL/TLS, false = STARTTLS
SMTP_USER=ihre-email@restaurant.de
SMTP_PASS=ihr-smtp-passwort
SMTP_FROM="OPA! Santorini" <noreply@restaurant.de>

# CORS – Erlaubte Domains (kommagetrennt, ALLE Domains die auf den Server zugreifen)
# Beispiel: https://meinrestaurant.de,https://www.meinrestaurant.de
CORS_ORIGINS=https://meinrestaurant.de
```

> ⚠️ **ADMIN_SECRET** niemals leer lassen oder den Standardwert verwenden – er signiert alle Login-Tokens!

---

## Starten

| Modus | Befehl |
|---|---|
| Entwicklung (mit Auto-Reload) | `npm run dev` |
| Produktion | `npm start` |
| Mit PM2 (Autostart nach Reboot) | `pm2 start server.js --name opa-santorini` |

---

## Server-Deployment (Ubuntu/Linux)

Für einen vollautomatischen Setup auf einem Ubuntu-Server (inkl. nginx, PM2, Firewall):

```bash
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

Das Skript richtet folgendes ein:
- Node.js & npm via NodeSource
- PM2 als Prozessmanager mit Autostart
- nginx als Reverse Proxy
- UFW-Firewall (Port 80/443 offen, 5000 nur lokal)

Nach der Installation `.env` unter `/opt/opa-santorini/.env` anpassen und PM2 neu starten:

```bash
pm2 restart opa-santorini
```

---

## System aktualisieren

**Windows:**
```cmd
update-windows.bat
```

**Mac / Linux:**
```bash
./update-mac-linux.sh
```

**Manuell:**
```bash
cd /opt/opa-santorini
npm run update
pm2 restart all   # Falls PM2 verwendet wird
```

---

## Admin-Passwort zurücksetzen

Falls der Zugang zum CMS verloren geht:

```bash
node reset-admin.js
```

Das Skript setzt das Admin-Passwort zurück und gibt die neuen Zugangsdaten in der Konsole aus.

---

## CMS-Navigation

```
📊 Dashboard
🌐 Website
   ├─ Startseite & Bilder
   ├─ Seiten verwalten
   ├─ Impressum & Datenschutz
   ├─ Cookie Banner
   ├─ Standort & Karte
   ├─ Urlaub
   └─ Feiertage
🍽 Restaurant
   ├─ Reservierungen
   ├─ Tische
   └─ Öffnungszeiten
📋 Speisekarte
   ├─ Gerichte
   ├─ Kategorien
   ├─ Allergene
   └─ Zusatzstoffe
⚙️ System
   ├─ Einstellungen
   └─ Erweiterungen (Plugins)
```

---

## Features

### 🍽️ Speisekarten-Verwaltung
- Gerichte mit Bild, Preis, Nummer & Beschreibung
- Kategorien, Allergene & Zusatzstoffe
- PDF-Export der Speisekarte
- JSON-Backup & Restore (Import/Export)
- Plan-Limit-Prüfung beim Speichern

### 📅 Reservierungen
- Online-Buchung mit Echtzeit-Verfügbarkeitsprüfung
- Tisch-Zuweisung & Kombinationstisch-Logik
- Bestätigungs-/Storno-Links per E-Mail
- Warteliste / Anfrage-Modus wenn voll
- Konfigurierbarer Puffer & Aufenthaltsdauer

### 🌐 Website-Editor
- Startseite, Hero-Bereich, Galerie & Öffnungszeiten
- Impressum, Datenschutz & Cookie-Banner
- Standort-Karte einbetten
- Urlaubs- & Feiertagsverwaltung

### 🔑 Lizenz-System
- FREE / STARTER / PRO / ENTERPRISE Pläne
- 30-Tage-Trial beim Setup
- Plan-Module einzeln manuell überschreibbar (Admin)
- Validierung gegen externen Lizenzserver

### 🔌 Plugin-System
- Erweiterungen mit eigenem `server.js` & Frontend
- Aktivierung/Deaktivierung per Toggle im CMS

---

## Tech Stack

| Bereich | Technologie |
|---|---|
| Backend | Node.js, Express |
| Datenbank | JSON-Flat-File via `database.js` |
| Auth | JWT + bcrypt |
| Realtime | Socket.io |
| Frontend | Vanilla JS (ES Modules) |
| Styling | CSS Custom Properties, Glassmorphism |
| E-Mail | Nodemailer (SMTP) |

---

## Projektstruktur

```
/opt/opa-santorini/
├── server.js              # Express-Server & alle API-Routen
├── config.js              # Konfiguration (Port, Secrets, SMTP)
├── reset-admin.js         # Admin-Passwort zurücksetzen
├── .env.example           # Vorlage für Umgebungsvariablen
├── server/
│   ├── database.js        # Datenbankschicht (JSON-Files)
│   ├── license.js         # Lizenz-Logik & Plan-Definitionen
│   └── mailer.js          # E-Mail-Versand
├── cms/                   # Admin-Interface
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── modules/           # CMS-Module (menu, reservations, ...)
├── menu-app/              # Gäste-Frontend (Speisekarte)
├── plugins/               # Erweiterungen
├── uploads/               # Hochgeladene Bilder
├── start-windows.bat      # 1-Klick Start (Windows)
├── start-mac-linux.sh     # 1-Klick Start (Mac/Linux)
├── update-windows.bat     # 1-Klick Update (Windows)
├── update-mac-linux.sh    # 1-Klick Update (Mac/Linux)
└── install-ubuntu.sh      # Server-Setup (Ubuntu)
```

---

## Roadmap

- [ ] Gutschein-System (digitale Geschenkkarten)
- [ ] Google Reviews Integration
- [ ] Sammelpass-Digital (jede 10. Bestellung = Rabatt)
- [ ] QR-Pay (Bezahlung am Tisch per QR-Code)
- [ ] SMS-Benachrichtigungen
- [ ] Mehrsprachigkeit (DE / EN / GR)
