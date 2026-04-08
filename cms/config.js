/**
 * Grieche-CMS Module Configuration
 * This file controls which features are active in the system.
 * In a production environment, this would be populated by the License Server.
 */
export const CONFIG = {
    restaurantName: "Restaurant Athos",
    domain: "restaurant-athos.de",
    version: "1.0.1",
    
    // Feature Toggles (Modules)
    modules: {
        orderSystem: true,         // Warenkorb & Bestellung
        pickupService: true,       // Abholung vor Ort
        deliveryService: false,    // Lieferservice (Radius-basiert)
        qrPayAtTable: true,        // QR-Code Zahlung am Tisch (Premium)
        reservations: true,        // Tisch-Reservierung
        crmSystem: true,           // Kunden-Datenbank
        licenseLock: true          // Automatischer Stopp bei Lizenz-Ablauf
    },

    // UI Preferences
    theme: {
        primaryColor: "#0056b3",
        mode: "light",             // 'light' or 'dark'
        language: "de"             // 'de', 'el', 'en'
    },

    // License Context
    license: {
        key: "GREEK-XXXX-XXXX-2026",
        status: "active",
        expiresAt: "2026-12-31"
    }
};

/**
 * Helper function to check if a specific module is active.
 */
export function isModuleActive(moduleName) {
    return !!CONFIG.modules[moduleName];
}
