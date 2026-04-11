# 🏛️ OPA-CMS – Restaurant Management System

> Modulares CMS für Restaurants: Speisekarte, Reservierungen, Website-Editor, Lizenz-System & Plugin-API.  
> **Komplett über den Browser einrichtbar – keine Konsole oder Server-SSH nach der Installation nötig.**

---

## 📋 Inhaltsverzeichnis

- [Voraussetzungen](#voraussetzungen)
- [Linux Server Setup (Empfohlen)](#-linux-server-setup-empfohlen)
- [Alternatives Deploy-Skript](#-alternatives-deploy-skript-systemd)
- [Erster Start: Setup-Wizard](#-erster-start-setup-wizard)
- [SMTP-Konfiguration im Browser](#-smtp-konfiguration-im-browser)
- [Lizenz aktivieren](#-lizenz-aktivieren)
- [System aktualisieren](#-system-aktualisieren)
- [Admin-Passwort vergessen?](#-admin-passwort-vergessen)
- [Lokale Entwicklung (Windows / Mac)](#-lokale-entwicklung-windows--mac)
- [CMS-Navigation](#cms-navigation)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Projektstruktur](#-projektstruktur)
- [Roadmap](#-roadmap)

---

## Voraussetzungen

**Linux Server (Produktion):**
- Ubuntu 22.04 / 24.04, Debian 12 oder Rocky Linux 9
- Root-Zugang (einmalig für das Installer-Skript)
- Offene Ports: 80, 443 (nginx), optional 5000

**Lokal (Entwicklung):**
- Node.js ≥ 18 ([nodejs.org](https://nodejs.org))
- npm ≥ 9
- **Native Build-Tools** (werden von `better-sqlite3` benötigt):

| Betriebssystem | Installation |
|---|---|
| Ubuntu / Debian | `sudo apt install -y build-essential python3` |
| Fedora / RHEL / Rocky | `sudo dnf install -y gcc make python3` |
| macOS | `xcode-select --install` |
| Windows | Python ([python.org](https://python.org/downloads)) + [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) oder in einer Admin-PowerShell: `npm install -g windows-build-tools` |

> ℹ️ Das Start-Skript (`start-mac-linux.sh`) prüft diese Voraussetzungen automatisch und gibt eine klare Fehlermeldung, falls etwas fehlt.

---

## 🚀 Linux Server Setup (Empfohlen)

Dies ist der empfohlene Weg für den Produktivbetrieb mit **PM2** als Prozessmanager. Das Skript erledigt alles vollautomatisch.

```bash
# 1. Repository klonen
git clone https://github.com/stb-srv/OPA-Santorini.git /opt/opa-santorini
cd /opt/opa-santorini

# 2. Installer starten
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

### Was der Installer erledigt

| Schritt | Was passiert |
|---|---|
| System-Update | `apt upgrade`, Basis-Pakete, `openssl` |
| Node.js 20 LTS | Installation via NodeSource |
| PM2 | Prozessmanager mit Autostart nach Reboot |
| `.env` | Wird automatisch erstellt – PORT, CORS & ADMIN_SECRET befüllt |
| nginx | Reverse Proxy für Port 80 (optional) |
| SSL / HTTPS | Let's Encrypt via Certbot (optional, Domain muss zeigen) |
| Firewall (UFW) | Port 80/443 freigegeben, 5000 nur lokal |

Nach dem Installer läuft das CMS sofort unter `http://<deine-domain>/admin`.

> ✅ **Ab hier ist kein Konsolenzugriff mehr nötig.** Alle weiteren Einstellungen (SMTP, Lizenz, Restaurant-Name, Admin-Passwort) werden direkt im Browser erledigt.

---

## 🔧 Alternatives Deploy-Skript (systemd)

Alternative zu `install-ubuntu.sh` – nutzt **systemd** statt PM2 und eignet sich für Server ohne vorhandenes PM2-Setup.

```bash
git clone https://github.com/stb-srv/OPA-Santorini.git /opt/opa-santorini
cd /opt/opa-santorini
bash deploy.sh
```

| Merkmal | `install-ubuntu.sh` | `deploy.sh` |
|---|---|---|
| Prozessmanager | PM2 | systemd |
| Zielgruppe | Shared-Server, mehrere Apps | Dedizierter Server, einfaches Setup |
| HTTPS / Certbot | Optional (interaktiv) | Optional (interaktiv) |
| Admin-Erstellung | Via Setup-Wizard im Browser | Via Setup-Wizard im Browser |

---

## 🧙 Erster Start: Setup-Wizard

Beim ersten Aufruf von `http://<deine-domain>/admin` startet automatisch der **Setup-Wizard**. Er führt dich durch alle nötigen Schritte:

1. **Restaurantname** eingeben
2. **Admin-Zugangsdaten** festlegen (Benutzername + Passwort)
3. **E-Mail-Adresse** des Admins hinterlegen (für Passwort-Reset)
4. **Fertig** – das System startet mit einem kostenlosen 30-Tage-Trial

Nach dem Setup wirst du direkt ins CMS weitergeleitet.

> 💡 **Recovery-Codes**: Am Ende des Setups bekommst du 3 Wiederherstellungs-Codes. **Speichere diese sicher ab** – sie erlauben dir den Zugang wiederherzustellen, falls du dein Passwort vergisst.

> ⚠️ **Wichtig:** Die Setup-Konfiguration wird in `server/config.json` gespeichert (nicht in `.env`). Diese Datei ist in `.gitignore` aufgeführt und wird **nicht** ins Repository committed – sie bleibt bei `git pull` unangetastet. Führe **kein** `git clean -fd` aus, da dies `server/config.json` und damit alle Setup-Einstellungen löschen würde.

---

## 📧 SMTP-Konfiguration im Browser

Die E-Mail-Konfiguration für Reservierungsbestätigungen wird **vollständig im CMS** vorgenommen – kein SSH nötig.

1. Ins CMS einloggen → **⚙️ Einstellungen** → **E-Mail**
2. Folgende Felder ausfüllen:

| Feld | Beispiel | Erklärung |
|---|---|---|
| SMTP Host | `smtp.ionos.de` | Dein E-Mail-Server |
| SMTP Port | `465` | 465 = SSL/TLS, 587 = STARTTLS |
| Sicher (SSL) | `✓` | Ein bei Port 465 |
| Benutzername | `info@meinrestaurant.de` | Dein E-Mail-Login |
| Passwort | `dein-smtp-passwort` | E-Mail-Passwort |
| Absender-Name | `Mein Restaurant` | Wird im E-Mail-Client angezeigt |

3. **Speichern** klicken → eine Test-E-Mail wird automatisch an deine Admin-Adresse gesendet

**Gängige SMTP-Einstellungen:**

| Anbieter | Host | Port |
|---|---|---|
| IONOS (1&1) | `smtp.ionos.de` | 465 |
| Strato | `smtp.strato.de` | 465 |
| GMX | `mail.gmx.net` | 465 |
| Gmail | `smtp.gmail.com` | 587 |
| Outlook/Office365 | `smtp.office365.com` | 587 |

---

## 🔑 Lizenz aktivieren

Das System startet automatisch mit einem **kostenlosen 30-Tage-Trial** (FREE-Plan). Eine bezahlte Lizenz wird ebenfalls komplett im Browser aktiviert:

1. CMS → **⚙️ Einstellungen** → **Lizenz**
2. Lizenzschlüssel eingeben und auf **Aktivieren** klicken
3. Der Plan wird sofort freigeschaltet

**Verfügbare Pläne:**

| Plan | Speisen | Tische | Module |
|---|---|---|---|
| FREE (Trial) | 10 | 5 | Speisekarte |
| Starter | 40 | 10 | + Reservierungen, Bestellungen |
| Pro | 100 | 25 | + Custom Design |
| Pro+ | 200 | 50 | + Analytics |
| Enterprise | 500 | unbegrenzt | Alle Module inkl. QR-Pay |

---

## 🔄 System aktualisieren

### PM2-Setup (install-ubuntu.sh)

```bash
cd /opt/opa-santorini && git pull && npm install --silent && pm2 restart opa-cms
```

Oder mit dem mitgelieferten Skript:

```bash
./update-mac-linux.sh
```

### systemd-Setup (deploy.sh)

```bash
cd /opt/opa-santorini && git pull && npm install --silent && systemctl restart opa-santorini
```

### Was beim Update passiert

1. Neuen Code von GitHub pullen (`git pull`)
2. Neue/geänderte npm-Pakete installieren
3. CMS-Prozess neu starten
4. `.env`, Datenbank und alle Einstellungen bleiben **unangetastet**

> ℹ️ Datenbankmigrationen (neue Spalten etc.) werden automatisch beim Start ausgeführt.

---

## 🔐 Admin-Passwort vergessen?

### Option 1 – Recovery-Code (empfohlen, kein Server-Zugang nötig)

Falls du beim Setup die Recovery-Codes gespeichert hast:

1. Auf der Login-Seite auf **"Passwort vergessen"** klicken
2. Einen der 3 Recovery-Codes eingeben
3. Neues Passwort setzen

### Option 2 – Reset via Konsole (Fallback)

Nur wenn kein Recovery-Code mehr vorhanden ist:

```bash
cd /opt/opa-santorini
node reset-admin.js
# PM2:
pm2 restart opa-cms
# systemd:
systemctl restart opa-santorini
```

Das Skript gibt die neuen Zugangsdaten direkt in der Konsole aus und erzwingt beim nächsten Login eine Passwortänderung.

---

## 💻 Lokale Entwicklung (Windows / Mac)

Für Tests und Entwicklung auf dem eigenen Rechner:

**Windows:** Doppelklick auf `start-windows.bat`

**Mac / Linux:**
```bash
chmod +x start-mac-linux.sh
./start-mac-linux.sh
```

Beide Skripte:
- Prüfen automatisch ob Node.js und native Build-Tools vorhanden sind
- Erstellen automatisch eine `.env` aus `.env.example` (ADMIN_SECRET wird auto-generiert)
- Installieren fehlende npm-Pakete via `npm install`
- Starten den Server auf Port 5000
- CMS erreichbar unter: `http://localhost:5000/admin`
- Beim ersten Aufruf startet der **Setup-Wizard** automatisch

> ℹ️ **Hinweis:** Das Admin-Panel (`/admin`) wird vom Express-Server ausgeliefert und ist nur erreichbar wenn der Server läuft – das direkte Öffnen von `cms/index.html` im Browser funktioniert nicht.

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
   ├─ Einstellungen (inkl. SMTP & Lizenz)
   └─ Erweiterungen (Plugins)
```

---

## ✨ Features

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
- POST-API für programmtische Cancel/Confirm-Aktionen
- Warteliste / Anfrage-Modus wenn voll
- Konfigurierbarer Puffer & Aufenthaltsdauer

### 🌐 Website-Editor
- Startseite, Hero-Bereich, Galerie & Öffnungszeiten
- Impressum, Datenschutz & Cookie-Banner
- Standort-Karte einbetten
- Urlaubs- & Feiertagsverwaltung

### 🔑 Lizenz-System
- FREE / STARTER / PRO / PRO+ / ENTERPRISE Pläne
- 30-Tage-Trial beim Setup
- Lizenz-Aktivierung komplett im Browser
- Plan-Module einzeln manuell überschreibbar (Admin)

### 🔌 Plugin-System
- Erweiterungen mit eigenem `server.js` & Frontend
- Aktivierung/Deaktivierung per Toggle im CMS

### 🔒 Sicherheit
- CORS Origin-Whitelist (konfigurierbar über `CORS_ORIGINS` in `.env`)
- Rate-Limiting auf Login & Reservierungen
- bcrypt-Passwort-Hashing
- JWT-Sessions mit 12h Ablauf
- Recovery-Codes für Admin-Zugang
- SMTP-Konfiguration dynamisch aus DB (kein Neustart bei Änderung)

---

## 🛠️ Tech Stack

| Bereich | Technologie |
|---|---|
| Backend | Node.js, Express |
| Datenbank | SQLite via `better-sqlite3` |
| Auth | JWT + bcrypt |
| Realtime | Socket.io |
| Frontend | Vanilla JS (ES Modules) |
| Styling | CSS Custom Properties, Glassmorphism |
| E-Mail | Nodemailer (SMTP, dynamisch aus DB) |
| Prozessmanager | PM2 (install-ubuntu.sh) oder systemd (deploy.sh) |

---

## 📁 Projektstruktur

```
/opt/opa-santorini/
├── server.js              # Express-Server & alle API-Routen
├── config.js              # Konfiguration (Port, Secrets, SMTP – Prio: config.json > .env)
├── reset-admin.js         # Admin-Passwort zurücksetzen (Fallback, nur Konsole)
├── .env                   # Eure Konfiguration (NICHT committen!)
├── .env.example           # Vorlage für Umgebungsvariablen
├── install-ubuntu.sh      # Vollautomatischer Server-Setup (PM2, Ubuntu/Debian)
├── deploy.sh              # Alternatives Deploy-Skript (systemd)
├── update-mac-linux.sh    # Update-Skript (Linux/Mac, PM2)
├── start-mac-linux.sh     # Lokaler Start (Mac/Linux, Entwicklung)
├── start-windows.bat      # Lokaler Start (Windows, Entwicklung)
├── server/
│   ├── database.js        # SQLite-Datenbankschicht (better-sqlite3)
│   ├── config.json        # Setup-Konfiguration (auto-generiert, NICHT committen!)
│   ├── license.js         # Lizenz-Logik & Plan-Definitionen
│   ├── mailer.js          # E-Mail-Versand (Nodemailer, dynamischer SMTP)
│   └── api.js             # ⚠️ Legacy / deprecated – nicht mehr aktiv
├── scripts/
│   └── create-admin.js    # Hilfsskript: Admin-User anlegen (Konsole)
├── cms/                   # Admin-Interface
│   ├── index.html
│   ├── setup.html         # Setup-Wizard (Ersteinrichtung)
│   ├── app.js
│   ├── style.css
│   └── modules/           # CMS-Module (menu, reservations, ...)
├── menu-app/              # Gäste-Frontend (Speisekarte)
├── plugins/               # Erweiterungen
├── uploads/               # Hochgeladene Bilder
└── tmp/                   # Temporäre Dateien
```

---

## 🗺️ Roadmap

- [ ] Gutschein-System (digitale Geschenkkarten)
- [ ] Google Reviews Integration
- [ ] Sammelpass-Digital (jede 10. Bestellung = Rabatt)
- [ ] QR-Pay (Bezahlung am Tisch per QR-Code)
- [ ] SMS-Benachrichtigungen
- [ ] Mehrsprachigkeit (DE / EN / GR)
