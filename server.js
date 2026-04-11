/**
 * OPA-CMS – Server Entry Point
 * All route logic lives in server/routes/*, helpers in server/helpers.js
 */
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

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

// Ensure required directories exist
[path.join(__dirname, 'server'), UPLOADS_DIR, PLUGINS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

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
app.use(express.json());

// Setup Wizard Guard
app.use((req, res, next) => {
    if (CONFIG.SETUP_COMPLETE || req.path === '/api/setup' || req.path === '/setup' || req.path.startsWith('/setup-assets')) return next();
    if (req.path.startsWith('/api/')) return res.status(403).json({ success: false, reason: 'SETUP_REQUIRED', message: 'System must be configured first.' });
    res.redirect('/setup');
});

// Build requireAuth with current ADMIN_SECRET
const requireAuth = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ success: false, reason: 'No token' });
    try { req.admin = jwt.verify(token, ADMIN_SECRET); next(); }
    catch (e) { res.status(401).json({ success: false, reason: 'Invalid session' }); }
};

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

// --- Plugins ---
const getInstalledPlugins = () => {
    if (!fs.existsSync(PLUGINS_DIR)) return [];
    return fs.readdirSync(PLUGINS_DIR)
        .filter(f => fs.statSync(path.join(PLUGINS_DIR, f)).isDirectory())
        .map(dir => { try { return JSON.parse(fs.readFileSync(path.join(PLUGINS_DIR, dir, 'plugin.json'))); } catch(e) { return null; } })
        .filter(Boolean);
};
app.get('/api/plugins', requireAuth, (req, res) => {
    const installed = getInstalledPlugins(), dbPlugins = DB.getKV('plugins', []);
    res.json(installed.map(p => { const dbP = dbPlugins.find(x => x.id === p.id); return { ...p, enabled: dbP ? dbP.enabled : false }; }));
});
app.post('/api/plugins/toggle', requireAuth, (req, res) => {
    let dbPlugins = DB.getKV('plugins', []);
    const { id, enabled } = req.body;
    const idx = dbPlugins.findIndex(p => p.id === id);
    if (idx > -1) dbPlugins[idx].enabled = enabled; else dbPlugins.push({ id, enabled });
    DB.setKV('plugins', dbPlugins); res.json({ success: true });
});
DB.getKV('plugins', []).filter(p => p.enabled).forEach(p => {
    const safeId = path.basename(p.id);
    const serverPath = path.join(PLUGINS_DIR, safeId, 'server.js');
    if (fs.existsSync(serverPath)) {
        try { const plug = require(serverPath); if (typeof plug === 'function') plug(app, { DB, requireAuth, requireLicense }); }
        catch(e) { console.error(`❌ Plugin load failed (${safeId}):`, e); }
    }
});

// --- Setup Wizard ---
app.post('/api/setup', async (req, res) => {
    if (CONFIG.SETUP_COMPLETE) return res.status(403).json({ success: false, reason: 'Already configured' });
    try {
        const { restaurantName, licenseServer, adminSecret, smtp, adminUser, adminPass, adminEmail } = req.body;
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
        const settings = DB.getKV('settings', {});
        settings.license = trialLicense;
        if (smtp && smtp.host) settings.smtp = smtp;
        DB.setKV('settings', settings);
        if (restaurantName) { const b = DB.getKV('branding', {}); b.name = restaurantName; DB.setKV('branding', b); }
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
        DB.addUser({ user: finalAdminUser, pass: hash, name: 'Setup', last_name: 'Admin', email: adminEmail || '', role: 'admin', require_password_change: 0, recovery_codes: hashedCodes });
        res.json({ success: true, trial: trialLicense, message: 'Setup abgeschlossen.', recovery_codes: plainRecoveryCodes });
    } catch (e) {
        console.error(`❌ Setup error:`, e);
        res.status(500).json({ success: false, reason: e.message });
    }
});
app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, 'cms', 'setup.html')));

// --- Static ---
app.use('/plugins', express.static(PLUGINS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/admin',   express.static(path.join(__dirname, 'cms')));
app.use('/',        express.static(path.join(__dirname, 'menu-app')));

// --- Error Handler ---
app.use((err, req, res, next) => {
    console.error(`❌ [${new Date().toISOString()}] Server Error:`, err.message || err);
    res.status(err.status || 500).json({ success: false, reason: err.message || 'Interner Serverfehler.' });
});

// --- Trial Expiry Job ---
setInterval(() => {
    try {
        const settings = DB.getKV('settings', {});
        const lic = settings.license;
        if (lic && lic.isTrial && lic.expiresAt && new Date(lic.expiresAt) < new Date() && lic.status !== 'expired') {
            console.log(`⏰ Trial license expired.`);
            lic.status = 'expired';
            DB.setKV('settings', settings);
        }
    } catch (e) { console.error('Trial cleanup error:', e.message); }
}, 60 * 60 * 1000);

server.listen(PORT, () => {
    console.log(`\n🚀 OPA-CMS v${APP_VERSION} – Port ${PORT}`);
    console.log(`🔒 License Server: ${LICENSE_SERVER}`);
    console.log(`🌐 CORS Origins:   ${allowedOrigins.join(', ')}`);
    console.log(`⏰ Started at:     ${new Date().toLocaleString('de-DE')}\n`);
});
