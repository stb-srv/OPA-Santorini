/**
 * Routes – Orders
 * GET    /api/orders
 * POST   /api/orders
 * PUT    /api/orders/:id
 * DELETE /api/orders/:id
 */
const router = require('express').Router();
const DB = require('../database.js');
const { reservationLimiter } = require('../middleware.js');

module.exports = (requireAuth, io) => {
    router.get('/', requireAuth, (req, res) => res.json(DB.getOrders()));

    router.post('/', reservationLimiter, (req, res) => {
        const newOrder = { ...req.body, id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'pending' };
        DB.addOrder(newOrder);
        io.emit('new-order', newOrder);
        res.json({ success: true, order: newOrder });
    });

    router.put('/:id', requireAuth, (req, res) => {
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, reason: 'Status fehlt.' });
        DB.updateOrderStatus(req.params.id, status);
        const updated = DB.getOrderById(req.params.id);
        io.emit('order-updated', updated);
        res.json({ success: true, order: updated });
    });

    router.delete('/:id', requireAuth, (req, res) => {
        DB.deleteOrder(req.params.id);
        res.json({ success: true });
    });

    return router;
};
