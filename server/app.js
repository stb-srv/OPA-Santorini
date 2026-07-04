const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const logger = require('./core/logger.js');

const DB = require('./db');
const {
    requireAuth: makeRequireAuth,
    requireLicense,
    requireRole,
    generalLimiter,
} = require('./core/middleware.js');
const { PLAN_DEFINITIONS } = require('./services/license.js');
const { version: APP_VERSION } = require('../package.json');

module.exports = function (CONFIG, io) {
    const app = express();
    app.set('trust proxy', 1);

    const ADMIN_SECRET = CONFIG.ADMIN_SECRET;
    const LICENSE_SERVER = (CONFIG.LICENSE_SERVER_URL || 'https://licens-prod.stb-srv.de').replace(
        /\/+$/,
        ''
    );
    const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
    const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');

    const requireAuth = makeRequireAuth(ADMIN_SECRET);

    // Ensure required directories exist
    [__dirname, UPLOADS_DIR, PLUGINS_DIR].forEach((d) => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    try {
        app.use(
            helmet({
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        // SEC: 'unsafe-eval' entfernt – weder das Vite-Produktions-Bundle
                        // noch die statischen Setup/Status-Seiten benötigen eval(). Das
                        // schließt die gefährlichste CSP-Lücke (dynamische Code-Ausführung).
                        scriptSrc: [
                            "'self'",
                            "'unsafe-inline'",
                            'https://cdnjs.cloudflare.com',
                            'https://cdn.jsdelivr.net',
                            'https://js.puter.com',
                        ],
                        scriptSrcAttr: ["'unsafe-inline'"],
                        styleSrc: [
                            "'self'",
                            "'unsafe-inline'",
                            'https://cdnjs.cloudflare.com',
                            'https://fonts.googleapis.com',
                        ],
                        styleSrcAttr: ["'unsafe-inline'"],
                        fontSrc: [
                            "'self'",
                            'data:',
                            'https://cdnjs.cloudflare.com',
                            'https://fonts.gstatic.com',
                        ],
                        imgSrc: [
                            "'self'",
                            'data:',
                            'blob:',
                            'https://maps.gstatic.com',
                            'https://maps.googleapis.com',
                            'https://ui-avatars.com',
                            'https://images.unsplash.com',
                            'https://images.pexels.com',
                            'https://*.puter.com',
                        ],
                        connectSrc: [
                            "'self'",
                            'ws:',
                            'wss:',
                            'https://cdnjs.cloudflare.com',
                            'https://api.unsplash.com',
                            'https://api.pexels.com',
                            'https://generativelanguage.googleapis.com',
                            'https://licens-prod.stb-srv.de',
                            'https://api.puter.com',
                            'https://*.puter.com',
                        ],
                        frameSrc: [
                            "'self'",
                            'https://maps.google.com',
                            'https://maps.googleapis.com',
                            'https://www.google.com',
                            'https://puter.com',
                            'https://*.puter.com',
                        ],
                        objectSrc: ["'none'"],
                    },
                },
                crossOriginEmbedderPolicy: false,
            })
        );
        logger.info('Helmet Security-Header aktiv.');
    } catch (e) {
        logger.warn('helmet nicht gefunden – Security-Header deaktiviert.');
    }

    const rawOrigins = CONFIG.CORS_ORIGINS || process.env.CORS_ORIGINS || '';
    const allowedOrigins = rawOrigins
        ? rawOrigins
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
        : ['http://localhost:3000', 'http://localhost:5000'];
    // SEC: Auch vor abgeschlossenem Setup keine Wildcard-CORS mehr. Die
    // Setup-Phase ist besonders sensibel (Admin-Anlage), daher werden auch
    // hier nur same-origin (kein Origin-Header) und localhost zugelassen.
    const PRE_SETUP_ORIGINS = [
        'http://localhost:5000',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5000',
        'http://127.0.0.1:5173',
    ];
    app.use(
        cors({
            origin: (origin, callback) => {
                if (!origin) return callback(null, true); // same-origin / Server-zu-Server
                if (!CONFIG.SETUP_COMPLETE) {
                    return PRE_SETUP_ORIGINS.includes(origin)
                        ? callback(null, true)
                        : callback(new Error(`CORS: Origin '${origin}' nicht erlaubt.`));
                }
                if (allowedOrigins.includes(origin)) return callback(null, true);
                return callback(new Error(`CORS: Origin '${origin}' nicht erlaubt.`));
            },
            credentials: true,
        })
    );
    app.use(express.json({ limit: '1mb' }));

    // General rate limiter — 300 req/min per IP across all API routes
    app.use('/api/', generalLimiter);

    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const ms = Date.now() - start;
            // Redact JWT tokens that may appear in ?token= query param
            const safeUrl = req.originalUrl.replace(/([?&])token=[^&]*/g, '$1token=REDACTED');
            logger.info(
                { method: req.method, url: safeUrl, status: res.statusCode, ms, ip: req.ip },
                `${req.method} ${safeUrl} ${res.statusCode} (${ms}ms)`
            );
        });
        next();
    });

    app.use((req, res, next) => {
        if (
            CONFIG.SETUP_COMPLETE ||
            req.path === '/api/setup' ||
            req.path === '/api/setup/status' ||
            req.path === '/api/setup/verify-token' ||
            req.path === '/setup' ||
            req.path.startsWith('/setup-assets')
        )
            return next();
        if (req.path.startsWith('/api/'))
            return res.status(403).json({
                success: false,
                reason: 'SETUP_REQUIRED',
                message: 'System must be configured first.',
            });
        res.redirect('/setup');
    });

    app.get('/api/health', (req, res) => {
        const failedPlugins = global._failedPlugins || [];
        res.json({
            status: failedPlugins.length > 0 ? 'degraded' : 'ok',
            version: APP_VERSION,
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            ...(failedPlugins.length > 0 && { failedPlugins }),
        });
    });
    app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));

    app.use('/api/admin', require('./routes/auth.js')(ADMIN_SECRET));
    app.use('/api/v1/setup', require('./routes/setup.js'));
    app.use('/api/users', require('./routes/users.js')(requireAuth));
    app.use('/api', require('./routes/menu.js')(requireAuth, requireLicense));
    app.use('/api/orders', require('./routes/orders.js')(requireAuth, io));
    app.use('/api/reservations', require('./routes/reservations.js')(requireAuth, requireLicense));
    app.use('/api', require('./routes/tables.js')(requireAuth));
    app.use('/api', require('./routes/settings.js')(requireAuth, requireLicense, LICENSE_SERVER));
    app.use('/api/upload', require('./routes/upload.js')(requireAuth, UPLOADS_DIR));
    app.use('/api', require('./routes/cookie.js')(requireAuth));
    app.use('/api', require('./routes/feedback.js')(requireAuth));
    app.use('/api/cart', require('./routes/cart.js')(requireLicense, io));
    app.use('/api/image-ai', requireAuth, require('./routes/image-ai.js')(requireAuth, DB));
    app.use('/api/backup', require('./routes/backup.js')(requireAuth));

    const getInstalledPlugins = () => {
        if (!fs.existsSync(PLUGINS_DIR)) return [];
        return fs
            .readdirSync(PLUGINS_DIR)
            .filter((f) => fs.statSync(path.join(PLUGINS_DIR, f)).isDirectory())
            .map((dir) => {
                try {
                    return JSON.parse(fs.readFileSync(path.join(PLUGINS_DIR, dir, 'plugin.json')));
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean);
    };

    app.get('/api/plugins', requireAuth, async (req, res) => {
        try {
            const installed = getInstalledPlugins();
            const dbPlugins = await DB.getKV('plugins', []);
            res.json(
                installed.map((p) => {
                    const dbP = dbPlugins.find((x) => x.id === p.id);
                    return { ...p, enabled: dbP ? dbP.enabled : false };
                })
            );
        } catch (e) {
            logger.error({ err: e }, 'GET /api/plugins Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    app.post('/api/plugins/toggle', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            let dbPlugins = await DB.getKV('plugins', []);
            const { id, enabled } = req.body;
            const idx = dbPlugins.findIndex((p) => p.id === id);
            if (idx > -1) dbPlugins[idx].enabled = enabled;
            else dbPlugins.push({ id, enabled });
            await DB.setKV('plugins', dbPlugins);
            res.json({ success: true });
        } catch (e) {
            logger.error({ err: e }, 'POST /api/plugins/toggle Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    app.post('/api/setup/verify-token', (req, res) => {
        if (CONFIG.SETUP_COMPLETE) return res.json({ valid: false, reason: 'Already configured' });
        const { token } = req.body;
        if (!global._setupToken)
            return res.json({ valid: false, reason: 'Kein Setup-Token aktiv.' });
        res.json({ valid: token === global._setupToken });
    });

    app.post('/api/setup', async (req, res) => {
        if (CONFIG.SETUP_COMPLETE)
            return res.status(403).json({ success: false, reason: 'Already configured' });

        const {
            setupToken,
            restaurantName,
            licenseKey,
            licenseServer,
            dbType,
            dbDetails,
            smtp,
            adminUser,
            adminPass,
            adminEmail,
            adminName,
            restaurant,
        } = req.body;

        if (!global._setupToken || setupToken !== global._setupToken) {
            return res.status(403).json({
                success: false,
                reason: 'Ungültiger Setup-Token. Sieh in der Konsole nach.',
            });
        }
        try {
            if (!adminPass || adminPass.length < 12) {
                return res.status(400).json({
                    success: false,
                    reason: 'Admin-Passwort ist erforderlich und muss mindestens 12 Zeichen lang sein.',
                });
            }
            const licenseServerUrl = (licenseServer || 'https://licens-prod.stb-srv.de').replace(
                /\/+$/,
                ''
            );
            const trialPlan = PLAN_DEFINITIONS['FREE'];
            const r = restaurant || {};
            const customerName = r.name || restaurantName || 'Trial';
            const trialLicense = {
                key:
                    'MERAKI-TRIAL-' +
                    crypto.randomBytes(4).toString('hex').toUpperCase() +
                    '-' +
                    new Date().getFullYear(),
                status: 'trial',
                customer: customerName,
                type: 'FREE',
                label: trialPlan.label,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                modules: trialPlan.modules,
                limits: { max_dishes: trialPlan.menu_items, max_tables: trialPlan.max_tables },
                isTrial: true,
            };

            const selectedDbType = (dbType || 'sqlite').toLowerCase();
            const newConfig = {
                LICENSE_SERVER_URL: licenseServerUrl,
                ADMIN_SECRET: crypto.randomBytes(32).toString('hex'),
                SMTP: smtp || {},
                DB_TYPE: selectedDbType,
                SETUP_COMPLETE: true,
            };
            if (selectedDbType === 'mysql' && dbDetails) {
                newConfig.DB_HOST = dbDetails.host || 'localhost';
                newConfig.DB_PORT = dbDetails.port || 3306;
                newConfig.DB_NAME = dbDetails.database || '';
                newConfig.DB_USER = dbDetails.user || '';
                newConfig.DB_PASS = dbDetails.password || '';
            }

            const configPath = path.join(__dirname, 'config.json');
            fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));
            Object.assign(CONFIG, newConfig);

            const settings = await DB.getKV('settings', {});
            if (licenseKey && licenseKey.trim()) {
                settings.license = { key: licenseKey.trim(), status: 'pending_validation' };
            } else {
                settings.license = trialLicense;
            }
            if (smtp && smtp.host) settings.smtp = smtp;
            await DB.setKV('settings', settings);

            const branding = await DB.getKV('branding', {});
            branding.name = customerName;
            if (r.phone) branding.phone = r.phone;
            if (r.address) branding.address = r.address;
            if (r.website) branding.website = r.website;
            if (r.lang) branding.lang = r.lang;
            if (r.timezone) branding.timezone = r.timezone;
            await DB.setKV('branding', branding);

            const finalAdminUser = adminUser || 'admin';
            const hash = await bcrypt.hash(adminPass, 12);
            const plainRecoveryCodes = [],
                hashedCodes = [];
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            for (let i = 0; i < 3; i++) {
                let code = 'MERAKI-';
                for (let j = 0; j < 4; j++) code += chars[Math.floor(Math.random() * chars.length)];
                code += '-';
                for (let j = 0; j < 4; j++) code += chars[Math.floor(Math.random() * chars.length)];
                plainRecoveryCodes.push(code);
                hashedCodes.push(await bcrypt.hash(code, 12));
            }
            await DB.addUser({
                user: finalAdminUser,
                pass: hash,
                name: adminName || 'Administrator',
                last_name: '',
                email: adminEmail || '',
                role: 'admin',
                require_password_change: 0,
                recovery_codes: hashedCodes,
            });

            global._setupToken = null;
            res.json({
                success: true,
                trial: licenseKey
                    ? { key: licenseKey.trim(), status: 'pending_validation' }
                    : trialLicense,
                message: 'Setup abgeschlossen.',
                recovery_codes: plainRecoveryCodes,
                adminUser: finalAdminUser,
                needsRestart: selectedDbType === 'mysql',
            });
        } catch (e) {
            logger.error({ err: e }, 'Setup error');
            res.status(500).json({
                success: false,
                reason: 'Setup fehlgeschlagen. Bitte Serverlogs prüfen.',
            });
        }
    });

    app.get('/api/setup/status', async (req, res) => {
        try {
            let licenseKey = null;
            if (CONFIG.SETUP_COMPLETE) {
                const settings = await DB.getKV('settings', {});
                if (settings.license && settings.license.key) licenseKey = settings.license.key;
            }
            res.json({ setupComplete: CONFIG.SETUP_COMPLETE, licenseKey });
        } catch (e) {
            res.json({ setupComplete: CONFIG.SETUP_COMPLETE, licenseKey: null });
        }
    });

    app.get('/setup', (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'web', 'public', 'setup.html'))
    );

    app.use('/plugins', express.static(PLUGINS_DIR));
    app.use(
        '/uploads',
        (req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Security-Policy', "default-src 'none'");
            res.setHeader('X-Frame-Options', 'DENY');
            next();
        },
        express.static(UPLOADS_DIR)
    );

    // ── Frontend: gebaute React-SPAs aus web/dist ausliefern ──────────────────
    // Cutover abgeschlossen: das alte Vanilla-JS-Frontend (cms/ + menu-app/)
    // wurde entfernt. Build via `npm run build:web`. Admin nutzt HashRouting
    // (/admin#/…), Gäste-Seite BrowserRouting (SPA-Fallback auf index.html).
    const DIST = path.join(__dirname, '..', 'web', 'dist');
    const DIST_READY = fs.existsSync(path.join(DIST, 'index.html'));

    if (DIST_READY) {
        // Statische Assets (gehashte JS/CSS/Fonts, favicon, logo, Brand-Bilder …)
        app.use(express.static(DIST));
        // Öffentliche Statusseite (noch nicht in React portiert)
        app.get('/status', (req, res) =>
            res.sendFile(path.join(__dirname, '..', 'public', 'status.html'))
        );
        // Admin-SPA: alle /admin-Routen liefern admin.html
        app.get(['/admin', '/admin/*'], (req, res) => res.sendFile(path.join(DIST, 'admin.html')));
        // Gäste-SPA: Fallback für alle übrigen Nicht-API-Routen
        app.get('*', (req, res, next) => {
            if (
                req.path.startsWith('/api/') ||
                req.path.startsWith('/uploads') ||
                req.path.startsWith('/plugins')
            ) {
                return next();
            }
            res.sendFile(path.join(DIST, 'index.html'));
        });
    } else {
        // web/dist fehlt – das Frontend muss gebaut werden. Es gibt kein
        // Alt-Frontend mehr als Fallback.
        logger.error('web/dist nicht gefunden – bitte `npm run build:web` ausführen.');
        app.use('/', express.static(path.join(__dirname, '..', 'public')));
        app.get('*', (req, res, next) => {
            if (
                req.path.startsWith('/api/') ||
                req.path.startsWith('/uploads') ||
                req.path.startsWith('/plugins')
            ) {
                return next();
            }
            res.status(503)
                .type('html')
                .send(
                    '<h1>Frontend nicht gebaut</h1><p>Bitte <code>npm run build:web</code> ausführen.</p>'
                );
        });
    }

    app.use((err, req, res, next) => {
        logger.error({ err, url: req.originalUrl, method: req.method }, 'Unhandled Server Error');
        res.status(err.status || 500).json({
            success: false,
            reason: 'Interner Serverfehler.',
        });
    });

    return app;
};
