import { Lock, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface FeatureToggleCardProps {
    icon: string;
    label: string;
    description?: string;
    checked: boolean;
    licensed: boolean;
    settingsPath?: string;
    onChange: (checked: boolean) => void;
}

/**
 * Art 1+2 Kontrolle: Lizenz-gated Feature-Schalter in Card-Form.
 * Extrahiert 1:1 aus PlanModulesTab.tsx (Modul-Center-Grid).
 */
export function FeatureToggleCard({
    icon,
    label,
    description,
    checked,
    licensed,
    settingsPath,
    onChange,
}: FeatureToggleCardProps) {
    return (
        <Card
            className={cn('relative flex items-center gap-4 p-4', !licensed && 'opacity-60')}
            title={!licensed ? 'Nicht in Ihrem Plan enthalten – Upgrade erforderlich' : undefined}
        >
            {!licensed && (
                <Lock className="absolute right-2 top-2 size-3.5 text-muted-foreground" />
            )}
            <div
                className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg',
                    checked
                        ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]'
                        : 'bg-muted text-muted-foreground'
                )}
            >
                <i className={`fas fa-${icon}`} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold">{label}</span>
                    {licensed && settingsPath && (
                        <Link
                            to={settingsPath}
                            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                            title="Zu den Einstellungen"
                        >
                            <ExternalLink className="size-3" />
                        </Link>
                    )}
                </div>
                <div className="text-xs text-muted-foreground">{description}</div>
            </div>
            <Switch checked={checked} disabled={!licensed} onCheckedChange={onChange} />
        </Card>
    );
}
