# Admin-Bereich – Zielarchitektur & Migrationsplan (Phase 2)

**Grundlage:** `docs/plans/admin-audit.md` (36 Einstellungen, 19 Dateien, 9 Cluster). **Das Lizenzsystem selbst (`server/services/license.js`, `server/services/license-checker.js`, `@meraki/plans`) wird nicht verändert** — nur seine Anbindung an die neue Struktur.

---

## 2.1 Informationsarchitektur

### Die 4 Arten von Kontrolle (konsistent auf alle Einstellungen angewendet)

| Art | Bedeutung | Wer ändert es? | Beispiel |
|---|---|---|---|
| **1 – Lizenz-Berechtigung** | Feature ist im gebuchten Plan enthalten | Niemand im CMS (read-only, kommt aus `license.js`/JWT) | `custom_design` im Plan „Pro" |
| **2 – Globaler Feature-Schalter** | Feature ist grundsätzlich ein-/ausgeschaltet | Admin, sofern Art 1 erlaubt | `enabledModules.orders_kitchen` |
| **3 – Sichtbarkeit** | Element wird angezeigt/versteckt, keine Funktionsänderung | Admin, meist ohne Lizenzbezug | Dashboard-Widget, eigene Seite |
| **4 – Detailkonfiguration** | Feinkonfiguration eines bereits aktiven Features | Admin, auf Unterseite/Dialog | Bestellstopp-Minuten, Slot-Länge |

Diese vier Arten bekommen ein einheitliches visuelles Vokabular: Art 1 = Schloss-Icon + ausgegraut (Muster bereits in `PlanModulesTab.tsx:90` vorhanden, wird übernommen), Art 2 = `Switch` in `FeatureToggleCard`, Art 3 = `Switch` in `SettingsSection` ohne Schloss, Art 4 = eigener Konfigurationsbereich, der nur sichtbar/aktiv ist, wenn das zugehörige Art-2-Feature an ist.

### Neue Top-Level-Kategorien

Bewusste Abweichung vom naheliegendsten Vorschlag: **Rechtliches wird von „Design & Website" abgetrennt** (Cookies/Impressum haben DSGVO-Charakter, andere Zielgruppe als Marketing-Inhalte), und **Speisekarten-Inhalte werden bewusst NICHT Teil der Settings-Registry**, weil `is_daily_special`/`available`/`available_days` Datensatzfelder pro Gericht sind, keine globalen Einstellungen.

| Nr | Kategorie | Enthält (aus Audit) | Registry-relevant? |
|---|---|---|---|
| 1 | **Module & Lizenz** | 14 Modul-Toggles (#1-#14), Plugins (#34) | Ja – Art 1+2 |
| 2 | **Bestellungen** | #18-#20 + Bestell-E-Mail-Vorlagen | Ja – Art 4, abhängig von Modul „online_orders" |
| 3 | **Reservierungen & Tische** | #16 (`allowInquiry`), Dauer/Puffer-Configs | Ja – Art 4, abhängig von Modul „reservations" |
| 4 | **Speisekarte & Menü** *(kein Registry-Bereich)* | #21-#25 | Nein – bleibt Content-Feld, nur UX-Konsolidierung (ein Eingabepunkt statt zwei) |
| 5 | **Design & Auftritt** | #26-#29 | Ja – Art 3/4 |
| 6 | **Rechtliches & Datenschutz** *(neu abgetrennt)* | #30, Impressum/Datenschutztext | Ja – Art 3 (mit Sonderfall „required") |
| 7 | **Kommunikation** | #15, #17 | Ja – Art 4 |
| 8 | **Dashboard** | #31 (17 Widgets) | Ja – Art 3, kein Lizenzbezug |
| 9 | **System** | #32 (Öffnungszeiten), #33 (Backup, Cloud-Teil entfällt), #34 (Plugins) | Teilweise |

Das Tischplaner-„Snap-to-Grid" (#35, nicht persistiert) wird explizit **nicht** in die Registry aufgenommen – keine echte Einstellung, sondern UI-Editor-Zustand.

---

## 2.2 Navigationsstruktur

Referenzdateien: `web/src/config/navigation.ts` (Single Source of Truth), `web/src/routes/admin-routes.tsx` (Routing-Konsument).

### Änderungen an `NAV_CONFIG`

| Aktuelle Struktur | Änderung |
|---|---|
| `settings-group` → „Lizenz & Module" + „Module aktivieren" (zwei Einträge) | Zusammenführen zu **einer** Seite mit zwei Tabs: „Übersicht/Lizenz" (read-only, Art 1) und „Module verwalten" (Art 2) — analog zum bestehenden `SettingsPage.tsx`-Tab-Muster |
| `settings-group` → „Erweiterungen" (Plugins, aktuell `PlaceholderPage`) | Bekommt eine echte Seite (`plugins: PluginsPage` in `admin-routes.tsx` PAGES-Registry) |
| **Neu:** `legal-group` | Neue `NavGroup` „Rechtliches" mit Items „Cookies" (aus `DesignerPage.tsx`-Tab herausgelöst → `/legal/cookies`) und „Impressum & Datenschutz" (aus `DesignerPage.tsx`-Tab „legal" → `/legal/texts`) |
| `restaurant-group` → „Website & Inhalte" | Behält Promo/Vacation/Holiday/Pages-Tabs, verliert die Tabs „Cookies" und „Impressum" (wandern in die neue Rechtliches-Gruppe) |
| `settings-group` → „Bestell-E-Mail Vorlagen" (reine Weiterleitungs-Karte in `SettingsPage.tsx:59-77`) | **Entfällt** – E-Mail-Vorlagen sind bereits nativ Teil von `OrderSettingsPage.tsx` |
| `settings-group` → „E-Mail & SMTP" + „KI-Bildgenerierung" | Zu Gruppe „Kommunikation" zusammengefasst (nur Label-Vereinheitlichung, keine Pfadänderung) |

### Explizit aufgelöste/zusammengeführte Seiten

- `settings/license` + `settings/plan-modules` → **eine** Seite „Module & Lizenz" mit 2 Tabs (beide bestehenden Komponenten `LicenseTab`/`PlanModulesTab` bleiben als Tab-Inhalte, kein Datenverlust)
- `SettingsOrderEmailsPage` (reine Weiterleitungs-Karte) → entfernt, Nav-Eintrag `order-emails` gelöscht
- `DesignerPage.tsx` Tab `cookies` → eigene Seite unter „Rechtliches"
- `DesignerPage.tsx` Tab `legal` → eigene Seite unter „Rechtliches"
- `plugins`-Nav-Eintrag → bekommt erstmals eine echte `PluginsPage` (Backend bereits vollständig unter `server/app.js:223-252`)

---

## 2.3 Technisches Datenmodell

### Registry-Interface

```ts
// web/src/config/settings-registry.ts (NEU)

export type SettingScope = 'feature' | 'visibility' | 'config';
// feature    = Art 2 (globaler Ein/Aus-Schalter)
// visibility = Art 3 (Sichtbarkeit, kein Lizenzbezug nötig)
// config     = Art 4 (Detailkonfiguration, meist innerhalb einer Unterseite)

export type SettingCategory =
  | 'module-license' | 'orders' | 'reservations'
  | 'design' | 'legal' | 'communication' | 'dashboard' | 'system';

export interface SettingRegistryEntry {
  key: string;                     // stabiler, kanonischer Schlüssel (NEU eingeführt)
  label: string;
  description?: string;
  category: SettingCategory;
  scope: SettingScope;
  icon?: string;

  // Art 1 – Lizenzbezug (read-only Anzeige, KEINE Schreiblogik hier!)
  requiresLicense?: boolean;
  licenseModule?: string;          // Schlüssel aus PLAN_MODULES (@meraki/plans)
  alwaysAvailable?: boolean;       // bypass licenseModule-Check

  // Art 2 – Abhängigkeiten zwischen Feature-Schaltern
  dependsOn?: string;              // registry-key, muss aktiv sein

  // Persistenz-Mapping
  storageKey: string;              // z.B. 'settings.enabledModules.orders_kitchen'
  legacyStorageKeys?: string[];    // weitere Keys, die synchron mitgeschrieben werden
  defaultValue: boolean | string | number;

  settingsPath?: string;           // Deep-Link zu Art-4-Unterseite
  configurableFields?: string[];   // Feldnamen der Art-4-Seite (rein deklarativ, für Doku/Suche)
}
```

### Beispiel-Einträge (repräsentativ für alle 9 Kategorien)

```ts
export const SETTINGS_REGISTRY: SettingRegistryEntry[] = [
  {
    key: 'menu_edit', label: 'Speisekarte bearbeiten', category: 'module-license',
    scope: 'feature', alwaysAvailable: true,
    storageKey: 'settings.enabledModules.menu_edit', defaultValue: true,
    settingsPath: '/menu/dishes',
  },
  {
    key: 'online_orders', // <- NEUER kanonischer Name (Bug-Fix, siehe unten)
    label: 'Online-Bestellungen', category: 'module-license', scope: 'feature',
    requiresLicense: true, licenseModule: 'online_orders',
    storageKey: 'settings.enabledModules.orders_kitchen', // Storage-Feldname bleibt!
    defaultValue: false, settingsPath: '/order-settings',
  },
  {
    key: 'kitchen_display', label: 'Küchen-Display', category: 'module-license',
    scope: 'feature', requiresLicense: true, licenseModule: 'online_orders',
    storageKey: 'settings.enabledModules.kitchen_display', defaultValue: false,
    settingsPath: '/kitchen',
  },
  {
    key: 'analytics', label: 'Statistiken', category: 'module-license', scope: 'feature',
    requiresLicense: true, licenseModule: 'analytics',
    storageKey: 'settings.enabledModules.analytics', defaultValue: false,
    settingsPath: undefined, // FIX: toter Link '/analytics' entfernt statt neu gebaut
  },
  {
    key: 'order_dine_in', label: 'Am Tisch bestellen', category: 'orders', scope: 'config',
    dependsOn: 'online_orders',
    storageKey: 'settings.orderConfig.dineInEnabled', defaultValue: true,
  },
  {
    key: 'reservation_inquiry', label: 'Warteliste/Anfrage erlauben', category: 'reservations',
    scope: 'config', dependsOn: 'reservations',
    storageKey: 'settings.reservationConfig.allowInquiry', defaultValue: true,
  },
  {
    key: 'design_promotion_bar', label: 'Promotion-Leiste', category: 'design', scope: 'visibility',
    dependsOn: 'custom_design',
    storageKey: 'homepage.promotionEnabled', defaultValue: true,
  },
  {
    key: 'design_vacation', label: 'Urlaubs-Sperre', category: 'design', scope: 'feature',
    dependsOn: 'custom_design',
    storageKey: 'homepage.vacation.enabled', defaultValue: false,
    // Label wird korrigiert: KEINE serverseitige Durchsetzung vorhanden (siehe Migrationsschritt 15)
  },
  {
    key: 'cookie_category_necessary', label: 'Technisch notwendig', category: 'legal',
    scope: 'visibility', alwaysAvailable: true,
    storageKey: 'cookie_config.categories.necessary.enabled', defaultValue: true,
    // required=true wird weiterhin serverseitig erzwungen (cookie.js:210-213) – nicht anfassen
  },
  {
    key: 'smtp_secure', label: 'SMTP: Sichere Verbindung (TLS)', category: 'communication',
    scope: 'config', storageKey: 'settings.smtp.secure', defaultValue: true,
  },
  {
    key: 'dashboard_widget_visibility', label: 'Dashboard-Widgets', category: 'dashboard',
    scope: 'visibility', alwaysAvailable: true,
    storageKey: 'settings.dashboardConfig[].active', defaultValue: true,
    // Sonderfall Array-of-objects: die 17 Widgets kommen weiterhin aus WIDGET_META (dashboard-data.ts)
  },
  {
    key: 'opening_hours_closed', label: 'Wochentag geschlossen', category: 'system',
    scope: 'config', alwaysAvailable: true,
    storageKey: 'homepage.openingHours[day].closed', defaultValue: false,
  },
  {
    key: 'plugin_enabled', label: 'Plugin aktiv', category: 'system', scope: 'feature',
    alwaysAvailable: true, storageKey: 'plugins[].enabled', defaultValue: false,
  },
];
```

### Migration bestehender Werte – ohne Datenverlust

Die Registry liest zur Laufzeit **weiterhin aus denselben `kv_store`-Keys** (`storageKey`). Es findet **keine physische Datenmigration** statt — lediglich eine neue, zentrale Lese/Schreib-Indirektion im Frontend (und Backend) wird eingeführt. `kv_store` ist schemalos (`CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT)`), daher keine DB-Migration nötig für Registry-Metadaten selbst — nur echte DB-Spalten (z. B. `menu.*`) folgen weiterhin dem bekannten Zwei-Adapter-Muster aus `CLAUDE.md`, falls je eine neue Spalte nötig würde (hier nicht der Fall).

| Alter Ort | Neuer Registry-Bereich | Migrationsaufwand |
|---|---|---|
| `MODULE_LABELS`/`MODULE_GROUPS` (`settings-api.ts:112-149`) | 14 `category: 'module-license'`-Einträge | `settings-api.ts` exportiert `MODULE_LABELS` künftig als *abgeleiteten* Wert aus der Registry (Re-Export, keine Breaking Changes für bestehende Importe) |
| `settings.enabledModules.orders_kitchen` | `online_orders` (kanonischer Registry-Key) | Storage-Feldname bleibt unverändert, nur der UI-Anzeigename wird vereinheitlicht |
| `settings.orderConfig.*` | `orders`-Kategorie, Scope `config` | keine Feldänderung, nur Registry-Metadaten neu |
| `settings.reservationConfig.allowInquiry` | `reservations`-Kategorie | unverändert |
| `homepage.promotionEnabled`/`vacation.enabled`/`holiday.enabled`/`pages[].enabled` | `design`-Kategorie | unverändert |
| `cookie_config.categories[id].enabled/required` | `legal`-Kategorie | unverändert, Server-Logik (`cookie.js:210-213`) bleibt exakt so |
| `settings.smtp.secure`, `settings.imageApiKeys.defaultProvider` | `communication`-Kategorie | unverändert |
| `settings.dashboardConfig[]` | `dashboard`-Kategorie (Sonderfall Array) | unverändert, `WIDGET_META` bleibt bestehen |
| `homepage.openingHours[day].closed` | `system`-Kategorie | unverändert |
| `plugins[]` (`server/app.js:226,241`) | `system`-Kategorie | unverändert, nur Frontend-Seite fehlt bisher |

### Anbindung des Lizenzsystems (read-only!)

Die Registry ruft **niemals** Funktionen aus `server/services/license.js` zur Veränderung auf. Sie konsumiert ausschließlich:
- `GET /api/license/info` (Frontend, via `useLicense()`-Hook, unverändert)
- `getCurrentLicense(DB, domain)` serverseitig (unverändert, nur **Lesezugriff**)

Der einzige Codeeingriff im Lizenzbereich ist der **Bug-Fix des CMS-seitigen Feature→Lizenz-Mappings** (nicht des Lizenzsystems selbst): `FEATURE_MAP` aus `@meraki/plans` existiert nicht und wird ersetzt durch eine lokale Ableitung aus der Registry:

```js
// server/routes/settings.js – Ersatz für `const { FEATURE_MAP } = require('@meraki/plans');`
const { getLicenseKeyForFeature } = require('../registry/settings-registry.js');
// getLicenseKeyForFeature('orders_kitchen') => 'online_orders'
```

### Entscheidungen zu den gefundenen Bugs/Inkonsistenzen

| Befund | Entscheidung | Begründung |
|---|---|---|
| `FEATURE_MAP` undefined (500 bei jedem Modul-Enable) | **Fix** – lokale Registry-Ableitung statt `@meraki/plans`-Import | Blockierender Live-Bug, ohne Fix ist Modul-Center faktisch unbenutzbar |
| `POST /license/modules` (dead endpoint) | **Entfernen** | Null Frontend-Aufrufer, schreibt in dasselbe Feld wie die echte Lizenzaktivierung → Konfliktpotenzial, kein Nutzen |
| `orders_kitchen`/`online_orders`/`activeModules.orders` Dreifachbenennung | **Kanonisieren auf `online_orders`** in allen neuen Code-Stellen (Registry, Doku), Storage-Keys unverändert lassen; `activeModules`-Feld (unbenutzt) wird entfernt | Keine DB-Migration nötig; wir fügen keine dritte Quelle der Wahrheit hinzu, sondern vereinheitlichen nur die Lesart und entfernen totes Legacy-Feld |
| `daily_specials` totes Toggle | **Entfernen** aus Modul-Center (nicht nachträglich scharf schalten) | Feature ist seit Einführung nie durchgesetzt worden; Reaktivierung wäre eine Verhaltensänderung, Entfernung ist reine Aufräumung ohne Risiko |
| `settingsPath: '/analytics'` (broken link) | **Entfernen** (kein Deep-Link) | Keine dedizierte Analytics-Konfigurationsseite vorhanden; Analytics ist reine Sichtbarkeit im Dashboard |
| `vacation.enabled`-Label ohne Enforcement | **Label korrigieren** auf tatsächliches Verhalten (Enforcement deferred) | Server-seitige Durchsetzung wäre eine neue Verhaltensänderung mit Auswirkung auf Gäste-Frontend — außerhalb des Scopes „nur bestehendes konsolidieren"; stattdessen ehrliches Label, ggf. separates Ticket für spätere Umsetzung |
| Cloud-Backup S3 (Frontend-only, kein Backend) | **Entfernen** aus `BackupPage.tsx` | Täuschende UI ohne Funktion widerspricht „kein Redundanz/keine toten Toggles" |
| Plugins-UI fehlt | **Bauen** (`PluginsPage.tsx`) | Backend ist fertig, Aufwand gering, schließt sichtbare Lücke in Nav |

---

## 2.4 Frontend-Komponentenarchitektur

### Bestehend (bleibt)
- **`SwitchRow`** (`web/src/components/shared/SwitchRow.tsx`) – bleibt das primitive Baustein-Element (Label + Description + Switch), wird als internes Rendering-Primitiv von `FeatureToggleCard` wiederverwendet.

### Neu

```
web/src/components/shared/
  FeatureToggleCard.tsx    // Art 1+2: Card mit Icon, Lock-Overlay bei !licensed, Switch, Deep-Link
  SettingsSection.tsx      // Gruppierender Container (Titel + Liste von SwitchRow/FeatureToggleCard)
  SettingsCategoryPage.tsx // Rendert eine ganze Kategorie generisch aus SETTINGS_REGISTRY
```

- **`FeatureToggleCard`** ist im Kern das, was `PlanModulesTab.tsx:78-126` bereits inline baut — wird 1:1 extrahiert (kein Verhaltensunterschied), damit auch andere Kategorien (Dashboard-Sichtbarkeit, Cookie-Kategorien) dasselbe Lock/Badge-Verhalten bekommen, ohne es erneut zu bauen.
- **`SettingsCategoryPage`** nimmt `category: SettingCategory` entgegen, filtert `SETTINGS_REGISTRY`, rendert je `scope`:
  - `feature`/`visibility` → `FeatureToggleCard`/`SwitchRow` automatisch, über einen gemeinsamen `useRegistrySetting(key)`-Hook (kapselt `apiGet('settings')`/`apiPost('settings', ...)` inkl. `storageKey`-Pfadauflösung).
  - `config` → rendert einen Slot (Render-Prop), da Detailkonfiguration (Zahlenfelder, Zeitfenster, E-Mail-Templates) zu heterogen für generische Erzeugung ist. `OrderSettingsPage.tsx`, `ReservationsTab.tsx` etc. bleiben **bewusst bespoke Komponenten**, docken sich aber an dieselbe Registry an für Header/Lizenz-Banner statt manuell gebauter Hinweise wie aktuell in `OrderSettingsPage.tsx:64-83`.
- **Graduelle Einführung, kein Big-Bang:** Zuerst `SettingsCategoryPage` nur für Dashboard-Widgets (reine `visibility`, kein Lizenzbezug, geringstes Risiko), danach für Module & Lizenz (ersetzt `PlanModulesTab.tsx`-Inline-Rendering 1:1), optional danach für Cookie-Kategorien. Bereiche mit starker Custom-Logik (Bestellungen, Reservierungen, SMTP, Image-AI) bleiben dauerhaft bespoke Seiten, die nur Registry-Metadaten für Header/Badges konsumieren.

---

## 2.5 Migrationsstrategie

**Grundprinzip Abwärtskompatibilität:** Jeder Schritt ist additiv oder ein lokal isolierter Fix; `storageKey`s ändern sich nie, wodurch alte und neue UI-Komponenten während der gesamten Migration parallel denselben `kv_store`-Zustand lesen/schreiben können. Rollback = `git revert` des jeweiligen Commits (keine DB-Schemaänderung involviert).

| Nr | Beschreibung | Betroffene Dateien | Risiko | Aufwand |
|---|---|---|---|---|
| 1 | Registry-Datei anlegen (rein additiv, wird von nichts referenziert) | `web/src/config/settings-registry.ts` (neu) | niedrig | M |
| 2 | Backend-Pendant der Registry + Fix `FEATURE_MAP`-Bug | `server/registry/settings-registry.js` (neu), `server/routes/settings.js` | mittel (Bug-Fix an produktivem Endpoint) | S |
| 3 | Toten Endpoint entfernen | `server/routes/settings.js` (nur `POST /license/modules`-Block löschen) | niedrig | S |
| 4 | `MODULE_LABELS`/`MODULE_GROUPS` als Re-Export der Registry umbauen (keine Konsumenten-Änderung) | `web/src/modules/settings/settings-api.ts` | niedrig | S |
| 5 | `FeatureToggleCard` extrahieren aus `PlanModulesTab.tsx` (1:1, kein Verhaltensunterschied) | `web/src/components/shared/FeatureToggleCard.tsx` (neu), `web/src/modules/settings/PlanModulesTab.tsx` | niedrig | S |
| 6 | `daily_specials`-Toggle + tote Felder (`dailySpecialsEnabled`, `activeModules`) entfernen | `web/src/config/settings-registry.ts`, `server/routes/settings.js:392-400` | niedrig | S |
| 7 | `settingsPath: '/analytics'` entfernen | `web/src/config/settings-registry.ts` | niedrig | S |
| 8 | `SettingsSection`/`SettingsCategoryPage` bauen, Pilot: Dashboard-Widgets | `web/src/components/shared/SettingsSection.tsx` (neu), `web/src/components/shared/SettingsCategoryPage.tsx` (neu), `web/src/modules/dashboard/VisibilityDialog.tsx` | mittel | L |
| 9 | Cloud-Backup-S3-Sektion entfernen | `web/src/modules/backup/BackupPage.tsx` | niedrig | S |
| 10 | Plugins-Seite bauen + registrieren | `web/src/modules/plugins/PluginsPage.tsx` (neu), `web/src/routes/admin-routes.tsx` | niedrig | M |
| 11 | Nav-Restrukturierung: „Rechtliches"-Gruppe, Cookies/Legal aus Designer lösen | `web/src/config/navigation.ts`, `web/src/routes/admin-routes.tsx`, `web/src/modules/designer/DesignerPage.tsx` (Tabs entfernen), neue `web/src/modules/legal/LegalCookiesPage.tsx` + `LegalTextsPage.tsx` | mittel | L |
| 12 | Lizenz+Modul-Seiten zusammenführen (2 Tabs statt 2 Nav-Einträge) | `web/src/config/navigation.ts`, `web/src/modules/settings/SettingsPage.tsx` | mittel | M |
| 13 | `order-emails`-Placeholder-Seite entfernen | `web/src/config/navigation.ts`, `web/src/modules/settings/SettingsPage.tsx`, `web/src/routes/admin-routes.tsx` | niedrig | S |
| 14 | `online_orders`-Kanonisierung in Registry + UI-Labels (Storage-Keys unverändert) | `web/src/config/settings-registry.ts`, `web/src/modules/order-settings/OrderSettingsPage.tsx` (Label/Hinweistexte) | niedrig | S |
| 15 | `vacation.enabled`-Label korrigieren (ehrliche Beschreibung statt Feature-Versprechen) | `web/src/modules/designer/DesignerPage.tsx` | niedrig | S |
| 16 | Cookie-Kategorien auf `FeatureToggleCard`/Registry-Metadaten umstellen (Server unverändert) | `web/src/modules/designer/CookiesTab.tsx` → `web/src/modules/legal/LegalCookiesPage.tsx` | mittel | M |

Legende Aufwand: S = < 0,5 Tag, M = 0,5–1,5 Tage, L = 2–3 Tage.

**Reihenfolge-Constraint:** Schritt 2 (Backend-Bugfix) muss **vor** Schritt 5 landen, da sonst das Modul-Center weiterhin 500-Fehler wirft, während an der UI gearbeitet wird. Schritte 6–16 sind untereinander unabhängig und beliebig neu sortierbar.

**Rollback pro Schritt:** Da jeder Schritt max. 3–5 Dateien betrifft und keine `storageKey`-Semantik ändert, ist ein `git revert <commit>` pro Schritt gefahrlos möglich, ohne dass andere Schritte brechen.

---

## Verifikation je Schritt

- `npm run build:web` (Vite-Build) muss grün sein
- Für Schritt 2: manuell ein Modul im „Module aktivieren"-Screen scharf schalten → darf keine 500 mehr werfen (aktuell reproduzierbar kaputt)
- Für Nav-Änderungen (11-13): jede Route in `admin-routes.tsx`/`navigation.ts` manuell anklicken, keine toten Links
- Für Registry-Änderungen: bestehende Werte in `server/database.sqlite` (kv_store) bleiben unverändert lesbar — Stichprobe via `node -e "console.log(require('./server/db').getKV('settings'))"`

---

## Nächste Schritte

Diese Datei + `docs/plans/admin-audit.md` sind die vollständige Grundlage für die Implementierung. **Keine Code-Änderung erfolgt, bis die 16 Migrationsschritte oben explizit freigegeben werden.**
