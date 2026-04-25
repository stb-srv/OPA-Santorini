/**
 * Routes – Reservations
 *
 * SECURITY:
 *  - BUG-04: Timing-sicherer Token-Vergleich via crypto.timingSafeEqual()
 */
const router = require('express').Router();
const crypto = require('crypto');
const DB = require('../database.js');
const Mailer = require('../mailer.js');
const { reservationLimiter } = require('../middleware.js');
const logger = require('../logger.js');
const { sanitizeText, calculateDuration, buildEndTime, findAvailableTables, tokenResponsePage } = require('../helpers.js');

/**
 * Timing-sicherer Token-Vergleich.
 * Verhindert Timing-Angriffe die ermöglichen würden gültige Tokens zu erraten.
 */
function findReservationByToken(reservations, token) {
    if (!token || typeof token !== 'string') return null;
    const tokenBuf = Buffer.from(token);
    return (reservations || []).find(x => {
        if (!x.token || typeof x.token !== 'string') return false;
        try {
            const xBuf = Buffer.from(x.token);
            // Längen müssen identisch sein für timingSafeEqual
            if (xBuf.length !== tokenBuf.length) return false;
            return crypto.timingSafeEqual(xBuf, tokenBuf);
        } catch {
            return false;
        }
    }) || null;
}

module.exports = (requireAuth, requireLicense) => {
    router.get('/', requireAuth, async (req, res) => {
        try { res.json(await DB.getReservations()); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/check', reservationLimiter, async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const { date, time, guests, areaId } = req.body;
            const duration = calculateDuration(guests, settings.reservationConfig);
            res.json(await findAvailableTables(date, time, duration, guests, areaId));
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/availability-grid', reservationLimiter, async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const { date, guests, areaId, times } = req.body;
            const duration = calculateDuration(guests, settings.reservationConfig);
            const grid = {};
            for (const time of times) {
                const result = await findAvailableTables(date, time, duration, guests, areaId);
                grid[time] = { available: result.success, reason: result.success ? null : result.reason };
            }
            res.json({ success: true, grid });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/submit', reservationLimiter, requireLicense('reservations'), async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const rc = settings.reservationConfig || { allowInquiry: true };
            const name   = sanitizeText(req.body.name),
                  email  = sanitizeText(req.body.email),
                  phone  = sanitizeText(req.body.phone),
                  date   = sanitizeText(req.body.date),
                  time   = sanitizeText(req.body.time),
                  guests = parseInt(req.body.guests) || 1,
                  note   = sanitizeText(req.body.note),
                  areaId = sanitizeText(req.body.areaId);
            const duration = calculateDuration(guests, settings.reservationConfig);
            const result   = await findAvailableTables(date, time, duration, guests, areaId);
            if (!result.success && !rc.allowInquiry) return res.status(400).json({ success: false, reason: result.reason });
            // Länge begrenzen + einfache Struktur-Prüfung (kein catastrophic backtracking)
            const emailValid = (e) => {
                if (!e || e.length > 254) return false;
                const at = e.lastIndexOf('@');
                if (at < 1 || at === e.length - 1) return false;
                const domain = e.slice(at + 1);
                return domain.includes('.') && domain.length <= 253;
            };

            if (email && !emailValid(email)) {
                return res.status(400).json({ success: false, reason: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' });
            }
            const status = result.success ? 'Pending' : 'Inquiry';
            const newRes = {
                id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('hex'),
                name, email, phone, date, time: time + ' Uhr', start_time: time,
                end_time: result.endTime || buildEndTime(time, duration),
                guests, note: note || '', status,
                assigned_tables: result.success ? result.tables : [],
                submittedAt: new Date().toISOString(),
                ip: (req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split('.').slice(0,2).join('.') + '.x.x'
            };
            // Race Condition Guard: nochmalige Prüfung direkt vor dem Speichern
            const doubleCheck = await DB.getReservations();
            const slotTaken = doubleCheck.some(r =>
                r.date === date &&
                r.start_time === time &&
                r.areaId === areaId &&
                r.status.toLowerCase() !== 'cancelled'
            );
            if (slotTaken) {
                return res.status(409).json({ success: false, reason: 'Dieser Zeitslot wurde soeben von jemand anderem gebucht. Bitte wähle einen anderen.' });
            }

            await DB.addReservation(newRes);
            Mailer.sendConfirmation(newRes, DB).catch(e => logger.error({ err: e }, 'Mailer Fehler'));
            res.json({ success: true, reservation: newRes, isInquiry: !result.success });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.put('/:id', requireAuth, async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const resId = req.params.id;
            const dbRes = await DB.getReservations();
            const old = dbRes.find(r => r.id === resId);
            if (!old) return res.status(404).json({ success: false });
            const update = req.body;
            const criticalChanged = (update.date && old.date !== update.date) ||
                                    (update.start_time && old.start_time !== update.start_time) ||
                                    (update.guests && old.guests != update.guests);
            if (criticalChanged) {
                const d = update.date || old.date, t = update.start_time || old.start_time, g = update.guests || old.guests;
                const duration = calculateDuration(g, settings.reservationConfig);
                const result = await findAvailableTables(d, t, duration, g);
                update.assigned_tables = result.tables || [];
                update.end_time = result.endTime || buildEndTime(t, duration);
                update.time = (update.start_time || old.start_time) + ' Uhr';
                if (!result.success && old.status === 'Confirmed') update.status = 'Pending';
            }
            const updated = await DB.updateReservation(resId, update);
            if (updated && update.status && update.status !== old.status)
                Mailer.sendStatusChange(updated, DB).catch(e => logger.error({ err: e }, 'Status Mailer Fehler'));
            res.json({ success: true, reservation: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.delete('/:id', requireAuth, async (req, res) => {
        try { await DB.deleteReservation(req.params.id); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/', requireAuth, async (req, res) => {
        try {
            if (!Array.isArray(req.body)) 
                return res.status(400).json({ success: false, reason: 'Array erwartet.' });
            if (req.body.length === 0) 
                return res.status(400).json({ success: false, reason: 'Leeres Array nicht erlaubt.' });
            await DB.saveReservations(req.body);
            res.json({ success: true });
        }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.get('/cancel/:token', async (req, res) => {
        try {
            const reservations = await DB.getReservations();
            const r = findReservationByToken(reservations, req.params.token);
            if (!r) return res.status(404).send(await tokenResponsePage(DB, 'Link ungültig', 'Dieser Link ist ungültig oder bereits abgelaufen.', '#e53e3e', '❌'));
            if (r.status === 'Cancelled') return res.send(await tokenResponsePage(DB, 'Bereits storniert', 'Diese Reservierung wurde bereits storniert.', '#718096', 'ℹ️'));
            const updated = await DB.updateReservation(r.id, { status: 'Cancelled' });
            if (updated) Mailer.sendStatusChange(updated, DB).catch(e => logger.error({ err: e }, 'Status Mailer Fehler (Stornierung)'));
            res.send(await tokenResponsePage(DB, 'Reservierung storniert', `Ihre Reservierung für den <strong>${r.date}</strong> um <strong>${r.start_time} Uhr</strong> wurde erfolgreich storniert.<br><br>Wir hoffen, Sie bald wieder begrüßen zu dürfen.`, '#e53e3e', '✅'));
        } catch(e) { res.status(500).send('Interner Fehler.'); }
    });

    router.get('/confirm/:token', async (req, res) => {
        try {
            const reservations = await DB.getReservations();
            const r = findReservationByToken(reservations, req.params.token);
            if (!r) return res.status(404).send(await tokenResponsePage(DB, 'Link ungültig', 'Dieser Link ist ungültig oder bereits abgelaufen.', '#e53e3e', '❌'));
            if (r.status === 'Confirmed') return res.send(await tokenResponsePage(DB, 'Bereits bestätigt', `Ihre Reservierung für den <strong>${r.date}</strong> um <strong>${r.start_time} Uhr</strong> ist bereits bestätigt. Wir freuen uns auf Ihren Besuch!`, '#38a169', '✅'));
            const updated = await DB.updateReservation(r.id, { status: 'Confirmed' });
            if (updated) Mailer.sendStatusChange(updated, DB).catch(e => logger.error({ err: e }, 'Status Mailer Fehler (Bestätigung)'));
            res.send(await tokenResponsePage(DB, 'Reservierung bestätigt!', `Ihre Reservierung für den <strong>${r.date}</strong> um <strong>${r.start_time} Uhr</strong> für <strong>${r.guests} Person(en)</strong> ist jetzt bestätigt.<br><br>Wir freuen uns auf Ihren Besuch!`, '#38a169', '🎉'));
        } catch(e) { res.status(500).send('Interner Fehler.'); }
    });

    router.post('/cancel/:token', reservationLimiter, async (req, res) => {
        try {
            const reservations = await DB.getReservations();
            const r = findReservationByToken(reservations, req.params.token);
            if (!r) return res.status(404).json({ success: false, reason: 'Ungültiger Token.' });
            if (r.status === 'Cancelled') return res.json({ success: true, alreadyCancelled: true });
            const updated = await DB.updateReservation(r.id, { status: 'Cancelled' });
            if (updated) Mailer.sendStatusChange(updated, DB).catch(e => logger.error({ err: e }, 'Status Mailer Fehler (API Stornierung)'));
            res.json({ success: true, reservation: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/confirm/:token', reservationLimiter, async (req, res) => {
        try {
            const reservations = await DB.getReservations();
            const r = findReservationByToken(reservations, req.params.token);
            if (!r) return res.status(404).json({ success: false, reason: 'Ungültiger Token.' });
            if (r.status === 'Confirmed') return res.json({ success: true, alreadyConfirmed: true });
            const updated = await DB.updateReservation(r.id, { status: 'Confirmed' });
            if (updated) Mailer.sendStatusChange(updated, DB).catch(e => logger.error({ err: e }, 'Status Mailer Fehler (API Bestätigung)'));
            res.json({ success: true, reservation: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    return router;
};
