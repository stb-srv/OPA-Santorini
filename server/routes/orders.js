/**
 * Routes – Orders
 * Status-Flow:
 *   dine_in:          pending → preparing → ready
 *   pickup/delivery:  pending → confirmed → preparing → ready → completed
 */
const router = require('express').Router();
const crypto = require('crypto');
const DB = require('../db');
const Mailer = require('../services/mailer.js');
const { getCurrentLicense } = require('../services/license.js');
const { extractDomain, sanitizeText } = require('../helpers.js');

const { reservationLimiter } = require('../core/middleware.js');
const logger = require('../core/logger.js');
const validate = require('../validation/validate.js');
const { cartOrderSchema, orderStatusUpdateSchema } = require('../validation/schemas.js');
const { requireRole } = require('../core/middleware.js');

const VALID_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

const PDFDocument = require('pdfkit');

module.exports = (requireAuth, io) => {
    // GET alle Bestellungen (Admin)
    router.get('/', requireAuth, requireRole('waiter', 'kitchen'), async (req, res) => {
        try {
            res.json(await DB.getOrders());
        } catch (e) {
            logger.error({ err: e }, 'Orders route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    // GET /api/orders/export/csv
    router.get('/export/csv', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            const { von, bis } = req.query;
            let orders = await DB.getOrders();
            if (von || bis) {
                const start = von ? new Date(von).getTime() : 0;
                const end = bis ? new Date(bis + 'T23:59:59.999Z').getTime() : Infinity;
                orders = orders.filter((o) => {
                    const t = new Date(o.timestamp || o.createdAt).getTime();
                    return t >= start && t <= end;
                });
            }
            let csv = 'ID,Datum,Tisch,Status,Gesamtpreis,Artikel\n';
            for (const o of orders) {
                const date = new Date(o.timestamp || o.createdAt).toLocaleString('de-DE');
                const table = o.table_name || o.table_id || o.tableNumber || '';
                const total = o.total ? parseFloat(o.total).toFixed(2) : '0.00';
                const items = o.items
                    ? o.items.map((i) => `${i.quantity}x ${i.name}`).join(' | ')
                    : '';
                csv += `"${o.id}","${date}","${table}","${o.status}","${total}","${items.replace(/"/g, '""')}"\n`;
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="bestellungen.csv"');
            res.send('\uFEFF' + csv);
        } catch (e) {
            logger.error({ err: e }, 'Export Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    // GET /api/orders/export/pdf
    router.get('/export/pdf', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            const { von, bis } = req.query;
            let orders = await DB.getOrders();
            if (von || bis) {
                const start = von ? new Date(von).getTime() : 0;
                const end = bis ? new Date(bis + 'T23:59:59.999Z').getTime() : Infinity;
                orders = orders.filter((o) => {
                    const t = new Date(o.timestamp || o.createdAt).getTime();
                    return t >= start && t <= end;
                });
            }

            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="bestellungen.pdf"');
            doc.pipe(res);

            doc.fontSize(20).text('Meraki', { align: 'center' });
            doc.fontSize(14).text('Bestellbericht', { align: 'center' });
            doc.moveDown(2);

            doc.fontSize(10);
            const startY = doc.y;
            doc.text('Datum', 50, startY);
            doc.text('Tisch', 180, startY);
            doc.text('Status', 280, startY);
            doc.text('Gesamt', 420, startY);
            doc.moveDown();

            let totalSum = 0;
            for (const o of orders) {
                if (doc.y > 700) {
                    doc.addPage();
                }
                const y = doc.y;
                const date = new Date(o.timestamp || o.createdAt).toLocaleString('de-DE');
                const table = o.table_name || o.table_id || o.tableNumber || o.type;
                const total = parseFloat(o.total || 0);
                totalSum += total;

                doc.text(date, 50, y);
                doc.text(String(table), 180, y);
                doc.text(o.status, 280, y);
                doc.text(total.toFixed(2) + ' EUR', 420, y);
                doc.moveDown(0.5);
            }

            doc.moveDown(2);
            doc.fontSize(12).text(`Gesamtumsatz: ${totalSum.toFixed(2)} EUR`, { align: 'right' });
            doc.end();
        } catch (e) {
            logger.error({ err: e }, 'Export Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    // GET einzelne Bestellung per orderToken (Kunden-Statusseite)
    router.get('/status/:token', async (req, res) => {
        try {
            const order = await DB.getOrderByToken(req.params.token);
            if (!order)
                return res
                    .status(404)
                    .json({ success: false, reason: 'Bestellung nicht gefunden.' });
            // Nur sichere Felder zurückgeben
            res.json({
                success: true,
                order: {
                    id: order.id,
                    status: order.status,
                    type: order.type,
                    items: order.items,
                    total: order.total,
                    timestamp: order.timestamp,
                    pickupTime: order.pickupTime,
                    estimatedTime: order.estimatedTime || null,
                    customerName: order.customerName || null,
                },
            });
        } catch (e) {
            logger.error({ err: e }, 'Orders route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    // POST neue Bestellung (Gast)
    // Für pickup/delivery: Status startet als 'pending' (wartet auf Bestätigung)
    // Für dine_in: Status startet als 'pending' und geht direkt in Küche
    router.post('/', reservationLimiter, validate(cartOrderSchema), async (req, res) => {
        try {
            const host = extractDomain(req);
            let license = null;
            try {
                license = await getCurrentLicense(DB, host);
            } catch (_) {}
            if (!license || !license.modules || license.modules.orders_kitchen !== true) {
                return res.status(403).json({
                    success: false,
                    message: 'Ihr aktueller Plan unterstützt dieses Feature nicht.',
                });
            }
            const orderToken = crypto.randomBytes(16).toString('hex');
            const newOrder = {
                ...req.body,
                id: Date.now().toString(),
                orderToken, // Für Kunden-Status-Polling
                timestamp: new Date().toISOString(),
                status: 'pending',
                // Kundendaten validieren
                customerName: sanitizeText(req.body.customerName || '').slice(0, 80),
                customerPhone: sanitizeText(req.body.customerPhone || '').slice(0, 30),
                customerEmail: sanitizeText(req.body.customerEmail || '').slice(0, 120),
                deliveryAddress:
                    req.body.type === 'delivery' ? req.body.deliveryAddress || '' : undefined,
            };
            await DB.addOrder(newOrder);
            io.emit('new_order', newOrder);
            // Dem Gast nur den Token zurückgeben, keine interne ID
            res.json({ success: true, orderToken, orderId: newOrder.id });
        } catch (e) {
            logger.error({ err: e }, 'Orders route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    // PUT Status-Update (Admin)
    router.put(
        '/:id/status',
        requireAuth,
        requireRole('waiter', 'kitchen'),
        validate(orderStatusUpdateSchema),
        async (req, res) => {
            try {
                const host = extractDomain(req);
                let license = null;
                try {
                    license = await getCurrentLicense(DB, host);
                } catch (_) {}
                if (!license || !license.modules || license.modules.orders_kitchen !== true) {
                    return res.status(403).json({
                        success: false,
                        message: 'Ihr aktueller Plan unterstützt dieses Feature nicht.',
                    });
                }
                const { status, estimatedTime } = req.body;
                if (!VALID_STATUSES.includes(status))
                    return res.status(400).json({
                        success: false,
                        reason: `Ungültiger Status. Erlaubt: ${VALID_STATUSES.join(', ')}`,
                    });

                const update = { status };
                if (estimatedTime) update.estimatedTime = estimatedTime;

                const updated = await DB.updateOrderStatus(req.params.id, update);
                if (!updated)
                    return res
                        .status(404)
                        .json({ success: false, reason: 'Bestellung nicht gefunden.' });

                // Socket-Event an alle Clients (inkl. Gäste-Polling)
                io.emit('order-updated', {
                    id: updated.id,
                    orderToken: updated.orderToken,
                    status: updated.status,
                    estimatedTime: updated.estimatedTime,
                });

                // E-Mail an Kunden bei Bestätigung, Ablehnung oder Abholbereitschaft
                if (['confirmed', 'cancelled', 'ready'].includes(status) && updated.customerEmail) {
                    Mailer.sendOrderStatusMail(updated, DB).catch((e) =>
                        logger.error({ err: e }, 'Order Status Mailer Fehler')
                    );
                }

                logger.info({ orderId: updated.id, status }, 'Bestellstatus aktualisiert');
                res.json({ success: true, order: updated });
            } catch (e) {
                logger.error({ err: e }, 'Orders route Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    // DELETE Bestellung (Admin)
    router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            await DB.deleteOrder(req.params.id);
            res.json({ success: true });
        } catch (e) {
            logger.error({ err: e }, 'Orders route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    return router;
};
