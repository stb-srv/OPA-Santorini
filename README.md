# 🏛️ OPA! Santorini – Restaurant Management System

> Modulares CMS für Restaurants: Speisekarte, Reservierungen, Website-Editor, Lizenz-System & Plugin-API.
> **Komplett über den Browser einrichtbar – keine Konsole oder Server-SSH nach der Installation nötig.**

---

## 📋 Inhaltsverzeichnis

- [Voraussetzungen](#voraussetzungen)
- [Linux Server Setup (Empfohlen)](#-linux-server-setup-empfohlen)
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
- Root-Zugang (einmalig für `install-ubuntu.sh`)
- Offene Ports: 80, 443 (nginx), optional 5000

**Lokal (Entwicklung):**
- Node.js ≥ 18 ([nodejs.org](https://nodejs.org))
- npm ≥ 9

---

## 🚀 Linux Server Setup (Empfohlen)

Dies ist der empfohlene Weg für den Produktivbetrieb. Das Skript erledigt **alles vollautomatisch** – nach dem einmaligen Ausführen wird **nichts mehr in der Konsole konfiguriert**.

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
| Firewall (UFW) | Port 80/443 freigegeben, 5000 nur lokal |

Nach dem Installer läuft das CMS sofort unter `http://<deine-domain>/admin`.

> ✅ **Ab hier ist kein Konsolenzugriff mehr nötig.** Alle weiteren Einstellungen (SMTP, Lizenz, Restaurant-Name, Admin-Passwort) werden direkt im Browser erledigt.

---

## 🧙 Erster Start: Setup-Wizard

Beim ersten Aufruf von `http://<deine-domain>/admin` startet automatisch der **Setup-Wizard**. Er führt dich durch alle nötigen Schritte:

1. **Restaurantname** eingeben
2. **Admin-Zugangsdaten** festlegen (Benutzername + Passwort)
3. **E-Mail-Adresse** des Admins hinterlegen (für Passwort-Reset)
4. **Fertig** – das System startet mit einem kostenlosen 30-Tage-Trial

Nach dem Setup wirst du direkt ins CMS weitergeleitet.

> 💡 **Recovery-Codes**: Am Ende des Setups bekommst du 3 Wiederherstellungs-Codes. **Speichere diese sicher ab** – sie erlauben dir den Zugang wiederherzustellen, falls du dein Passwort vergisst.

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
| Absender-Name | `OPA! Santorini` | Wird im E-Mail-Client angezeigt |

3. **Speichern** – eine Test-E-Mail wird automatisch verschickt

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

### One-Liner (Linux, empfohlen)

```bash
cd /opt/opa-santorini && git pull && npm install --silent && pm2 restart opa-cms
```

Oder mit dem mitgelieferten Skript:

```bash
./update-mac-linux.sh
```

### Was beim Update passiert

1. Neuen Code von GitHub pullen (`git pull`)
2. Neue/geänderte npm-Pakete installieren
3. CMS-Prozess in PM2 neu starten
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
pm2 restart opa-cms
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
- Erstellen automatisch eine `.env` aus `.env.example` falls noch keine vorhanden ist
- Installieren fehlende npm-Pakete
- Starten den Server auf Port 5000
- CMS erreichbar unter: `http://localhost:5000/admin`

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
- CORS Origin-Whitelist (konfigurierbar über CORS_ORIGINS in `.env`)
- Rate-Limiting auf Login & Reservierungen
- bcrypt-Passwort-Hashing
- JWT-Sessions mit 12h Ablauf
- Recovery-Codes für Admin-Zugang

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
| E-Mail | Nodemailer (SMTP) |

---

## 📁 Projektstruktur

```
/opt/opa-santorini/
├── server.js              # Express-Server & alle API-Routen
├── config.js              # Konfiguration (Port, Secrets, SMTP)
├── reset-admin.js         # Admin-Passwort zurücksetzen (Fallback)
├── .env                   # Eure Konfiguration (NICHT committen!)
├── .env.example           # Vorlage für Umgebungsvariablen
├── server/
│   ├── database.js        # SQLite-Datenbankschicht
│   ├── license.js         # Lizenz-Logik & Plan-Definitionen
│   └── mailer.js          # E-Mail-Versand (Nodemailer)
├── cms/                   # Admin-Interface
│   ├── index.html
│   ├── setup.html         # Setup-Wizard (Ersteinrichtung)
│   ├── app.js
│   ├── style.css
│   └── modules/           # CMS-Module (menu, reservations, ...)
├── menu-app/              # Gäste-Frontend (Speisekarte)
├── plugins/               # Erweiterungen
├── uploads/               # Hochgeladene Bilder
├── install-ubuntu.sh      # Vollautomatischer Server-Setup (Ubuntu/Debian)
├── update-mac-linux.sh    # Update-Skript (Linux/Mac)
├── start-mac-linux.sh     # Lokaler Start (Mac/Linux)
└── start-windows.bat      # Lokaler Start (Windows)
```

---

## 🗺️ Roadmap

- [ ] Gutschein-System (digitale Geschenkkarten)
- [ ] Google Reviews Integration
- [ ] Sammelpass-Digital (jede 10. Bestellung = Rabatt)
- [ ] QR-Pay (Bezahlung am Tisch per QR-Code)
- [ ] SMS-Benachrichtigungen
- [ ] Mehrsprachigkeit (DE / EN / GR)
