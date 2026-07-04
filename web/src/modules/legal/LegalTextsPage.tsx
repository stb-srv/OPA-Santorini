import * as React from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { useViewTitle } from '@/hooks/useViewTitle';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';

interface LegalData {
    impressum?: string;
    privacy?: string;
}
interface HomeData {
    legal?: LegalData;
    [k: string]: unknown;
}

/** Aus DesignerPage.tsx herausgeloest (Plan-Schritt #11) – eigene Seite unter "Rechtliches". */
export function LegalTextsPage() {
    useViewTitle('Impressum & Datenschutz');
    const qc = useQueryClient();
    const { data: home } = useQuery({
        queryKey: ['homepage'],
        queryFn: () => apiGet<HomeData>('homepage'),
    });
    const [legal, setLegal] = React.useState<LegalData>({});
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (home) setLegal(home.legal || {});
    }, [home]);

    async function save() {
        setSaving(true);
        // POST /api/homepage ersetzt den kompletten kv-Wert (kein serverseitiges
        // Deep-Merge) -- daher vollstaendiges homepage-Objekt zurueckschreiben,
        // sonst gingen andere Felder (Bilder, Seiten, Oeffnungszeiten...) verloren.
        const res = await apiPost('homepage', { ...(home || {}), legal });
        setSaving(false);
        if (res.success !== false) {
            toast.success('Änderungen gespeichert!');
            qc.invalidateQueries({ queryKey: ['homepage'] });
        } else toast.error(res.reason || 'Fehler');
    }

    return (
        <div className="space-y-5">
            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="space-y-1">
                        <Label>Impressum</Label>
                        <Textarea
                            className="h-48"
                            value={legal.impressum || ''}
                            onChange={(e) =>
                                setLegal((l) => ({ ...l, impressum: e.target.value }))
                            }
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>Datenschutzerklärung</Label>
                        <Textarea
                            className="h-48"
                            value={legal.privacy || ''}
                            onChange={(e) => setLegal((l) => ({ ...l, privacy: e.target.value }))}
                        />
                    </div>
                </CardContent>
            </Card>
            <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>
                    {saving ? 'Speichern…' : 'Änderungen speichern'}
                </Button>
            </div>
        </div>
    );
}
