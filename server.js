/**
 * OPA-CMS – Server Entry Point
 * All route logic lives in server/routes/*, helpers in server/helpers.js
 *
 * SECURITY:
 *  - SEC-06: helmet.js für Security-HTTP-Header
 *  - Upload-Pfad mit nosniff + X-Frame-Options gesichert
 */
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const logger  = require('./server/logger.js');

const CONFIG  = require('./config.js');
const DB      = require('./server/database.js');
const Mailer  = require('./server/mailer.js');
const { getCurrentLicense, PLAN_DEFINITIONS } = require('./server/license.js');
const { version: APP_VERSION } = require('./package.json');

const { requireAuth: makeRequireAuth, requireLicense, requireMenuLimit,
        loginLimiter, forgotPasswordLimiter, reservationLimiter } = require('./server/middleware.js');

const app    = express();
const server = require('http').createServer(app);
const io     = require('socket.io')(server);
app.set('trust proxy', 1);

const PORT         = CONFIG.PORT || 5000;
const ADMIN_SECRET = CONFIG.ADMIN_SECRET;
const LICENSE_SERVER = (CONFIG.LICENSE_SERVER_URL || 'https://licens-prod.stb-srv.de').replace(/\/+$/, '');
const UPLOADS_DIR  = path.join(__dirname, 'uploads');
const PLUGINS_DIR  = path.join(__dirname, 'plugins');

const requireAuth = makeRequireAuth(ADMIN_SECRET);

// Ensure required directories exist
[path.join(__dirname, 'server'), UPLOADS_DIR, PLUGINS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// --- SEC-06: Security-HTTP-Header via helmet ---
try {
    const helmet = require('helmet');
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc:      ["'self'"],
                // inline <script> Tags + eval (CMS-Admin benötigt beides)
                // cdnjs: jsPDF, jsPDF-autotable, font-awesome
                // cdn.jsdelivr.net: SortableJS (Drag & Drop)
                scriptSrc:       ["'self'", "'unsafe-inline'", "'unsafe-eval'",
                                  'https://cdnjs.cloudflare.com',
                                  'https://cdn.jsdelivr.net'],
                // Inline onclick=, onchange= etc. in HTML-Attributen
                scriptSrcAttr:   ["'unsafe-inline'"],
                // Externe Stylesheets + inline style= Attribute
                styleSrc:        ["'self'", "'unsafe-inline'",
                                  'https://cdnjs.cloudflare.com',
                                  'https://fonts.googleapis.com'],
                styleSrcAttr:    ["'unsafe-inline'"],
                // Webfonts
                fontSrc:         ["'self'", 'data:',
                                  'https://cdnjs.cloudflare.com',
                                  'https://fonts.gstatic.com'],
                // Bilder: ui-avatars.com für Admin-Avatar ergänzt
                imgSrc:          ["'self'", 'data:', 'blob:',
                                  'https://maps.gstatic.com',
                                  'https://*.googleapis.com',
                                  'https://ui-avatars.com',
                                  'https://images.unsplash.com',
                                  'https://images.pexels.com'],
                // WebSocket (Socket.IO)
                connectSrc:      ["'self'", 'ws:', 'wss:', 
                                  'https://cdnjs.cloudflare.com',
                                  'https://api.unsplash.com',
                                  'https://api.pexels.com',
                                  'https://generativelanguage.googleapis.com'],
                // Google Maps iFrame
                frameSrc:        ["'self'",
                                  'https://maps.google.com',
                                  'https://maps.googleapis.com',
                                  'https://www.google.com'],
                objectSrc:       ["'none'"],
            }
        },
        crossOriginEmbedderPolicy: false,
    }));
    logger.info('Helmet Security-Header aktiv.');
} catch (e) {
    logger.warn('helmet nicht gefunden – Security-Header deaktiviert. Bitte: npm install helmet');
}

// CORS
const rawOrigins = CONFIG.CORS_ORIGINS || process.env.CORS_ORIGINS || '';
const allowedOrigins = rawOrigins ? rawOrigins.split(',').map(o => o.trim()).filter(Boolean) : ['http://localhost:3000', 'http://localhost:5000'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const currentRaw = CONFIG.CORS_ORIGINS || process.env.CORS_ORIGINS || '';
        const currentAllowed = currentRaw ? currentRaw.split(',').map(o => o.trim()).filter(Boolean) : ['http://localhost:3000', 'http://localhost:5000'];
        if (currentAllowed.includes(origin)) return callback(null, true);
        if (!CONFIG.SETUP_COMPLETE) return callback(null, true);
        return callback(new Error(`CORS: Origin '${origin}' nicht erlaubt.`));
    },
    credentials: true
}));
app.use(express.json({ limit: '20mb' }));

// HTTP Request Logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        logger.info({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            ms,
            ip: req.ip
        }, `${req.method} ${req.originalUrl} ${res.statusCode} (${ms}ms)`);
    });
    next();
});

// Setup Wizard Guard
app.use((req, res, next) => {
    if (CONFIG.SETUP_COMPLETE || req.path === '/api/setup' || req.path === '/setup' || req.path.startsWith('/setup-assets')) return next();
    if (req.path.startsWith('/api/')) return res.status(403).json({ success: false, reason: 'SETUP_REQUIRED', message: 'System must be configured first.' });
    res.redirect('/setup');
});



// --- Mount Routes ---
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: APP_VERSION, uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() }));
app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));

app.use('/api/admin',        require('./server/routes/auth.js')(ADMIN_SECRET));
app.use('/api/users',        require('./server/routes/users.js')(requireAuth));
app.use('/api',              require('./server/routes/menu.js')(requireAuth, requireLicense));
app.use('/api/orders',       require('./server/routes/orders.js')(requireAuth, io));
app.use('/api/reservations', require('./server/routes/reservations.js')(requireAuth, requireLicense));
app.use('/api',              require('./server/routes/tables.js')(requireAuth));
app.use('/api',              require('./server/routes/settings.js')(requireAuth, requireLicense, LICENSE_SERVER));
app.use('/api/upload',       require('./server/routes/upload.js')(requireAuth, UPLOADS_DIR));
// Cookie Consent API (DSGVO)
app.use('/api',              require('./server/routes/cookie.js')(requireAuth));
app.use('/api/cart',         require('./server/routes/cart.js')(requireLicense, io));
app.use('/api/image-ai',     requireAuth, require('./server/routes/image-ai.js')(requireAuth, DB));

// Global Backup & Restore
app.use('/api/backup', requireAuth, require('./server/routes/backup.js'));

// --- Plugins ---
const getInstalledPlugins = () => {
    if (!fs.existsSync(PLUGINS_DIR)) return [];
    return fs.readdirSync(PLUGINS_DIR)
        .filter(f => fs.statSync(path.join(PLUGINS_DIR, f)).isDirectory())
        .map(dir => { try { return JSON.parse(fs.readFileSync(path.join(PLUGINS_DIR, dir, 'plugin.json'))); } catch(e) { return null; } })
        .filter(Boolean);
};

app.get('/api/plugins', requireAuth, async (req, res) => {
    try {
        const installed  = getInstalledPlugins();
        const dbPlugins  = await DB.getKV('plugins', []);
        res.json(installed.map(p => { const dbP = dbPlugins.find(x => x.id === p.id); return { ...p, enabled: dbP ? dbP.enabled : false }; }));
    } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
});

app.post('/api/plugins/toggle', requireAuth, async (req, res) => {
    try {
        let dbPlugins = await DB.getKV('plugins', []);
        const { id, enabled } = req.body;
        const idx = dbPlugins.findIndex(p => p.id === id);
        if (idx > -1) dbPlugins[idx].enabled = enabled; else dbPlugins.push({ id, enabled });
        await DB.setKV('plugins', dbPlugins);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, reason: e.message }); }
});

// --- Setup Wizard ---
app.post('/api/setup', async (req, res) => {
    if (CONFIG.SETUP_COMPLETE) return res.status(403).json({ success: false, reason: 'Already configured' });
    try {
        const { restaurantName, licenseServer, adminSecret, smtp, adminUser, adminPass, adminEmail } = req.body;

        if (adminPass && adminPass.length < 12) {
            return res.status(400).json({ success: false, reason: 'Admin-Passwort muss mindestens 12 Zeichen lang sein.' });
        }
        const licenseServerUrl = (licenseServer || 'https://licens-prod.stb-srv.de').replace(/\/+$/, '');
        const trialPlan = PLAN_DEFINITIONS['FREE'];
        const trialLicense = {
            key: 'OPA-TRIAL-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '-' + new Date().getFullYear(),
            status: 'trial', customer: restaurantName || 'Trial',
            type: 'FREE', label: trialPlan.label,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            modules: trialPlan.modules,
            limits: { max_dishes: trialPlan.menu_items, max_tables: trialPlan.max_tables },
            isTrial: true
        };
        const newConfig = { LICENSE_SERVER_URL: licenseServerUrl, ADMIN_SECRET: adminSecret || crypto.randomBytes(32).toString('hex'), SMTP: smtp || {}, SETUP_COMPLETE: true };
        const configPath = path.join(__dirname, 'server', 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));
        Object.assign(CONFIG, newConfig);
        const settings = await DB.getKV('settings', {});
        settings.license = trialLicense;
        if (smtp && smtp.host) settings.smtp = smtp;
        await DB.setKV('settings', settings);
        if (restaurantName) { const b = await DB.getKV('branding', {}); b.name = restaurantName; await DB.setKV('branding', b); }
        const finalAdminUser = adminUser || 'admin';
        const finalAdminPass = adminPass || 'admin';
        const hash = await bcrypt.hash(finalAdminPass, 10);
        const plainRecoveryCodes = [], hashedCodes = [];
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for (let i = 0; i < 3; i++) {
            let code = 'OPA-';
            for (let j=0;j<4;j++) code += chars[Math.floor(Math.random()*chars.length)];
            code += '-';
            for (let j=0;j<4;j++) code += chars[Math.floor(Math.random()*chars.length)];
            plainRecoveryCodes.push(code);
            hashedCodes.push(await bcrypt.hash(code, 10));
        }
        await DB.addUser({ user: finalAdminUser, pass: hash, name: 'Setup', last_name: 'Admin', email: adminEmail || '', role: 'admin', require_password_change: 0, recovery_codes: hashedCodes });
        res.json({ success: true, trial: trialLicense, message: 'Setup abgeschlossen.', recovery_codes: plainRecoveryCodes });
    } catch (e) {
        logger.error({ err: e }, 'Setup error');
        res.status(500).json({ success: false, reason: e.message });
    }
});
app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, 'cms', 'setup.html')));

// --- Static ---
app.use('/plugins', express.static(PLUGINS_DIR));

// SEC-06: /uploads mit zusätzlichen Sicherheits-Headern ausliefern
app.use('/uploads', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    next();
}, express.static(UPLOADS_DIR));

app.use('/admin',   express.static(path.join(__dirname, 'cms')));
app.use('/',        express.static(path.join(__dirname, 'menu-app')));

// --- Error Handler ---
app.use((err, req, res, next) => {
    logger.error({ err, url: req.originalUrl, method: req.method }, 'Unhandled Server Error');
    res.status(err.status || 500).json({ success: false, reason: err.message || 'Interner Serverfehler.' });
});

// --- Trial Expiry Job ---
setInterval(async () => {
    try {
        const settings = await DB.getKV('settings', {});
        const lic = settings.license;
        if (lic && lic.isTrial && lic.expiresAt && new Date(lic.expiresAt) < new Date() && lic.status !== 'expired') {
            logger.warn('Trial-Lizenz abgelaufen.');
            lic.status = 'expired';
            await DB.setKV('settings', settings);
        }
    } catch (e) { logger.error({ err: e }, 'Trial cleanup error'); }
}, 60 * 60 * 1000);

// --- Reservation Reminder Job (24h before at 10:00 AM) ---
const checkReminders = async () => {
    try {
        const now = new Date();
        // Nur um 10 Uhr morgens prüfen
        const nowHour = parseInt(new Intl.DateTimeFormat('de-DE', { hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin' }).format(now), 10);
        if (nowHour !== 10) return;
        
        const reservations = await DB.getReservations();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${String(tomorrow.getDate()).padStart(2,'0')}.${String(tomorrow.getMonth()+1).padStart(2,'0')}.${tomorrow.getFullYear()}`;
        
        const toRemind = reservations.filter(r => 
            r.date === tomorrowStr && 
            r.status === 'Confirmed' && 
            r.email &&
            !r.reminderSent
        );
        
        for (const r of toRemind) {
            try {
                await Mailer.sendReminder(r, DB);
                await DB.updateReservation(r.id, { reminderSent: true });
                logger.info({ reservation: r.id, name: r.name }, 'Erinnerung gesendet');
            } catch (mailErr) {
                logger.error({ err: mailErr, name: r.name }, 'Fehler beim Senden der Erinnerung');
            }
        }
    } catch(e) { logger.error({ err: e }, 'Reminder-Check Fehler'); }
};

setInterval(checkReminders, 60 * 60 * 1000); // Stündlich prüfen
checkReminders(); // Einmal beim Start


// =============================================================================
// Bootstrap: async Start (Plugin-Loader + Server-Listen)
// =============================================================================
async function start() {
    try {
        const enabledPlugins = await DB.getKV('plugins', []);
        enabledPlugins.filter(p => p.enabled).forEach(p => {
            const safeId     = path.basename(p.id);
            const serverPath = path.join(PLUGINS_DIR, safeId, 'server.js');
            if (fs.existsSync(serverPath)) {
                try {
                    const plug = require(serverPath);
                    if (typeof plug === 'function') plug(app, { DB, requireAuth, requireLicense });
                } catch(e) { logger.error({ err: e, plugin: safeId }, 'Plugin load failed'); }
            }
        });
    } catch(e) {
        logger.warn({ err: e }, 'Plugin-Loader Fehler');
    }

    server.listen(PORT, () => {
        logger.info({ version: APP_VERSION, port: PORT, licenseServer: LICENSE_SERVER, cors: allowedOrigins }, 'OPA-CMS gestartet');
    });
}

start().catch(e => {
    logger.fatal({ err: e }, 'Server-Start fehlgeschlagen');
    process.exit(1);
});
