/**
 * Routes – Users
 * GET    /api/users
 * POST   /api/users
 * PUT    /api/users/:user
 * DELETE /api/users/:user
 * POST   /api/users/:user/reset
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const DB = require('../database.js');
const Mailer = require('../mailer.js');

module.exports = (requireAuth) => {
    router.get('/', requireAuth, (req, res) => {
        const safeUsers = DB.getUsers().map(u => { const copy = { ...u }; delete copy.pass; return copy; });
        res.json(safeUsers);
    });

    router.post('/', requireAuth, async (req, res) => {
        const u = req.body;
        const existing = DB.getUsers().find(x => x.user === u.user);
        if (existing) return res.status(400).json({ success: false, reason: 'Benutzername existiert bereits.' });
        const plainPass = crypto.randomBytes(4).toString('hex');
        u.pass = await bcrypt.hash(plainPass, 10);
        u.require_password_change = 1;
        DB.addUser(u);
        if (u.email) Mailer.sendUserCredentials(u.email, u.name, u.user, plainPass, DB).catch(e => console.error(e));
        res.json({ success: true });
    });

    router.put('/:user', requireAuth, (req, res) => {
        DB.updateUser(req.params.user, req.body);
        res.json({ success: true });
    });

    router.delete('/:user', requireAuth, (req, res) => {
        if (req.params.user === req.admin.user)
            return res.status(400).json({ success: false, reason: 'Kann sich selbst nicht löschen.' });
        DB.deleteUser(req.params.user);
        res.json({ success: true });
    });

    router.post('/:user/reset', requireAuth, async (req, res) => {
        const target = DB.getUsers().find(x => x.user === req.params.user);
        if (!target) return res.status(404).json({ success: false, reason: 'Benutzer nicht gefunden.' });
        if (!target.email) return res.status(400).json({ success: false, reason: 'Benutzer hat keine E-Mail Adresse hinterlegt.' });
        const plainPass = crypto.randomBytes(4).toString('hex');
        const hashed = await bcrypt.hash(plainPass, 10);
        DB.setUserPass(target.user, hashed, true);
        Mailer.sendUserCredentials(target.email, target.name, target.user, plainPass, DB).catch(e => console.error(e));
        res.json({ success: true });
    });

    return router;
};
