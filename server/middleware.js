/**
 * Express Middleware – auth, license, rate limiters
 */
const jwt      = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getCurrentLicense, verifyLicenseToken } = require('./license.js');
const DB = require('./database.js');

const requireAuth = (ADMIN_SECRET) => (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ success: false, reason: 'No token' });
    try { req.admin = jwt.verify(token, ADMIN_SECRET); next(); }
    catch (e) { res.status(401).json({ success: false, reason: 'Invalid session' }); }
};

/**
 * Extrahiert die saubere Domain aus dem Request.
 * Wertet X-Forwarded-Host, Origin und Host-Header aus – entfernt Port.
 * Konsistent mit settings.js und menu.js.
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
 * requireLicense – prüft ob ein Modul in der aktuellen Lizenz aktiv ist.
 *
 * Nutzt getCurrentLicense() (identische Logik wie menu.js / settings.js)
 * statt direkt das raw JWT zu verifizieren.
 * Das verhindert falsche 403-Fehler hinter Nginx / Reverse-Proxy wenn
 * req.hostname von X-Forwarded-Host abweicht.
 *
 * Reihenfolge:
 *  1. getCurrentLicense() → liefert aufgelöste Lizenz (Trial oder Vollizenz)
 *  2. modules aus payload.allowed_modules ODER aus Plan-Definition
 *  3. Wenn Modul nicht enthalten → 403
 */
const requireLicense = (module) => async (req, res, next) => {
    try {
        const domain = extractDomain(req);
        const lic    = await getCurrentLicense(DB, domain);

        // Abgelaufene oder ungültige Lizenz → FREE hat keine Premium-Module
        if (lic.isExpired) {
            return res.status(403).json({
                success: false,
                reason: `Feature '${module}' gesperrt – Lizenz abgelaufen.`
            });
        }

        const modules = lic.modules || {};
        if (!modules[module]) {
            return res.status(403).json({
                success: false,
                reason: `Feature '${module}' ist in Ihrem ${lic.label || lic.type}-Plan nicht enthalten.`
            });
        }

        // Lizenz-Infos für nachfolgende Handler verfügbar machen
        req.license = lic;
        next();
    } catch (e) {
        console.error('requireLicense error:', e.message);
        res.status(500).json({ success: false, reason: 'Lizenzprüfung fehlgeschlagen.' });
    }
};

/**
 * requireMenuLimit – prüft Speisenlimit des aktuellen Plans.
 * Nutzt getCurrentLicense (async).
 */
const requireMenuLimit = async (req, res, next) => {
    try {
        const host = extractDomain(req);
        const lic  = await getCurrentLicense(DB, host);
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
    } catch (e) {
        console.error('requireMenuLimit error:', e.message);
        next(); // im Zweifel durchlassen
    }
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
