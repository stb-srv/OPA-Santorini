/**
 * Routes – Tables, Table Plan, Areas
 */
const router = require('express').Router();
const DB = require('../db');
const validate = require('../validation/validate.js');
const { anyObjectSchema, anyArraySchema } = require('../validation/schemas.js');
const logger = require('../core/logger.js');

module.exports = (requireAuth) => {
    router.get('/tables', async (req, res) => {
        try {
            res.json(await DB.getTables());
        } catch (e) {
            logger.error({ err: e }, 'Tables route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });
    router.post('/tables', requireAuth, validate(anyArraySchema), async (req, res) => {
        try {
            await DB.saveTables(req.body);
            res.json({ success: true });
        } catch (e) {
            logger.error({ err: e }, 'Tables route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    router.get('/areas', async (req, res) => {
        try {
            res.json(
                await DB.getKV('areas', [
                    { id: 'main', name: 'Gastraum' },
                    { id: 'terrace', name: 'Terrasse' },
                ])
            );
        } catch (e) {
            logger.error({ err: e }, 'Areas route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });
    router.post('/areas', requireAuth, validate(anyArraySchema), async (req, res) => {
        try {
            await DB.setKV('areas', req.body);
            res.json({ success: true });
        } catch (e) {
            logger.error({ err: e }, 'Areas route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    router.get('/table-plan', requireAuth, async (req, res) => {
        try {
            let plan = await DB.getKV('table_plan', null);
            if (!plan) {
                const dbTables = (await DB.getTables()) || [];
                const dbAreas = await DB.getKV('areas', [{ id: 'main', name: 'Gastraum' }]);
                plan = {
                    areas: dbAreas.map((a) => ({
                        id: a.id,
                        name: a.name,
                        icon: a.id === 'terrace' ? '🌿' : '🏠',
                        w: 800,
                        h: 600,
                        locked: false,
                    })),
                    tables: {},
                    combined: {},
                    decors: {},
                };
                dbAreas.forEach((a) => {
                    const areaTables = dbTables.filter((t) => (t.area_id || 'main') === a.id);
                    plan.tables[a.id] = areaTables.map((t, i) => ({
                        id: t.id,
                        num: t.name,
                        seats: t.capacity,
                        shape: t.capacity > 4 ? 'rect-h' : 'square',
                        x: 50 + (i % 5) * 120,
                        y: 50 + Math.floor(i / 5) * 120,
                        w: t.capacity > 4 ? 100 : 60,
                        h: 60,
                    }));
                });
                await DB.setKV('table_plan', plan);
            }
            res.json(plan);
        } catch (e) {
            logger.error({ err: e }, 'Table-Plan route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    router.post('/table-plan', requireAuth, validate(anyObjectSchema), async (req, res) => {
        try {
            const plan = req.body;
            await DB.setKV('table_plan', plan);
            const allTables = [];
            Object.keys(plan.tables || {}).forEach((areaId) => {
                (plan.tables[areaId] || []).forEach((t) => {
                    if (!t.hidden)
                        allTables.push({
                            id: t.id,
                            name: t.num,
                            capacity: parseInt(t.seats) || 2,
                            combinable: true,
                            active: true,
                            area_id: areaId,
                        });
                });
            });
            Object.keys(plan.combined || {}).forEach((areaId) => {
                (plan.combined[areaId] || []).forEach((c) => {
                    allTables.push({
                        id: 'C' + c.id,
                        name: c.num,
                        capacity: parseInt(c.seats) || 4,
                        combinable: false,
                        active: true,
                        area_id: areaId,
                    });
                });
            });
            await DB.saveTables(allTables);
            if (plan.areas)
                await DB.setKV(
                    'areas',
                    plan.areas.map((a) => ({ id: a.id, name: a.name }))
                );
            res.json({ success: true });
        } catch (e) {
            logger.error({ err: e }, 'Table-Plan route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    return router;
};
