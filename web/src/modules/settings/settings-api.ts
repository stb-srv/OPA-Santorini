import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { LicenseInfo } from '@/hooks/useLicense';
import { SETTINGS_REGISTRY } from '@/config/settings-registry';

export interface SmtpConfig {
    host?: string;
    port?: number;
    user?: string;
    from?: string;
    secure?: boolean;
    pass?: string;
}
export interface ReservationConfig {
    durationSmall: number;
    durationMedium: number;
    durationLarge: number;
    buffer: number;
    allowInquiry: boolean;
}
export interface ImageApiKeys {
    unsplashKey?: string;
    pexelsKey?: string;
    googleAiKey?: string;
    puterToken?: string;
    defaultProvider?: string;
}
export interface EmailTemplate {
    subject?: string;
    body?: string;
}
export interface SettingsData {
    license?: LicenseInfo;
    smtp?: SmtpConfig;
    reservationConfig?: ReservationConfig;
    imageApiKeys?: ImageApiKeys;
    emailTemplates?: Record<string, EmailTemplate>;
    enabledModules?: Record<string, boolean>;
    [key: string]: unknown;
}
export interface BrandingData {
    name?: string;
    slogan?: string;
    phone?: string;
    logo?: string;
    favicon?: string;
    primaryColor?: string;
    accentColor?: string;
    [key: string]: unknown;
}
export interface User {
    user: string;
    name?: string;
    last_name?: string;
    email?: string;
    role: string;
}

export const SETTINGS_KEY = ['settings'] as const;
export const BRANDING_KEY = ['branding'] as const;
export const USERS_KEY = ['users'] as const;
export const LICENSE_INFO_KEY = ['license-info'] as const;

export const useSettings = () =>
    useQuery({ queryKey: SETTINGS_KEY, queryFn: () => apiGet<SettingsData>('settings') });
export const useBranding = () =>
    useQuery({ queryKey: BRANDING_KEY, queryFn: () => apiGet<BrandingData>('branding') });
export const useUsers = () =>
    useQuery({ queryKey: USERS_KEY, queryFn: () => apiGet<User[]>('users') });
export const useLicenseInfo = () =>
    useQuery({ queryKey: LICENSE_INFO_KEY, queryFn: () => apiGet<LicenseInfo>('license/info') });

export interface MailType {
    key: string;
    label: string;
    default_subject: string;
    placeholders: string[];
}

export const MAIL_TYPES: MailType[] = [
    {
        key: 'tpl_confirmation',
        label: 'Reservierungsbestätigung (Eingang)',
        default_subject: 'Reservierungsbestätigung – {{date}}',
        placeholders: ['name', 'date', 'start_time', 'guests', 'restaurantName'],
    },
    {
        key: 'tpl_confirmed',
        label: 'Reservierung bestätigt',
        default_subject: 'BESTÄTIGT: Ihr Tisch am {{date}}',
        placeholders: ['name', 'date', 'start_time', 'restaurantName'],
    },
    {
        key: 'tpl_cancelled',
        label: 'Reservierung storniert',
        default_subject: 'ABSAGE: Ihre Reservierung am {{date}}',
        placeholders: ['name', 'date', 'start_time', 'restaurantName'],
    },
    {
        key: 'tpl_inquiry',
        label: 'Warteliste / Anfrage',
        default_subject: 'Warteliste – Anfrage für {{date}}',
        placeholders: ['name', 'date', 'start_time', 'guests', 'restaurantName'],
    },
    {
        key: 'tpl_credentials',
        label: 'Zugangsdaten (neuer Nutzer)',
        default_subject: 'Ihre Zugangsdaten für das CMS',
        placeholders: ['name', 'username', 'password', 'restaurantName'],
    },
];

export interface ModuleMeta {
    label: string;
    icon: string;
    desc: string;
    group: string;
    /** Which JWT allowed_modules key gates this feature (defaults to the record key) */
    licenseKey?: string;
    /** No license gate — always admin-toggleable regardless of plan */
    alwaysAvailable?: boolean;
    /** Hash path to the module's settings page (e.g. '/order-settings') */
    settingsPath?: string;
}

// Historische Gruppen-Zuordnung fuer das Modul-Center-Grid. Unabhaengig von der
// groben SettingCategory('module-license') der Registry, damit die bestehende
// PlanModulesTab-Gruppierung (Speisekarte/Bestellungen/... statt nur "Module")
// unveraendert bleibt.
const MODULE_CENTER_GROUP: Record<string, string> = {
    menu_edit: 'Speisekarte',
    online_orders: 'Bestellungen',
    reservations: 'Reservierungen',
    custom_design: 'Auftritt',
    analytics: 'Dashboard',
    qr_pay: 'Bestellungen',
    kitchen_display: 'Bestellungen',
    table_planner: 'Reservierungen',
    daily_specials: 'Speisekarte',
    menu_translate: 'Speisekarte',
    menu_import_export: 'Speisekarte',
    qrcodes: 'Tools',
    shifts: 'Tools',
    backup: 'Tools',
};

// 'settings.enabledModules.orders_kitchen' -> 'orders_kitchen'. Der historische
// Feldname im kv_store (nicht der neue kanonische Registry-Key) bleibt der
// Record-Key, damit bestehende gespeicherte enabledModules-Werte unveraendert
// gelesen/geschrieben werden (keine Datenmigration noetig).
function storageFieldName(storageKey: string): string {
    return storageKey.split('.').pop() as string;
}

export const MODULE_LABELS: Record<string, ModuleMeta> = Object.fromEntries(
    SETTINGS_REGISTRY.filter((e) => e.category === 'module-license').map((e) => [
        storageFieldName(e.storageKey),
        {
            label: e.label,
            icon: e.icon || 'toggle-on',
            desc: e.description || '',
            group: MODULE_CENTER_GROUP[e.key] || 'Tools',
            licenseKey: e.licenseModule,
            alwaysAvailable: e.alwaysAvailable,
            settingsPath: e.settingsPath,
        },
    ])
);

export const MODULE_GROUPS = [
    { name: 'Speisekarte', icon: 'utensils' },
    { name: 'Bestellungen', icon: 'shopping-bag' },
    { name: 'Reservierungen', icon: 'calendar-alt' },
    { name: 'Auftritt', icon: 'paint-brush' },
    { name: 'Dashboard', icon: 'chart-pie' },
    { name: 'Tools', icon: 'wrench' },
];

export function isValidImageSrc(val?: string): boolean {
    if (!val || typeof val !== 'string') return false;
    return val.startsWith('data:image') || val.startsWith('http') || val.startsWith('/');
}
