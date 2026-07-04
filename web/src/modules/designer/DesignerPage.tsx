import * as React from 'react';
import { toast } from 'sonner';
import { ImageIcon, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiUpload } from '@/lib/api';
import { useViewTitle } from '@/hooks/useViewTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { SwitchRow } from '@/components/shared/SwitchRow';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CustomPage {
    id: string;
    title: string;
    slug?: string;
    enabled?: boolean;
    image?: string;
    headline?: string;
    content?: string;
}
interface HomeData {
    heroTitle?: string;
    heroSlogan?: string;
    bgImage?: string;
    welcomeImage?: string;
    location?: { address?: string; embedUrl?: string };
    pages?: CustomPage[];
    promotionEnabled?: boolean;
    promotionText?: string;
    vacation?: { enabled?: boolean; title?: string; text?: string; start?: string; end?: string };
    holiday?: { enabled?: boolean; title?: string; text?: string; start?: string; end?: string };
    legal?: { impressum?: string; privacy?: string };
    [k: string]: unknown;
}

type Tab = 'visuals' | 'location' | 'pages' | 'promo' | 'vacation' | 'holiday';
const TABS: { id: Tab; label: string }[] = [
    { id: 'visuals', label: 'Design & Bilder' },
    { id: 'location', label: 'Standort & Karte' },
    { id: 'pages', label: 'Seiten' },
    { id: 'promo', label: 'Promo' },
    { id: 'vacation', label: 'Urlaub' },
    { id: 'holiday', label: 'Feiertage' },
];

function DesignerPage({ initialTab }: { initialTab: Tab }) {
    useViewTitle('Website & Inhalte');
    const qc = useQueryClient();
    const { data } = useQuery({ queryKey: ['homepage'], queryFn: () => apiGet<HomeData>('homepage') });
    const [home, setHome] = React.useState<HomeData>({});
    const [tab, setTab] = React.useState<Tab>(initialTab);
    const [saving, setSaving] = React.useState(false);
    const [editPage, setEditPage] = React.useState<CustomPage | null>(null);
    const bgRef = React.useRef<HTMLInputElement>(null);
    const wRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (data) setHome(data);
    }, [data]);
    React.useEffect(() => setTab(initialTab), [initialTab]);

    const set = (patch: Partial<HomeData>) => setHome((h) => ({ ...h, ...patch }));
    const setNested = <K extends keyof HomeData>(key: K, patch: Record<string, unknown>) =>
        setHome((h) => ({ ...h, [key]: { ...(h[key] as object), ...patch } }));

    async function uploadImg(file: File | undefined, field: 'bgImage' | 'welcomeImage') {
        if (!file) return;
        const res = await apiUpload<{ success?: boolean; url?: string; reason?: string }>(file);
        if (res.success && res.url) {
            set({ [field]: res.url });
            toast.success('Bild hochgeladen.');
        } else toast.error(res.reason || 'Upload fehlgeschlagen.');
    }

    async function save() {
        setSaving(true);
        const res = await apiPost('homepage', home);
        setSaving(false);
        if (res.success !== false) {
            toast.success('Änderungen gespeichert!');
            qc.invalidateQueries({ queryKey: ['homepage'] });
        } else toast.error(res.reason || 'Fehler');
    }

    async function savePage(p: CustomPage) {
        const pages = home.pages || [];
        const exists = pages.some((x) => x.id === p.id);
        const updatedPages = exists ? pages.map((x) => (x.id === p.id ? p : x)) : [...pages, p];
        const updatedHome = { ...home, pages: updatedPages };
        setHome(updatedHome);
        setEditPage(null);
        const res = await apiPost('homepage', updatedHome);
        if (res.success !== false) {
            qc.invalidateQueries({ queryKey: ['homepage'] });
            toast.success('Seite gespeichert!');
        } else toast.error(res.reason || 'Fehler beim Speichern');
    }
    function deletePage(id: string) {
        if (!window.confirm('Seite löschen?')) return;
        setHome((h) => ({ ...h, pages: (h.pages || []).filter((p) => p.id !== id) }));
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5 border-b pb-3">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            tab === t.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <Card>
                <CardContent className="space-y-4 pt-6">
                    {tab === 'visuals' && (
                        <>
                            <Field label="Hero Titel">
                                <Input value={home.heroTitle || ''} onChange={(e) => set({ heroTitle: e.target.value })} />
                            </Field>
                            <Field label="Hero Slogan">
                                <Input value={home.heroSlogan || ''} onChange={(e) => set({ heroSlogan: e.target.value })} />
                            </Field>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <ImgField
                                    label="Hintergrundbild (Hero)"
                                    src={home.bgImage}
                                    onPick={() => bgRef.current?.click()}
                                />
                                <input ref={bgRef} type="file" accept="image/*" hidden onChange={(e) => uploadImg(e.target.files?.[0], 'bgImage')} />
                                <ImgField
                                    label="Willkommen-Bild"
                                    src={home.welcomeImage}
                                    onPick={() => wRef.current?.click()}
                                />
                                <input ref={wRef} type="file" accept="image/*" hidden onChange={(e) => uploadImg(e.target.files?.[0], 'welcomeImage')} />
                            </div>
                        </>
                    )}

                    {tab === 'location' && (
                        <>
                            <Field label="Adresse (für Anzeige & Maps)">
                                <Textarea
                                    className="h-24"
                                    value={home.location?.address || ''}
                                    onChange={(e) => setNested('location', { address: e.target.value })}
                                />
                            </Field>
                            <Field label="Google Maps Embed URL (Iframe-Quelle)">
                                <Input
                                    value={home.location?.embedUrl || ''}
                                    onChange={(e) => setNested('location', { embedUrl: e.target.value })}
                                />
                            </Field>
                        </>
                    )}

                    {tab === 'pages' && (
                        <>
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold">Eigene Unterseiten</h4>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        setEditPage({ id: 'new-' + Date.now(), title: '', image: '', headline: '', content: '' })
                                    }
                                >
                                    <Plus /> Neue Seite
                                </Button>
                            </div>
                            {(home.pages || []).length === 0 ? (
                                <p className="py-8 text-center text-muted-foreground">
                                    Noch keine eigenen Seiten erstellt.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {(home.pages || []).map((p) => (
                                        <div key={p.id} className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <strong>{p.title || '(ohne Titel)'}</strong>
                                                    <span className={cn('rounded-full px-2 py-0.5 text-[0.65rem] font-medium', p.enabled !== false ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground')}>
                                                        {p.enabled !== false ? 'Aktiv' : 'Inaktiv'}
                                                    </span>
                                                </div>
                                                <div className="truncate text-xs opacity-60">URL: /p/{p.slug || p.id}</div>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <Button size="icon" variant="outline" onClick={() => setEditPage(p)}>
                                                    <Pencil />
                                                </Button>
                                                <Button size="icon" variant="outline" className="text-destructive" onClick={() => deletePage(p.id)}>
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {tab === 'promo' && (
                        <>
                            <SwitchRow
                                label="Promotion-Leiste auf der Startseite anzeigen"
                                checked={home.promotionEnabled !== false}
                                onChange={(c) => set({ promotionEnabled: c })}
                            />
                            <Field label="Promotion Text">
                                <Input
                                    value={home.promotionText || ''}
                                    onChange={(e) => set({ promotionText: e.target.value })}
                                    placeholder="z.B. Heute: Frischer Oktopus vom Grill"
                                />
                            </Field>
                        </>
                    )}

                    {tab === 'vacation' && (
                        <PeriodForm
                            label="Urlaubs-Sperre aktiv (Reservierungen & Online-Bestellungen deaktiviert)"
                            data={home.vacation || {}}
                            onChange={(p) => setNested('vacation', p)}
                        />
                    )}
                    {tab === 'holiday' && (
                        <PeriodForm
                            label="Feiertags-Ankündigung aktiv (Banner auf der Website)"
                            data={home.holiday || {}}
                            onChange={(p) => setNested('holiday', p)}
                        />
                    )}

                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>
                    {saving ? 'Speichern…' : 'Änderungen speichern'}
                </Button>
            </div>

            {editPage && (
                <PageEditDialog page={editPage} onClose={() => setEditPage(null)} onSave={savePage} />
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <Label>{label}</Label>
            {children}
        </div>
    );
}

function ImgField({ label, src, onPick }: { label: string; src?: string; onPick: () => void }) {
    return (
        <div className="space-y-1">
            <Label>{label}</Label>
            <div className="flex h-44 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/40">
                {src ? (
                    <img src={src} alt="" className="h-full w-full object-cover" />
                ) : (
                    <ImageIcon className="size-8 opacity-20" />
                )}
            </div>
            <Button variant="outline" size="sm" onClick={onPick}>
                <Upload /> Hochladen
            </Button>
        </div>
    );
}

function PeriodForm({
    label,
    data,
    onChange,
}: {
    label: string;
    data: { enabled?: boolean; title?: string; text?: string; start?: string; end?: string };
    onChange: (p: Record<string, unknown>) => void;
}) {
    return (
        <>
            <SwitchRow label={label} checked={!!data.enabled} onChange={(c) => onChange({ enabled: c })} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Titel">
                    <Input value={data.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
                </Field>
                <Field label="Text">
                    <Input value={data.text || ''} onChange={(e) => onChange({ text: e.target.value })} />
                </Field>
                <Field label="Von (Datum)">
                    <Input type="date" value={data.start || ''} onChange={(e) => onChange({ start: e.target.value })} />
                </Field>
                <Field label="Bis (Datum)">
                    <Input type="date" value={data.end || ''} onChange={(e) => onChange({ end: e.target.value })} />
                </Field>
            </div>
        </>
    );
}

function toSlug(s: string) {
    return s
        .toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function PageEditDialog({
    page,
    onClose,
    onSave,
}: {
    page: CustomPage;
    onClose: () => void;
    onSave: (p: CustomPage) => void;
}) {
    const [title, setTitle] = React.useState(page.title);
    const [slug, setSlug] = React.useState(page.slug || '');
    const [enabled, setEnabled] = React.useState(page.enabled !== false);
    const [image, setImage] = React.useState(page.image || '');
    const [headline, setHeadline] = React.useState(page.headline || '');
    const [slugTouched, setSlugTouched] = React.useState(!!page.slug);
    const initialText = React.useMemo(() => {
        try {
            const p = JSON.parse(page.content || '');
            if (p.version === 1 && Array.isArray(p.blocks)) {
                const t = p.blocks.find((b: { type: string }) => b.type === 'text');
                return t?.text || '';
            }
        } catch {
            /* legacy */
        }
        return page.content || '';
    }, [page]);
    const [text, setText] = React.useState(initialText);
    const fileRef = React.useRef<HTMLInputElement>(null);

    function handleTitleChange(val: string) {
        setTitle(val);
        if (!slugTouched) setSlug(toSlug(val));
    }

    async function upload(file: File | undefined) {
        if (!file) return;
        const res = await apiUpload<{ success?: boolean; url?: string }>(file);
        if (res.success && res.url) setImage(res.url);
    }

    function save() {
        const finalSlug = slug || toSlug(title) || page.id;
        const content = JSON.stringify({ version: 1, blocks: [{ type: 'text', heading: headline, text }] });
        onSave({ ...page, title, slug: finalSlug, enabled, image, headline, content });
    }

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{page.id.startsWith('new-') ? 'Neue Seite' : 'Seite bearbeiten'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <SwitchRow label="Seite aktiv (öffentlich sichtbar)" checked={enabled} onChange={setEnabled} />
                    <Field label="Menü-Titel (Navigation)">
                        <Input value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="z.B. Über uns" />
                    </Field>
                    <Field label="URL-Pfad (Slug)">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-sm text-muted-foreground">/p/</span>
                            <Input
                                value={slug}
                                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
                                placeholder="ueber-uns"
                            />
                        </div>
                    </Field>
                    <Field label="Header-Bild">
                        <div className="flex gap-2">
                            <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="/uploads/…" />
                            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
                            <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()}>
                                <Upload />
                            </Button>
                        </div>
                    </Field>
                    <Field label="Überschrift">
                        <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
                    </Field>
                    <Field label="Inhalt (Text)">
                        <Textarea className="h-48" value={text} onChange={(e) => setText(e.target.value)} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Abbrechen
                    </Button>
                    <Button onClick={save}>Speichern</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export const DesignerVisualsPage = () => <DesignerPage initialTab="visuals" />;
export const DesignerLocationPage = () => <DesignerPage initialTab="location" />;
export const DesignerVacationPage = () => <DesignerPage initialTab="vacation" />;
export const DesignerHolidayPage = () => <DesignerPage initialTab="holiday" />;
