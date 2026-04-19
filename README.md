# 🏛️ OPA-CMS – Restaurant Management System

![Node.js Version](https://img.shields.io/badge/node-%E2%89%A518-green)
![License MIT](https://img.shields.io/badge/license-MIT-blue)
![Platform Linux](https://img.shields.io/badge/platform-Linux-lightgrey)

> Modulares CMS für Restaurants: Speisekarte, Reservierungen, Website-Editor, Warenkorb-System & Plugin-API.  
> **Komplett über den Browser einrichtbar – keine Konsole oder Server-SSH nach der Installation nötig.**

---

## 📋 Inhaltsverzeichnis

- [Voraussetzungen](#voraussetzungen)
- [Linux Server Setup (Empfohlen)](#-linux-server-setup-empfohlen)
- [MySQL/MariaDB Setup](#-mysqlmariadb-setup)
- [Warenkorb & Online-Bestellung](#-warenkorb--online-bestellung)
- [Erster Start: Setup-Wizard](#-erster-start-setup-wizard)
- [.env Variablen-Referenz](#-env-variablen-referenz)
- [Lizenz aktivieren](#-lizenz-aktivieren)
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
- Node.js ≥ 18
- npm ≥ 9
- **Native Build-Tools** (für `better-sqlite3`):
  - Ubuntu/Debian: `sudo apt install -y build-essential python3`
  - macOS: `xcode-select --install`

---

## 🚀 Linux Server Setup (Empfohlen)

Dies ist der empfohlene Weg für den Produktivbetrieb mit **PM2** als Prozessmanager.

```bash
# 1. Repository klonen
git clone https://github.com/stb-srv/OPA-Santorini.git /opt/opa-santorini
cd /opt/opa-santorini

# 2. Installer starten
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

---

## 🗄️ MySQL/MariaDB Setup

Standardmäßig nutzt OPA-Santorini **SQLite** (kein Setup nötig). Für größere Installationen oder Shared-Hosting (Netcup, Hetzner etc.) wird **MySQL/MariaDB** empfohlen.

1. Erstelle eine neue Datenbank und einen Benutzer.
2. Trage in der `.env` Datei folgende Werte ein:

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=dein_benutzer
DB_PASS=dein_passwort
DB_NAME=deine_db_name
DB_SSL=false
```

3. Starte den Server neu. Das Schema wird automatisch inkl. aller Migrationen erstellt.

---

## 🛒 Warenkorb & Online-Bestellung

OPA-Santorini verfügt über ein integriertes Warenkorb-System für Gäste.

- **Dine-In**: Gäste scannen einen QR-Code am Tisch und bestellen direkt an ihre Tischnummer.
- **Abholung (Pickup)**: Bestellen von zu Hause mit Angabe der gewünschten Abholzeit.
- **Lieferung (Delivery)**: Integriertes Formular für Lieferadresse und Kontaktdaten.
- **Vollständig Clientseitig**: Der Warenkorb nutzt den LocalStorage – kein Login für Gäste erforderlich.
- **Status-Steuerung**: Bestellungen können im Admin-Panel pro Modus (Tisch/Abholung/Lieferung) aktiviert oder deaktiviert werden.

---

## 🧙 Erster Start: Setup-Wizard

Beim ersten Aufruf von `http://<deine-domain>/admin` startet der **Setup-Wizard**:

1. **Restaurantname** & Branding festlegen
2. **Admin-Konto** erstellen (Benutzername + Passwort)
3. **Recovery-Codes** generieren (Sicher aufbewahren!)

> ⚠️ **Wichtig:** Die Konfiguration liegt in `server/config.json`. Diese Datei niemals committen oder löschen.

---

## ⚙️ .env Variablen-Referenz

| Variable | Beschreibung | Standard |
|---|---|---|
| `PORT` | Port des Express-Servers | `5000` |
| `ADMIN_SECRET` | JWT Signing Key (sehr lang & zufällig) | - |
| `CORS_ORIGINS` | Erlaubte Frontend-Domains (kommagetrennt) | - |
| `DB_TYPE` | `sqlite` oder `mysql` | `sqlite` |
| `DB_HOST` | Hostname der MySQL DB | `localhost` |
| `DB_PORT` | Port der MySQL DB | `3306` |
| `DB_USER` | Benutzername MySQL | - |
| `DB_PASS` | Passwort MySQL | - |
| `DB_NAME` | Datenbankname | - |
| `DB_SSL` | SSL für DB-Verbindung (`true`/`false`) | `false` |
| `PEXELS_API_KEY` | Key für automatische Speisefotos | - |
| `UNSPLASH_ACCESS_KEY` | Zweiter Key für Speisefotos | - |

---

## 🔑 Lizenz aktivieren

Das System bietet verschiedene Pläne (Starter, Pro, Pro+, Enterprise). Die Aktivierung erfolgt direkt im CMS unter **Einstellungen → Lizenz**.

| Plan | Highlights |
|---|---|
| **Starter** | Bis 40 Gerichte, Reservierungen & Bestellungen |
| **Pro** | Bis 100 Gerichte, Custom Design |
| **Enterprise** | Unbegrenzte Tische, alle Module inkl. QR-Pay |

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Datenbank**: SQLite (`better-sqlite3`) ODER MySQL/MariaDB (`mysql2`)
- **Frontend**: Vanilla JS (ES Modules), CSS Custom Properties (Glassmorphism)
- **Realtime**: Socket.io (für Bestelleingänge)
- **E-Mail**: Nodemailer (dynamischer SMTP aus DB)

---

## 📁 Projektstruktur

```
/
├── server.js              # Entry Point & API Routen
├── config.js              # Konfigurations-Loader
├── server/
│   ├── database.js        # DB-Adapter & SQLite Logik
│   ├── database-mysql.js  # MySQL/MariaDB Adapter
│   ├── routes/            # API Endpunkte (auth, menu, orders, cart...)
│   ├── license.js         # Lizenz-Prüfung
│   └── mailer.js          # E-Mail Versand
├── cms/                   # Admin-Panel (ES Modules)
│   ├── app.js             # Hauptlogik CMS
│   └── modules/           # Module (menu.js, reservations.js...)
├── menu-app/              # Gäste-Frontend
│   ├── app.js             # Hauptlogik Speisekarte
│   ├── cart.js            # Warenkorb-Logik
│   └── cart.css           # Warenkorb-Styles
└── plugins/               # Erweiterungs-Schnittstelle
```

---

## 🗺️ Roadmap

- [ ] Gutschein-System (digitale Geschenkkarten)
- [ ] Google Reviews Integration
- [ ] QR-Pay (Bezahlung am Tisch)
- [ ] Mehrsprachigkeit (DE / EN / EL)
