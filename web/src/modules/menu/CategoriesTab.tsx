import * as React from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { MENU_QUERY_KEY, type Category, type MenuData } from './menu-api';

export function CategoriesTab({ data }: { data: MenuData }) {
    const qc = useQueryClient();
    const refresh = () => qc.invalidateQueries({ queryKey: MENU_QUERY_KEY });
    const categories = data.categories;

    const [showForm, setShowForm] = React.useState(false);
    const [editing, setEditing] = React.useState<Category | null>(null);
    const [label, setLabel] = React.useState('');
    const [sort, setSort] = React.useState(0);

    function openNew() {
        setEditing(null);
        setLabel('');
        setSort(categories.length);
        setShowForm(true);
    }
    function openEdit(c: Category) {
        setEditing(c);
        setLabel(c.label || '');
        setSort(c.sort_order || 0);
        setShowForm(true);
    }

    async function save() {
        if (!label.trim()) {
            toast.error('Bitte einen Namen eingeben');
            return;
        }
        const cat: Category = {
            id: editing
                ? editing.id
                : label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_'),
            label: label.trim(),
            sort_order: sort,
            icon: editing?.icon || 'utensils',
            active: editing ? editing.active !== false : true,
        };
        const res = editing
            ? await apiPut(`categories/${cat.id}`, cat)
            : await apiPost('categories', cat);
        if (res.success !== false) {
            toast.success('Kategorie gespeichert!');
            setShowForm(false);
            refresh();
        } else toast.error(res.reason || 'Fehler beim Speichern');
    }

    async function remove(c: Category) {
        if (
            !window.confirm(
                `„${c.label}" wirklich löschen? Gerichte bleiben erhalten, verlieren aber die Kategorie-Zuordnung.`
            )
        )
            return;
        const res = await apiDelete(`categories/${c.id}`);
        if (res.success !== false) {
            toast.success('Kategorie gelöscht.');
            refresh();
        } else toast.error(res.reason || 'Fehler');
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Kategorien verwalten</h3>
                <Button variant="secondary" onClick={openNew}>
                    <Plus /> Neue Kategorie
                </Button>
            </div>

            {showForm && (
                <Card>
                    <CardContent className="space-y-4 pt-6">
                        <h4 className="font-semibold">
                            {editing ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
                        </h4>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label>Name</Label>
                                <Input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="z.B. Desserts"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>Reihenfolge (kleinere Zahl = weiter vorne)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={999}
                                    value={sort}
                                    onChange={(e) => setSort(parseInt(e.target.value) || 0)}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={save}>Speichern</Button>
                            <Button variant="outline" onClick={() => setShowForm(false)}>
                                Abbrechen
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="pt-6">
                    {categories.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Noch keine Kategorien vorhanden. Oben eine neue hinzufügen.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-32">Reihenfolge</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="text-right">Aktionen</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {categories.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell className="text-muted-foreground">
                                            {c.sort_order || 0}
                                        </TableCell>
                                        <TableCell className="font-bold text-primary">
                                            {c.label}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1.5">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openEdit(c)}
                                                >
                                                    <Pencil /> Bearbeiten
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="text-destructive"
                                                    onClick={() => remove(c)}
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
