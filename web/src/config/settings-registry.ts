/**
 * Zentrale Settings-Registry – Single Source of Truth für alle Admin-Feature-Toggles.
 * Siehe docs/plans/admin-audit.md (Bestandsaufnahme) und
 * docs/plans/admin-refactor-plan.md (Architektur) für den vollständigen Kontext.
 *
 * Wichtig: `storageKey` verweist auf exakt dieselben kv_store-Pfade, die auch
 * heute schon genutzt werden – es findet KEINE Datenmigration statt, nur eine
 * zentrale Lese/Schreib-Indirektion.
 */

export type SettingScope = 'feature' | 'visibility' | 'config';
// feature    = Art 2 (globaler Ein/Aus-Schalter)
// visibility = Art 3 (Sichtbarkeit, kein Lizenzbezug nötig)
// config     = Art 4 (Detailkonfiguration, meist innerhalb einer Unterseite)

export type SettingCategory =
    | 'module-license'
    | 'orders'
    | 'reservations'
    | 'design'
    | 'legal'
    | 'communication'
    | 'dashboard'
    | 'system';

export interface SettingRegistryEntry {
    key: string;
    label: string;
    description?: string;
    category: SettingCategory;
    scope: SettingScope;
    icon?: string;

    /** Art 1 – Lizenzbezug (read-only Anzeige, KEINE Schreiblogik hier!) */
    requiresLicense?: boolean;
    /** Schlüssel aus PLAN_MODULES (@meraki/plans) */
    licenseModule?: string;
    /** Bypass des licenseModule-Checks */
    alwaysAvailable?: boolean;

    /** Art 2 – Abhängigkeit zu einem anderen Registry-Key, der aktiv sein muss */
    dependsOn?: string;

    /** Persistenz-Pfad im kv_store (z.B. 'settings.enabledModules.orders_kitchen') */
    storageKey: string;
    defaultValue: boolean | string | number;

    /** Deep-Link zu einer Art-4-Detailseite */
    settingsPath?: string;
    /** Rein deklarativ – Feldnamen der zugehörigen Detailseite, für Doku/Suche */
    configurableFields?: string[];
}

export const SETTINGS_REGISTRY: SettingRegistryEntry[] = [
    // ---- Module & Lizenz ----
    {
        key: 'menu_edit',
        label: 'Speisekarte bearbeiten',
        description: 'Gerichte hinzufügen, bearbeiten & löschen',
        category: 'module-license',
        scope: 'feature',
        icon: 'utensils',
        alwaysAvailable: true,
        storageKey: 'settings.enabledModules.menu_edit',
        defaultValue: true,
        settingsPath: '/menu',
    },
    {
        key: 'online_orders',
        label: 'Online-Bestellungen',
        description: 'Kunden können online bestellen',
        category: 'module-license',
        scope: 'feature',
        icon: 'shopping-bag',
        requiresLicense: true,
        licenseModule: 'online_orders',
        storageKey: 'settings.enabledModules.orders_kitchen',
        defaultValue: true,
        settingsPath: '/order-settings',
    },
    {
        key: 'reservations',
        label: 'Online-Reservierung',
        description: 'Gäste können online reservieren',
        category: 'module-license',
        scope: 'feature',
        icon: 'calendar-check',
        requiresLicense: true,
        licenseModule: 'reservations',
        storageKey: 'settings.enabledModules.reservations',
        defaultValue: true,
        settingsPath: '/reservations',
    },
    {
        key: 'custom_design',
        label: 'Design anpassen',
        description: 'Farben, Logo & Homepage bearbeiten',
        category: 'module-license',
        scope: 'feature',
        icon: 'paint-brush',
        requiresLicense: true,
        licenseModule: 'custom_design',
        storageKey: 'settings.enabledModules.custom_design',
        defaultValue: true,
        settingsPath: '/designer',
    },
    {
        key: 'analytics',
        label: 'Statistiken',
        description: 'Umsatz- und Bestellstatistiken',
        category: 'module-license',
        scope: 'feature',
        icon: 'chart-bar',
        requiresLicense: true,
        licenseModule: 'analytics',
        storageKey: 'settings.enabledModules.analytics',
        defaultValue: true,
        // Kein settingsPath: '/analytics' existiert nicht als Route (siehe Audit-Fund #5).
    },
    {
        key: 'qr_pay',
        label: 'QR-Pay am Tisch',
        description: 'Bezahlung per QR-Code am Tisch (Premium)',
        category: 'module-license',
        scope: 'feature',
        icon: 'qrcode',
        requiresLicense: true,
        licenseModule: 'qr_pay',
        storageKey: 'settings.enabledModules.qr_pay',
        defaultValue: true,
    },
    {
        key: 'kitchen_display',
        label: 'Küchen-Display',
        description: 'Bestellungen in Echtzeit im Küchen-Monitor anzeigen',
        category: 'module-license',
        scope: 'feature',
        icon: 'fire-burner',
        requiresLicense: true,
        licenseModule: 'online_orders',
        storageKey: 'settings.enabledModules.kitchen_display',
        defaultValue: true,
        settingsPath: '/order-settings',
    },
    {
        key: 'table_planner',
        label: 'Tischplaner',
        description: 'Visueller Saalplan und Tischzuweisung',
        category: 'module-license',
        scope: 'feature',
        icon: 'project-diagram',
        requiresLicense: true,
        licenseModule: 'reservations',
        storageKey: 'settings.enabledModules.table_planner',
        defaultValue: true,
        settingsPath: '/tables',
    },
    {
        key: 'menu_translate',
        label: 'Menü-Übersetzung',
        description: 'Speisekarte automatisch übersetzen lassen',
        category: 'module-license',
        scope: 'feature',
        icon: 'language',
        requiresLicense: true,
        licenseModule: 'multilanguage',
        storageKey: 'settings.enabledModules.menu_translate',
        defaultValue: true,
    },
    {
        key: 'menu_import_export',
        label: 'Import / Export',
        description: 'Speisekarte als CSV/JSON importieren/exportieren',
        category: 'module-license',
        scope: 'feature',
        icon: 'file-export',
        alwaysAvailable: true,
        storageKey: 'settings.enabledModules.menu_import_export',
        defaultValue: true,
        settingsPath: '/menu',
    },
    {
        key: 'qrcodes',
        label: 'QR-Code Generator',
        description: 'QR-Codes für Tische und Speisekarte generieren',
        category: 'module-license',
        scope: 'feature',
        icon: 'qrcode',
        alwaysAvailable: true,
        storageKey: 'settings.enabledModules.qrcodes',
        defaultValue: true,
    },
    {
        key: 'shifts',
        label: 'Schichtplan',
        description: 'Mitarbeiter-Schichten planen',
        category: 'module-license',
        scope: 'feature',
        icon: 'calendar-week',
        alwaysAvailable: true,
        storageKey: 'settings.enabledModules.shifts',
        defaultValue: true,
    },
    {
        key: 'backup',
        label: 'Backup & Wiederherstellung',
        description: 'Datenbank sichern und wiederherstellen',
        category: 'module-license',
        scope: 'feature',
        icon: 'database',
        requiresLicense: true,
        licenseModule: 'backup',
        storageKey: 'settings.enabledModules.backup',
        defaultValue: true,
        settingsPath: '/backup',
    },
    {
        key: 'daily_specials',
        label: 'Tagesspecials',
        description: 'Goldene Heute-Badges und Special-Filter',
        category: 'module-license',
        scope: 'feature',
        icon: 'star',
        alwaysAvailable: true,
        storageKey: 'settings.enabledModules.daily_specials',
        defaultValue: true,
        settingsPath: '/menu/daily',
        // Hinweis: Wird von keiner Seite ausgewertet (totes Toggle, siehe Audit-Fund).
        // Entfernung erfolgt in einem eigenen Migrationsschritt, nicht hier.
    },

    // ---- Bestellungen (Art 4 – Detailkonfiguration, abhängig von 'online_orders') ----
    {
        key: 'order_dine_in',
        label: 'Am Tisch bestellen',
        description: 'Gast bestellt per Tischnummer',
        category: 'orders',
        scope: 'config',
        dependsOn: 'online_orders',
        storageKey: 'settings.orderConfig.dineInEnabled',
        defaultValue: true,
    },
    {
        key: 'order_pickup',
        label: 'Abholung',
        description: 'Gast bestellt vorab und holt selbst ab',
        category: 'orders',
        scope: 'config',
        dependsOn: 'online_orders',
        storageKey: 'settings.orderConfig.pickupEnabled',
        defaultValue: true,
    },
    {
        key: 'order_delivery',
        label: 'Lieferung',
        description: 'Lieferung an die angegebene Adresse',
        category: 'orders',
        scope: 'config',
        dependsOn: 'online_orders',
        storageKey: 'settings.orderConfig.deliveryEnabled',
        defaultValue: false,
    },
    {
        key: 'order_sofort',
        label: '„Sofort"-Option',
        description: 'Bestellung ohne fixen Zeitslot',
        category: 'orders',
        scope: 'config',
        dependsOn: 'online_orders',
        storageKey: 'settings.orderConfig.sofortEnabled',
        defaultValue: true,
    },

    // ---- Reservierungen & Tische (Art 4, abhängig von 'reservations') ----
    {
        key: 'reservation_inquiry',
        label: 'Warteliste / Anfrage erlauben',
        description: 'Gäste können eine Anfrage stellen, wenn keine freien Zeiten verfügbar sind',
        category: 'reservations',
        scope: 'config',
        dependsOn: 'reservations',
        storageKey: 'settings.reservationConfig.allowInquiry',
        defaultValue: true,
    },

    // ---- Design & Auftritt (Art 3, abhängig von 'custom_design') ----
    {
        key: 'design_promotion_bar',
        label: 'Promotion-Leiste',
        description: 'Promotion-Leiste auf der Startseite anzeigen',
        category: 'design',
        scope: 'visibility',
        dependsOn: 'custom_design',
        storageKey: 'homepage.promotionEnabled',
        defaultValue: true,
    },
    {
        key: 'design_vacation',
        label: 'Urlaubs-Sperre',
        description: 'Zeigt einen Hinweis auf der Website für den angegebenen Zeitraum an',
        category: 'design',
        scope: 'feature',
        dependsOn: 'custom_design',
        storageKey: 'homepage.vacation.enabled',
        defaultValue: false,
    },
    {
        key: 'design_holiday',
        label: 'Feiertags-Ankündigung',
        description: 'Banner auf der Website für Feiertage/Events',
        category: 'design',
        scope: 'visibility',
        dependsOn: 'custom_design',
        storageKey: 'homepage.holiday.enabled',
        defaultValue: false,
    },

    // ---- Rechtliches & Datenschutz ----
    {
        key: 'cookie_category_necessary',
        label: 'Technisch notwendig',
        description: 'Für den Betrieb der Website zwingend erforderlich',
        category: 'legal',
        scope: 'visibility',
        alwaysAvailable: true,
        storageKey: 'cookie_config.categories.necessary.enabled',
        defaultValue: true,
        // required=true wird weiterhin serverseitig erzwungen (server/routes/cookie.js) – unverändert.
    },
    {
        key: 'cookie_category_functional',
        label: 'Funktional',
        description: 'Erweiterte Funktionen wie gespeicherte Spracheinstellungen',
        category: 'legal',
        scope: 'visibility',
        alwaysAvailable: true,
        storageKey: 'cookie_config.categories.functional.enabled',
        defaultValue: true,
    },
    {
        key: 'cookie_category_analytics',
        label: 'Analyse',
        description: 'Hilft zu verstehen, wie Besucher mit der Website interagieren',
        category: 'legal',
        scope: 'visibility',
        alwaysAvailable: true,
        storageKey: 'cookie_config.categories.analytics.enabled',
        defaultValue: false,
    },
    {
        key: 'cookie_category_marketing',
        label: 'Marketing & Externe Medien',
        description: 'Externe Dienste wie Google Maps',
        category: 'legal',
        scope: 'visibility',
        alwaysAvailable: true,
        storageKey: 'cookie_config.categories.marketing.enabled',
        defaultValue: false,
    },

    // ---- Kommunikation ----
    {
        key: 'smtp_secure',
        label: 'SMTP: Sichere Verbindung (SSL/TLS)',
        description: 'Empfohlen für Port 465',
        category: 'communication',
        scope: 'config',
        storageKey: 'settings.smtp.secure',
        defaultValue: true,
    },
    {
        key: 'image_ai_default_provider',
        label: 'Standard-Bildquelle für Gerichte',
        description: 'Welcher Anbieter beim Bild-Hinzufügen standardmäßig genutzt wird',
        category: 'communication',
        scope: 'config',
        requiresLicense: true,
        licenseModule: 'image_ai',
        storageKey: 'settings.imageApiKeys.defaultProvider',
        defaultValue: 'none',
    },

    // ---- Dashboard ----
    {
        key: 'dashboard_widget_visibility',
        label: 'Dashboard-Widgets',
        description: 'Sichtbarkeit einzelner Dashboard-Widgets (17 Widgets, siehe WIDGET_META)',
        category: 'dashboard',
        scope: 'visibility',
        alwaysAvailable: true,
        storageKey: 'settings.dashboardConfig[].active',
        defaultValue: true,
        // Sonderfall Array-of-objects: die konkreten Widgets kommen weiterhin aus
        // WIDGET_META (web/src/modules/dashboard/dashboard-data.ts), dieser Eintrag
        // dient nur als Registry-Metadaten-Platzhalter für die Kategorie-Seite.
    },

    // ---- System ----
    {
        key: 'opening_hours_closed',
        label: 'Öffnungszeiten',
        description: 'Wochentag als geschlossen markieren',
        category: 'system',
        scope: 'config',
        alwaysAvailable: true,
        storageKey: 'homepage.openingHours[day].closed',
        defaultValue: false,
    },
    {
        key: 'plugin_enabled',
        label: 'Plugin aktiv',
        description: 'Installierte Plugins aktivieren/deaktivieren',
        category: 'system',
        scope: 'feature',
        alwaysAvailable: true,
        storageKey: 'plugins[].enabled',
        defaultValue: false,
    },
];

/** Hilfsfunktion: Registry-Eintrag anhand des kanonischen Keys finden. */
export function getRegistryEntry(key: string): SettingRegistryEntry | undefined {
    return SETTINGS_REGISTRY.find((e) => e.key === key);
}

/** Hilfsfunktion: alle Einträge einer Kategorie. */
export function getRegistryByCategory(category: SettingCategory): SettingRegistryEntry[] {
    return SETTINGS_REGISTRY.filter((e) => e.category === category);
}
