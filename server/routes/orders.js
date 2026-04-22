/**
 * Routes – Orders
 */
const router = require('express').Router();
const DB = require('../database.js');
const { reservationLimiter } = require('../middleware.js');
const logger = require('../logger.js');

module.exports = (requireAuth, io) => {
    router.get('/', requireAuth, async (req, res) => {
        try { res.json(await DB.getOrders()); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.post('/', reservationLimiter, async (req, res) => {
        try {
            const newOrder = { ...req.body, id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'pending' };
            await DB.addOrder(newOrder);
            io.emit('new_order', newOrder);
            res.json({ success: true, order: newOrder });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.put('/:id', requireAuth, async (req, res) => {
        try {
            const { status } = req.body;
            if (!status) return res.status(400).json({ success: false, reason: 'Status fehlt.' });
            await DB.updateOrderStatus(req.params.id, status);
            const updated = await DB.getOrderById(req.params.id);
            io.emit('order-updated', updated);
            res.json({ success: true, order: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });
    
    router.put('/:id/status', requireAuth, async (req, res) => {
        try {
            const { status } = req.body;
            if (!['new', 'preparing', 'ready', 'cancelled'].includes(status))
                return res.status(400).json({ success: false, reason: 'Ungültiger Status.' });
            const updated = await DB.updateOrderStatus(req.params.id, status);
            if (!updated) return res.status(404).json({ success: false, reason: 'Bestellung nicht gefunden.' });
            res.json({ success: true, order: updated });
        } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    router.delete('/:id', requireAuth, async (req, res) => {
        try { await DB.deleteOrder(req.params.id); res.json({ success: true }); }
        catch(e) { res.status(500).json({ success: false, reason: e.message }); }
    });

    return router;
};
