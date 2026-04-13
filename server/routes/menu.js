/**
 * Routes – Menu, Categories, Allergens, Additives, Import
 */
const router = require('express').Router();
const DB = require('../database.js');
const { getCurrentLicense } = require('../license.js');

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

const jwt = require('jsonwebtoken');
async function getMaxDishes(DB, domain) {
    const settings = DB.getKV('settings', {});
    const lic      = (settings && settings.license) ? settings.license : {};

    let verified = null;
    try { verified = await getCurrentLicense(DB, domain); } catch (_) {}

    if (verified && verified.status === 'active') {
        return verified.limits?.max_dishes ?? 999;
    }

    if (lic.licenseToken) {
        try {
            const payload = jwt.decode(lic.licenseToken);
            if (payload?.limits?.max_dishes) {
                console.warn('\u26a0\ufe0f  [menu/import] Token nicht verifizierbar – nutze dekodiertes Limit:', payload.limits.max_dishes);
                return payload.limits.max_dishes;
            }
        } catch (_) {}
    }

    if (lic.key && !lic.isTrial) {
        console.warn('\u26a0\ufe0f  [menu/import] Kein verifizierbares Token, aber License-Key vorhanden – Limit 9999.');
        return 9999;
    }

    return verified?.limits?.max_dishes ?? 30;
}

module.exports = (requireAuth, requireLicense) => {
    // --- Menu ---
    router.get('/menu', async (req, res) => {
        try {
            const result = await DB.getMenu();
            res.json(Array.isArray(result) ? result : []);
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/menu', requireAuth, requireLicense('menu_edit'), async (req, res) => {
        try {
            const domain = extractDomain(req);
            let lic = null;
            try { lic = await getCurrentLicense(DB, domain); } catch (_) {}
            const maxDishes = lic?.limits?.max_dishes ?? 30;
            const menu = await DB.getMenu();
            if (menu.length >= maxDishes)
                return res.status(403).json({ success: false, reason: `Ihr ${lic?.label || lic?.type || 'Free'}-Plan erlaubt maximal ${maxDishes} Speisen.` });
            const m = req.body;
            // Kompatibilitäts-Mapping: 'nr' → 'number'
            if (typeof m.number === 'undefined' && typeof m.nr !== 'undefined') m.number = m.nr;
            if (typeof m.number === 'string') m.number = m.number.trim() || null;
            m.id = m.id || Date.now().toString();
            await DB.addMenu(m);
            res.json({ success: true, id: m.id });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.put('/menu/:id', requireAuth, requireLicense('menu_edit'), async (req, res) => {
        try {
            const body = req.body;
            // Kompatibilitäts-Mapping: 'nr' → 'number'
            if (typeof body.number === 'undefined' && typeof body.nr !== 'undefined') body.number = body.nr;
            if (typeof body.number === 'string') body.number = body.number.trim() || null;
            const updated = await DB.updateMenu(req.params.id, body);
            if (!updated) return res.status(404).json({ success: false, reason: 'Gericht nicht gefunden.' });
            res.json({ success: true, item: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.delete('/menu/:id', requireAuth, requireLicense('menu_edit'), async (req, res) => {
        try { await DB.deleteMenu(req.params.id); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    // --- Categories ---
    router.get('/categories', async (req, res) => {
        try {
            const result = await DB.getCategories();
            // Immer ein Array zurückgeben – verhindert null.map() im Frontend
            res.json(Array.isArray(result) ? result : []);
        } catch(e) {
            console.error('[GET /categories] Fehler:', e.message);
            res.json([]); // Kein 500 – leeres Array verhindert Frontend-Crash
        }
    });

    router.post('/categories', requireAuth, async (req, res) => {
        try {
            const c = req.body;
            if (!c.label) return res.status(400).json({ success: false, reason: 'Label erforderlich.' });
            c.id = c.id || c.label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_') || Date.now().toString();
            await DB.addCategory(c);
            res.json({ success: true, id: c.id });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.put('/categories/:id', requireAuth, async (req, res) => {
        try {
            const updated = await DB.updateCategory(req.params.id, req.body);
            if (!updated) return res.status(404).json({ success: false, reason: 'Kategorie nicht gefunden.' });
            res.json({ success: true, item: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.delete('/categories/:id', requireAuth, async (req, res) => {
        try { await DB.deleteCategory(req.params.id); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    // --- Allergens / Additives ---
    router.get('/allergens', async (req, res) => {
        try {
            const result = await DB.getKV('allergens', {});
            res.json((result && typeof result === 'object' && !Array.isArray(result)) ? result : {});
        } catch(e) { res.json({}); }
    });
    router.post('/allergens', requireAuth, async (req, res) => {
        try { await DB.setKV('allergens', req.body); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });
    router.get('/additives', async (req, res) => {
        try {
            const result = await DB.getKV('additives', {});
            res.json((result && typeof result === 'object' && !Array.isArray(result)) ? result : {});
        } catch(e) { res.json({}); }
    });
    router.post('/additives', requireAuth, async (req, res) => {
        try { await DB.setKV('additives', req.body); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    // --- Import ---
    router.post('/menu/import', requireAuth, async (req, res) => {
        try {
            const { menu, categories, allergens, additives } = req.body;
            const domain    = extractDomain(req);
            const maxDishes = await getMaxDishes(DB, domain);

            if (menu && Array.isArray(menu) && menu.length > maxDishes) {
                return res.status(403).json({
                    success: false,
                    reason: `Ihr Plan erlaubt maximal ${maxDishes} Speisen. Die Backup-Datei enthält ${menu.length} Einträge.`,
                    limit: maxDishes, current: menu.length
                });
            }
            if (menu && Array.isArray(menu))               await DB.saveMenu(menu);
            if (categories && Array.isArray(categories))   await DB.saveCategories(categories);
            if (allergens && typeof allergens === 'object') await DB.setKV('allergens', allergens);
            if (additives && typeof additives === 'object') await DB.setKV('additives', additives);
            res.json({ success: true });
        } catch(e) {
            console.error('[menu/import] Fehler:', e.message);
            res.status(500).json({ success: false, reason: e.message });
        }
    });

    return router;
};
