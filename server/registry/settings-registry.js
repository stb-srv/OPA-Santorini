/**
 * Server-seitiges Pendant der Frontend-Registry (web/src/config/settings-registry.ts).
 * Bildet featureId (enabledModules-Feldname) -> Lizenz-Modul-Key ab.
 *
 * Ersetzt den vormaligen `const { FEATURE_MAP } = require('@meraki/plans')`-Import:
 * @meraki/plans exportiert kein FEATURE_MAP (nur PLAN_DEFINITIONS, PLAN_MODULES),
 * wodurch jeder Versuch ein Modul zu aktivieren mit TypeError/500 fehlschlug.
 *
 * null = alwaysAvailable (kein Lizenz-Gate, analog zu MODULE_LABELS.alwaysAvailable
 * im Frontend). Muss bei Änderungen an web/src/config/settings-registry.ts
 * (Kategorie 'module-license') manuell synchron gehalten werden.
 */
const FEATURE_LICENSE_MAP = {
    menu_edit: null,
    orders_kitchen: 'online_orders',
    reservations: 'reservations',
    custom_design: 'custom_design',
    analytics: 'analytics',
    qr_pay: 'qr_pay',
    kitchen_display: 'online_orders',
    table_planner: 'reservations',
    daily_specials: null,
    menu_translate: 'multilanguage',
    menu_import_export: null,
    qrcodes: null,
    shifts: null,
    backup: 'backup',
};

function getLicenseKeyForFeature(featureId) {
    return FEATURE_LICENSE_MAP[featureId] ?? undefined;
}

module.exports = { FEATURE_LICENSE_MAP, getLicenseKeyForFeature };
