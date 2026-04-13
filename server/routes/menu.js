/**
 * Routes – Menu, Categories, Allergens, Additives, Import
 */
const router = require('express').Router();
const DB = require('../database.js');
const { getCurrentLicense } = require('../license.js');

/**
 * Extrahiert die saubere Domain aus dem Request.
 * Konsistent mit settings.js – verhindert FREE-Fallback durch Domain-Mismatch.
 */
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

/**
 * Gibt das Speisenlimit zuverlässig zurück.
 * Wenn ein License-Key in der DB vorhanden ist (aber Token gerade nicht verifizierbar),
 * wird das Limit aus dem gespeicherten Token-Payload (jwt.decode ohne Signaturprüfung)
 * oder aus den DB-Feldern gelesen – statt auf FREE (30) zurückzufallen.
 */
const jwt = require('jsonwebtoken');
async function getMaxDishes(DB, domain) {
    const settings = await DB.getKV('settings', {});
    const lic      = settings.license || {};

    // 1. Verifiziertes Token (Normalfall)
    const verified = await getCurrentLicense(DB, domain);
    if (verified && verified.status === 'active') {
        return verified.limits?.max_dishes ?? 999;
    }

    // 2. Fallback: Token dekodieren ohne Signaturprüfung
    if (lic.licenseToken) {
        try {
            const payload = jwt.decode(lic.licenseToken);
            if (payload?.limits?.max_dishes) {
                console.warn('⚠️  [menu/import] Token nicht verifizierbar – nutze dekodiertes Limit:', payload.limits.max_dishes);
                return payload.limits.max_dishes;
            }
        } catch (_) { /* ignore */ }
    }

    // 3. Fallback: License-Key vorhanden aber kein Token – großzügiges Limit
    if (lic.key && !lic.isTrial) {
        console.warn('⚠️  [menu/import] Kein verifizierbares Token, aber License-Key vorhanden – Limit 9999.');
        return 9999;
    }

    // 4. Trial oder keine Lizenz – Plan-Limit
    return verified.limits?.max_dishes ?? 30;
}

module.exports = (requireAuth, requireLicense) => {
    // --- Menu ---
    router.get('/menu', async (req, res) => {
        try { res.json(await DB.getMenu()); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/menu', requireAuth, requireLicense('menu_edit'), async (req, res) => {
        try {
            const domain = extractDomain(req);
            const lic = await getCurrentLicense(DB, domain);
            const maxDishes = lic.limits?.max_dishes ?? 10;
            const menu = await DB.getMenu();
            if (menu.length >= maxDishes)
                return res.status(403).json({ success: false, reason: `Ihr ${lic.label || lic.type}-Plan erlaubt maximal ${maxDishes} Speisen.` });
            const m = req.body;
            // Fix: Kompatibilitäts-Mapping falls Frontend 'nr' statt 'number' sendet
            if (typeof m.number === 'undefined' && typeof m.nr !== 'undefined') m.number = m.nr;
            m.id = m.id || Date.now().toString();
            await DB.addMenu(m);
            res.json({ success: true, id: m.id });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.put('/menu/:id', requireAuth, requireLicense('menu_edit'), async (req, res) => {
        try {
            const body = req.body;
            // Fix: Kompatibilitäts-Mapping falls Frontend 'nr' statt 'number' sendet
            if (typeof body.number === 'undefined' && typeof body.nr !== 'undefined') body.number = body.nr;
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
        try { res.json(await DB.getCategories()); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/categories', requireAuth, async (req, res) => {
        try {
            const c = req.body;
            c.id = c.id || Date.now().toString();
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
        try { res.json(await DB.getKV('allergens', {})); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });
    router.post('/allergens', requireAuth, async (req, res) => {
        try { await DB.setKV('allergens', req.body); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });
    router.get('/additives', async (req, res) => {
        try { res.json(await DB.getKV('additives', {})); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
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
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    return router;
};
