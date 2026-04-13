/**
 * OPA-CMS – Cart Routes
 *
 * GET  /api/cart/config   → öffentlich, keine Auth nötig
 * POST /api/cart/order    → öffentlich für Gäste, Lizenzgate online_orders
 *
 * SECURITY:
 *  - SEC-01: Preise IMMER serverseitig aus DB laden
 *  - BUG-03: Item-Limit max. 50 gegen DoS
 */

const express = require('express');
const DB      = require('../database.js');
const { getCurrentLicense } = require('../license.js');
const { sanitizeText } = require('../helpers.js');

const MAX_ITEMS_PER_ORDER     = 50;
const MAX_QTY_PER_ITEM        = 99;
const DEFAULT_CUTOFF_MINUTES  = 30; // Fallback wenn Admin nichts eingestellt hat
const MIN_PICKUP_LEAD_MINUTES = 5;  // Mindestvorlauf Abholung

/**
 * Liest orderCutoffMinutes aus den Settings (konfigurierbar im Admin).
 */
function getCutoffMinutes() {
    try {
        const settings = DB.getKV('settings', {});
        const v = parseInt((settings.orderConfig || {}).orderCutoffMinutes, 10);
        return (isNaN(v) || v < 0) ? DEFAULT_CUTOFF_MINUTES : v;
    } catch (_) {
        return DEFAULT_CUTOFF_MINUTES;
    }
}

/**
 * Prüft ob das Restaurant zum aktuellen Zeitpunkt bestellt werden kann.
 * Beachtet:
 *  - Ruhetag  → komplett gesperrt
 *  - Außerhalb der Öffnungszeiten  → gesperrt
 *  - Innerhalb der letzten <cutoff> Minuten  → gesperrt
 *
 * Rückgabe: { open, reason?, openMin?, closeMin?, openStr?, closeStr?, cutoff }
 */
function checkOpeningHours() {
    const cutoff   = getCutoffMinutes();
    const homepage = DB.getKV('homepage', {});
    const oh       = homepage.openingHours || {};
    const now      = new Date();
    const dayKey   = ['So','Mo','Di','Mi','Do','Fr','Sa'][now.getDay()];
    const dayConfig = oh[dayKey];

    // Keine Konfiguration → Restaurant gilt als offen
    if (!dayConfig) return { open: true, openMin: null, closeMin: null, cutoff };

    // Ruhetag → vollständig sperren
    if (dayConfig.closed) {
        return {
            open:   false,
            reason: `Wir haben heute (${dayKey}) Ruhetag und nehmen keine Bestellungen an.`,
            openMin: null, closeMin: null, cutoff
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
        // Vor Öffnung
        if (nowMin < openMin) {
            return {
                open:   false,
                reason: `Wir haben noch nicht geöffnet. Öffnungszeit: ${dayConfig.open} Uhr.`,
                openMin, closeMin, openStr: dayConfig.open, closeStr: dayConfig.close, cutoff
            };
        }
        // Nach Schließung
        if (nowMin > closeMin) {
            return {
                open:   false,
                reason: `Wir haben heute bereits geschlossen (ab ${dayConfig.close} Uhr).`,
                openMin, closeMin, openStr: dayConfig.open, closeStr: dayConfig.close, cutoff
            };
        }
        // Innerhalb der Cutoff-Sperrzeit vor Ladenschluss
        if (cutoff > 0 && nowMin > closeMin - cutoff) {
            const minutesLeft = closeMin - nowMin;
            return {
                open:   false,
                reason: `Bestellungen sind ${cutoff} Minuten vor Ladenschluss nicht mehr möglich. Wir schließen um ${dayConfig.close} Uhr (noch ${minutesLeft} Min.).`,
                openMin, closeMin, openStr: dayConfig.open, closeStr: dayConfig.close, cutoff
            };
        }
    }

    return { open: true, openMin, closeMin, openStr: dayConfig.open, closeStr: dayConfig.close, cutoff };
}

/**
 * Validiert die gewünschte Abholzeit:
 *  - Format HH:MM
 *  - Nicht in der Vergangenheit (+ MIN_PICKUP_LEAD_MINUTES)
 *  - Nicht nach closeMin - cutoff (damit der Koch noch genug Zeit hat)
 *  - Nicht vor openMin
 */
function validatePickupTime(pickupTime, openStatus) {
    if (!pickupTime || typeof pickupTime !== 'string') {
        return { valid: false, reason: 'Bitte eine Abholzeit angeben.' };
    }
    if (!/^([0-1]?\d|2[0-3]):[0-5]\d$/.test(pickupTime)) {
        return { valid: false, reason: 'Ungültiges Zeitformat für Abholzeit (HH:MM erwartet).' };
    }

    const now      = new Date();
    const nowMin   = now.getHours() * 60 + now.getMinutes();
    const [h, m]   = pickupTime.split(':').map(Number);
    const pickupMin = h * 60 + m;
    const cutoff   = openStatus.cutoff ?? DEFAULT_CUTOFF_MINUTES;

    // Zu früh (Vergangenheit)
    if (pickupMin < nowMin + MIN_PICKUP_LEAD_MINUTES) {
        const earliest = new Date(now.getTime() + MIN_PICKUP_LEAD_MINUTES * 60000);
        const eh = String(earliest.getHours()).padStart(2, '0');
        const em = String(earliest.getMinutes()).padStart(2, '0');
        return { valid: false, reason: `Abholzeit liegt in der Vergangenheit. Frühestmögliche Abholzeit: ${eh}:${em} Uhr.` };
    }

    // Vor Öffnung
    if (openStatus.openMin !== null && pickupMin < openStatus.openMin) {
        return { valid: false, reason: `Abholzeit liegt vor der Öffnungszeit (${openStatus.openStr} Uhr).` };
    }

    // Nach Ladenschluss abzüglich Cutoff
    if (openStatus.closeMin !== null) {
        const maxPickup = openStatus.closeMin - cutoff;
        if (pickupMin > maxPickup) {
            const mh = String(Math.floor(maxPickup / 60)).padStart(2, '0');
            const mm = String(maxPickup % 60).padStart(2, '0');
            return {
                valid:  false,
                reason: `Spätestmögliche Abholzeit ist ${mh}:${mm} Uhr (${cutoff} Min. vor Ladenschluss ${openStatus.closeStr} Uhr).`
            };
        }
    }

    return { valid: true };
}

/** Formatiert Minuten-Zahl als HH:MM */
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
            const host    = req.headers['x-forwarded-host'] || req.headers.host || null;
            const license = await getCurrentLicense(DB, host);
            const settings = await DB.getKV('settings', {});

            const onlineOrdersEnabled = !!(license.modules && license.modules.online_orders);
            const orderConfig = settings.orderConfig || {};
            const openStatus  = checkOpeningHours();

            // Früheste mögliche Abholzeit
            const now = new Date();
            const earliest = new Date(now.getTime() + MIN_PICKUP_LEAD_MINUTES * 60000);
            const minPickupTime = `${String(earliest.getHours()).padStart(2,'0')}:${String(earliest.getMinutes()).padStart(2,'0')}`;

            // Späteste mögliche Abholzeit (closeMin - cutoff)
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
                isOpenNow:       openStatus.open,
                closedReason:    openStatus.open ? null : openStatus.reason,
                minPickupTime,
                maxPickupTime,
                orderCutoffMinutes: openStatus.cutoff
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
            const { type, items, phone, tableNumber, pickupTime, delivery, guestNote } = req.body;

            // --- Öffnungszeiten + Cutoff-Prüfung (alle Bestelltypen) ---
            const openStatus = checkOpeningHours();
            if (!openStatus.open) {
                return res.status(403).json({ success: false, reason: openStatus.reason });
            }

            // --- Typ-Validierung ---
            if (!type || !['dine_in', 'pickup', 'delivery'].includes(type)) {
                return res.status(400).json({ success: false, reason: 'Ungültiger Bestelltyp.' });
            }
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, reason: 'Warenkorb ist leer.' });
            }
            if (items.length > MAX_ITEMS_PER_ORDER) {
                return res.status(400).json({ success: false, reason: `Maximale Artikelanzahl (${MAX_ITEMS_PER_ORDER}) überschritten.` });
            }

            // --- Telefonnummer (Pflicht für dine_in + pickup) ---
            const cleanPhone = sanitizeText(phone);
            if (type !== 'delivery' && !cleanPhone) {
                return res.status(400).json({ success: false, reason: 'Bitte geben Sie eine Telefonnummer für Rückfragen an.' });
            }

            // --- Abholzeit-Validierung (nur pickup) ---
            if (type === 'pickup') {
                const pickupCheck = validatePickupTime(pickupTime, openStatus);
                if (!pickupCheck.valid) {
                    return res.status(400).json({ success: false, reason: pickupCheck.reason });
                }
            }

            // --- Admin-Schalter prüfen ---
            const settings    = await DB.getKV('settings', {});
            const orderConfig = settings.orderConfig || {};
            if (!orderConfig.ordersEnabled)                   return res.status(403).json({ success: false, reason: 'Bestellsystem ist derzeit deaktiviert.' });
            if (type === 'delivery' && !orderConfig.deliveryEnabled) return res.status(403).json({ success: false, reason: 'Lieferung ist derzeit deaktiviert.' });
            if (type === 'pickup'   && !orderConfig.pickupEnabled)   return res.status(403).json({ success: false, reason: 'Abholung ist derzeit deaktiviert.' });
            if (type === 'dine_in'  && !orderConfig.dineInEnabled)   return res.status(403).json({ success: false, reason: 'Tisch-Bestellung ist derzeit deaktiviert.' });

            // --- SEC-01: Preisvalidierung aus DB ---
            const menuItems = await DB.getMenu();
            const validatedItems = [];
            for (const item of items) {
                const dbItem = menuItems.find(m => m.id === item.id);
                if (!dbItem)        return res.status(400).json({ success: false, reason: `Unbekanntes Gericht: ${item.id}` });
                if (!dbItem.active) return res.status(400).json({ success: false, reason: `Gericht nicht verfügbar: ${dbItem.name}` });
                const qty = Math.max(1, Math.min(MAX_QTY_PER_ITEM, parseInt(item.quantity, 10) || 1));
                validatedItems.push({ id: dbItem.id, name: dbItem.name, price: parseFloat(dbItem.price) || 0, quantity: qty, extras: item.extras || null });
            }

            const total   = validatedItems.reduce((s, i) => s + i.price * i.quantity, 0);
            const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            const order   = {
                id: orderId, type, status: 'new',
                items: validatedItems,
                total: parseFloat(total.toFixed(2)),
                phone:       type !== 'delivery' ? cleanPhone : (delivery?.phone ? sanitizeText(delivery.phone) : null),
                tableNumber: type === 'dine_in'  ? (tableNumber || null) : null,
                pickupTime:  type === 'pickup'   ? (pickupTime  || null) : null,
                delivery:    type === 'delivery' ? (delivery    || null) : null,
                guestNote:   guestNote ? String(guestNote).slice(0, 500) : null,
                createdAt:   new Date().toISOString()
            };

            await DB.addOrder(order);
            if (io) io.emit('new_order', order);
            console.log(`🛒 Neue Bestellung: ${orderId} | ${type} | ${validatedItems.length} Artikel | ${total.toFixed(2)} € | Tel: ${order.phone || 'n/a'}${type === 'pickup' ? ` | Abholung: ${pickupTime}` : ''}`);

            res.status(201).json({ success: true, orderId, total: order.total, message: 'Bestellung wurde erfolgreich übermittelt.' });
        } catch (e) {
            console.error('❌ cart/order error:', e.message);
            res.status(500).json({ success: false, reason: e.message });
        }
    });

    return router;
};
