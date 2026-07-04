import * as React from 'react';
import { toast } from 'sonner';
import { ArrowUp, Lock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { useViewTitle } from '@/hooks/useViewTitle';
import { useLicense } from '@/hooks/useLicense';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { EmailTemplate, SettingsData } from '@/modules/settings/settings-api';

interface OrderConfig {
    ordersEnabled?: boolean;
    dineInEnabled?: boolean;
    pickupEnabled?: boolean;
    deliveryEnabled?: boolean;
    orderCutoffMinutes?: number;
    pickupLeadMinutes?: number;
    timeSlotMode?: 'slots' | 'free';
    timeSlotLead?: number;
    timeSlotStep?: number;
    openTime?: string;
    closeTime?: string;
    sofortEnabled?: boolean;
    sofortLabel?: string;
}

const EMAIL_TPLS = [
    { key: 'tpl_order_confirmed', icon: '✅', title: 'Bestätigung (Annahme)' },
    { key: 'tpl_order_cancelled', icon: '❌', title: 'Ablehnung (Storno)' },
    { key: 'tpl_order_ready', icon: '🎉', title: 'Bestellung Bereit' },
];
const PLACEHOLDERS = ['customerName', 'restaurantName', 'estimatedTime', 'total', 'statusUrl'];

export function OrderSettingsPage() {
    useViewTitle('Bestellungen einrichten');
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { hasModule, isLoading: licLoading } = useLicense();

    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: () => apiGet<SettingsData>('settings'),
    });

    const [cfg, setCfg] = React.useState<OrderConfig>({});
    const [templates, setTemplates] = React.useState<Record<string, EmailTemplate>>({});
    const [saving, setSaving] = React.useState(false);
    const [savingTpl, setSavingTpl] = React.useState(false);
    const bodyRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});

    React.useEffect(() => {
        if (settings) {
            setCfg((settings.orderConfig as OrderConfig) || {});
            setTemplates(settings.emailTemplates || {});
        }
    }, [settings]);

    const moduleLicensed = licLoading || hasModule('online_orders');
    const moduleEnabled = settings?.enabledModules?.orders_kitchen !== false;

    if (!licLoading && !moduleLicensed) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
                    <Lock className="size-10 text-muted-foreground" />
                    <h2 className="text-xl font-bold text-primary">Online-Bestellungen</h2>
                    <p className="max-w-md text-sm text-muted-foreground">
                        Die Übermittlung von Bestellungen ist ab dem <strong>Pro+</strong>-Plan
                        verfügbar.
                    </p>
                    <Button onClick={() => navigate('/settings/license')}>
                        <ArrowUp /> Plan upgraden
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const set = <K extends keyof OrderConfig>(k: K, v: OrderConfig[K]) =>
        setCfg((s) => ({ ...s, [k]: v }));
    const setTpl = (key: string, field: 'subject' | 'body', value: string) =>
        setTemplates((t) => ({ ...t, [key]: { ...t[key], [field]: value } }));

    function insertPlaceholder(key: string, ph: string) {
        const ta = bodyRefs.current[key];
        const token = `{{${ph}}}`;
        const cur = templates[key]?.body || '';
        if (ta && document.activeElement === ta) {
            const start = ta.selectionStart;
            const next = cur.slice(0, start) + token + cur.slice(ta.selectionEnd);
            setTpl(key, 'body', next);
            requestAnimationFrame(() => {
                ta.focus();
                ta.selectionStart = ta.selectionEnd = start + token.length;
            });
        } else setTpl(key, 'body', cur + token);
    }

    async function saveConfig() {
        setSaving(true);
        const cutoff = Math.max(0, Math.min(120, cfg.orderCutoffMinutes ?? 30));
        const lead = Math.max(0, Math.min(60, cfg.pickupLeadMinutes ?? 5));
        const res = await apiPost('settings', {
            orderConfig: { ...cfg, orderCutoffMinutes: cutoff, pickupLeadMinutes: lead },
        });
        setSaving(false);
        if (res.success !== false) {
            toast.success('Einstellungen gespeichert!');
            qc.invalidateQueries({ queryKey: ['settings'] });
        } else toast.error(res.reason || 'Fehler beim Speichern');
    }

    async function saveTemplates() {
        setSavingTpl(true);
        const cleaned: Record<string, EmailTemplate> = { ...templates };
        for (const { key } of EMAIL_TPLS) {
            cleaned[key] = {
                subject: templates[key]?.subject?.trim() || '',
                body: templates[key]?.body?.trim() || '',
            };
        }
        const res = await apiPost('settings', { emailTemplates: cleaned });
        setSavingTpl(false);
        if (res.success !== false) toast.success('E-Mail Templates gespeichert.');
        else toast.error(res.reason || 'Fehler');
    }

    const modeRow = (
        emoji: string,
        title: string,
        desc: string,
        key: keyof OrderConfig,
        def = false
    ) => (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b py-4 last:border-0">
            <div className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-xl">
                    {emoji}
                </div>
                <div>
                    <div className="text-sm font-bold">{title}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
            </div>
            <Switch checked={cfg[key] !== undefined ? !!cfg[key] : def} onCheckedChange={(c) => set(key, c)} />
        </div>
    );

    const numRow = (emoji: string, title: string, desc: string, key: keyof OrderConfig, def: number, max: number) => (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b py-3 last:border-0">
            <div className="min-w-48 flex-1">
                <div className="text-sm font-bold">{emoji} {title}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
            <div className="flex items-center gap-2">
                <Input
                    type="number"
                    min={0}
                    max={max}
                    step={5}
                    value={(cfg[key] as number) ?? def}
                    onChange={(e) => set(key, (parseInt(e.target.value) || 0) as never)}
                    className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">Min.</span>
            </div>
        </div>
    );

    const slots = (cfg.timeSlotMode ?? 'slots') !== 'free';

    return (
        <div className="max-w-3xl space-y-5">
            {moduleLicensed && !moduleEnabled && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                    Online-Bestellungen sind derzeit deaktiviert.{' '}
                    <Link to="/settings/license" className="font-medium underline underline-offset-2">
                        Module aktivieren →
                    </Link>
                </div>
            )}
            <Card>
                <CardContent className="pt-6">
                    <div className="mb-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Aktive Bestellmodi
                    </div>
                    {modeRow('🍽️', 'Am Tisch', 'Gast bestellt per Tischnummer', 'dineInEnabled', true)}
                    {modeRow('🚗', 'Abholung', 'Gast bestellt vorab und holt selbst ab', 'pickupEnabled', true)}
                    {modeRow('🚚', 'Lieferung', 'Lieferung an die angegebene Adresse', 'deliveryEnabled')}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="mb-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Zeitfenster
                    </div>
                    {numRow('⏱️', 'Bestellstopp vor Ladenschluss', 'Keine neuen Bestellungen X Min. vor Schließzeit.', 'orderCutoffMinutes', 30, 120)}
                    {numRow('🚗', 'Mindest-Vorlaufzeit Abholung', 'Abholzeit muss X Min. in der Zukunft liegen.', 'pickupLeadMinutes', 5, 60)}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="mb-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Zeitauswahl für Gäste
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-48 flex-1">
                            <div className="text-sm font-bold">📅 Auswahl-Modus</div>
                            <div className="text-xs text-muted-foreground">
                                Wie Gäste die Uhrzeit wählen können.
                            </div>
                        </div>
                        <select
                            className="h-9 w-52 rounded-md border border-input bg-transparent px-3 text-sm"
                            value={cfg.timeSlotMode || 'slots'}
                            onChange={(e) => set('timeSlotMode', e.target.value as 'slots' | 'free')}
                        >
                            <option value="slots">Zeitslots (empfohlen)</option>
                            <option value="free">Freie Eingabe (alt)</option>
                        </select>
                    </div>

                    {slots && (
                        <div className="mt-5 space-y-1 rounded-xl border bg-muted/30 p-5">
                            {numRow('⏱️', 'Vorlaufzeit (Slots)', 'Erster Slot ab "jetzt + X Min."', 'timeSlotLead', 20, 120)}
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b py-3">
                                <div>
                                    <div className="text-sm font-bold">📏 Slot-Abstand</div>
                                    <div className="text-xs text-muted-foreground">
                                        Intervall zwischen den Uhrzeiten
                                    </div>
                                </div>
                                <select
                                    className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm"
                                    value={cfg.timeSlotStep ?? 15}
                                    onChange={(e) => set('timeSlotStep', parseInt(e.target.value))}
                                >
                                    {[10, 15, 20, 30].map((n) => (
                                        <option key={n} value={n}>
                                            {n} Min
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b py-3">
                                <div>
                                    <div className="text-sm font-bold">🌅 Öffnet / 🌌 Letzte Bestellung</div>
                                    <div className="text-xs text-muted-foreground">
                                        Zeitbereich für die Slot-Generierung
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="time"
                                        value={cfg.openTime || '11:00'}
                                        onChange={(e) => set('openTime', e.target.value)}
                                        className="w-28"
                                    />
                                    <span className="text-muted-foreground">–</span>
                                    <Input
                                        type="time"
                                        value={cfg.closeTime || '22:00'}
                                        onChange={(e) => set('closeTime', e.target.value)}
                                        className="w-28"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b py-3">
                                <div>
                                    <div className="text-sm font-bold">⚡ "Sofort"-Option aktiv</div>
                                    <div className="text-xs text-muted-foreground">
                                        Bestellung ohne fixen Zeitslot
                                    </div>
                                </div>
                                <Switch
                                    checked={cfg.sofortEnabled !== undefined ? !!cfg.sofortEnabled : true}
                                    onCheckedChange={(c) => set('sofortEnabled', c)}
                                />
                            </div>
                            <div className="pt-3">
                                <Label>📝 Sofort-Label Text</Label>
                                <Input
                                    value={cfg.sofortLabel ?? 'So schnell wie möglich (ca. {min} Min.)'}
                                    onChange={(e) => set('sofortLabel', e.target.value)}
                                    placeholder="Platzhalter {min} möglich"
                                    className="mt-1"
                                />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex items-center gap-3">
                <Button onClick={saveConfig} disabled={saving}>
                    {saving ? 'Speichern…' : 'Einstellungen speichern'}
                </Button>
            </div>

            {/* Bestell-E-Mails */}
            <Card>
                <CardContent className="space-y-5 pt-6">
                    <div>
                        <h3 className="font-semibold">✉️ Bestell-Bestätigungen</h3>
                        <p className="text-sm text-muted-foreground">
                            Inhalt der E-Mails anpassen, die Kunden nach der Bestellung erhalten.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 rounded-lg border bg-muted/40 p-3">
                        <span className="w-full text-xs font-bold text-muted-foreground">
                            Verfügbare Platzhalter (in fokussiertes Textfeld einfügen):
                        </span>
                        {PLACEHOLDERS.map((p) => (
                            <span
                                key={p}
                                className="rounded-full border bg-background px-2.5 py-0.5 font-mono text-xs text-primary"
                            >
                                {`{{${p}}}`}
                            </span>
                        ))}
                    </div>
                    {EMAIL_TPLS.map(({ key, icon, title }) => (
                        <div key={key} className="rounded-xl border p-4">
                            <h4 className="mb-3 flex items-center gap-2 font-bold text-primary">
                                <span className="text-lg">{icon}</span> {title}
                            </h4>
                            <Label>E-Mail Betreff</Label>
                            <Input
                                className="mb-3 mt-1"
                                value={templates[key]?.subject || ''}
                                placeholder="Standard-Betreff wird verwendet wenn leer"
                                onChange={(e) => setTpl(key, 'subject', e.target.value)}
                            />
                            <Label>Inhalt (HTML erlaubt)</Label>
                            <Textarea
                                ref={(el) => {
                                    bodyRefs.current[key] = el;
                                }}
                                className="mt-1 min-h-24"
                                value={templates[key]?.body || ''}
                                placeholder="Standard-Template wird verwendet wenn leer"
                                onChange={(e) => setTpl(key, 'body', e.target.value)}
                            />
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {PLACEHOLDERS.map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => insertPlaceholder(key, p)}
                                        className="rounded-full border bg-muted px-2 py-0.5 text-xs hover:bg-accent"
                                    >
                                        {`{{${p}}}`}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="flex justify-end">
                        <Button onClick={saveTemplates} disabled={savingTpl}>
                            {savingTpl ? 'Speichern…' : 'Templates speichern'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
