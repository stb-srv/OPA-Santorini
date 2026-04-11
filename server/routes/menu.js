/**
 * Routes – Menu, Categories, Allergens, Additives, Import
 */
const router = require('express').Router();
const DB = require('../database.js');
const { getCurrentLicense } = require('../license.js');

module.exports = (requireAuth, requireLicense) => {
    // --- Menu ---
    router.get('/menu', (req, res) => res.json(DB.getMenu()));

    router.post('/menu', requireAuth, requireLicense('menu_edit'), (req, res) => {
        const lic = getCurrentLicense(DB);
        const maxDishes = lic.limits?.max_dishes ?? 10;
        if (DB.getMenu().length >= maxDishes)
            return res.status(403).json({ success: false, reason: `Ihr ${lic.label || lic.type}-Plan erlaubt maximal ${maxDishes} Speisen.` });
        const m = req.body;
        m.id = m.id || Date.now().toString();
        DB.addMenu(m);
        res.json({ success: true, id: m.id });
    });

    router.put('/menu/:id', requireAuth, requireLicense('menu_edit'), (req, res) => {
        const updated = DB.updateMenu(req.params.id, req.body);
        if (!updated) return res.status(404).json({ success: false, reason: 'Gericht nicht gefunden.' });
        res.json({ success: true, item: updated });
    });

    router.delete('/menu/:id', requireAuth, requireLicense('menu_edit'), (req, res) => {
        DB.deleteMenu(req.params.id);
        res.json({ success: true });
    });

    // --- Categories ---
    router.get('/categories', (req, res) => res.json(DB.getCategories()));

    router.post('/categories', requireAuth, (req, res) => {
        const c = req.body;
        c.id = c.id || Date.now().toString();
        DB.addCategory(c);
        res.json({ success: true, id: c.id });
    });

    router.put('/categories/:id', requireAuth, (req, res) => {
        const updated = DB.updateCategory(req.params.id, req.body);
        if (!updated) return res.status(404).json({ success: false, reason: 'Kategorie nicht gefunden.' });
        res.json({ success: true, item: updated });
    });

    router.delete('/categories/:id', requireAuth, (req, res) => {
        DB.deleteCategory(req.params.id);
        res.json({ success: true });
    });

    // --- Allergens / Additives ---
    router.get('/allergens', (req, res) => res.json(DB.getKV('allergens', {})));
    router.post('/allergens', requireAuth, (req, res) => { DB.setKV('allergens', req.body); res.json({ success: true }); });
    router.get('/additives', (req, res) => res.json(DB.getKV('additives', {})));
    router.post('/additives', requireAuth, (req, res) => { DB.setKV('additives', req.body); res.json({ success: true }); });

    // --- Import ---
    router.post('/menu/import', requireAuth, (req, res) => {
        const { menu, categories, allergens, additives } = req.body;
        const lic = getCurrentLicense(DB);
        const maxDishes = lic.limits?.max_dishes ?? 10;
        if (menu && Array.isArray(menu) && menu.length > maxDishes) {
            return res.status(403).json({
                success: false,
                reason: `Ihr ${lic.label || lic.type}-Plan erlaubt maximal ${maxDishes} Speisen. Die Backup-Datei enthält ${menu.length} Einträge.`,
                limit: maxDishes, current: menu.length
            });
        }
        if (menu && Array.isArray(menu)) DB.saveMenu(menu);
        if (categories && Array.isArray(categories)) DB.saveCategories(categories);
        if (allergens && typeof allergens === 'object') DB.setKV('allergens', allergens);
        if (additives && typeof additives === 'object') DB.setKV('additives', additives);
        res.json({ success: true });
    });

    return router;
};
