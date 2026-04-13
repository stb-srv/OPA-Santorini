/**
 * OPA-CMS – Cart Routes
 *
 * GET  /api/cart/config   → öffentlich, keine Auth nötig
 *                           Liefert dem Gast-Frontend:
 *                            - onlineOrdersEnabled (Lizenz PRO_PLUS+)
 *                            - ordersEnabled       (Admin-Toggle global)
 *                            - deliveryEnabled     (Lieferung aktiv)
 *                            - pickupEnabled       (Abholung aktiv)
 *                            - dineInEnabled       (Am Tisch aktiv)
 *
 * POST /api/cart/order    → öffentlich für Gäste, aber Lizenzgate online_orders
 *                           Schreibt Bestellung in die DB, feuert Socket.IO Event
 *
 * SECURITY:
 *  - SEC-01: Preise werden IMMER serverseitig aus der DB geladen (nie vom Client übernommen)
 *  - BUG-03: Item-Limit max. 50 gegen DoS / Speichererschöpfung
 */

const express = require('express');
const DB      = require('../database.js');
const { getCurrentLicense } = require('../license.js');

// Maximale Anzahl Artikel pro Bestellung (DoS-Schutz)
const MAX_ITEMS_PER_ORDER = 50;
// Maximale Bestellmenge pro Artikel
const MAX_QTY_PER_ITEM = 99;

module.exports = function cartRoutes(requireLicense, io) {
    const router = express.Router();

    // -------------------------------------------------------------------------
    // GET /api/cart/config  (öffentlich – kein requireAuth)
    // -------------------------------------------------------------------------
    router.get('/config', async (req, res) => {
        try {
            const host     = req.headers['x-forwarded-host'] || req.headers.host || null;
            const license  = await getCurrentLicense(DB, host);
            const settings = await DB.getKV('settings', {});

            const onlineOrdersEnabled = !!(license.modules && license.modules.online_orders);

            // orderConfig aus Settings lesen – Defaults: alles deaktiviert
            const orderConfig = settings.orderConfig || {};

            res.json({
                success: true,
                // Warenkorb (Planungsansicht) ist IMMER aktiv – kein Flag nötig
                onlineOrdersEnabled,
                // Globaler Schalter – nur relevant wenn Lizenz online_orders hat
                ordersEnabled:   onlineOrdersEnabled && (orderConfig.ordersEnabled  === true),
                deliveryEnabled: onlineOrdersEnabled && (orderConfig.ordersEnabled === true) && (orderConfig.deliveryEnabled === true),
                pickupEnabled:   onlineOrdersEnabled && (orderConfig.ordersEnabled === true) && (orderConfig.pickupEnabled   === true),
                dineInEnabled:   onlineOrdersEnabled && (orderConfig.ordersEnabled === true) && (orderConfig.dineInEnabled   === true)
            });
        } catch (e) {
            console.error('❌ cart/config error:', e.message);
            res.status(500).json({ success: false, reason: e.message });
        }
    });

    // -------------------------------------------------------------------------
    // POST /api/cart/order  (Lizenzgate: online_orders)
    // -------------------------------------------------------------------------
    router.post('/order', requireLicense('online_orders'), async (req, res) => {
        try {
            const {
                type,        // 'dine_in' | 'pickup' | 'delivery'
                items,       // [{ id, quantity, extras? }]
                tableNumber, // bei dine_in
                pickupTime,  // bei pickup
                delivery,    // bei delivery: { name, address, phone, note? }
                guestNote    // optionaler Gesamtkommentar
            } = req.body;

            // --- Typ-Validierung ---
            if (!type || !['dine_in', 'pickup', 'delivery'].includes(type)) {
                return res.status(400).json({ success: false, reason: 'Ungültiger Bestelltyp. Erlaubt: dine_in, pickup, delivery' });
            }
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, reason: 'Warenkorb ist leer.' });
            }

            // BUG-03: Item-Limit prüfen (DoS-Schutz)
            if (items.length > MAX_ITEMS_PER_ORDER) {
                return res.status(400).json({ success: false, reason: `Maximale Artikelanzahl (${MAX_ITEMS_PER_ORDER}) überschritten.` });
            }

            // Prüfen ob der gewählte Modus vom Admin aktiviert wurde
            const settings    = await DB.getKV('settings', {});
            const orderConfig = settings.orderConfig || {};
            if (!orderConfig.ordersEnabled) {
                return res.status(403).json({ success: false, reason: 'Bestellsystem ist derzeit deaktiviert.' });
            }
            if (type === 'delivery'  && !orderConfig.deliveryEnabled) {
                return res.status(403).json({ success: false, reason: 'Lieferung ist derzeit deaktiviert.' });
            }
            if (type === 'pickup'    && !orderConfig.pickupEnabled) {
                return res.status(403).json({ success: false, reason: 'Abholung ist derzeit deaktiviert.' });
            }
            if (type === 'dine_in'   && !orderConfig.dineInEnabled) {
                return res.status(403).json({ success: false, reason: 'Tisch-Bestellung ist derzeit deaktiviert.' });
            }

            // ----------------------------------------------------------------
            // SEC-01: Preisvalidierung – Preise IMMER aus der DB laden
            // Client-seitige Preise werden komplett ignoriert.
            // ----------------------------------------------------------------
            const menuItems = await DB.getMenu();
            const validatedItems = [];
            for (const item of items) {
                const dbItem = menuItems.find(m => m.id === item.id);
                if (!dbItem) {
                    return res.status(400).json({ success: false, reason: `Unbekanntes Gericht: ${item.id}` });
                }
                if (!dbItem.active) {
                    return res.status(400).json({ success: false, reason: `Gericht nicht verfügbar: ${dbItem.name}` });
                }
                const qty = Math.max(1, Math.min(MAX_QTY_PER_ITEM, parseInt(item.quantity, 10) || 1));
                validatedItems.push({
                    id:       dbItem.id,
                    name:     dbItem.name,
                    price:    parseFloat(dbItem.price) || 0,  // Preis aus DB, nicht vom Client
                    quantity: qty,
                    extras:   item.extras || null
                });
            }

            // --- Gesamtpreis serverseitig berechnen ---
            const total = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

            // --- Bestellung erstellen ---
            const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            const order = {
                id:          orderId,
                type,
                status:      'new',
                items:       validatedItems,
                total:       parseFloat(total.toFixed(2)),
                tableNumber: type === 'dine_in'  ? (tableNumber || null) : null,
                pickupTime:  type === 'pickup'   ? (pickupTime  || null) : null,
                delivery:    type === 'delivery' ? (delivery    || null) : null,
                guestNote:   guestNote ? String(guestNote).slice(0, 500) : null,
                createdAt:   new Date().toISOString()
            };

            // In DB speichern via addOrder (verhindert Race Condition des KV-Stores)
            await DB.addOrder(order);

            // Socket.IO: Küchen-Monitor in Echtzeit benachrichtigen
            if (io) {
                io.emit('new_order', order);
            }

            console.log(`🛒 Neue Gast-Bestellung: ${orderId} | Typ: ${type} | Artikel: ${validatedItems.length} | Gesamt: ${total.toFixed(2)} €`);

            res.status(201).json({
                success:  true,
                orderId,
                total:    order.total,
                message:  'Bestellung wurde erfolgreich übermittelt.'
            });
        } catch (e) {
            console.error('❌ cart/order error:', e.message);
            res.status(500).json({ success: false, reason: e.message });
        }
    });

    return router;
};
