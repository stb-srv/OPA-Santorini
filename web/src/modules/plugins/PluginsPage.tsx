import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { useViewTitle } from '@/hooks/useViewTitle';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { PuzzleIcon } from 'lucide-react';

interface PluginInfo {
    id: string;
    name: string;
    description?: string;
    version?: string;
    author?: string;
    icon?: string;
    enabled: boolean;
}

const PLUGINS_KEY = ['plugins'] as const;

export function PluginsPage() {
    useViewTitle('Erweiterungen');
    const qc = useQueryClient();
    const { data: plugins, isLoading } = useQuery({
        queryKey: PLUGINS_KEY,
        queryFn: () => apiGet<PluginInfo[]>('plugins'),
    });

    async function toggle(id: string, enabled: boolean) {
        const res = await apiPost('plugins/toggle', { id, enabled });
        if (res.success !== false) {
            qc.invalidateQueries({ queryKey: PLUGINS_KEY });
            toast.success(enabled ? 'Plugin aktiviert.' : 'Plugin deaktiviert.');
        } else {
            toast.error(res.reason || 'Fehler beim Speichern.');
        }
    }

    if (isLoading) {
        return <Card className="h-40 animate-pulse bg-muted/50" />;
    }

    const list = plugins || [];

    return (
        <div className="space-y-4">
            <div>
                <h3 className="font-semibold">Erweiterungen</h3>
                <p className="text-sm text-muted-foreground">
                    Installierte Plugins aktivieren oder deaktivieren.
                </p>
            </div>

            {list.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                        <PuzzleIcon className="size-10 opacity-40" />
                        <p>Keine Plugins installiert.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
                    {list.map((p) => (
                        <Card key={p.id} className="flex items-center gap-4 p-4">
                            <div
                                className={
                                    'flex size-10 shrink-0 items-center justify-center rounded-lg ' +
                                    (p.enabled
                                        ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]'
                                        : 'bg-muted text-muted-foreground')
                                }
                            >
                                <i className={`fas fa-${p.icon || 'puzzle-piece'}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold">{p.name}</span>
                                    {p.version && (
                                        <span className="text-xs text-muted-foreground">
                                            v{p.version}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {p.description}
                                    {p.author && ` · ${p.author}`}
                                </div>
                            </div>
                            <Switch
                                checked={p.enabled}
                                onCheckedChange={(c) => toggle(p.id, c)}
                            />
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
