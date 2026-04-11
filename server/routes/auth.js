/**
 * Routes – Authentication
 * POST /api/admin/login
 * POST /api/admin/forgot-password
 * POST /api/admin/change-password
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const DB     = require('../database.js');
const Mailer = require('../mailer.js');
const { loginLimiter, forgotPasswordLimiter, requireAuth: makeRequireAuth } = require('../middleware.js');

module.exports = (ADMIN_SECRET) => {
    const requireAuth = makeRequireAuth(ADMIN_SECRET);

    router.post('/login', loginLimiter, async (req, res) => {
        const { user, pass } = req.body;
        const u = (DB.getUsers() || []).find(x => x.user === user);
        if (!u) return res.status(401).json({ success: false, reason: 'Benutzername oder Passwort falsch.' });
        let isValid = false;
        try { isValid = await bcrypt.compare(pass, u.pass); } catch(e) { isValid = false; }
        if (isValid) {
            const requirePasswordChange = !!u.require_password_change;
            const token = jwt.sign({ user: u.user, role: u.role, requirePasswordChange }, ADMIN_SECRET, { expiresIn: '12h' });
            return res.json({ success: true, token, user: { ...u, pass: undefined }, requirePasswordChange });
        }
        res.status(401).json({ success: false, reason: 'Benutzername oder Passwort falsch.' });
    });

    router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
        const { user } = req.body;
        const u = (DB.getUsers() || []).find(x => x.user === user);
        if (!u || !u.email) {
            return res.json({ success: true, message: 'Falls ein Konto mit diesem Benutzernamen und einer hinterlegten E-Mail existiert, wird eine E-Mail versendet.' });
        }
        try {
            const plainPass = crypto.randomBytes(5).toString('hex');
            const hashed   = await bcrypt.hash(plainPass, 10);
            DB.setUserPass(u.user, hashed, true);
            await Mailer.sendUserCredentials(u.email, u.name || u.user, u.user, plainPass, DB);
            res.json({ success: true, message: 'Falls ein Konto mit diesem Benutzernamen und einer hinterlegten E-Mail existiert, wird eine E-Mail versendet.' });
        } catch (e) {
            console.error('Forgot-password mailer error:', e);
            res.status(500).json({ success: false, reason: 'E-Mail konnte nicht gesendet werden. Bitte SMTP-Konfiguration prüfen.' });
        }
    });

    router.post('/change-password', requireAuth, async (req, res) => {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6)
            return res.status(400).json({ success: false, reason: 'Passwort zu kurz (min. 6 Zeichen).' });
        const hashed = await bcrypt.hash(newPassword, 10);
        DB.setUserPass(req.admin.user, hashed, false);
        const token = jwt.sign({ user: req.admin.user, role: req.admin.role, requirePasswordChange: false }, ADMIN_SECRET, { expiresIn: '12h' });
        res.json({ success: true, token });
    });

    return router;
};
