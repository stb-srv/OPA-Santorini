/**
 * Routes – Settings, Branding, Homepage, License, SMTP Test
 */
const router = require('express').Router();
const DB = require('../database.js');
const Mailer = require('../mailer.js');
const { getCurrentLicense, PLAN_DEFINITIONS } = require('../license.js');

module.exports = (requireAuth, requireLicense, LICENSE_SERVER) => {
    router.get('/homepage', (req, res) => {
        const settings = DB.getKV('settings', {});
        res.json({ ...DB.getKV('homepage', {}), activeModules: settings.activeModules });
    });
    router.post('/homepage', requireAuth, requireLicense('custom_design'), (req, res) => {
        DB.setKV('homepage', req.body); res.json({ success: true });
    });

    router.get('/branding', (req, res) => res.json(DB.getKV('branding', {})));
    router.post('/branding', requireAuth, (req, res) => { DB.setKV('branding', req.body); res.json({ success: true }); });

    router.get('/settings', requireAuth, (req, res) => res.json(DB.getKV('settings', {})));
    router.post('/settings', requireAuth, (req, res) => { DB.setKV('settings', req.body); res.json({ success: true }); });

    router.post('/settings/test-smtp', requireAuth, async (req, res) => {
        const target = DB.getUsers().find(u => u.user === req.admin.user);
        const toEmail = target?.email || req.body?.email;
        if (!toEmail) return res.status(400).json({ success: false, reason: 'Keine Ziel-E-Mail-Adresse gefunden. Bitte in den Benutzereinstellungen hinterlegen.' });
        try {
            await Mailer.sendTestMail(toEmail, DB);
            res.json({ success: true, sentTo: toEmail });
        } catch (e) {
            res.status(500).json({ success: false, reason: `SMTP Fehler: ${e.message}` });
        }
    });

    router.get('/license/info', requireAuth, (req, res) => {
        const host = req.headers.host || 'localhost';
        const lic = getCurrentLicense(DB, host);
        res.json({ ...lic, menu_items_used: (DB.getMenu() || []).length, trialDaysLeft: lic.trialDaysLeft, plans: PLAN_DEFINITIONS });
    });

    router.post('/license/validate', async (req, res) => {
        try {
            const host = req.headers.host || 'localhost';
            const response = await fetch(`${LICENSE_SERVER}/api/v1/validate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: req.body.key, domain: host })
            });
            const r = await response.json();
            if (r.status === 'active') {
                if (!r.token) {
                    console.error('❌ License server returned status=active but no signed token (r.token missing)!');
                    return res.status(500).json({ success: false, reason: 'Lizenzserver hat kein signiertes Token zurückgegeben. Bitte Support kontaktieren.' });
                }
                const settings = DB.getKV('settings', {});
                settings.license = {
                    key:          req.body.key,
                    licenseToken: r.token,          // ← signiertes RS256-JWT, wird von getCurrentLicense() verifiziert
                    status:       'active',
                    customer:     r.customer_name,
                    type:         r.type,
                    label:        r.plan_label,
                    expiresAt:    r.expires_at,
                    modules:      r.allowed_modules,
                    limits: {
                        max_dishes: r.limits?.max_dishes ?? r.limits?.maxDishes ?? 10,
                        max_tables: r.limits?.max_tables ?? r.limits?.maxTables ?? 5
                    }
                };
                DB.setKV('settings', settings);
                return res.json({ success: true, license: settings.license });
            }
            res.status(403).json({ success: false, reason: r.message });
        } catch (e) { res.status(500).json({ success: false, reason: 'Lizenzserver nicht erreichbar.' }); }
    });

    router.post('/license/modules', requireAuth, (req, res) => {
        const { modules } = req.body;
        if (!modules || typeof modules !== 'object') return res.status(400).json({ success: false, reason: 'Ungültige Module-Daten.' });
        const settings = DB.getKV('settings', {});
        if (!settings.license) return res.status(400).json({ success: false, reason: 'Keine Lizenz aktiv.' });
        settings.license.modules = { ...settings.license.modules, ...modules };
        DB.setKV('settings', settings);
        res.json({ success: true, modules: settings.license.modules });
    });

    return router;
};
