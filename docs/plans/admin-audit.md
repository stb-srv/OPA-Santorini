# Admin-Bereich – Bestandsaufnahme aller Toggles/Settings (Phase 1)

**Methode:** Vollständige Lesekontrolle von `web/src/modules/**` (jede Datei mit `Switch`/`SwitchRow`/`Checkbox`/Toggle-Button-Pattern), Abgleich mit `server/routes/**`, `server/app.js`, `server/db/{sqlite,mysql}.js` (kv_store-Keys, DB-Spalten) sowie `web/src/config/navigation.ts` und `web/src/routes/admin-routes.tsx` (Routing/PAGES-Registry). Es wurden **keine Dateien verändert**.

**Ausdrücklich außerhalb des Scopes:** Das Lizenzsystem selbst (`server/services/license.js`, `server/services/license-checker.js`, `@meraki/plans`) wird nicht bewertet oder verändert — nur seine *Anbindung* an CMS-interne Toggles wird dokumentiert.

**Nicht mit erfasst:** `web/src/modules/guest/CookieBanner.tsx` (Gäste-Frontend-Consent-UI, kein Admin-Toggle) — wird nur als Konsument von `cookie_config` erwähnt.

---

## 1. Vollständige Toggle-Tabelle

| # | Bezeichnung im UI | Frontend-Datei:Zeile | Backend-Gegenstück | Fachbereich | Persistenz | Lizenzabhängig? | Abhängigkeiten | UI-Komponente |
|---|---|---|---|---|---|---|---|---|
| 1 | Modul-Grid: „Speisekarte bearbeiten" (`menu_edit`) | `settings/PlanModulesTab.tsx:120`, Meta in `settings/settings-api.ts:126` | `POST /api/settings/modules` → `server/routes/settings.js:350-414` | Module & Lizenz | kv `settings.enabledModules.menu_edit` | `alwaysAvailable: true` (kein Lizenz-Gate) | — | `Switch` (roh, in `Card`) |
| 2 | Modul-Grid: „Online-Bestellungen" (`orders_kitchen`) | gleiche Datei, Meta-Key `orders_kitchen` | gleiche Route | Module & Lizenz / Bestellungen | kv `settings.enabledModules.orders_kitchen` | ja, `licenseKey: orders_kitchen` | **Sync-Hack:** `settings.js:384-386` spiegelt diesen Wert automatisch nach `enabledModules.online_orders` UND `settings.activeModules.orders` | `Switch` |
| 3 | Modul-Grid: „Online-Reservierung" (`reservations`) | gleiche Datei | gleiche Route | Module & Lizenz / Reservierungen | kv `settings.enabledModules.reservations` | ja, `licenseKey: reservations` | spiegelt zusätzlich `settings.activeModules.reservations` | `Switch` |
| 4 | Modul-Grid: „Design anpassen" (`custom_design`) | gleiche Datei | gleiche Route | Module & Lizenz / Auftritt | kv `settings.enabledModules.custom_design` | ja | — | `Switch` |
| 5 | Modul-Grid: „Statistiken" (`analytics`) | gleiche Datei, `settingsPath: '/analytics'` | gleiche Route | Module & Lizenz / Dashboard | kv `settings.enabledModules.analytics` | ja, `licenseKey: analytics` | **Broken Link:** `/analytics` existiert weder in `navigation.ts` noch in `admin-routes.tsx` PAGES-Registry → Klick auf ⧉-Link landet im Catch-All (`/dashboard`). Zusätzlich: kein Dashboard-Widget prüft `hasModule('analytics')` — das Lizenzmodul „Statistiken" gated aktuell **nichts** Sichtbares. | `Switch` |
| 6 | Modul-Grid: „QR-Pay am Tisch" (`qr_pay`) | gleiche Datei | gleiche Route | Module & Lizenz / Bestellungen | kv `settings.enabledModules.qr_pay` | ja, `licenseKey: qr_pay` | — | `Switch` |
| 7 | Modul-Grid: „Küchen-Display" (`kitchen_display`) | gleiche Datei, `settingsPath: '/order-settings'` | gleiche Route | Module & Lizenz / Bestellungen | kv `settings.enabledModules.kitchen_display` | ja, `licenseKey: orders_kitchen` (**anderer Key als der Modul-Name selbst!**) | Nutzt dieselbe Lizenz wie „Online-Bestellungen", ist aber ein separater Enable-Schalter | `Switch` |
| 8 | Modul-Grid: „Tischplaner" (`table_planner`) | gleiche Datei, `settingsPath: '/tables'` | gleiche Route | Module & Lizenz / Reservierungen | kv `settings.enabledModules.table_planner` | ja, `licenseKey: reservations` | — | `Switch` |
| 9 | Modul-Grid: „Tagesspecials" (`daily_specials`) | gleiche Datei, `settingsPath: '/menu/daily'` | gleiche Route | Module & Lizenz / Speisekarte | kv `settings.enabledModules.daily_specials` | `alwaysAvailable: true` | **Toter Schalter:** Weder `DailyPage.tsx` noch `DishesTab.tsx` prüfen `enabledModules.daily_specials` — die Seite/Funktion ist immer aktiv, unabhängig vom Schalterstand. | `Switch` |
| 10 | Modul-Grid: „Menü-Übersetzung" (`menu_translate`) | gleiche Datei | gleiche Route | Module & Lizenz / Speisekarte | kv `settings.enabledModules.menu_translate` | ja, `licenseKey: multilanguage` | Kein `settingsPath` → kein Einstellungs-Link; Feature selbst laut `CLAUDE.md` „nur DE aktiv" (nicht implementiert) | `Switch` |
| 11 | Modul-Grid: „Import / Export" (`menu_import_export`) | gleiche Datei, `settingsPath: '/menu'` | gleiche Route | Module & Lizenz / Speisekarte | kv `settings.enabledModules.menu_import_export` | `alwaysAvailable: true` | laut `CLAUDE.md` Menü-Import/Export als Folge-TODO offen (Funktion evtl. nicht gebaut) | `Switch` |
| 12 | Modul-Grid: „QR-Code Generator" (`qrcodes`) | gleiche Datei | gleiche Route | Module & Lizenz / Tools | kv `settings.enabledModules.qrcodes` | `alwaysAvailable: true` | — | `Switch` |
| 13 | Modul-Grid: „Schichtplan" (`shifts`) | gleiche Datei | gleiche Route | Module & Lizenz / Tools | kv `settings.enabledModules.shifts` | `alwaysAvailable: true` | — | `Switch` |
| 14 | Modul-Grid: „Backup & Wiederherstellung" (`backup`) | gleiche Datei, `settingsPath: '/backup'` | gleiche Route | Module & Lizenz / Tools | kv `settings.enabledModules.backup` | ja, `licenseKey: backup` | Gated nur der JSON-Export/Import-Teil der Seite; der (kaputte) Cloud-Teil ist unabhängig davon immer sichtbar | `Switch` |
| 15 | SMTP „SSL/TLS" | `settings/SmtpTab.tsx:168-173` | `POST /api/settings` → `settings.js:139-165` | Kommunikation | kv `settings.smtp.secure` | nein | Wirkt auf `server/services/mailer.js` Transport-Konfiguration | `SwitchRow` |
| 16 | Reservierung: „Warteliste / Anfrage erlauben" | `settings/ReservationsTab.tsx:67-72` | `POST /api/settings` | Reservierungen | kv `settings.reservationConfig.allowInquiry` | Seite selbst hinter `reservations`-Modul (page-level, kein Einzel-Gate) | Serverseitig ausgewertet in `server/routes/reservations.js` (`rc.allowInquiry`) | `SwitchRow` |
| 17 | Bild-KI „Standard-Bildquelle" (Select, kein Switch) | `settings/ImageAiTab.tsx:120-133` | `POST /api/settings` | Kommunikation / Medien | kv `settings.imageApiKeys.defaultProvider` | Seite hinter `image_ai`-Modul (page-level) | Wert steuert clientseitig, welcher Provider beim Bild-Hinzufügen benutzt wird | natives `<select>` (kein Switch/SwitchRow) |
| 18 | Bestellmodi: „Am Tisch" / „Abholung" / „Lieferung" | `order-settings/OrderSettingsPage.tsx:193-195` | `POST /api/settings` | Bestellungen | kv `settings.orderConfig.{dineInEnabled,pickupEnabled,deliveryEnabled}` | Seite hinter `online_orders`-Lizenzmodul **und** zusätzlich `enabledModules.orders_kitchen` (Doppel-Gate, zwei verschiedene Mechanismen übereinander) | siehe Naming-Inkonsistenz unten (`orders_kitchen` vs. `online_orders`) | roh `Switch` via `modeRow()`-Helper |
| 19 | Zeitauswahl-Modus (Select) | `order-settings/OrderSettingsPage.tsx:221-228` | `POST /api/settings` | Bestellungen | kv `settings.orderConfig.timeSlotMode` | wie #18 | schaltet weitere Felder (`timeSlotLead`, `timeSlotStep`, `openTime`, `closeTime`) sichtbar/unsichtbar | `<select>` |
| 20 | „Sofort"-Option aktiv | `order-settings/OrderSettingsPage.tsx:283-286` | `POST /api/settings` | Bestellungen | kv `settings.orderConfig.sofortEnabled` | wie #18 | nur sichtbar wenn `timeSlotMode==='slots'` | roh `Switch` |
| 21 | Tagesempfehlung (Bulk-Liste) | `menu/DailyPage.tsx:113-116` | `PUT /api/menu/:id` | Speisekarte | DB-Spalte `menu.is_daily_special` (SQLite + MySQL) | nein (Modul „Tagesspecials" gated nichts, siehe #9) | Gleicher Wert auch über #22 änderbar | roh `Switch` |
| 22 | Tagesempfehlung (Einzelformular) | `menu/DishFormDialog.tsx:302-305` | `PUT /api/menu/:id` | Speisekarte | DB-Spalte `menu.is_daily_special` | nein | Doppelter Einstiegspunkt zu #21 (siehe Duplikate unten) | `Checkbox` |
| 23 | Verfügbarkeit (Gericht an/aus) | `menu/DishesTab.tsx:214-216` | `PUT /api/menu/:id` | Speisekarte | DB-Spalte `menu.available` | nein | — | roh `Switch` |
| 24 | Verfügbare Wochentage (Button-Gruppe) | `menu/DishFormDialog.tsx:328-330` | `PUT /api/menu/:id` | Speisekarte | DB-Spalte `menu.available_days` (JSON) | nein | — | eigene Button-Toggles (kein Switch/Checkbox) |
| 25 | Allergene/Zusatzstoffe (Mehrfachauswahl) | `menu/DishFormDialog.tsx:352-363` | `PUT /api/menu/:id` | Speisekarte | DB-Spalten `menu.allergens`/`menu.additives` (JSON) | nein | Datenzuordnung, kein „Feature-Toggle" im engeren Sinn | `Checkbox`-Liste |
| 26 | „Promotion-Leiste anzeigen" | `designer/DesignerPage.tsx:226-230` | `POST /api/homepage` | Design & Darstellung | kv `homepage.promotionEnabled` | Seite hinter `custom_design` (page-level) | Wird von Dashboard-Widget `website` (`dashboard/widgets.tsx:215-222`) rein zur Anzeige gelesen | `SwitchRow` |
| 27 | „Urlaubs-Sperre aktiv" | `designer/DesignerPage.tsx:241-247` (`PeriodForm`) | `POST /api/homepage` | Design & Darstellung | kv `homepage.vacation.enabled` | wie #26 | **UI-Label verspricht Serververhalten, das nicht existiert** (siehe Findings unten) | `SwitchRow` |
| 28 | „Feiertags-Ankündigung aktiv" | `designer/DesignerPage.tsx:248-253` | `POST /api/homepage` | Design & Darstellung | kv `homepage.holiday.enabled` | wie #26 | rein dekorativ (Banner), keine Blockade-Logik versprochen | `SwitchRow` |
| 29 | „Seite aktiv (öffentlich sichtbar)" | `designer/DesignerPage.tsx:413` (`PageEditDialog`) | `POST /api/homepage` | Design & Darstellung | kv `homepage.pages[].enabled` | wie #26 | — | `SwitchRow` |
| 30 | Cookie-Kategorie „Aktiv/Pflicht" | `designer/CookiesTab.tsx:167-174` | `POST /api/cookie-config/admin` | Rechtliches | kv `cookie_config.categories[id].enabled` | nein | Serverseitig erzwungen: `necessary.required/.enabled` wird in `server/routes/cookie.js:210-213` immer auf `true` überschrieben (gute Absicherung, aber nur serverseitig sichtbar) | roh `Switch` |
| 31 | Dashboard-Widget-Sichtbarkeit (17 Widgets) | `dashboard/VisibilityDialog.tsx:81` | `POST /api/settings` | Dashboard | kv `settings.dashboardConfig[]` (`{id,size,active}`) | nein (keine Kopplung an Lizenzmodule, obwohl z. B. „branding"-Widget Lizenzdaten zeigt) | — | roh `Switch` in Dialog-Liste |
| 32 | Öffnungszeiten „Geschlossen" (pro Wochentag) | `opening/OpeningPage.tsx:80-84` | `POST /api/homepage` | Öffnungszeiten | kv `homepage.openingHours[day].closed` | nein | — | roh `Switch` |
| 33 | Cloud-Backup „Auto-Backup täglich" | `backup/BackupPage.tsx:241-244` | **keins** — `apiPost('settings/backup-cloud', …)` und `apiPost('backup/cloud', {})` haben **keine** serverseitige Route (verifiziert per Grep über `server/`) | Backup | Frontend-lokaler State `s3` — wird nie erfolgreich persistiert | Seite hinter `backup`-Modul (page-level) | **Kaputtes Feature:** komplette S3-Cloud-Backup-Sektion ist reine Frontend-Attrappe ohne Backend | roh `Switch` |
| 34 | Plugin aktiv/inaktiv | *(keine Frontend-UI vorhanden)* | `GET/POST /api/plugins`, `/api/plugins/toggle` → `server/app.js:223-250` | System | kv `plugins[]` (`{id, enabled}`) | nein | Nav-Item „Erweiterungen" (`path:/plugins`) existiert in `navigation.ts:341-346`, aber `admin-routes.tsx` PAGES-Registry hat **keinen Eintrag** dafür → rendert `PlaceholderPage`. Backend-Funktion ist vollständig gebaut, Frontend fehlt komplett. | — |
| 35 | „Am Raster einrasten" (Tischplaner-Editor) | `table-planner/TablePlannerPage.tsx:349` | keins (nicht persistiert) | Reservierungen (Editor-UX) | **nicht persistiert**, nur `useState` im Editor | nein | Kein Feature-Toggle im eigentlichen Sinn, sondern reine Editor-Präferenz | natives `<input type="checkbox">` |
| 36 | `POST /license/modules` (kein UI-Aufrufer) | *(keine Frontend-Nutzung gefunden)* | `server/routes/settings.js:416-453` | Module & Lizenz | kv `settings.license.modules` | ja, eigene Validierung gegen `currentLic.modules` | **Toter/verwaister Endpunkt** – schreibt in ein anderes Feld (`license.modules`) als der tatsächlich genutzte Mechanismus (`enabledModules`, siehe #1-#14). Keine Referenz in `web/src/**` gefunden. | — |

---

## 2. Kritische Zusatzbefunde (bei Gegenprüfung während der Architekturplanung entdeckt)

Diese wurden **nach** der initialen Tabelle entdeckt, während eines Plan-Agenten-Reviews, und von mir per direktem Code-/Node-Check verifiziert (nicht nur behauptet):

1. **LIVE-BUG:** `server/routes/settings.js:13` importiert `FEATURE_MAP` aus `@meraki/plans` — dieser Export existiert nicht im installierten Paket (`node -e "console.log(Object.keys(require('@meraki/plans')))"` → nur `['PLAN_DEFINITIONS','PLAN_MODULES']`). Jeder Versuch, im Modul-Center (#1-#14) ein Modul auf **aktiv** zu setzen, wirft eine `TypeError` bei `FEATURE_MAP[featureId]`, die vom generischen Error-Handler zu HTTP 500 wird. **Das Modul-Center kann aktuell keine Module aktivieren.**
2. `settings.dailySpecialsEnabled` (`settings.js:400`) und `settings.activeModules.{orders,reservations}` (`settings.js:392-395`) sind **tote Felder** — repo-weiter Grep zeigt ausschließlich die Schreibstelle, keine einzige Lesestelle. (Eine erste Vermutung, das Gäste-Frontend läse `activeModules`, wurde geprüft und widerlegt — nur eine TS-Typdeklaration in `guest-api.ts:26`, keine tatsächliche Property-Zugriffsstelle.)

---

## 3. Duplikate / widersprüchliche Einstellungen

1. **`is_daily_special` – zwei Eingabepunkte** (#21 vs. #22): `DailyPage.tsx` (Bulk-Tabelle) und `DishFormDialog.tsx` (Einzelformular) schreiben denselben DB-Wert. Funktional korrekt, aber ein Konsolidierungskandidat für die neue Struktur (eine Quelle der Wahrheit für „wo ändere ich das").
2. **Zwei parallele „Modul aktivieren"-Mechanismen**: `enabledModules` (kv `settings`, via `/api/settings/modules`, tatsächlich genutzt in #1-#14, #18) vs. `settings.license.modules` (via `/api/license/modules`, #36) – letzterer wird von keiner Frontend-Seite aufgerufen. Zwei Datenmodelle für konzeptionell densel­ben Sachverhalt („welche Module darf/will der Kunde nutzen").
3. **Doppel-Gate bei Bestellmodi** (#18): Sowohl `enabledModules.orders_kitchen` (Modul-Center) als auch die Lizenzprüfung `hasModule('online_orders')` (page-level) müssen positiv sein, bevor die Einzelmodi (`dineInEnabled` etc.) überhaupt greifen — zwei unabhängige Ein/Aus-Schichten für dasselbe Feature-Bündel.
4. **`vacation.enabled`-Label vs. Implementierung** (#27): Text verspricht „Reservierungen & Online-Bestellungen deaktiviert", aber `grep -r vacation server/` liefert **keinen Treffer** — keine serverseitige Sperrlogik vorhanden. Entweder unvollständiges Feature oder veraltete Beschriftung.
5. **Kaputte Navigations-Links** aus dem Modul-Grid: `settingsPath: '/analytics'` (#5) sowie der Link `to="/settings/modules"` in `OrderSettingsPage.tsx:183` (tatsächliche Route ist `/settings/plan-modules`, siehe `navigation.ts:309`) führen beide ins Leere (Catch-All-Redirect zu `/dashboard`).
6. **Cloud-Backup ohne Backend** (#33): Komplette UI-Sektion ohne jede serverseitige Entsprechung.
7. **Backend-Feature ohne UI**: Plugin-Toggle (#34) ist serverseitig fertig, aber im Admin nirgends bedienbar.

## 4. Naming-Inkonsistenzen Backend ↔ Frontend

| Frontend-Begriff | Backend/Lizenz-Key | Ort |
|---|---|---|
| „Online-Bestellungen" (Modul-Center-Label) | `enabledModules.orders_kitchen` | `settings-api.ts:127` |
| dieselbe Funktion, aber Lizenzprüfung nutzt | `licInfo.modules.online_orders` | `OrderSettingsPage.tsx:64`, `useLicense.ts` |
| „Küchen-Display" (eigener Modul-Schalter) | `licenseKey: orders_kitchen` (identisch zu „Online-Bestellungen") | `settings-api.ts:132` |
| kv-Feld `settings.activeModules.orders` | totes Feld, nur für „Abwärtskompatibilität für das Gast-Frontend" gedacht (`settings.js:391-395`), aber nirgends gelesen | Legacy-Brücke ohne Konsument |

→ Es gibt de facto **drei verschiedene Bezeichner** (`orders_kitchen`, `online_orders`, `activeModules.orders`) für ein und dasselbe Geschäftsfeature „Online-Bestellungen", verteilt über Modul-Center, Lizenzsystem und eine tote Legacy-Brücke.

## 5. Wiederverwendbare bestehende UI-Bausteine

- **`SwitchRow`** (`web/src/components/shared/SwitchRow.tsx`) – Label + Beschreibung + Switch in einer Zeile. Bereits der sauberste, am ehesten wiederverwendbare Baustein; aktuell nur in 4 von 14 Toggle-Dateien genutzt (`SmtpTab`, `ReservationsTab`, `DesignerPage`). Die übrigen 10 Stellen verwenden rohes `Switch` mit jeweils eigenem Markup drumherum (Card, Zeile, Label) → Konsolidierungspotenzial.
- **`Switch`** (shadcn, `components/ui/switch.tsx`) – Basis-Primitive, überall verfügbar.
- **`Checkbox`** (`components/ui/checkbox.tsx`) – nur für Mehrfachauswahl (Allergene/Zusatzstoffe) und `is_daily_special`/„Am Raster einrasten" genutzt; funktional redundant zu `Switch` an den Single-Bool-Stellen (#22, #35).
- **`Card` / `CardContent`** – als Container für Einstellungsblöcke durchgängig verwendet, aber ohne einheitliche Innenstruktur (mal `space-y-4`, mal eigene Flex-Zeilen).
- **`PlanModulesTab`-Grid-Pattern** (Icon-Box + Titel + Beschreibung + Lock-Icon + Switch in `Card`) ist strukturell bereits nah an einer generischen „FeatureToggleCard" — guter Ausgangspunkt für Phase 2.
- Kein bestehendes `SettingsSection`/`SettingsCategoryPage`-Pattern vorhanden — jede Tab-Datei ist eine eigenständige, handgeschriebene Seite ohne gemeinsame Registry.

## 6. Einschätzung: fachliche Cluster

Aus den 36 gefundenen Einstellungen lassen sich **9 fachliche Cluster** ableiten:

1. Module & Lizenz-Center (#1-#14, #36)
2. Bestellungen (#18-#20, Teil von #2)
3. Reservierungen (#3, #16, #35)
4. Speisekarte & Inhalte (#21-#25)
5. Design & Website (#26-#29)
6. Rechtliches / Cookies (#30)
7. Kommunikation (#15, #17)
8. Dashboard (#31)
9. System / Tools (#32-#34: Öffnungszeiten, Backup, Plugins)

---

**Ergebnis: 36 Einstellungen in 19 Dateien gefunden, 9 fachliche Cluster identifiziert.** Weiterführende Architektur- und Migrationsentscheidungen siehe `docs/plans/admin-refactor-plan.md`.
