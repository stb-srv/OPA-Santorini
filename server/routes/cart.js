/**
 * OPA-CMS – Cart Routes
 *
 * GET  /api/cart/config   → öffentlich, keine Auth nötig
 * POST /api/cart/order    → öffentlich für Gäste, Lizenzgate online_orders
 *
 * SECURITY:
 *  - SEC-01: Preise IMMER serverseitig aus DB laden
 *  - BUG-03: Item-Limit max. 50 gegen DoS
 *  - BUG-D:  extractDomain() statt rohem Host-Header (Port-Strip)
 */

const express = require('express');
const DB      = require('../database.js');
const { getCurrentLicense } = require('../license.js');
const { sanitizeText } = require('../helpers.js');

const MAX_ITEMS_PER_ORDER    = 50;
const MAX_QTY_PER_ITEM       = 99;
const DEFAULT_CUTOFF_MINUTES = 30;
const DEFAULT_LEAD_MINUTES   = 5;

/**
 * BUG-D FIX: Konsistente Domain-Extraktion (identisch zu middleware.js / menu.js / settings.js).
 * Entfernt Port und wertet X-Forwarded-Host, Origin und Host aus.
 */
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

/** Konfigurierbare Cutoff-Minuten (Bestellstopp vor Ladenschluss). */
function getCutoffMinutes(cfg) {
    const v = parseInt((cfg || {}).orderCutoffMinutes, 10);
    return (isNaN(v) || v < 0) ? DEFAULT_CUTOFF_MINUTES : v;
}

/** Konfigurierbare Mindest-Vorlaufzeit für Abholungen. */
function getLeadMinutes(cfg) {
    const v = parseInt((cfg || {}).pickupLeadMinutes, 10);
    return (isNaN(v) || v < 0) ? DEFAULT_LEAD_MINUTES : v;
}

/**
 * Prüft ob das Restaurant zum aktuellen Zeitpunkt bestellt werden kann.
 * async – unterstützt sowohl SQLite (sync) als auch MySQL (async) Adapter.
 * Rückgabe: { open, reason?, openMin?, closeMin?, openStr?, closeStr?, cutoff, lead }
 */
async function checkOpeningHours() {
    const settings  = await DB.getKV('settings', {});
    const cfg       = (settings && settings.orderConfig) ? settings.orderConfig : {};
    const cutoff    = getCutoffMinutes(cfg);
    const lead      = getLeadMinutes(cfg);
    const homepage  = await DB.getKV('homepage', {});
    const oh        = (homepage && homepage.openingHours) ? homepage.openingHours : {};
    const now       = new Date();
    const dayKey    = ['So','Mo','Di','Mi','Do','Fr','Sa'][now.getDay()];
    const dayConfig = oh[dayKey];

    if (!dayConfig) return { open: true, openMin: null, closeMin: null, cutoff, lead };

    if (dayConfig.closed) {
        return {
            open:   false,
            reason: `Wir haben heute (${dayKey}) Ruhetag und nehmen keine Bestellungen an.`,
            openMin: null, closeMin: null, cutoff, lead
        };
    }

    const parseHM = (str) => {
        if (!str) return null;
        const [h, m] = str.split(':').map(Number);
        return h * 60 + (m || 0);
    };
    const openMin  = parseHM(dayConfig.open);
    const closeMin = parseHM(dayConfig.close);
    const nowMin   = now.getHours() * 60 + now.getMinutes();

    if (openMin !== null && closeMin !== null) {
        if (nowMin < openMin) {
            return { open: false, reason: `Wir haben noch nicht geöffnet. Öffnungszeit: ${dayConfig.open} Uhr.`, openMin, closeMin, openStr: dayConfig.open, closeStr: dayConfig.close, cutoff, lead };
        }
        if (nowMin > closeMin) {
            return { open: false, reason: `Wir haben heute bereits geschlossen (ab ${dayConfig.close} Uhr).`, openMin, closeMin, openStr: dayConfig.open, closeStr: dayConfig.close, cutoff, lead };
        }
        if (cutoff > 0 && nowMin > closeMin - cutoff) {
            const minutesLeft = closeMin - nowMin;
            return { open: false, reason: `Bestellungen sind ${cutoff} Minuten vor Ladenschluss nicht mehr möglich. Wir schließen um ${dayConfig.close} Uhr (noch ${minutesLeft} Min.).`, openMin, closeMin, openStr: dayConfig.open, closeStr: dayConfig.close, cutoff, lead };
        }
    }

    return { open: true, openMin, closeMin, openStr: dayConfig.open, closeStr: dayConfig.close, cutoff, lead };
}

/**
 * Validiert die gewünschte Abholzeit.
 */
function validatePickupTime(pickupTime, openStatus) {
    if (!pickupTime || typeof pickupTime !== 'string') {
        return { valid: false, reason: 'Bitte eine Abholzeit angeben.' };
    }
    if (!/^([0-1]?\d|2[0-3]):[0-5]\d$/.test(pickupTime)) {
        return { valid: false, reason: 'Ungültiges Zeitformat für Abholzeit (HH:MM erwartet).' };
    }

    const now        = new Date();
    const nowMin     = now.getHours() * 60 + now.getMinutes();
    const [h, m]     = pickupTime.split(':').map(Number);
    const pickupMin  = h * 60 + m;
    const lead       = openStatus.lead   ?? DEFAULT_LEAD_MINUTES;
    const cutoff     = openStatus.cutoff ?? DEFAULT_CUTOFF_MINUTES;

    if (pickupMin < nowMin + lead) {
        const earliest = new Date(now.getTime() + lead * 60000);
        const eh = String(earliest.getHours()).padStart(2, '0');
        const em = String(earliest.getMinutes()).padStart(2, '0');
        return { valid: false, reason: lead === 0
            ? 'Abholzeit liegt in der Vergangenheit.'
            : `Frühestmögliche Abholzeit: ${eh}:${em} Uhr (mind. ${lead} Min. Vorlauf).` };
    }

    if (openStatus.openMin !== null && pickupMin < openStatus.openMin) {
        return { valid: false, reason: `Abholzeit liegt vor der Öffnungszeit (${openStatus.openStr} Uhr).` };
    }

    if (openStatus.closeMin !== null) {
        const maxPickup = openStatus.closeMin - cutoff;
        if (pickupMin > maxPickup) {
            const mh = String(Math.floor(maxPickup / 60)).padStart(2, '0');
            const mm = String(maxPickup % 60).padStart(2, '0');
            return { valid: false, reason: `Spätestmögliche Abholzeit ist ${mh}:${mm} Uhr (${cutoff} Min. vor Ladenschluss ${openStatus.closeStr} Uhr).` };
        }
    }

    return { valid: true };
}

function minToHHMM(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

module.exports = function cartRoutes(requireLicense, io) {
    const router = express.Router();

    // -------------------------------------------------------------------------
    // GET /api/cart/config
    // -------------------------------------------------------------------------
    router.get('/config', async (req, res) => {
        try {
            const host     = extractDomain(req); // BUG-D FIX: war req.headers['x-forwarded-host'] || req.headers.host
            const license  = await getCurrentLicense(DB, host);
            const settings = await DB.getKV('settings', {});

            const onlineOrdersEnabled = !!(license.modules && license.modules.online_orders);
            const orderConfig = (settings && settings.orderConfig) ? settings.orderConfig : {};
            const openStatus  = await checkOpeningHours();

            const now      = new Date();
            const lead     = openStatus.lead;
            const earliest = new Date(now.getTime() + lead * 60000);
            const minPickupTime = `${String(earliest.getHours()).padStart(2,'0')}:${String(earliest.getMinutes()).padStart(2,'0')}`;

            let maxPickupTime = null;
            if (openStatus.closeMin !== null) {
                const maxMin = openStatus.closeMin - openStatus.cutoff;
                if (maxMin > 0) maxPickupTime = minToHHMM(maxMin);
            }

            res.json({
                success: true,
                onlineOrdersEnabled,
                ordersEnabled:   onlineOrdersEnabled && (orderConfig.ordersEnabled  === true),
                deliveryEnabled: onlineOrdersEnabled && (orderConfig.ordersEnabled === true) && (orderConfig.deliveryEnabled === true),
                pickupEnabled:   onlineOrdersEnabled && (orderConfig.ordersEnabled === true) && (orderConfig.pickupEnabled   === true),
                dineInEnabled:   onlineOrdersEnabled && (orderConfig.ordersEnabled === true) && (orderConfig.dineInEnabled   === true),
                isOpenNow:          openStatus.open,
                closedReason:       openStatus.open ? null : openStatus.reason,
                minPickupTime,
                maxPickupTime,
                orderCutoffMinutes: openStatus.cutoff,
                pickupLeadMinutes:  openStatus.lead
            });
        } catch (e) {
            console.error('❌ cart/config error:', e.message);
            res.status(500).json({ success: false, reason: e.message });
        }
    });

    // -------------------------------------------------------------------------
    // POST /api/cart/order
    // -------------------------------------------------------------------------
    router.post('/order', requireLicense('online_orders'), async (req, res) => {
        try {
            const { type, items, phone, tableNumber, pickupTime, delivery, guestNote,
                    customerName, customerPhone, customerEmail, deliveryAddress } = req.body;

            const openStatus = await checkOpeningHours();
            if (!openStatus.open) {
                return res.status(403).json({ success: false, reason: openStatus.reason });
            }

            if (!type || !['dine_in', 'pickup', 'delivery'].includes(type)) {
                return res.status(400).json({ success: false, reason: 'Ungültiger Bestelltyp.' });
            }
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, reason: 'Warenkorb ist leer.' });
            }
            if (items.length > MAX_ITEMS_PER_ORDER) {
                return res.status(400).json({ success: false, reason: `Maximale Artikelanzahl (${MAX_ITEMS_PER_ORDER}) überschritten.` });
            }

            const cleanPhone = sanitizeText(customerPhone || phone);
            if (type !== 'delivery' && !cleanPhone) {
                return res.status(400).json({ success: false, reason: 'Bitte geben Sie eine Telefonnummer für Rückfragen an.' });
            }

            if (type === 'pickup') {
                const pickupCheck = validatePickupTime(pickupTime, openStatus);
                if (!pickupCheck.valid) {
                    return res.status(400).json({ success: false, reason: pickupCheck.reason });
                }
            }

            const settings    = await DB.getKV('settings', {});
            const orderConfig = (settings && settings.orderConfig) ? settings.orderConfig : {};
            if (!orderConfig.ordersEnabled)                        return res.status(403).json({ success: false, reason: 'Bestellsystem ist derzeit deaktiviert.' });
            if (type === 'delivery' && !orderConfig.deliveryEnabled) return res.status(403).json({ success: false, reason: 'Lieferung ist derzeit deaktiviert.' });
            if (type === 'pickup'   && !orderConfig.pickupEnabled)   return res.status(403).json({ success: false, reason: 'Abholung ist derzeit deaktiviert.' });
            if (type === 'dine_in'  && !orderConfig.dineInEnabled)   return res.status(403).json({ success: false, reason: 'Tisch-Bestellung ist derzeit deaktiviert.' });

            const menuItems = await DB.getMenu();
            const validatedItems = [];
            for (const item of items) {
                const dbItem = menuItems.find(m => m.id === item.id);
                if (!dbItem)        return res.status(400).json({ success: false, reason: `Unbekanntes Gericht: ${item.id}` });
                if (dbItem.available === false) return res.status(400).json({ success: false, reason: `Gericht nicht verfügbar: ${dbItem.name}` });
                const qty = Math.max(1, Math.min(MAX_QTY_PER_ITEM, parseInt(item.quantity, 10) || 1));
                validatedItems.push({
                    id:       dbItem.id,
                    name:     dbItem.name,
                    number:   dbItem.number || null,
                    price:    parseFloat(dbItem.price) || 0,
                    quantity: qty,
                    note:     item.note ? String(item.note).slice(0, 200) : null,
                    extras:   item.extras || null
                });
            }

            const total   = validatedItems.reduce((s, i) => s + i.price * i.quantity, 0);
            const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            const crypto = require('crypto');
            const orderToken = crypto.randomBytes(16).toString('hex');
            const order = {
                id:              orderId,
                orderToken,
                type,
                status:          'pending',
                items:           validatedItems,
                total:           parseFloat(total.toFixed(2)),
                timestamp:       new Date().toISOString(),
                customerName:    sanitizeText(customerName || '').slice(0, 80) || null,
                customerPhone:   sanitizeText(customerPhone || phone || '').slice(0, 30) || null,
                customerEmail:   sanitizeText(customerEmail || '').slice(0, 120) || null,
                deliveryAddress: type === 'delivery' ? (deliveryAddress || delivery?.address || null) : null,
                tableNumber:     type === 'dine_in'  ? (tableNumber || null) : null,
                pickupTime:      type === 'pickup'   ? (pickupTime  || null) : null,
                guestNote:       guestNote ? String(guestNote).slice(0, 500) : null,
            };

            await DB.addOrder(order);
            if (io) io.emit('new_order', order);
            console.log(`🛒 Bestellung: ${orderId} | ${type} | ${validatedItems.length} Artikel | ${total.toFixed(2)}€ | Tel: ${order.phone || 'n/a'}${type === 'pickup' ? ` | Abholung: ${pickupTime}` : ''}`);

            res.status(201).json({ success: true, orderId, orderToken, total: order.total, message: 'Bestellung wurde erfolgreich übermittelt.' });
        } catch (e) {
            console.error('❌ cart/order error:', e.message);
            res.status(500).json({ success: false, reason: e.message });
        }
    });

    return router;
};
