/**
 * Routes – Reservations
 */
const router = require('express').Router();
const crypto = require('crypto');
const DB = require('../database.js');
const Mailer = require('../mailer.js');
const { reservationLimiter } = require('../middleware.js');
const { sanitizeText, calculateDuration, buildEndTime, findAvailableTables, tokenResponsePage } = require('../helpers.js');

module.exports = (requireAuth, requireLicense) => {
    router.get('/', requireAuth, (req, res) => res.json(DB.getReservations()));

    router.post('/check', reservationLimiter, (req, res) => {
        const settings = DB.getKV('settings', {});
        const { date, time, guests, areaId } = req.body;
        const duration = calculateDuration(guests, settings.reservationConfig);
        res.json(findAvailableTables(date, time, duration, guests, areaId));
    });

    router.post('/availability-grid', reservationLimiter, (req, res) => {
        const settings = DB.getKV('settings', {});
        const { date, guests, areaId, times } = req.body;
        const duration = calculateDuration(guests, settings.reservationConfig);
        const grid = {};
        times.forEach(time => {
            const result = findAvailableTables(date, time, duration, guests, areaId);
            grid[time] = { available: result.success, reason: result.success ? null : result.reason };
        });
        res.json({ success: true, grid });
    });

    router.post('/submit', reservationLimiter, requireLicense('reservations'), (req, res) => {
        const settings = DB.getKV('settings', {});
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
        const result   = findAvailableTables(date, time, duration, guests, areaId);
        if (!result.success && !rc.allowInquiry) return res.status(400).json({ success: false, reason: result.reason });
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (email && !emailRegex.test(email)) return res.status(400).json({ success: false, reason: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' });
        const status = result.success ? 'Pending' : 'Inquiry';
        const newRes = {
            id: Date.now(), token: crypto.randomBytes(32).toString('hex'),
            name, email, phone, date, time: time + ' Uhr', start_time: time,
            end_time: result.endTime || buildEndTime(time, duration),
            guests, note: note || '', status,
            assigned_tables: result.success ? result.tables : [],
            submittedAt: new Date().toISOString(),
            ip: (req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split('.').slice(0,2).join('.') + '.x.x'
        };
        DB.addReservation(newRes);
        Mailer.sendConfirmation(newRes, DB).catch(e => console.error('Mailer error:', e));
        res.json({ success: true, reservation: newRes, isInquiry: !result.success });
    });

    router.put('/:id', requireAuth, (req, res) => {
        const settings = DB.getKV('settings', {});
        const resId = parseInt(req.params.id);
        const dbRes = DB.getReservations(), old = dbRes.find(r => r.id === resId);
        if (!old) return res.status(404).json({ success: false });
        const update = req.body;
        const criticalChanged = (update.date && old.date !== update.date) ||
                                (update.start_time && old.start_time !== update.start_time) ||
                                (update.guests && old.guests != update.guests);
        if (criticalChanged) {
            const d = update.date || old.date, t = update.start_time || old.start_time, g = update.guests || old.guests;
            const duration = calculateDuration(g, settings.reservationConfig);
            const result = findAvailableTables(d, t, duration, g);
            update.assigned_tables = result.tables || [];
            update.end_time = result.endTime || buildEndTime(t, duration);
            update.time = (update.start_time || old.start_time) + ' Uhr';
            if (!result.success && old.status === 'Confirmed') update.status = 'Pending';
        }
        const updated = DB.updateReservation(resId, update);
        if (updated && update.status && update.status !== old.status)
            Mailer.sendStatusChange(updated, DB).catch(e => console.error('Status mailer error:', e));
        res.json({ success: true, reservation: updated });
    });

    router.delete('/:id', requireAuth, (req, res) => {
        DB.deleteReservation(parseInt(req.params.id));
        res.json({ success: true });
    });

    // Bulk save (Admin)
    router.post('/', requireAuth, (req, res) => {
        DB.saveReservations(req.body);
        res.json({ success: true });
    });

    // Token-based cancel/confirm (GET = HTML page for email links, POST = JSON for AJAX)
    router.get('/cancel/:token', (req, res) => {
        const r = (DB.getReservations() || []).find(x => x.token === req.params.token);
        if (!r) return res.status(404).send(tokenResponsePage(DB, 'Link ungültig', 'Dieser Link ist ungültig oder bereits abgelaufen.', '#e53e3e', '❌'));
        if (r.status === 'Cancelled') return res.send(tokenResponsePage(DB, 'Bereits storniert', 'Diese Reservierung wurde bereits storniert.', '#718096', 'ℹ️'));
        const updated = DB.updateReservation(r.id, { status: 'Cancelled' });
        if (updated) Mailer.sendStatusChange(updated, DB).catch(e => console.error(e));
        res.send(tokenResponsePage(DB, 'Reservierung storniert', `Ihre Reservierung für den <strong>${r.date}</strong> um <strong>${r.start_time} Uhr</strong> wurde erfolgreich storniert.<br><br>Wir hoffen, Sie bald wieder begrüßen zu dürfen.`, '#e53e3e', '✅'));
    });

    router.get('/confirm/:token', (req, res) => {
        const r = (DB.getReservations() || []).find(x => x.token === req.params.token);
        if (!r) return res.status(404).send(tokenResponsePage(DB, 'Link ungültig', 'Dieser Link ist ungültig oder bereits abgelaufen.', '#e53e3e', '❌'));
        if (r.status === 'Confirmed') return res.send(tokenResponsePage(DB, 'Bereits bestätigt', `Ihre Reservierung für den <strong>${r.date}</strong> um <strong>${r.start_time} Uhr</strong> ist bereits bestätigt. Wir freuen uns auf Ihren Besuch!`, '#38a169', '✅'));
        const updated = DB.updateReservation(r.id, { status: 'Confirmed' });
        if (updated) Mailer.sendStatusChange(updated, DB).catch(e => console.error(e));
        res.send(tokenResponsePage(DB, 'Reservierung bestätigt!', `Ihre Reservierung für den <strong>${r.date}</strong> um <strong>${r.start_time} Uhr</strong> für <strong>${r.guests} Person(en)</strong> ist jetzt bestätigt.<br><br>Wir freuen uns auf Ihren Besuch!`, '#38a169', '🎉'));
    });

    router.post('/cancel/:token', reservationLimiter, (req, res) => {
        const r = (DB.getReservations() || []).find(x => x.token === req.params.token);
        if (!r) return res.status(404).json({ success: false, reason: 'Ungültiger Token.' });
        if (r.status === 'Cancelled') return res.json({ success: true, alreadyCancelled: true });
        const updated = DB.updateReservation(r.id, { status: 'Cancelled' });
        if (updated) Mailer.sendStatusChange(updated, DB).catch(e => console.error(e));
        res.json({ success: true, reservation: updated });
    });

    router.post('/confirm/:token', reservationLimiter, (req, res) => {
        const r = (DB.getReservations() || []).find(x => x.token === req.params.token);
        if (!r) return res.status(404).json({ success: false, reason: 'Ungültiger Token.' });
        if (r.status === 'Confirmed') return res.json({ success: true, alreadyConfirmed: true });
        const updated = DB.updateReservation(r.id, { status: 'Confirmed' });
        if (updated) Mailer.sendStatusChange(updated, DB).catch(e => console.error(e));
        res.json({ success: true, reservation: updated });
    });

    return router;
};
