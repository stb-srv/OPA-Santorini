import * as React from 'react';
import { toast } from 'sonner';
import { apiPost } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_WIDGETS, WIDGET_META, type WidgetConfig } from './dashboard-data';
import { cn } from '@/lib/utils';

/** Widget-Sichtbarkeit (Port von customizeDashboard()). */
export function VisibilityDialog({
    open,
    onOpenChange,
    config,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    config: WidgetConfig[];
    onSaved: () => void;
}) {
    const knownIds = Object.keys(WIDGET_META);
    const initial = React.useMemo(() => {
        const map: Record<string, boolean> = {};
        for (const id of knownIds) {
            const entry = config.find((w) => w.id === id);
            map[id] = entry ? entry.active !== false : true;
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, open]);

    const [state, setState] = React.useState(initial);
    React.useEffect(() => setState(initial), [initial]);
    const [saving, setSaving] = React.useState(false);

    async function save() {
        setSaving(true);
        // Bestehende Config übernehmen, fehlende Widgets ergänzen, active setzen
        const merged: WidgetConfig[] = [...config];
        for (const id of knownIds) {
            const entry = merged.find((w) => w.id === id);
            if (entry) entry.active = state[id];
            else merged.push({ id, size: 'span-4', active: state[id] });
        }
        const res = await apiPost('settings', { dashboardConfig: merged });
        setSaving(false);
        if (res.success !== false) {
            toast.success('Sichtbarkeit gespeichert!');
            onOpenChange(false);
            onSaved();
        } else {
            toast.error(res.reason || 'Fehler beim Speichern');
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <i className="fas fa-eye opacity-60" /> Widget-Sichtbarkeit
                    </DialogTitle>
                </DialogHeader>
                <div className="divide-y divide-border">
                    {knownIds.map((id) => {
                        const meta = WIDGET_META[id];
                        const on = state[id];
                        return (
                            <div key={id} className="flex items-center justify-between py-2.5">
                                <span className="flex items-center gap-2.5 text-sm font-medium">
                                    <i className={cn('fas', meta.icon, 'w-5 opacity-55')} />
                                    {meta.label}
                                </span>
                                <Switch checked={on} onCheckedChange={(val) => setState((s) => ({ ...s, [id]: val }))} />
                            </div>
                        );
                    })}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Abbrechen
                    </Button>
                    <Button onClick={save} disabled={saving}>
                        {saving ? 'Speichern…' : 'Speichern'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Default-Config + gespeicherte zusammenführen (Port der Merge-Logik). */
export function mergeConfig(saved?: WidgetConfig[]): WidgetConfig[] {
    if (!saved || !saved.length) return DEFAULT_WIDGETS;
    const present = new Set(saved.map((w) => w.id));
    const missing = DEFAULT_WIDGETS.filter((w) => !present.has(w.id));
    return [...missing, ...saved];
}
