# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

---

## [Unreleased]

### Security
- **SEC-02 FIXED**: `requireLicense` Middleware prüft jetzt immer das RS256-signierte JWT
  via `verifyLicenseToken()` statt rohem DB-Cache. Direkter DB-Zugriff reicht nicht mehr
  aus um Module freizuschalten.
- **SEC-04**: Plugin-System ohne Code-Signing – `require(serverPath)` lädt Plugins blind.
  Geplant: Integritäts-Prüfung (Hash/Signatur) vor dem Laden.

### Fixed
- **FIX-04**: Plan-Definitionen mit License-Server synchronisiert:
  - FREE: `menu_items` 10 → 30
  - STARTER: 40 → 60
  - PRO: 100 → 150
  - PRO_PLUS: 200 → 300
  - ENTERPRISE: 500 → 999

### Improvements
- **IMP-02**: RSA Public Key kann jetzt per `LICENSE_PUBLIC_KEY` Env-Variable überschrieben
  werden – kein Code-Änderung mehr nötig bei Schlüsselwechsel.
  Nächster Schritt: automatisches Laden von `/api/v1/public-key` beim CMS-Start.
- **IMP-04**: Grace-Period für Token-Ablauf geplant (CMS läuft bei Heartbeat-Fehler
  noch 24-48h weiter).
- **IMP-05**: Docker Compose geplant.
- **IMP-06**: Trial-Lizenz-Registrierung oder Reset-Limit geplant.
- **NTH-01**: OpenAPI/Swagger-Dokumentation geplant.
- **NTH-02**: GitHub Actions CI (Tests + Lint) geplant.
- **NTH-06**: Content-Security-Policy-Header für Admin-Frontend geplant.

---

## [1.0.0] – 2026-04-12

### Hinzugefügt
- CMS als modulares Node.js/Express-System mit SQLite/JSON-KV-Datenbank
- RS256-JWT-Token-Verifikation mit Domain-Binding
- Trial-Lizenz-System mit Ablaufprüfung
- Heartbeat-Mechanismus (alle 23h) zum License-Server
- Offline-Token-Verifikation (bis 168h)
- Plugin-System mit dynamischem Laden aus `plugins/`
- Rate Limiting auf Login, Passwort-Vergessen und Reservierungen
- Admin-Dashboard mit JWT-Session-Auth
- SMTP-Konfiguration per Env oder Admin-UI
- Deploy-Skripte für Ubuntu/Linux und Windows
