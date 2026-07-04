import type * as React from 'react';

interface SettingsSectionProps {
    title?: string;
    description?: string;
    children: React.ReactNode;
}

/**
 * Einheitlicher Gruppierungs-Container fuer Listen von Einstellungen
 * (z.B. Switch-Zeilen oder FeatureToggleCards). Ersetzt handgestrickte
 * divide-y/space-y-Wrapper, die bisher pro Seite eigenstaendig gebaut wurden.
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
    return (
        <div className="space-y-3">
            {(title || description) && (
                <div>
                    {title && <h4 className="text-sm font-semibold">{title}</h4>}
                    {description && (
                        <p className="text-xs text-muted-foreground">{description}</p>
                    )}
                </div>
            )}
            <div className="divide-y divide-border">{children}</div>
        </div>
    );
}
