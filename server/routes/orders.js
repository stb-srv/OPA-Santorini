/**
 * Routes – Orders
 * Status-Flow:
 *   dine_in:          pending → preparing → ready
 *   pickup/delivery:  pending → confirmed → preparing → ready → completed
 */
const router = require('express').Router();
const DB     = require('../database.js');
const Mailer = require('../mailer.js');
const { getCurrentLicense } = require('../license.js');

function extractDomain(req) {
    const forwarded = req.headers['x-forwarded-host'];
    if (forwarded) return forwarded.split(',')[0].trim().split(':')[0];
    const origin = req.headers['origin'];
    if (origin) {
        try { return new URL(origin).hostname; } catch (_) { /* ignore */ }
    }
    const host = req.headers.host || 'localhost';
    return host.split(':')[0];
}
const { reservationLimiter } = require('../middleware.js');
const logger = require('../logger.js');

const VALID_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

module.exports = (requireAuth, io) => {

    // GET alle Bestellungen (Admin)
    router.get('/', requireAuth, async (req, res) => {
        try { res.json(await DB.getOrders()); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    // GET einzelne Bestellung per orderToken (Kunden-Statusseite)
    router.get('/status/:token', async (req, res) => {
        try {
            const orders = await DB.getOrders();
            const order  = orders.find(o => o.orderToken === req.params.token);
            if (!order) return res.status(404).json({ success: false, reason: 'Bestellung nicht gefunden.' });
            // Nur sichere Felder zurückgeben
            res.json({
                success: true,
                order: {
                    id:          order.id,
                    status:      order.status,
                    type:        order.type,
                    items:       order.items,
                    total:       order.total,
                    timestamp:   order.timestamp,
                    pickupTime:  order.pickupTime,
                    estimatedTime: order.estimatedTime || null,
                    customerName: order.customerName || null,
                }
            });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    // POST neue Bestellung (Gast)
    // Für pickup/delivery: Status startet als 'pending' (wartet auf Bestätigung)
    // Für dine_in: Status startet als 'pending' und geht direkt in Küche
    router.post('/', reservationLimiter, async (req, res) => {
        try {
            const host = extractDomain(req);
            let license = null;
            try { license = await getCurrentLicense(DB, host); } catch (_) {}
            if (!license || !license.modules || license.modules.orders_kitchen !== true) {
                return res.status(403).json({ success: false, message: "Ihr aktueller Plan unterstützt dieses Feature nicht." });
            }
            const crypto = require('crypto');
            const orderToken = crypto.randomBytes(16).toString('hex');
            const newOrder = {
                ...req.body,
                id:         Date.now().toString(),
                orderToken, // Für Kunden-Status-Polling
                timestamp:  new Date().toISOString(),
                status:     'pending',
                // Kundendaten validieren
                customerName:  (req.body.customerName  || '').slice(0, 80),
                customerPhone: (req.body.customerPhone || '').slice(0, 30),
                customerEmail: (req.body.customerEmail || '').slice(0, 120),
                deliveryAddress: req.body.type === 'delivery' ? (req.body.deliveryAddress || '') : undefined,
            };
            await DB.addOrder(newOrder);
            io.emit('new_order', newOrder);
            // Dem Gast nur den Token zurückgeben, keine interne ID
            res.json({ success: true, orderToken, orderId: newOrder.id });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    // PUT Status-Update (Admin)
    router.put('/:id/status', requireAuth, async (req, res) => {
        try {
            const host = extractDomain(req);
            let license = null;
            try { license = await getCurrentLicense(DB, host); } catch (_) {}
            if (!license || !license.modules || license.modules.orders_kitchen !== true) {
                return res.status(403).json({ success: false, message: "Ihr aktueller Plan unterstützt dieses Feature nicht." });
            }
            const { status, estimatedTime } = req.body;
            if (!VALID_STATUSES.includes(status))
                return res.status(400).json({ success: false, reason: `Ungültiger Status. Erlaubt: ${VALID_STATUSES.join(', ')}` });

            const update = { status };
            if (estimatedTime) update.estimatedTime = estimatedTime;
            
            const updated = await DB.updateOrderStatus(req.params.id, update);
            if (!updated) return res.status(404).json({ success: false, reason: 'Bestellung nicht gefunden.' });

            // Socket-Event an alle Clients (inkl. Gäste-Polling)
            io.emit('order-updated', { id: updated.id, orderToken: updated.orderToken, status: updated.status, estimatedTime: updated.estimatedTime });

            // E-Mail an Kunden bei Bestätigung, Ablehnung oder Abholbereitschaft
            if (['confirmed', 'cancelled', 'ready'].includes(status) && updated.customerEmail) {
                Mailer.sendOrderStatusMail(updated, DB).catch(e =>
                    logger.error({ err: e }, 'Order Status Mailer Fehler')
                );
            }

            logger.info({ orderId: updated.id, status }, 'Bestellstatus aktualisiert');
            res.json({ success: true, order: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    // DELETE Bestellung (Admin)
    router.delete('/:id', requireAuth, async (req, res) => {
        try { await DB.deleteOrder(req.params.id); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    return router;
};
