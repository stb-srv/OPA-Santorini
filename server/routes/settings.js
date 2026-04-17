/**
 * Routes – Settings, Branding, Homepage, License, SMTP Test
 */
const router = require('express').Router();
const DB = require('../database.js');
const Mailer = require('../mailer.js');
const { getCurrentLicense, PLAN_DEFINITIONS, getPlan } = require('../license.js');

function extractDomain(req) {
    const forwarded = req.headers['x-forwarded-host'];
    if (forwarded) return forwarded.split(',')[0].trim().split(':')[0];
    const origin = req.headers['origin'];
    if (origin) {
        try { return new URL(origin).hostname; } catch (_) {}
    }
    const host = req.headers.host || 'localhost';
    return host.split(':')[0];
}

/**
 * Tiefes Merge zweier Objekte (nur plain objects, keine Arrays).
 * Arrays werden direkt ersetzt (nicht konkateniert).
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (
            source[key] !== null &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            typeof target[key] === 'object' &&
            target[key] !== null &&
            !Array.isArray(target[key])
        ) {
            result[key] = deepMerge(target[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

module.exports = (requireAuth, requireLicense, LICENSE_SERVER) => {
    router.get('/homepage', async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const homepage = await DB.getKV('homepage', {});
            res.json({ ...homepage, activeModules: settings.activeModules });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/homepage', requireAuth, async (req, res) => {
        try {
            const { activeModules, ...homepageData } = req.body;
            await DB.setKV('homepage', homepageData);
            res.json({ success: true });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.get('/branding', async (req, res) => {
        try { res.json(await DB.getKV('branding', {})); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });
    router.post('/branding', requireAuth, async (req, res) => {
        try { await DB.setKV('branding', req.body); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.get('/settings', requireAuth, async (req, res) => {
        try { res.json(await DB.getKV('settings', {})); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    /**
     * POST /settings
     * Liest erst den aktuellen Stand aus der DB und merged tief,
     * damit Teilupdates (z.B. nur smtp) nicht andere Keys (license, reservationConfig) löschen.
     */
    router.post('/settings', requireAuth, async (req, res) => {
        try {
            const existing = await DB.getKV('settings', {});
            const merged   = deepMerge(existing, req.body);
            await DB.setKV('settings', merged);
            res.json({ success: true });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    /**
     * POST /settings/test-smtp
     * req.body.email hat Priorität – Fallback auf User-Account-Email.
     */
    router.post('/settings/test-smtp', requireAuth, async (req, res) => {
        try {
            const toEmail = req.body?.email || (await (async () => {
                const users  = await DB.getUsers();
                const target = (users || []).find(u => u.user === req.admin.user);
                return target?.email || null;
            })());

            if (!toEmail) return res.status(400).json({
                success: false,
                reason: 'Keine Ziel-E-Mail-Adresse angegeben. Bitte im Testmail-Feld eine Adresse eingeben.'
            });

            await Mailer.sendTestMail(toEmail, DB);
            res.json({ success: true, sentTo: toEmail });
        } catch (e) {
            res.status(500).json({ success: false, reason: `SMTP Fehler: ${e.message}` });
        }
    });

    router.get('/license/info', requireAuth, async (req, res) => {
        try {
            const domain = extractDomain(req);
            const lic    = await getCurrentLicense(DB, domain);
            const menu   = await DB.getMenu();
            res.json({ ...lic, menu_items_used: (menu || []).length, trialDaysLeft: lic.trialDaysLeft, plans: PLAN_DEFINITIONS });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/license/validate', async (req, res) => {
        try {
            const domain = extractDomain(req);
            console.log(`\uD83D\uDD11 License validate: key=${req.body.key}, domain=${domain}`);

            const response = await fetch(`${LICENSE_SERVER}/api/v1/validate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: req.body.key, domain })
            });

            const r = await response.json();

            if (!response.ok) {
                console.warn(`\u26a0\ufe0f  License server rejected (HTTP ${response.status}):`, r);
                return res.status(response.status).json({
                    success: false,
                    status:  r.status  || 'error',
                    reason:  r.message || 'Lizenzserver hat die Anfrage abgelehnt.',
                    debug:   { domain, licenseServer: LICENSE_SERVER }
                });
            }

            if (r.status === 'active') {
                const licenseToken = r.license_token || r.token || null;
                if (!licenseToken) {
                    console.error('\u274c License server returned status=active but no signed token!');
                    return res.status(500).json({
                        success: false,
                        reason: 'Lizenzserver hat kein signiertes Token zurückgegeben. Bitte sicherstellen dass RSA_PRIVATE_KEY auf dem Lizenzserver gesetzt ist.'
                    });
                }
                const settings = await DB.getKV('settings', {});
                const plan = getPlan(r.type);
                settings.license = {
                    key:          req.body.key,
                    licenseToken: licenseToken,
                    status:       'active',
                    customer:     r.customer_name,
                    type:         r.type || 'FREE',
                    label:        r.plan_label || plan.label,
                    expiresAt:    r.expires_at,
                    modules:      r.allowed_modules || plan.modules,
                    limits: {
                        max_dishes: r.limits?.max_dishes ?? r.limits?.maxDishes ?? plan.menu_items,
                        max_tables: r.limits?.max_tables ?? r.limits?.maxTables ?? plan.max_tables
                    },
                    lastKnownType:    r.type || 'FREE',
                    lastKnownModules: r.allowed_modules || plan.modules,
                    lastKnownLimits:  {
                        max_dishes: r.limits?.max_dishes ?? r.limits?.maxDishes ?? plan.menu_items,
                        max_tables: r.limits?.max_tables ?? r.limits?.maxTables ?? plan.max_tables
                    },
                    lastKnownAt: new Date().toISOString()
                };
                await DB.setKV('settings', settings);
                console.log(`\u2705 License activated: ${req.body.key} (${r.type}) for domain ${domain}`);
                return res.json({ success: true, license: settings.license });
            }

            res.status(403).json({ success: false, status: r.status, reason: r.message });
        } catch (e) {
            console.error('\u274c License validate error:', e.message);
            res.status(500).json({ success: false, reason: 'Lizenzserver nicht erreichbar: ' + e.message });
        }
    });

    router.post('/license/modules', requireAuth, async (req, res) => {
        try {
            const { modules } = req.body;
            if (!modules || typeof modules !== 'object') return res.status(400).json({ success: false, reason: 'Ungültige Module-Daten.' });
            const settings = await DB.getKV('settings', {});
            if (!settings.license) settings.license = {};
            settings.license.modules = { ...(settings.license.modules || {}), ...modules };
            await DB.setKV('settings', settings);
            res.json({ success: true, modules: settings.license.modules });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    return router;
};
