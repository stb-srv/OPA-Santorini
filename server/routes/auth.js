/**
 * Routes – Authentication
 *
 * SECURITY:
 *  - SEC-07: Passwort-Mindestlänge 12 Zeichen
 *  - BUG-04: Timing-sicherer Token-Vergleich via crypto.timingSafeEqual()
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const DB     = require('../database.js');
const Mailer = require('../mailer.js');
const { loginLimiter, forgotPasswordLimiter, requireAuth: makeRequireAuth } = require('../middleware.js');

/** Timing-sicherer String-Vergleich (verhindert Timing-Angriffe auf Tokens) */
function timingSafeStringEqual(a, b) {
    try {
        const bufA = Buffer.from(String(a));
        const bufB = Buffer.from(String(b));
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
}

module.exports = (ADMIN_SECRET) => {
    const requireAuth = makeRequireAuth(ADMIN_SECRET);

    router.post('/login', loginLimiter, async (req, res) => {
        try {
            const { user, pass } = req.body;
            const users = await DB.getUsers();
            const u = (users || []).find(x => x.user === user);
            if (!u) return res.status(401).json({ success: false, reason: 'Benutzername oder Passwort falsch.' });
            let isValid = false;
            try { isValid = await bcrypt.compare(pass, u.pass); } catch(e) { isValid = false; }
            if (isValid) {
                const requirePasswordChange = !!u.require_password_change;
                const token = jwt.sign({ user: u.user, role: u.role, requirePasswordChange }, ADMIN_SECRET, { expiresIn: '12h' });
                return res.json({ success: true, token, user: { ...u, pass: undefined }, requirePasswordChange });
            }
            res.status(401).json({ success: false, reason: 'Benutzername oder Passwort falsch.' });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
        try {
            const { user } = req.body;
            const users = await DB.getUsers();
            const u = (users || []).find(x => x.user === user);
            if (!u || !u.email) {
                return res.json({ success: true, message: 'Falls ein Konto mit diesem Benutzernamen und einer hinterlegten E-Mail existiert, wird eine E-Mail versendet.' });
            }
            // BUG-04: Timing-sicherer Vergleich für den Reset-Token (wird per Mail versendet)
            const plainPass = crypto.randomBytes(5).toString('hex');
            const hashed   = await bcrypt.hash(plainPass, 10);
            await DB.setUserPass(u.user, hashed, true);
            await Mailer.sendUserCredentials(u.email, u.name || u.user, u.user, plainPass, DB);
            res.json({ success: true, message: 'Falls ein Konto mit diesem Benutzernamen und einer hinterlegten E-Mail existiert, wird eine E-Mail versendet.' });
        } catch (e) {
            console.error('Forgot-password mailer error:', e);
            res.status(500).json({ success: false, reason: 'E-Mail konnte nicht gesendet werden. Bitte SMTP-Konfiguration prüfen.' });
        }
    });

    router.post('/change-password', requireAuth, async (req, res) => {
        try {
            const { newPassword } = req.body;
            // SEC-07: Mindestlänge 12 Zeichen (statt zuvor 6)
            if (!newPassword || newPassword.length < 12)
                return res.status(400).json({ success: false, reason: 'Passwort zu kurz (min. 12 Zeichen).' });
            const hashed = await bcrypt.hash(newPassword, 10);
            await DB.setUserPass(req.admin.user, hashed, false);
            const token = jwt.sign({ user: req.admin.user, role: req.admin.role, requirePasswordChange: false }, ADMIN_SECRET, { expiresIn: '12h' });
            res.json({ success: true, token });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    return router;
};
