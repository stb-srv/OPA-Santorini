import * as React from 'react';
import { useViewTitle } from '@/hooks/useViewTitle';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LicenseInfo } from '@/hooks/useLicense';
import {
    useBranding,
    useLicenseInfo,
    useSettings,
    useUsers,
    type SettingsData,
} from './settings-api';
import { BrandingTab } from './BrandingTab';
import { UsersTab } from './UsersTab';
import { SmtpTab } from './SmtpTab';
import { LicenseTab } from './LicenseTab';
import { PlanModulesTab } from './PlanModulesTab';
import { ReservationsTab } from './ReservationsTab';
import { ImageAiTab } from './ImageAiTab';

type Tab = 'branding' | 'users' | 'smtp' | 'license' | 'reservations' | 'image-ai';

const TITLES: Record<Tab, string> = {
    branding: 'Profil & Branding',
    users: 'Mitarbeiter & Zugänge',
    smtp: 'E-Mail & SMTP',
    license: 'Module & Lizenz',
    reservations: 'Reservierungs-Einstellungen',
    'image-ai': 'KI-Bildgenerierung',
};

type LicenseSubTab = 'overview' | 'modules';

/**
 * Fuehrt die vormals getrennten Nav-Eintraege "Lizenz & Module" und
 * "Module aktivieren" zu einer Seite mit 2 internen Tabs zusammen
 * (Plan-Schritt #12). LicenseTab/PlanModulesTab bleiben unveraendert,
 * nur die Nav-Struktur/Container aendert sich.
 */
function LicenseAndModulesPage({
    settings,
    licInfo,
}: {
    settings: SettingsData;
    licInfo: LicenseInfo;
}) {
    const [subTab, setSubTab] = React.useState<LicenseSubTab>('overview');
    const subTabs: { id: LicenseSubTab; label: string }[] = [
        { id: 'overview', label: 'Übersicht & Lizenz' },
        { id: 'modules', label: 'Module verwalten' },
    ];
    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5 border-b pb-3">
                {subTabs.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setSubTab(t.id)}
                        className={cn(
                            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            subTab === t.id
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-accent'
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            {subTab === 'overview' ? (
                <LicenseTab settings={settings} licInfo={licInfo} />
            ) : (
                <PlanModulesTab settings={settings} licInfo={licInfo} />
            )}
        </div>
    );
}

function Skeleton() {
    return (
        <div className="space-y-4">
            <Card className="h-24 animate-pulse bg-muted/50" />
            <Card className="h-72 animate-pulse bg-muted/50" />
        </div>
    );
}

function SettingsPage({ tab }: { tab: Tab }) {
    useViewTitle(TITLES[tab]);

    const settingsQ = useSettings();
    const brandingQ = useBranding();
    const usersQ = useUsers();
    const licInfoQ = useLicenseInfo();

    switch (tab) {
        case 'branding':
            return brandingQ.data ? <BrandingTab branding={brandingQ.data} /> : <Skeleton />;
        case 'users':
            return usersQ.data ? <UsersTab users={usersQ.data} /> : <Skeleton />;
        case 'smtp':
            return settingsQ.data ? <SmtpTab settings={settingsQ.data} /> : <Skeleton />;
        case 'reservations':
            return settingsQ.data ? <ReservationsTab settings={settingsQ.data} /> : <Skeleton />;
        case 'image-ai':
            return settingsQ.data ? <ImageAiTab settings={settingsQ.data} /> : <Skeleton />;
        case 'license':
            return settingsQ.data && licInfoQ.data ? (
                <LicenseAndModulesPage settings={settingsQ.data} licInfo={licInfoQ.data} />
            ) : (
                <Skeleton />
            );
        default:
            return <Skeleton />;
    }
}

export const SettingsBrandingPage = () => <SettingsPage tab="branding" />;
export const SettingsUsersPage = () => <SettingsPage tab="users" />;
export const SettingsSmtpPage = () => <SettingsPage tab="smtp" />;
export const SettingsLicensePage = () => <SettingsPage tab="license" />;
export const SettingsReservationsPage = () => <SettingsPage tab="reservations" />;
export const SettingsImageAiPage = () => <SettingsPage tab="image-ai" />;
