/**
 * Express Middleware – auth, license, rate limiters
 */
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getCurrentLicense, verifyLicenseToken } = require('../services/license.js');
const DB = require('../db');
const logger = require('./logger.js');
const { extractDomain } = require('../helpers.js');

const requireAuth = (ADMIN_SECRET) => (req, res, next) => {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (!token) return res.status(401).json({ success: false, reason: 'No token' });
    try {
        req.admin = jwt.verify(token, ADMIN_SECRET);
        next();
    } catch (e) {
        res.status(401).json({ success: false, reason: 'Invalid session' });
    }
};

const requireRole =
    (...roles) =>
    (req, res, next) => {
        if (!req.admin || !req.admin.role)
            return res
                .status(403)
                .json({ success: false, reason: 'Keine Berechtigung für diese Aktion.' });
        if (req.admin.role === 'admin' || roles.includes(req.admin.role)) return next();
        return res
            .status(403)
            .json({ success: false, reason: 'Keine Berechtigung für diese Aktion.' });
    };

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
        const lic = await getCurrentLicense(DB, domain);

        // Abgelaufene oder ungültige Lizenz → FREE hat keine Premium-Module
        if (lic.isExpired) {
            return res.status(403).json({
                success: false,
                reason: `Feature '${module}' gesperrt – Lizenz abgelaufen.`,
            });
        }

        const modules = lic.modules || {};
        if (!modules[module]) {
            return res.status(403).json({
                success: false,
                reason: `Feature '${module}' ist in Ihrem ${lic.label || lic.type}-Plan nicht enthalten.`,
            });
        }

        // Admin-seitige Modul-Deaktivierung prüfen
        const settings = await DB.getKV('settings', {});
        const adminEnabled = settings.enabledModules || {};
        if (adminEnabled[module] === false) {
            return res.status(403).json({
                success: false,
                reason: `Feature '${module}' wurde vom Administrator deaktiviert.`,
            });
        }

        // Lizenz-Infos für nachfolgende Handler verfügbar machen
        req.license = lic;
        next();
    } catch (e) {
        logger.error({ err: e }, 'requireLicense Fehler');
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
        const lic = await getCurrentLicense(DB, host);
        const maxDishes = lic.limits?.max_dishes ?? 10;
        const incomingItems = Array.isArray(req.body) ? req.body : [];
        if (incomingItems.length > maxDishes) {
            return res.status(403).json({
                success: false,
                reason: `Ihr ${lic.label || lic.type}-Plan erlaubt maximal ${maxDishes} Speisen. Bitte upgraden Sie Ihren Plan.`,
                limit: maxDishes,
                current: incomingItems.length,
                plan: lic.type,
            });
        }
        next();
    } catch (e) {
        logger.error({ err: e }, 'requireMenuLimit Fehler');
        res.status(500).json({ success: false, reason: 'Lizenzprüfung fehlgeschlagen.' });
    }
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, reason: 'Zu viele Login-Versuche. Bitte 15 Minuten warten.' },
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { success: false, reason: 'Zu viele Anfragen. Bitte 1 Stunde warten.' },
});

const reservationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, reason: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, reason: 'Zu viele Anfragen. Bitte kurz warten.' },
});

// Gäste-Bewertungen: öffentlich, daher Spam-Schutz pro IP
const feedbackLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { success: false, reason: 'Zu viele Bewertungen. Bitte später erneut versuchen.' },
});

// Bild-KI: externe, teils kostenpflichtige Provider (Google Imagen/Gemini).
// Strenges Limit gegen Kostenmissbrauch pro authentifiziertem Client/IP.
const imageAiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        reason: 'Zu viele Bild-KI-Anfragen. Bitte kurz warten.',
    },
});

module.exports = {
    requireAuth,
    requireRole,
    requireLicense,
    requireMenuLimit,
    loginLimiter,
    forgotPasswordLimiter,
    reservationLimiter,
    generalLimiter,
    feedbackLimiter,
    imageAiLimiter,
};
