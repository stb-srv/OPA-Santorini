/**
 * Routes – Tables, Table Plan, Areas
 */
const router = require('express').Router();
const DB = require('../database.js');

module.exports = (requireAuth) => {
    router.get('/tables', (req, res) => res.json(DB.getTables()));
    router.post('/tables', requireAuth, (req, res) => { DB.saveTables(req.body); res.json({ success: true }); });

    router.get('/areas', (req, res) => res.json(DB.getKV('areas', [{ id:'main',name:'Gastraum' },{ id:'terrace',name:'Terrasse' }])));
    router.post('/areas', requireAuth, (req, res) => { DB.setKV('areas', req.body); res.json({ success: true }); });

    router.get('/table-plan', requireAuth, (req, res) => {
        let plan = DB.getKV('table_plan', null);
        if (!plan) {
            const dbTables = DB.getTables() || [];
            const dbAreas = DB.getKV('areas', [{ id:'main',name:'Gastraum' }]);
            plan = { areas: dbAreas.map(a => ({ id:a.id,name:a.name,icon:a.id==='terrace'?'🌿':'🏠',w:800,h:600,locked:false })), tables:{},combined:{},decors:{} };
            dbAreas.forEach(a => {
                const areaTables = dbTables.filter(t => (t.area_id||'main') === a.id);
                plan.tables[a.id] = areaTables.map((t,i) => ({ id:t.id,num:t.name,seats:t.capacity,shape:t.capacity>4?'rect-h':'square',x:50+(i%5)*120,y:50+Math.floor(i/5)*120,w:t.capacity>4?100:60,h:60 }));
            });
            DB.setKV('table_plan', plan);
        }
        res.json(plan);
    });

    router.post('/table-plan', requireAuth, (req, res) => {
        const plan = req.body;
        DB.setKV('table_plan', plan);
        const allTables = [];
        Object.keys(plan.tables||{}).forEach(areaId => {
            (plan.tables[areaId]||[]).forEach(t => { if (!t.hidden) allTables.push({ id:t.id,name:t.num,capacity:parseInt(t.seats)||2,combinable:true,active:true,area_id:areaId }); });
        });
        Object.keys(plan.combined||{}).forEach(areaId => {
            (plan.combined[areaId]||[]).forEach(c => { allTables.push({ id:'C'+c.id,name:c.num,capacity:parseInt(c.seats)||4,combinable:false,active:true,area_id:areaId }); });
        });
        DB.saveTables(allTables);
        if (plan.areas) DB.setKV('areas', plan.areas.map(a => ({ id:a.id,name:a.name })));
        res.json({ success: true });
    });

    return router;
};
