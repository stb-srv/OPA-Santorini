/**
 * Routes – Settings, Branding, Homepage, License, SMTP Test
 */
const router = require('express').Router();
const DB = require('../db');
const Mailer = require('../services/mailer.js');
const {
    getCurrentLicense,
    PLAN_DEFINITIONS,
    getPlan,
    mergeModules,
} = require('../services/license.js');
const { getLicenseKeyForFeature } = require('../registry/settings-registry.js');
const { sanitizeText, extractDomain } = require('../helpers.js');
const logger = require('../core/logger.js');
const validate = require('../validation/validate.js');
const { anyObjectSchema } = require('../validation/schemas.js');
const { requireRole } = require('../core/middleware.js');

/**
 * Tiefes Merge zweier Objekte (nur plain objects, keine Arrays).
 * Arrays werden direkt ersetzt (nicht konkateniert).
 */
// SEC: Keys die eine Prototype-Pollution ermöglichen würden, werden im
// rekursiven Merge grundsätzlich übersprungen. Da /settings & /branding
// mit .passthrough() beliebige Body-Keys durchlassen, könnte sonst ein
// Body mit "__proto__"/"constructor"/"prototype" den Object-Prototyp
// verändern.
const FORBIDDEN_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (FORBIDDEN_MERGE_KEYS.has(key)) continue;
        if (
            source[key] !== null &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            typeof target[key] === 'object' &&
            target[key] !== null &&
            !Array.isArray(target[key])
        ) {
            result[key] = deepMerge(target[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

module.exports = (requireAuth, requireLicense, LICENSE_SERVER) => {
    router.get('/homepage', async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const homepage = await DB.getKV('homepage', {});
            res.json({ ...homepage, activeModules: settings.activeModules });
        } catch (e) {
            logger.error({ err: e }, 'Settings route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    router.post(
        '/homepage',
        requireAuth,
        requireRole('admin'),
        validate(anyObjectSchema),
        async (req, res) => {
            try {
                const { activeModules, ...homepageData } = req.body;
                await DB.setKV('homepage', homepageData);
                res.json({ success: true });
            } catch (e) {
                logger.error({ err: e }, 'Settings route Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    router.get('/branding', async (req, res) => {
        try {
            res.json(await DB.getKV('branding', {}));
        } catch (e) {
            logger.error({ err: e }, 'Settings route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });
    router.post(
        '/branding',
        requireAuth,
        requireRole('admin'),
        validate(anyObjectSchema),
        async (req, res) => {
            try {
                await DB.setKV('branding', req.body);
                try {
                    if (DB.addAuditLog)
                        await DB.addAuditLog({
                            actor: req.admin?.user || null,
                            action: 'branding.update',
                            entity: 'branding',
                            entity_id: null,
                        });
                } catch (_) {}
                res.json({ success: true });
            } catch (e) {
                logger.error({ err: e }, 'Settings route Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    router.get('/settings', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            res.json(await DB.getKV('settings', {}));
        } catch (e) {
            logger.error({ err: e }, 'Settings route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    // Audit-Log (wer hat wann was geändert) – nur Admin
    router.get('/audit-log', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 100, 500);
            const log = DB.getAuditLog ? await DB.getAuditLog(limit) : [];
            res.json(Array.isArray(log) ? log : []);
        } catch (e) {
            logger.error({ err: e }, 'Audit-Log route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    /**
     * POST /settings
     * Liest erst den aktuellen Stand aus der DB und merged tief,
     * damit Teilupdates (z.B. nur smtp) nicht andere Keys (license, reservationConfig) löschen.
     */
    router.post(
        '/settings',
        requireAuth,
        requireRole('admin'),
        validate(anyObjectSchema),
        async (req, res) => {
            try {
                const existing = await DB.getKV('settings', {});
                const merged = deepMerge(existing, req.body);
                await DB.setKV('settings', merged);
                try {
                    if (DB.addAuditLog)
                        await DB.addAuditLog({
                            actor: req.admin?.user || null,
                            action: 'settings.update',
                            entity: 'settings',
                            entity_id: null,
                            detail: { keys: Object.keys(req.body || {}) },
                        });
                } catch (_) {}
                res.json({ success: true });
            } catch (e) {
                logger.error({ err: e }, 'Settings route Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    /**
     * POST /settings/test-smtp
     * req.body.email hat Priorität – Fallback auf User-Account-Email.
     */
    router.post(
        '/settings/test-smtp',
        requireAuth,
        requireRole('admin'),
        validate(anyObjectSchema),
        async (req, res) => {
            try {
                const toEmail =
                    req.body?.email ||
                    (await (async () => {
                        const users = await DB.getUsers();
                        const target = (users || []).find((u) => u.user === req.admin.user);
                        return target?.email || null;
                    })());

                if (!toEmail)
                    return res.status(400).json({
                        success: false,
                        reason: 'Keine Ziel-E-Mail-Adresse angegeben. Bitte im Testmail-Feld eine Adresse eingeben.',
                    });

                await Mailer.sendTestMail(toEmail, DB);
                res.json({ success: true, sentTo: toEmail });
            } catch (e) {
                logger.error({ err: e }, 'SMTP-Test Fehler');
                res.status(500).json({
                    success: false,
                    reason: 'SMTP-Test fehlgeschlagen. Bitte SMTP-Einstellungen prüfen.',
                });
            }
        }
    );

    router.get('/license/plans', requireAuth, requireRole('admin'), async (req, res) => {
        const CONFIG = require('../../config.js');
        const base = (CONFIG.LICENSE_SERVER_URL || 'https://licens-prod.stb-srv.de').replace(
            /\/+$/,
            ''
        );
        try {
            const r = await fetch(`${base}/api/v1/plans`, { signal: AbortSignal.timeout(8000) });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            if (!Array.isArray(data.plans)) throw new Error('Ungueltige Antwort');
            res.json({
                success: true,
                plans: data.plans,
                source: 'live',
                fetchedAt: new Date().toISOString(),
            });
        } catch (e) {
            logger.warn(
                { err: e },
                'GET /license/plans: Lizenzserver nicht erreichbar – Fallback auf Cache'
            );
            const fallback = Object.entries(PLAN_DEFINITIONS).map(([plan_id, p]) => ({
                plan_id,
                ...p,
            }));
            res.json({ success: true, plans: fallback, source: 'cache', fetchedAt: null });
        }
    });

    router.get('/license/info', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            const domain = extractDomain(req);
            const lic = await getCurrentLicense(DB, domain);
            const menu = await DB.getMenu();
            res.json({
                ...lic,
                menu_items_used: (menu || []).length,
                trialDaysLeft: lic.trialDaysLeft,
                plans: PLAN_DEFINITIONS,
            });
        } catch (e) {
            logger.error({ err: e }, 'Settings route Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    router.post(
        '/license/validate',
        requireAuth,
        requireRole('admin'),
        validate(anyObjectSchema),
        async (req, res) => {
            try {
                const domain = extractDomain(req);
                logger.info({ key: req.body.key, domain }, 'Lizenz-Validierung angefordert');

                const ENFORCED_LICENSE_SERVER = 'https://licens-prod.stb-srv.de';
                // Nutze ab hier ausschließlich ENFORCED_LICENSE_SERVER statt LICENSE_SERVER

                const response = await fetch(`${ENFORCED_LICENSE_SERVER}/api/v1/validate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ license_key: req.body.key, domain }),
                });

                const r = await response.json();

                if (!response.ok) {
                    logger.warn(
                        { status: response.status, response: r },
                        'Lizenzserver hat Anfrage abgelehnt'
                    );
                    return res.status(response.status).json({
                        success: false,
                        status: r.status || 'error',
                        reason: r.message || 'Lizenzserver hat die Anfrage abgelehnt.',
                        debug: { domain, licenseServer: ENFORCED_LICENSE_SERVER },
                    });
                }

                if (r.status === 'active') {
                    const licenseToken = r.license_token || r.token || null;
                    if (!licenseToken) {
                        logger.error(
                            'Lizenzserver gab status=active zurück, aber kein signiertes Token'
                        );
                        return res.status(500).json({
                            success: false,
                            reason: 'Lizenzserver hat kein signiertes Token zurückgegeben. Bitte sicherstellen dass RSA_PRIVATE_KEY auf dem Lizenzserver gesetzt ist.',
                        });
                    }
                    const settings = await DB.getKV('settings', {});
                    const plan = getPlan(r.type);
                    const resolvedModules = mergeModules(plan.modules, r.allowed_modules);
                    settings.license = {
                        key: req.body.key,
                        isTrial: false,
                        licenseToken: licenseToken,
                        status: 'active',
                        customer: r.customer_name,
                        type: r.type || 'FREE',
                        label: r.plan_label || plan.label,
                        expiresAt: r.expires_at,
                        modules: resolvedModules,
                        limits: {
                            max_dishes:
                                r.limits?.max_dishes ?? r.limits?.maxDishes ?? plan.menu_items,
                            max_tables:
                                r.limits?.max_tables ?? r.limits?.maxTables ?? plan.max_tables,
                        },
                        lastKnownType: r.type || 'FREE',
                        lastKnownModules: resolvedModules,
                        lastKnownLimits: {
                            max_dishes:
                                r.limits?.max_dishes ?? r.limits?.maxDishes ?? plan.menu_items,
                            max_tables:
                                r.limits?.max_tables ?? r.limits?.maxTables ?? plan.max_tables,
                        },
                        lastKnownAt: new Date().toISOString(),
                    };
                    await DB.setKV('settings', settings);
                    logger.info(
                        { key: req.body.key, type: r.type, domain },
                        'Lizenz erfolgreich aktiviert'
                    );
                    try {
                        if (DB.addAuditLog)
                            await DB.addAuditLog({
                                actor: req.admin?.user || null,
                                action: 'license.activate',
                                entity: 'license',
                                entity_id: null,
                                detail: { type: r.type, label: settings.license.label },
                            });
                    } catch (_) {}
                    return res.json({ success: true, license: settings.license });
                }

                res.status(403).json({ success: false, status: r.status, reason: r.message });
            } catch (e) {
                logger.error({ err: e }, 'Lizenz-Validierung Fehler');
                res.status(500).json({
                    success: false,
                    reason: 'Lizenzserver nicht erreichbar. Bitte später erneut versuchen.',
                });
            }
        }
    );

    router.post(
        '/settings/modules',
        requireAuth,
        requireRole('admin'),
        validate(anyObjectSchema),
        async (req, res) => {
            try {
                const { enabledModules } = req.body;
                if (!enabledModules || typeof enabledModules !== 'object') {
                    return res
                        .status(400)
                        .json({ success: false, reason: 'Ungültige Module-Daten.' });
                }

                // Lizenz prüfen: nur lizenzierte Module dürfen aktiviert werden
                const domain = extractDomain(req);
                const currentLic = await getCurrentLicense(DB, domain);
                const licModules = currentLic.modules || {};
                const blockedModules = Object.entries(enabledModules)
                    .filter(([featureId, val]) => {
                        if (val !== true) return false;
                        const licenseKey = getLicenseKeyForFeature(featureId);
                        if (licenseKey === null || licenseKey === undefined) return false;
                        return !licModules[licenseKey];
                    })
                    .map(([featureId]) => featureId);
                if (blockedModules.length > 0) {
                    return res.status(403).json({
                        success: false,
                        reason: `Folgende Features sind in Ihrem ${currentLic.label || currentLic.type}-Plan nicht enthalten: ${blockedModules.join(', ')}`,
                    });
                }

                // orders_kitchen und online_orders sind immer synchron
                if (enabledModules.orders_kitchen !== undefined) {
                    enabledModules.online_orders = enabledModules.orders_kitchen;
                }

                const settings = await DB.getKV('settings', {});
                settings.enabledModules = enabledModules;

                // Abwärtskompatibilität für das Gast-Frontend
                settings.activeModules = {
                    orders: enabledModules.orders_kitchen,
                    reservations: enabledModules.reservations,
                };
                settings.dailySpecialsEnabled = enabledModules.daily_specials;

                await DB.setKV('settings', settings);
                try {
                    if (DB.addAuditLog)
                        await DB.addAuditLog({
                            actor: req.admin?.user || null,
                            action: 'settings.modules',
                            entity: 'settings',
                            entity_id: null,
                            detail: enabledModules,
                        });
                } catch (_) {}
                res.json({ success: true, enabledModules: settings.enabledModules });
            } catch (e) {
                logger.error({ err: e }, 'POST /settings/modules Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    router.post(
        '/license/modules',
        requireAuth,
        requireRole('admin'),
        validate(anyObjectSchema),
        async (req, res) => {
            try {
                const { modules } = req.body;
                if (!modules || typeof modules !== 'object')
                    return res
                        .status(400)
                        .json({ success: false, reason: 'Ungültige Module-Daten.' });

                // Validate: only allow enabling modules that are in the current license plan
                const domain = extractDomain(req);
                const currentLic = await getCurrentLicense(DB, domain);
                const allowedByLicense = currentLic.modules || {};
                const invalidModules = Object.entries(modules)
                    .filter(([key, val]) => val === true && !allowedByLicense[key])
                    .map(([key]) => key);
                if (invalidModules.length > 0) {
                    return res.status(403).json({
                        success: false,
                        reason: `Folgende Module sind in Ihrem ${currentLic.label || currentLic.type}-Plan nicht enthalten: ${invalidModules.join(', ')}`,
                    });
                }

                const settings = await DB.getKV('settings', {});
                if (!settings.license) settings.license = {};
                settings.license.modules = { ...(settings.license.modules || {}), ...modules };
                await DB.setKV('settings', settings);
                res.json({ success: true, modules: settings.license.modules });
            } catch (e) {
                logger.error({ err: e }, 'POST /license/modules Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    return router;
};
