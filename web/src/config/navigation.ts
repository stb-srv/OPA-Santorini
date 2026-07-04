/**
 * Navigations-Konfiguration – Single Source of Truth für Sidebar + Routing.
 * Port von cms/modules/navigation-config.js, typisiert und um `path`
 * (react-router) sowie `module` (requireLicense) ergänzt.
 *
 * `module` referenziert die Lizenz-Modulnamen aus CLAUDE.md:
 *   menu_edit, orders_kitchen, reservations, custom_design, analytics,
 *   qr_pay, online_orders, backup, image_ai
 */

/** Gültige Lizenz-Modulnamen (gesperrt, wenn Plan das Modul nicht enthält). */
export type LicenseModule =
    | 'menu_edit'
    | 'orders_kitchen'
    | 'reservations'
    | 'custom_design'
    | 'analytics'
    | 'qr_pay'
    | 'online_orders'
    | 'backup'
    | 'image_ai';

export interface NavItem {
    id: string;
    label: string;
    icon: string; // Font-Awesome-Klasse, z. B. "fa-th-large"
    path: string; // react-router-Pfad (relativ zu /admin)
    description?: string;
    /** Sperrt das Item, wenn der aktuelle Plan dieses Modul nicht enthält. */
    module?: LicenseModule;
    /** Öffnet eine externe Seite (z. B. Küchen-Display) statt SPA-Route. */
    external?: string;
}

export interface NavSection {
    label: string;
    items: NavItem[];
}

export interface NavGroup {
    id: string;
    label: string;
    icon: string;
    items?: NavItem[];
    sections?: NavSection[];
}

export const NAV_CONFIG: NavGroup[] = [
    {
        id: 'overview',
        label: 'Dashboard',
        icon: 'fa-th-large',
        items: [
            {
                id: 'dashboard',
                label: 'Dashboard',
                icon: 'fa-th-large',
                path: '/dashboard',
                description: 'Statistiken, Umsätze und Tagesüberblick',
            },
        ],
    },
    {
        id: 'menu-group',
        label: 'Speisekarte',
        icon: 'fa-utensils',
        items: [
            {
                id: 'dishes',
                label: 'Gerichte',
                icon: 'fa-hamburger',
                path: '/menu/dishes',
                module: 'menu_edit',
                description: 'Gerichte anlegen, bearbeiten und löschen',
            },
            {
                id: 'categories',
                label: 'Kategorien',
                icon: 'fa-tags',
                path: '/menu/categories',
                module: 'menu_edit',
                description: 'Menü-Kategorien verwalten',
            },
            {
                id: 'daily',
                label: 'Tagesgerichte',
                icon: 'fa-star',
                path: '/menu/daily',
                module: 'menu_edit',
                description: 'Tagesgerichte und Specials verwalten',
            },
            {
                id: 'allergens',
                label: 'Allergene',
                icon: 'fa-exclamation-triangle',
                path: '/menu/allergens',
                module: 'menu_edit',
                description: 'Allergene und Unverträglichkeiten pflegen',
            },
            {
                id: 'additives',
                label: 'Zusatzstoffe',
                icon: 'fa-flask',
                path: '/menu/additives',
                module: 'menu_edit',
                description: 'Zusatzstoffe gemäß LMIV verwalten',
            },
        ],
    },
    {
        id: 'reservations-group',
        label: 'Reservierungen & Tische',
        icon: 'fa-calendar-alt',
        items: [
            {
                id: 'reservations',
                label: 'Reservierungen',
                icon: 'fa-calendar-check',
                path: '/reservations',
                module: 'reservations',
                description: 'Reservierungen verwalten und annehmen',
            },
            {
                id: 'table-planner',
                label: 'Tischplaner',
                icon: 'fa-project-diagram',
                path: '/table-planner',
                module: 'reservations',
                description: 'Saalplan und visuelle Tischzuweisung',
            },
            {
                id: 'tables',
                label: 'Tische einrichten',
                icon: 'fa-chair',
                path: '/tables',
                module: 'reservations',
                description: 'Tische und Gastbereiche konfigurieren',
            },
            {
                id: 'res-settings',
                label: 'Reservierungs-Einstellungen',
                icon: 'fa-sliders-h',
                path: '/settings/reservations',
                module: 'reservations',
                description: 'Aufenthaltsdauer, Puffer, Warteliste und Bestätigung',
            },
            {
                id: 'archive',
                label: 'Archiv',
                icon: 'fa-archive',
                path: '/reservations/archive',
                module: 'reservations',
                description: 'Vergangene Reservierungen einsehen',
            },
        ],
    },
    {
        id: 'orders-group',
        label: 'Online-Bestellungen',
        icon: 'fa-shopping-bag',
        items: [
            {
                id: 'orders',
                label: 'Live-Monitor',
                icon: 'fa-bell',
                path: '/orders',
                module: 'online_orders',
                description: 'Eingehende Bestellungen in Echtzeit',
            },
            {
                id: 'kassenbuch',
                label: 'Kassenbuch & Tagesabschluss',
                icon: 'fa-cash-register',
                path: '/kassenbuch',
                module: 'online_orders',
                description: 'Tages- und Monatsumsätze, Z-Bon / Tagesabschluss',
            },
            {
                id: 'order-settings',
                label: 'Bestellungen einrichten',
                icon: 'fa-sliders-h',
                path: '/order-settings',
                module: 'online_orders',
                description: 'Bestelloptionen, Lieferung, Abholung und Zahlungsarten',
            },
        ],
    },
    {
        id: 'restaurant-group',
        label: 'Mein Restaurant',
        icon: 'fa-store',
        items: [
            {
                id: 'branding',
                label: 'Profil & Branding',
                icon: 'fa-palette',
                path: '/settings/branding',
                module: 'custom_design',
                description: 'Restaurantname, Logo, Farben und Favicon',
            },
            {
                id: 'opening',
                label: 'Öffnungszeiten',
                icon: 'fa-clock',
                path: '/opening',
                description: 'Öffnungszeiten für alle Wochentage einrichten',
            },
            {
                id: 'home-editor',
                label: 'Website & Inhalte',
                icon: 'fa-layer-group',
                path: '/designer',
                module: 'custom_design',
                description: 'Startseite, Texte, Bilder und Gäste-Website bearbeiten',
            },
            {
                id: 'location',
                label: 'Standort & Karte',
                icon: 'fa-map-marker-alt',
                path: '/designer/location',
                module: 'custom_design',
                description: 'Adresse, Google Maps und Anfahrt hinterlegen',
            },
            {
                id: 'vacation',
                label: 'Urlaub & Schließzeiten',
                icon: 'fa-umbrella-beach',
                path: '/designer/vacation',
                module: 'custom_design',
                description: 'Betriebsurlaub und temporäre Schließzeiten',
            },
            {
                id: 'holiday',
                label: 'Feiertage & Events',
                icon: 'fa-calendar-star',
                path: '/designer/holiday',
                module: 'custom_design',
                description: 'Feiertage, Sonderöffnungszeiten und Events ankündigen',
            },
            {
                id: 'feedback',
                label: 'Gäste-Bewertungen',
                icon: 'fa-star',
                path: '/feedback',
                description: 'Gäste-Bewertungen ansehen und moderieren',
            },
        ],
    },
    {
        id: 'legal-group',
        label: 'Rechtliches',
        icon: 'fa-scale-balanced',
        items: [
            {
                id: 'legal-cookies',
                label: 'Cookies',
                icon: 'fa-cookie-bite',
                path: '/legal/cookies',
                module: 'custom_design',
                description: 'Cookie-Kategorien und Einwilligungs-Nachweis verwalten',
            },
            {
                id: 'legal-texts',
                label: 'Impressum & Datenschutz',
                icon: 'fa-file-contract',
                path: '/legal/texts',
                module: 'custom_design',
                description: 'Impressum und Datenschutzerklärung bearbeiten',
            },
        ],
    },
    {
        id: 'settings-group',
        label: 'Verwaltung',
        icon: 'fa-cog',
        sections: [
            {
                label: 'Team',
                items: [
                    {
                        id: 'users',
                        label: 'Mitarbeiter & Zugänge',
                        icon: 'fa-users-cog',
                        path: '/settings/users',
                        description: 'Benutzerkonten, Rollen und Passwörter verwalten',
                    },
                    {
                        id: 'shifts',
                        label: 'Schichtplan',
                        icon: 'fa-calendar-week',
                        path: '/shifts',
                        description: 'Mitarbeiter-Schichten und Dienstplan planen',
                    },
                ],
            },
            {
                label: 'System',
                items: [
                    {
                        id: 'smtp',
                        label: 'E-Mail & SMTP',
                        icon: 'fa-envelope',
                        path: '/settings/smtp',
                        description: 'E-Mail-Server und Versandeinstellungen',
                    },
                    {
                        id: 'order-emails',
                        label: 'Bestell-E-Mail Vorlagen',
                        icon: 'fa-file-alt',
                        path: '/settings/order-emails',
                        description: 'E-Mail-Vorlagen für Bestellbestätigungen anpassen',
                    },
                    {
                        id: 'image-ai',
                        label: 'KI-Bildgenerierung',
                        icon: 'fa-robot',
                        path: '/settings/image-ai',
                        module: 'image_ai',
                        description: 'API-Keys für KI-Bilder: Unsplash, Pexels, Gemini',
                    },
                    {
                        id: 'license',
                        label: 'Module & Lizenz',
                        icon: 'fa-key',
                        path: '/settings/license',
                        description: 'Lizenz, Plan-Informationen und Modul-Verwaltung',
                    },
                    {
                        id: 'audit-log',
                        label: 'Änderungsprotokoll',
                        icon: 'fa-clipboard-list',
                        path: '/audit-log',
                        description: 'Wer hat wann was geändert – Audit-Log',
                    },
                ],
            },
            {
                label: 'Werkzeuge',
                items: [
                    {
                        id: 'qrcodes',
                        label: 'QR-Codes',
                        icon: 'fa-qrcode',
                        path: '/qrcodes',
                        module: 'qr_pay',
                        description: 'QR-Codes für Tische und Speisekarte erstellen',
                    },
                    {
                        id: 'backup',
                        label: 'Backup & Wiederherstellung',
                        icon: 'fa-database',
                        path: '/backup',
                        module: 'backup',
                        description: 'Datenbank sichern, herunterladen und wiederherstellen',
                    },
                    {
                        id: 'plugins',
                        label: 'Erweiterungen',
                        icon: 'fa-puzzle-piece',
                        path: '/plugins',
                        description: 'Plugins und Erweiterungen installieren und verwalten',
                    },
                    {
                        id: 'kitchen',
                        label: 'Küchen-Display',
                        icon: 'fa-fire-burner',
                        path: '/kitchen',
                        module: 'orders_kitchen',
                        description: 'Küchen-Monitor in neuem Fenster öffnen',
                        external: '/admin#/kitchen',
                    },
                ],
            },
        ],
    },
];

/** Flache Liste aller Items (für Routing & Command-Palette). */
export function flattenNav(): NavItem[] {
    const out: NavItem[] = [];
    for (const group of NAV_CONFIG) {
        if (group.items) out.push(...group.items);
        if (group.sections) for (const s of group.sections) out.push(...s.items);
    }
    return out;
}
