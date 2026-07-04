import * as React from 'react';
import { toast } from 'sonner';
import { FileText, Sheet } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut, apiDownload } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useViewTitle } from '@/hooks/useViewTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { OrderCard } from './OrderCard';
import {
    filterOrders,
    isExternal,
    type Order,
    type OrderFilter,
    type OrderStatus,
} from './orders-api';

const ORDERS_KEY = ['orders'] as const;
const FILTERS: { id: OrderFilter; label: string }[] = [
    { id: 'active', label: 'Aktiv' },
    { id: 'all', label: 'Alle' },
    { id: 'completed', label: 'Abgeschlossen' },
];

function playOrderSound() {
    try {
        void new Audio('/assets/sounds/order-notification.mp3').play().catch(() => {});
    } catch {
        /* ignore */
    }
}

function monthRange() {
    const now = new Date();
    const von = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const bis = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return { von, bis };
}

export function OrdersPage() {
    useViewTitle('Küchen-Monitor');
    const qc = useQueryClient();
    const [filter, setFilter] = React.useState<OrderFilter>('active');
    const [connected, setConnected] = React.useState(false);
    const range = monthRange();
    const [von, setVon] = React.useState(range.von);
    const [bis, setBis] = React.useState(range.bis);

    const { data: orders = [] } = useQuery({
        queryKey: ORDERS_KEY,
        queryFn: async () => (await apiGet<Order[]>('orders')) || [],
    });

    React.useEffect(() => {
        const socket = getSocket();
        setConnected(socket.connected);
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        const onNew = (order: Order) => {
            qc.setQueryData<Order[]>(ORDERS_KEY, (prev = []) => [order, ...prev]);
            const msg = isExternal(order)
                ? `📦 Neue Anfrage von ${order.customerName || 'Gast'}`
                : `🍽️ Neue Tischbestellung – Tisch ${order.tableNumber || '?'}`;
            toast(msg);
            playOrderSound();
        };
        const onUpdate = (update: Partial<Order> & { id: string }) => {
            qc.setQueryData<Order[]>(ORDERS_KEY, (prev = []) =>
                prev.map((o) => (o.id === update.id ? { ...o, ...update } : o))
            );
        };
        const onReconnect = async () => {
            setConnected(true);
            const fresh = await apiGet<Order[]>('orders');
            if (fresh) qc.setQueryData(ORDERS_KEY, fresh);
        };
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('new_order', onNew);
        socket.on('order-updated', onUpdate);
        socket.io.on('reconnect', onReconnect);
        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('new_order', onNew);
            socket.off('order-updated', onUpdate);
            socket.io.off('reconnect', onReconnect);
        };
    }, [qc]);

    async function setStatus(id: string, status: OrderStatus, eta?: string) {
        const res = await apiPut(`orders/${id}/status`, { status, estimatedTime: eta });
        if (res.success !== false) {
            qc.setQueryData<Order[]>(ORDERS_KEY, (prev = []) =>
                prev.map((o) =>
                    o.id === id ? { ...o, status, ...(eta ? { estimatedTime: eta } : {}) } : o
                )
            );
            toast.success(`Status: ${status}`);
        } else toast.error('Fehler beim Speichern.');
    }

    async function saveEta(id: string, eta: string) {
        const order = orders.find((o) => o.id === id);
        if (!order) return;
        const res = await apiPut(`orders/${id}/status`, { status: order.status, estimatedTime: eta });
        if (res.success !== false) {
            qc.setQueryData<Order[]>(ORDERS_KEY, (prev = []) =>
                prev.map((o) => (o.id === id ? { ...o, estimatedTime: eta } : o))
            );
            toast.success('Zeit gespeichert.');
        } else toast.error('Fehler.');
    }

    function downloadExport(format: 'csv' | 'pdf') {
        void apiDownload(
            `orders/export/${format}?von=${von}&bis=${bis}`,
            `bestellungen.${format}`
        );
    }

    const filtered = filterOrders(orders, filter);
    const pendingExternal = orders.filter(
        (o) => o.status === 'pending' && isExternal(o)
    ).length;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold">Küchen-Monitor</h3>
                    <p className="text-sm text-muted-foreground">
                        Eingehende Bestellungen – Abholung &amp; Lieferung zuerst bestätigen.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 border-r pr-3">
                        <Input
                            type="date"
                            value={von}
                            onChange={(e) => setVon(e.target.value)}
                            className="h-8 w-auto text-xs"
                        />
                        <Input
                            type="date"
                            value={bis}
                            onChange={(e) => setBis(e.target.value)}
                            className="h-8 w-auto text-xs"
                        />
                        <Button size="sm" variant="outline" onClick={() => downloadExport('csv')}>
                            <Sheet /> CSV
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadExport('pdf')}>
                            <FileText /> PDF
                        </Button>
                    </div>
                    <div className="flex gap-1.5">
                        {FILTERS.map((f) => (
                            <Button
                                key={f.id}
                                size="sm"
                                variant={filter === f.id ? 'default' : 'outline'}
                                onClick={() => setFilter(f.id)}
                            >
                                {f.label}
                            </Button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span
                            className={cn(
                                'inline-block size-2.5 rounded-full',
                                connected ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground'
                            )}
                        />
                        <span className="text-xs font-bold uppercase">
                            {connected ? 'Live' : 'Verbinde…'}
                        </span>
                    </div>
                </div>
            </div>

            {pendingExternal > 0 && (
                <div className="flex items-center gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-5 py-3.5">
                    <span className="text-xl">🔔</span>
                    <strong className="text-destructive">
                        {pendingExternal} neue Anfrage{pendingExternal > 1 ? 'n' : ''} warten auf
                        Bestätigung!
                    </strong>
                </div>
            )}

            {filtered.length === 0 ? (
                <Card className="p-20 text-center text-muted-foreground">
                    <h3 className="text-lg font-semibold">Keine Bestellungen</h3>
                    <p>Neue Bestellungen erscheinen hier in Echtzeit.</p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((o) => (
                        <OrderCard
                            key={o.id}
                            order={o}
                            onAction={setStatus}
                            onSaveEta={saveEta}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
