/**
 * Express Middleware – auth, license, rate limiters
 */
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getCurrentLicense } = require('./license.js');
const DB = require('./database.js');

const requireAuth = (ADMIN_SECRET) => (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ success: false, reason: 'No token' });
    try { req.admin = jwt.verify(token, ADMIN_SECRET); next(); }
    catch (e) { res.status(401).json({ success: false, reason: 'Invalid session' }); }
};

const requireLicense = (module) => (req, res, next) => {
    const l = DB.getKV('settings')?.license || {};
    if (!l.modules || !l.modules[module]) return res.status(403).json({ success: false, reason: `Feature '${module}' gesperrt.` });
    next();
};

const requireMenuLimit = (req, res, next) => {
    const lic = getCurrentLicense(DB);
    const maxDishes = lic.limits?.max_dishes ?? 10;
    const incomingItems = Array.isArray(req.body) ? req.body : [];
    if (incomingItems.length > maxDishes) {
        return res.status(403).json({
            success: false,
            reason: `Ihr ${lic.label || lic.type}-Plan erlaubt maximal ${maxDishes} Speisen. Bitte upgraden Sie Ihren Plan.`,
            limit: maxDishes, current: incomingItems.length, plan: lic.type
        });
    }
    next();
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { success: false, reason: 'Zu viele Login-Versuche. Bitte 15 Minuten warten.' }
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 5,
    message: { success: false, reason: 'Zu viele Anfragen. Bitte 1 Stunde warten.' }
});

const reservationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 20,
    message: { success: false, reason: 'Zu viele Anfragen. Bitte später erneut versuchen.' }
});

module.exports = { requireAuth, requireLicense, requireMenuLimit, loginLimiter, forgotPasswordLimiter, reservationLimiter };
