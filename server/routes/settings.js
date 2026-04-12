/**
 * Routes – Settings, Branding, Homepage, License, SMTP Test
 */
const router = require('express').Router();
const DB = require('../database.js');
const Mailer = require('../mailer.js');
const { getCurrentLicense, PLAN_DEFINITIONS, getPlan } = require('../license.js');

/**
 * Extrahiert die saubere Domain aus dem Request.
 * Wertet X-Forwarded-Host, Origin und Host-Header aus – entfernt Port.
 */
function extractDomain(req) {
    // 1) X-Forwarded-Host gesetzt durch Reverse-Proxy (nginx)?
    const forwarded = req.headers['x-forwarded-host'];
    if (forwarded) return forwarded.split(',')[0].trim().split(':')[0];

    // 2) Origin-Header (z.B. beim direkten Browser-Request)
    const origin = req.headers['origin'];
    if (origin) {
        try {
            return new URL(origin).hostname;
        } catch (_) { /* ignore */ }
    }

    // 3) Host-Header – Port abschneiden
    const host = req.headers.host || 'localhost';
    return host.split(':')[0];
}

module.exports = (requireAuth, requireLicense, LICENSE_SERVER) => {
    router.get('/homepage', async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const homepage = await DB.getKV('homepage', {});
            res.json({ ...homepage, activeModules: settings.activeModules });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });
    router.post('/homepage', requireAuth, requireLicense('custom_design'), async (req, res) => {
        try { await DB.setKV('homepage', req.body); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
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
    router.post('/settings', requireAuth, async (req, res) => {
        try { await DB.setKV('settings', req.body); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/settings/test-smtp', requireAuth, async (req, res) => {
        try {
            const users  = await DB.getUsers();
            const target = (users || []).find(u => u.user === req.admin.user);
            const toEmail = target?.email || req.body?.email;
            if (!toEmail) return res.status(400).json({ success: false, reason: 'Keine Ziel-E-Mail-Adresse gefunden. Bitte in den Benutzereinstellungen hinterlegen.' });
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
            console.log(`🔑 License validate: key=${req.body.key}, domain=${domain}`);

            const response = await fetch(`${LICENSE_SERVER}/api/v1/validate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: req.body.key, domain })
            });

            const r = await response.json();

            if (!response.ok) {
                // Lizenzserver hat 4xx/5xx zurückgegeben – Status + Grund klar ans Frontend
                console.warn(`⚠️  License server rejected (HTTP ${response.status}):`, r);
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
                    console.error('❌ License server returned status=active but no signed token!');
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
                    }
                };
                await DB.setKV('settings', settings);
                console.log(`✅ License activated: ${req.body.key} (${r.type}) for domain ${domain}`);
                return res.json({ success: true, license: settings.license });
            }

            // Lizenzserver hat HTTP 200, aber status != 'active'
            res.status(403).json({ success: false, status: r.status, reason: r.message });
        } catch (e) {
            console.error('❌ License validate error:', e.message);
            res.status(500).json({ success: false, reason: 'Lizenzserver nicht erreichbar: ' + e.message });
        }
    });

    router.post('/license/modules', requireAuth, async (req, res) => {
        try {
            const { modules } = req.body;
            if (!modules || typeof modules !== 'object') return res.status(400).json({ success: false, reason: 'Ungültige Module-Daten.' });
            const settings = await DB.getKV('settings', {});
            if (!settings.license) return res.status(400).json({ success: false, reason: 'Keine Lizenz aktiv.' });
            settings.license.modules = { ...settings.license.modules, ...modules };
            await DB.setKV('settings', settings);
            res.json({ success: true, modules: settings.license.modules });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    return router;
};
