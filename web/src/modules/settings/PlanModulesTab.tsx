import * as React from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { FeatureToggleCard } from '@/components/shared/FeatureToggleCard';
import {
    MODULE_GROUPS,
    MODULE_LABELS,
    SETTINGS_KEY,
    type SettingsData,
} from './settings-api';
import type { LicenseInfo } from '@/hooks/useLicense';

export function PlanModulesTab({
    settings,
    licInfo,
}: {
    settings: SettingsData;
    licInfo: LicenseInfo;
}) {
    const qc = useQueryClient();
    const l = settings.license || {};
    const activeModules =
        licInfo.modules && Object.keys(licInfo.modules).length > 0
            ? licInfo.modules
            : (l.modules as Record<string, boolean>) || {};

    const [enabled, setEnabled] = React.useState<Record<string, boolean>>(
        settings.enabledModules || {}
    );

    async function toggle(key: string, val: boolean) {
        const next = { ...enabled, [key]: val };
        setEnabled(next);
        const res = await apiPost('settings/modules', { enabledModules: next });
        if (res.success !== false) {
            qc.invalidateQueries({ queryKey: SETTINGS_KEY });
            qc.invalidateQueries({ queryKey: ['license-info'] });
        } else {
            setEnabled(enabled);
            toast.error(res.reason || 'Fehler beim Speichern.');
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h4 className="font-semibold">Plan-Module verwalten</h4>
                <p className="text-sm text-muted-foreground">
                    Zentrale Verwaltung aller CMS-Module. Aktivieren oder deaktivieren Sie
                    verfügbare Features Ihres Plans. Gesperrte Module erfordern einen
                    höheren Plan.
                </p>
            </div>

            {MODULE_GROUPS.map((group) => {
                const keys = Object.keys(MODULE_LABELS).filter(
                    (k) => MODULE_LABELS[k].group === group.name
                );
                if (!keys.length) return null;
                return (
                    <div key={group.name}>
                        <h5 className="mb-3 border-b pb-1.5 text-sm font-semibold">
                            <i className={`fas fa-${group.icon} mr-1.5 text-muted-foreground`} />
                            {group.name}
                        </h5>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
                            {keys.map((key) => {
                                const m = MODULE_LABELS[key];
                                const licKey = m.licenseKey ?? key;
                                const licensed = m.alwaysAvailable || activeModules[licKey] === true;
                                const on = licensed && enabled[key] !== false;
                                return (
                                    <FeatureToggleCard
                                        key={key}
                                        icon={m.icon}
                                        label={m.label}
                                        description={m.desc}
                                        checked={on}
                                        licensed={licensed}
                                        settingsPath={m.settingsPath}
                                        onChange={(c) => toggle(key, c)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
