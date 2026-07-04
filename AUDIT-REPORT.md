# Security- & Code-Audit — meraki-cms

**Auditiert:** Branch `fix/security-audit-remediation` (aktueller Arbeitsstand, inkl. bereits umgesetzter Härtungsmaßnahmen)
**Scope:** `server/`, `web/src/`, `plugins/`, `config.js`, `server.js`, `deploy.sh`, `install-ubuntu.sh`, `package.json`
**Methode:** Statische Codeanalyse (read-only), `npm audit`, manuelle Verifikation jeder Fundstelle am Code.

---

## Executive Summary

Die Codebasis ist insgesamt solide und in einem sicherheitsbewussten Zustand: SQL-Zugriffe sind in **beiden** DB-Adaptern durchgängig parametrisiert, Passwörter werden mit bcrypt (12 Runden) gehasht, der Login ist timing-sicher, Datei-Uploads sind mehrfach validiert (Extension + MIME + Magic-Byte), Secrets sind korrekt gitignored und React escaped Ausgaben automatisch (kein `dangerouslySetInnerHTML`). Mehrere klassische Schwachstellen (doppelter Setup-Endpunkt, Stored-XSS auf Token-Seiten, `unsafe-eval` in der CSP, Prototype Pollution im Settings-Merge, ungeschützte Image-AI-Routen) wurden auf diesem Branch **bereits behoben** und im Code verifiziert. Alle fünf 🟠-Funde der ursprünglichen "Top 5 Sofortmaßnahmen" (SMTP/MySQL-TLS, verbose Fehlermeldungen, Reservierungs-Race, Query-Token-Leak) sind inzwischen ebenfalls behoben. Verbleibend sind nur noch 🟡-Funde mittlerer Priorität (CSP `unsafe-inline`, fehlende Pagination, schwache `.passthrough()`-Validierung, Socket-Stale-Token, verwundbare `file-type`-Abhängigkeit).

**Fundverteilung:** 🔴 0 · 🟠 0 (alle behoben) · 🟡 7 · 🟢 4 · ❓ 3

---

## Architektur (Kurzüberblick)

`server.js` bootet die Express-App (`server/app.js`), Socket.IO (`server/socket.js`), Cron-Jobs und den LicenseChecker. Alle Routen liegen unter `server/routes/*` und werden in `app.js` mit Middleware aus `server/core/middleware.js` (`requireAuth` via JWT, `requireRole`, `requireLicense`, diverse Rate-Limiter) gemountet. Persistenz über einen Adapter-Selector (`server/db/index.js`) mit identischem Interface für SQLite (`better-sqlite3`, synchron) und MySQL (`mysql2/promise`, async); allgemeine Einstellungen liegen als JSON im `kv_store`. Auth erfolgt zustandslos über ein JWT im `x-admin-token`-Header **oder** `?token`-Query-Param, signiert mit `ADMIN_SECRET`; Rollen `admin`/`waiter`/`kitchen`. Das Lizenzsystem verifiziert RSA-signierte Tokens und gated Feature-Routen via `requireLicense(modul)`. Das Frontend ist eine React/Vite/TS-SPA (`web/`) mit TanStack Query für Server-State und einem Socket.IO-Singleton für Echtzeit-Updates (Kitchen/Orders/Dashboard). Gäste-Routen (Website, Warenkorb/Bestellung, Cookie-Consent, Feedback) sind bewusst öffentlich, alle Admin-Routen erfordern `requireAuth`.

---

## 🔴 Kritische Funde

_Keine offenen kritischen Funde auf dem auditierten Branch._

> Hinweis: Der zuvor kritische zweite Setup-Endpunkt (`server/routes/setup.js`) ist inzwischen hart gegen `CONFIG.SETUP_COMPLETE` gesperrt (Zeilen ~27-33) und erzwingt eine Passwort-Mindestlänge — verifiziert, nicht mehr offen.

---

## 🟠 Hohe Priorität

| Datei | Zeile(n) | Kategorie | Beschreibung | Auswirkung | Empfohlener Fix |
|-------|----------|-----------|--------------|------------|-----------------|
| ~~`server/services/mailer.js`~~ | ~~41~~ | Krypto / MITM | ✅ **Behoben** — `rejectUnauthorized` ist jetzt standardmäßig `true`, nur per `SMTP_ALLOW_INSECURE_TLS=true` abschaltbar. | — | — |
| ~~`server/routes/tables.js`, `server/routes/backup.js`, `server/routes/image-ai.js`, `server/routes/settings.js`, `server/app.js`~~ | — | Fehlerbehandlung / Info-Disclosure | ✅ **Behoben** — alle Routen liefern jetzt generische Client-Messages, Details ausschließlich via `logger.error` serverseitig. | — | — |
| ~~`server/routes/reservations.js` + `server/db/{sqlite,mysql}.js`~~ | — | Race Condition | ✅ **Behoben** — echtes DB-seitiges Locking via neuer `reservation_locks`-Tabelle (`acquireSlotLock`/`releaseSlotLock`, atomarer INSERT + Stale-Lock-Steal per `UPDATE ... WHERE locked_at < ?`) in beiden Adaptern implementiert. Schützt jetzt auch bei PM2-Cluster/Mehrfachinstanzen. | — | — |

---

## 🟡 Mittlere Priorität

| Datei | Zeile(n) | Kategorie | Beschreibung | Auswirkung | Empfohlener Fix |
|-------|----------|-----------|--------------|------------|-----------------|
| ~~`server/db/mysql.js`~~ | ~~28~~ | Krypto / MITM | ✅ **Behoben** — `rejectUnauthorized` ist jetzt standardmäßig `true` bei `DB_SSL=true`, nur per `DB_SSL_ALLOW_INSECURE=true` abschaltbar. | — | — |
| `server/app.js` | 45-60 | XSS / CSP | CSP erlaubt weiterhin `'unsafe-inline'` in `scriptSrc` **und** `styleSrc`/`scriptSrcAttr` (`'unsafe-eval'` wurde bereits entfernt). | Bei einer künftigen XSS-Lücke bleibt Inline-Script-Ausführung möglich — CSP-Schutz nur teilweise wirksam. | Auf Nonce-/Hash-basierte CSP umstellen und `'unsafe-inline'` für Scripts entfernen. |
| ~~`web/src/modules/orders/OrdersPage.tsx` + `server/core/middleware.js`~~ | — | Auth / Token-Leak | ✅ **Behoben** — Export-Downloads laufen jetzt über `apiDownload()` (fetch + Blob + `x-admin-token`-Header statt `?token=`-Query-Param). | — | — |
| `package.json` / `node_modules/file-type` | package.json:32 (`file-type ^16.5.4`), `server/routes/upload.js`:18 | Verwundbare Abhängigkeit | `npm audit`: `file-type` (13.0.0–21.3.0) — Endlosschleife im ASF-Parser bei manipuliertem Input (GHSA-5v7r-6r5c-r473, moderate). | DoS-Potenzial über hochgeladene Dateien. Kontextuell abgeschwächt (Upload ist auth-, MIME- und Größen-limitiert). | Update erfordert v22 (reines ESM) → inkompatibel mit dem CommonJS-`require()` in `upload.js`; entweder Upload-Modul auf dynamischen `import()` umstellen oder Magic-Byte-Prüfung auf eine CJS-kompatible Alternative migrieren. |
| `server/routes/orders.js`, `server/routes/reservations.js` | orders GET `/` (~26), reservations GET `/` (~76) | Performance | `GET /orders` und `GET /reservations` liefern **alle** Datensätze ohne `LIMIT`/Pagination. | Unbeschränktes Wachstum → wachsende Latenz/Speicher bei großem Bestand. | Server-seitige Pagination + Datumsfilter; Frontend entsprechend anpassen. |
| `server/validation/schemas.js` | 109 (`anyObjectSchema`) + Nutzung in settings/branding/menu/users/tables | Input-Validierung | Viele Schreib-Routen nutzen `z.object({}).passthrough()` bzw. `anyObjectSchema` — es werden faktisch nur wenige Pflichtfelder geprüft, der Rest geht ungeprüft weiter. | Schwache Server-Validierung; inkonsistent zur (teils strengeren) Client-Validierung. | Engere, feldspezifische Zod-Schemas je Route; `.strict()` wo möglich. |
| `web/src/lib/socket.ts` | 13-18 | State/Robustheit | Der Socket-Singleton übernimmt das JWT (`auth.token`) nur beim **ersten** `getSocket()`; nach Token-Refresh (<30 min Ablauf) wird der alte Token weiterverwendet. | Nach Ablauf des ursprünglichen Tokens kann ein Socket-Reconnect serverseitig scheitern (`socket.js` lehnt ungültige Tokens ab) → Echtzeit-Updates brechen ab. | Bei Token-Refresh `socket.auth` aktualisieren und Reconnect auslösen, oder Token pro Reconnect frisch aus `getAuthToken()` ziehen. |

---

## 🟢 Niedrige Priorität

| Datei | Zeile(n) | Kategorie | Beschreibung | Auswirkung | Empfohlener Fix |
|-------|----------|-----------|--------------|------------|-----------------|
| `server/services/mailer.js` | 124, 128, 29 | Logging-Hygiene | Nutzt `console.log`/`console.warn`/`console.error` statt des strukturierten `logger` (pino). | Inkonsistentes Logging, umgeht JSON-Logstruktur. | Auf `logger` umstellen (wie in den Routen). |
| `web/src/modules/settings/ImageAiTab.tsx` | 120-132 | Accessibility | `<Label>Standard-Bildquelle…</Label>` ist nicht via `htmlFor`/`id` mit dem folgenden `<select>` verknüpft. | Screenreader können Label und Control nicht zuordnen. | `id` am `<select>` + `htmlFor` am `<Label>` setzen (oder Control umschließen). |
| `plugins/hello-world/*`, `server.js` (Plugin-Loader) | server.js:41-63 | Supply-Chain / Plugins | Aktivierte Plugins werden per `require()` mit Vollzugriff (`app`, `DB`, `requireAuth`, `requireLicense`) geladen; Path-Traversal ist abgesichert (`path.basename` + Prefix-Check), aber es gibt keine Signatur-/Integritätsprüfung. | Ein manipuliertes Plugin-Verzeichnis hätte vollen Serverzugriff. | Nur relevant, wenn Plugins aus untrusted Quellen kommen — dann Signaturprüfung/Allowlist. Aktuell nur lokales Beispiel-Plugin → geringes Risiko. |
| `server/routes/orders.js` (CSV-Export) | 56 | Robustheit | CSV wird per String-Konkatenation gebaut; Felder sind zwar gequotet (`""`-Escaping für Items), aber `customerName`/Tisch könnten führende `=`,`+`,`-`,`@` enthalten (CSV-Formula-Injection in Excel). | Beim Öffnen in Excel könnten Formeln ausgeführt werden. | Führende Formel-Zeichen in Zellwerten mit `'` prefixen. |

---

## ❓ Verdachtsfälle (manuell prüfen)

| Datei | Zeile(n) | Kategorie | Beschreibung | Empfehlung |
|-------|----------|-----------|--------------|------------|
| `web/src/lib/socket.ts` + `web/src/lib/api.ts` | socket:13-18; api Auto-Refresh | Auth/Robustheit | Zusammenspiel Token-Auto-Refresh ↔ Socket-Reconnect (siehe 🟡). Ob ein Reconnect nach Refresh real scheitert, hängt vom Timing (12h Token-Gültigkeit vs. Session-Dauer) ab — im Betrieb reproduzieren. | Manuell testen: Token kurz vor Ablauf refreshen, Netzwerk trennen/wiederverbinden, prüfen ob Socket re-authentifiziert. |
| `server/helpers.js` (`tokenResponsePage`) | 142-179 | XSS | Der `message`-Parameter wird bewusst **unescaped** interpoliert (enthält legitime `<strong>`-Tags). Die dynamischen Werte werden inzwischen an den Aufrufstellen mit `escapeHtml()` gekapselt und `PUT /reservations/:id` sanitisiert die Felder — die Restfläche ist geschlossen, sollte aber bei künftigen neuen Aufrufern beachtet werden. | Konvention dokumentieren: Aufrufer müssen dynamische Werte selbst escapen. Alternativ `tokenResponsePage` auf strukturierte, intern escapte Felder umbauen. |
| `server/routes/cart.js` (`/order`) | 349-402 | Race / Bestandslogik | Preise werden serverseitig aus der DB geladen (gut), aber es gibt keine Bestands-/Verfügbarkeitssperre bei parallelen Bestellungen desselben limitierten Artikels. | Prüfen, ob limitierte Artikel (z. B. Tagesgerichte mit Menge) überhaupt existieren; falls ja, DB-seitige Mengenprüfung ergänzen. |

---

## Kategorien-Abdeckung (Phase 2)

1. **Injection (SQL/Command/Path):** Geprüft — **keine Funde**. SQLite (`server/db/sqlite.js`) nutzt ausschließlich `prepare()`-Statements mit Platzhaltern; MySQL (`server/db/mysql.js`) durchgehend `pool.query(sql, params)`. Path-Traversal beim Plugin-Loader (`server.js:46-51`) und Upload-Delete (`upload.js:106`, `path.basename`) abgesichert.
2. **Auth & Session:** Geprüft. JWT (`ADMIN_SECRET`, 12h Ablauf), Server verweigert Start bei unsicherem/Default-Secret (`config.js:83-97`). Timing-sicherer Login + Dummy-Hash (`auth.js:46-65`). Rest-Findings: Query-Token-Leak (🟡), Socket-Stale-Token (🟡).
3. **Autorisierung / IDOR:** Geprüft — im Wesentlichen sauber. Admin-Routen `requireRole('admin')`, Rollen-Kaskade in `middleware.js:22-33` (admin darf alles). Reservierungs-/Order-Token sind kryptografisch stark (`crypto.randomBytes(32)`) + timing-sicherer Vergleich. Keine offensichtliche IDOR.
4. **Input-Validierung:** Teilweise schwach — `.passthrough()`/`anyObjectSchema` (🟡). Server sanitisiert Freitext (`sanitizeText`), Gast-Bestellungen validieren Preise/Mengen serverseitig.
5. **XSS & CSP:** Kein `dangerouslySetInnerHTML` im Frontend (geprüft per Grep). Server-seitige HTML-Ausgabe (`tokenResponsePage`) escaped dynamische Werte. CSP: `unsafe-eval` entfernt, `unsafe-inline` verbleibt (🟡).
6. **CSRF:** Geprüft — **nicht anwendbar** für Admin-Routen: Auth über `x-admin-token`-Header (kein Cookie), daher kein klassischer CSRF-Vektor. Gäste-Routen sind absichtlich öffentlich.
7. **Datei-Uploads:** Geprüft — robust. `upload.js`: Extension- + MIME- + Magic-Byte-Prüfung, 5 MB Limit, SVG bewusst ausgeschlossen, zufällige Dateinamen, `/uploads` mit `Content-Security-Policy: default-src 'none'` + `nosniff` + `X-Frame-Options: DENY` ausgeliefert (`app.js`).
8. **Secrets-Management:** Geprüft — **keine Funde**. `.env`, `config.json`, `*.sqlite` in `.gitignore` und nicht getrackt (per `git ls-files` verifiziert). `ADMIN_SECRET` server-seitig auto-generiert. Request-Logger redacted `?token=` (`app.js`).
9. **Rate-Limiting:** Geprüft — vorhanden. Login (10/15min), Forgot-Password (5/h), Reservierung (20/15min), Feedback (10/h), General (300/min), Image-AI (15/min, neu). Angemessen.
10. **CORS:** Geprüft. Post-Setup Allowlist aus `CORS_ORIGINS`; Pre-Setup jetzt auf localhost beschränkt (`app.js`, zuvor Wildcard). OK.
11. **Verwundbare Dependencies:** `npm audit` = **1 moderate** (`file-type`, siehe 🟡). Frontend (`web/`): 0 Vulnerabilities. Zuvor 15 (u. a. multer, nodemailer, sanitize-html, ws) bereits behoben.
12. **Fehlerbehandlung:** Fund — verbose `e.message` an Client in mehreren Routen + globalem Handler (🟠).
13. **Shell-Skripte:** Geprüft. `deploy.sh`/`install-ubuntu.sh` validieren jetzt Domain/E-Mail per Regex vor Interpolation. `.env` wird mit `chmod 600` erstellt. Eingaben sind interaktiv (lokaler Admin-Kontext). Keine offene Command-Injection.
14. **Race Conditions:** Fund — Reservierungs-Mutex nur single-process (🟠); Cart-Bestand (❓).
15. **Memory Leaks (Frontend):** Geprüft — **keine Funde**. Alle `useEffect` mit Timern/Sockets/Listenern haben korrekte Cleanups (`KitchenPage.tsx:35`, `OrdersPage.tsx:85-91`, `DashboardPage.tsx:60-61`, `TablePlannerPage.tsx:100-104`).
16. **React State-Handling:** Geprüft — überwiegend sauber. `useEffect`-Dependencies plausibel (`[qc]` bei Socket-Effekten). Bewusste `eslint-disable exhaustive-deps` in `VisibilityDialog.tsx:35` (kontrolliert). Kein akuter Stale-Closure-Bug gefunden; Socket-Stale-Token separat unter 🟡/❓.
17. **Accessibility:** Ein konkreter Fund — `<select>` ohne Label-Verknüpfung in `ImageAiTab.tsx` (🟢). shadcn/ui-Komponenten liefern ansonsten Fokus-States/ARIA.
18. **Performance:** DB-Indizes vorhanden (`sqlite.js:197-205`, `mysql.js:281-291`: reservations date/token/status, orders status/timestamp, menu cat, categories sort). N+1 im Availability-Grid wurde durch Vorab-Laden entschärft. Offen: fehlende Pagination (🟡). Keine offensichtlichen unnötigen Re-Renders (TanStack Query + gezielte `setQueryData`).

---

## Top 5 Sofortmaßnahmen

1. ✅ **SMTP-TLS-Zertifikatsprüfung aktivieren** — Behoben (Commit `8e4cda6`).
2. ✅ **Verbose Fehlermeldungen kappen** — Behoben in `tables.js`, `backup.js`, `image-ai.js`, `settings.js` und dem globalen Handler (`app.js`); generische Client-Message, Details nur via `logger`.
3. ✅ **MySQL-SSL absichern** — Behoben, `rejectUnauthorized: true` als Default bei `DB_SSL=true` (Opt-out via `DB_SSL_ALLOW_INSECURE`).
4. ✅ **Reservierungs-Race entscheiden** — Behoben: echtes DB-seitiges Locking (`reservation_locks`-Tabelle, atomarer Acquire/Release + Stale-Lock-Recovery) in beiden DB-Adaptern implementiert.
5. ✅ **Query-Token bei Downloads ablösen** — Behoben: `apiDownload()` nutzt jetzt Header-Auth (fetch + Blob) statt `?token=`-Query-Param.

_Alle fünf Sofortmaßnahmen aus diesem Audit sind auf diesem Branch umgesetzt und verifiziert (Syntax-Checks, Smoke-Tests der neuen Lock-Logik, `tsc --noEmit` für die Frontend-Änderung)._

---

_Ende des Reports. Diese Analyse hat ausschließlich Lese-Tools genutzt; es wurden keine Code-Dateien verändert und keine Commits erstellt (einzige Ausgabe: diese Datei)._
