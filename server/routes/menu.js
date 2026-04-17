/**
 * Routes – Menu, Categories, Allergens, Additives, Import
 *
 * SECURITY / BUGFIXES:
 *  - BUG-02: await bei DB.getKV in getMaxDishes ergänzt (MySQL-Kompatibilität)
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

/**
 * BUG-02 FIX: await ergänzt – DB.getKV ist im MySQL-Adapter async.
 * Ohne await wurde im MySQL-Betrieb immer ein leeres {} verwendet.
 */
async function getMaxDishes(DB, domain) {
    const settings = await DB.getKV('settings', {});  // FIX: await hinzugefügt
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
                console.warn('\u26a0\ufe0f  [menu/import] Token nicht verifizierbar \u2013 nutze dekodiertes Limit:', payload.limits.max_dishes);
                return payload.limits.max_dishes;
            }
        } catch (_) {}
    }

    if (lic.key && !lic.isTrial) {
        console.warn('\u26a0\ufe0f  [menu/import] Kein verifizierbares Token, aber License-Key vorhanden \u2013 Limit 9999.');
        return 9999;
    }

    return verified?.limits?.max_dishes ?? 30;
}

/**
 * Stellt sicher dass eine Kategorie (label-String) in der categories-Tabelle existiert.
 * Falls nicht, wird sie automatisch angelegt.
 */
async function ensureCategoryExists(catLabel) {
    if (!catLabel || typeof catLabel !== 'string') return;
    const label = catLabel.trim();
    if (!label) return;
    try {
        const existing = await DB.getCategories();
        const alreadyExists = Array.isArray(existing) && existing.some(
            c => (c.label || '').trim().toLowerCase() === label.toLowerCase()
        );
        if (!alreadyExists) {
            const id = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_') || Date.now().toString();
            await DB.addCategory({ id, label, icon: 'utensils', active: true, sort_order: existing.length || 0 });
            console.log(`[categories] Auto-angelegt: "${label}"`);
        }
    } catch (e) {
        console.warn('[categories] ensureCategoryExists Fehler:', e.message);
    }
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
            if (typeof m.number === 'undefined' && typeof m.nr !== 'undefined') m.number = m.nr;
            if (typeof m.number === 'string') m.number = m.number.trim() || null;
            m.id = m.id || Date.now().toString();
            // Kategorie automatisch anlegen falls noch nicht vorhanden
            if (m.cat) await ensureCategoryExists(m.cat);
            await DB.addMenu(m);
            res.json({ success: true, id: m.id });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.put('/menu/:id', requireAuth, requireLicense('menu_edit'), async (req, res) => {
        try {
            const body = req.body;
            if (typeof body.number === 'undefined' && typeof body.nr !== 'undefined') body.number = body.nr;
            if (typeof body.number === 'string') body.number = body.number.trim() || null;
            // Kategorie automatisch anlegen falls noch nicht vorhanden
            if (body.cat) await ensureCategoryExists(body.cat);
            const updated = await DB.updateMenu(req.params.id, body);
            if (!updated) return res.status(404).json({ success: false, reason: 'Gericht nicht gefunden.' });
            res.json({ success: true, item: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.delete('/menu/:id', requireAuth, requireLicense('menu_edit'), async (req, res) => {
        try { await DB.deleteMenu(req.params.id); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/menu/reorder', requireAuth, async (req, res) => {
        try {
            const { ids } = req.body; // Array von Dish-IDs in neuer Reihenfolge
            if (!Array.isArray(ids)) return res.status(400).json({ success: false });
            const menu = await DB.getMenu();
            const reordered = ids.map(id => menu.find(d => String(d.id) === String(id))).filter(Boolean);
            // Nicht enthaltene Gerichte ans Ende hängen
            menu.forEach(d => { if (!ids.includes(String(d.id))) reordered.push(d); });
            await DB.saveMenu(reordered);
            res.json({ success: true });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    // --- Categories ---
    router.get('/categories', async (req, res) => {
        try {
            // Kategorien aus der categories-Tabelle
            const dbCats = await DB.getCategories();
            const safeCats = Array.isArray(dbCats) ? dbCats : [];

            // Zusätzlich: alle cat-Werte aus der menu-Tabelle einschließen
            const menuItems = await DB.getMenu();
            const menuCatLabels = Array.isArray(menuItems)
                ? [...new Set(menuItems.map(m => (m.cat || '').trim()).filter(Boolean))]
                : [];

            const existingLabels = new Set(safeCats.map(c => (c.label || '').trim().toLowerCase()));

            // Fehlende Kategorien aus Gerichten automatisch in DB eintragen
            for (const label of menuCatLabels) {
                if (!existingLabels.has(label.toLowerCase())) {
                    try {
                        const id = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_') || Date.now().toString();
                        await DB.addCategory({ id, label, icon: 'utensils', active: true, sort_order: safeCats.length });
                        safeCats.push({ id, label, icon: 'utensils', active: 1, sort_order: safeCats.length });
                        existingLabels.add(label.toLowerCase());
                        console.log(`[categories] Migriert aus Gerichten: "${label}"`);
                    } catch (e) { /* doppelter insert – ignorieren */ }
                }
            }

            res.json(safeCats);
        } catch(e) {
            console.error('[GET /categories] Fehler:', e.message);
            res.json([]);
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
                    reason: `Ihr Plan erlaubt maximal ${maxDishes} Speisen. Die Backup-Datei enth\u00e4lt ${menu.length} Eintr\u00e4ge.`,
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
