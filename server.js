const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

// --- Central Production Configuration ---
const CONFIG = require('./config.js');
const DB = require('./server/database.js');
const Mailer = require('./server/mailer.js');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
app.set('trust proxy', true);
const PORT = CONFIG.PORT || 5000;
const ADMIN_SECRET = CONFIG.ADMIN_SECRET;

// --- CORS: Only allow configured origins ---
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, same-origin)
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true
}));
app.use(express.json());

// --- Rate Limiters ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, reason: 'Zu viele Login-Versuche. Bitte 15 Minuten warten.' }
});

const reservationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, reason: 'Zu viele Anfragen. Bitte später erneut versuchen.' }
});

// --- Setup Wizard Middleware ---
app.use((req, res, next) => {
    if (CONFIG.SETUP_COMPLETE || req.path === '/api/setup' || req.path === '/setup' || req.path.startsWith('/setup-assets')) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
        return res.status(403).json({ success: false, reason: 'SETUP_REQUIRED', message: 'System must be configured first.' });
    }
    res.redirect('/setup');
});

// Ensure storage exists
if (!fs.existsSync(path.join(__dirname, 'server'))) fs.mkdirSync(path.join(__dirname, 'server'));
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
const PLUGINS_DIR = path.join(__dirname, 'plugins');
if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR);

// --- Multer Upload Config ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
        if (allowed.test(path.extname(file.originalname))) cb(null, true);
        else cb(new Error('Nur Bilddateien erlaubt (JPG, PNG, GIF, WEBP, SVG)'));
    }
});

// --- Input Sanitization Helper ---
const sanitizeText = (str) => {
    if (!str) return '';
    return sanitizeHtml(String(str), { allowedTags: [], allowedAttributes: {} }).trim();
};

// --- Reservation Logic Helpers ---
const calculateDuration = (guestCount, rc = null) => {
    const config = rc || { durationSmall: 90, durationMedium: 120, durationLarge: 150 };
    const count = parseInt(guestCount);
    if (count <= 2) return config.durationSmall || 90;
    if (count <= 4) return config.durationMedium || 120;
    return config.durationLarge || 150;
};

// Parse time with optional date string for accurate overlap detection
const parseTime = (timeStr, dateStr = null) => {
    if (!timeStr) return new Date();
    const cleanTime = timeStr.replace(/[^0-9:]/g, '');
    const [hrs, mins] = cleanTime.split(':').map(Number);
    const d = dateStr ? new Date(dateStr.split('.').reverse().join('-')) : new Date();
    d.setHours(hrs || 0, mins || 0, 0, 0);
    return d;
};

// Build end time safely, handling midnight overflow
const buildEndTime = (startTime, durationMinutes) => {
    const d = parseTime(startTime);
    d.setMinutes(d.getMinutes() + durationMinutes);
    const h = d.getHours();
    const m = d.getMinutes();
    // Cap at 23:59 if overflow
    if (h >= 24) return '23:59';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const checkOverlap = (date, start1, end1, start2, end2, buffer = 15) => {
    const s1 = parseTime(start1, date).getTime();
    const e1 = parseTime(end1, date).getTime() + (buffer * 60000);
    const s2 = parseTime(start2, date).getTime();
    const e2 = parseTime(end2, date).getTime() + (buffer * 60000);
    return s1 < e2 && s2 < e1;
};

const findAvailableTables = (date, startTime, duration, guestCount, areaId = null) => {
    const settings = DB.getKV('settings', {});
    const rc = settings.reservationConfig || { buffer: 15 };

    // Check Opening Hours
    const homepage = DB.getKV('homepage', {});
    const oh = homepage.openingHours || {};
    const d = new Date(date.split('.').reverse().join('-'));
    const dayKey = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
    const dayConfig = oh[dayKey];

    if (dayConfig) {
        if (dayConfig.closed) return { success: false, reason: `Wir haben am ${dayKey} leider Ruhetag.` };
        const start = parseTime(startTime, date).getTime();
        const open = parseTime(dayConfig.open, date).getTime();
        const close = parseTime(dayConfig.close, date).getTime();
        if (start < open || start > close) {
            return { success: false, reason: `Reservierung außerhalb der Öffnungszeiten (${dayConfig.open} - ${dayConfig.close} Uhr).` };
        }
    }

    const endTime = buildEndTime(startTime, duration);

    const tables = DB.getTables() || [];
    let activeTables = tables.filter(t => t.active);

    const plan = DB.getKV('table_plan', { combined: {} });
    const combinedMapping = {};
    const parentMapping = {};

    Object.values(plan.combined || {}).forEach(areaCombos => {
        areaCombos.forEach(c => {
            const pid = 'C' + c.id;
            const tids = c.tableIds || [];
            parentMapping[pid] = tids;
            tids.forEach(tid => {
                if (!combinedMapping[tid]) combinedMapping[tid] = [];
                combinedMapping[tid].push(pid);
            });
        });
    });

    if (areaId) activeTables = activeTables.filter(t => t.area_id === areaId);

    const blockedStatuses = ['Confirmed', 'Pending', 'Blocked', 'Inquiry'];
    const existingReservations = (DB.getReservations() || []).filter(r =>
        r.date === date &&
        blockedStatuses.includes(r.status) &&
        r.start_time && r.end_time
    );

    const unavailableTableIds = new Set();
    existingReservations.forEach(res => {
        if (checkOverlap(date, startTime, endTime, res.start_time, res.end_time, rc.buffer)) {
            (res.assigned_tables || []).forEach(id => {
                unavailableTableIds.add(id);
                if (parentMapping[id]) parentMapping[id].forEach(cid => unavailableTableIds.add(cid));
                if (combinedMapping[id]) combinedMapping[id].forEach(pid => unavailableTableIds.add(pid));
            });
        }
    });

    const availableTables = activeTables.filter(t => !unavailableTableIds.has(t.id));

    // 1. Single Table Fit
    let fit = availableTables.filter(t => t.capacity >= guestCount).sort((a, b) => a.capacity - b.capacity)[0];
    if (fit) return { success: true, tables: [fit.id], endTime };

    // 2. Combinable Tables Fit (Simple greedy)
    const combinable = availableTables.filter(t => t.combinable).sort((a, b) => b.capacity - a.capacity);
    let combinedCapacity = 0;
    let selectedIds = [];
    for (const t of combinable) {
        combinedCapacity += t.capacity;
        selectedIds.push(t.id);
        if (combinedCapacity >= guestCount) return { success: true, tables: selectedIds, endTime };
    }

    return { success: false, reason: `Keine Kapazität im Bereich ${areaId || 'Gesamt'} verfügbar` };
};

// --- Security ---
const requireAuth = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ success: false, reason: 'No token' });
    try {
        const decoded = jwt.verify(token, ADMIN_SECRET);
        req.admin = decoded;
        next();
    } catch (e) {
        res.status(401).json({ success: false, reason: 'Invalid session' });
    }
};

const requireLicense = (module) => {
    return (req, res, next) => {
        const l = DB.getKV('settings')?.license || {};
        if (!l.modules || !l.modules[module]) return res.status(403).json({ success: false, reason: `Feature '${module}' gesperrt.` });
        next();
    };
};

// --- API Router ---
app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const { user, pass } = req.body;
    const u = (DB.getUsers() || []).find(x => x.user === user);
    if (!u) return res.status(401).json({ success: false });

    let isValid = false;
    try {
        isValid = await bcrypt.compare(pass, u.pass);
    } catch(e) { isValid = false; }

    if (!isValid && pass === u.pass) {
        isValid = true;
        const hashed = await bcrypt.hash(pass, 10);
        DB.setUserPass(user, hashed);
        console.log(`🔒 Auto-migrated password for user: ${user}`);
    }

    if (isValid) {
        const token = jwt.sign({ user: u.user, role: u.role }, ADMIN_SECRET, { expiresIn: '12h' });
        res.json({ success: true, token, user: u });
    } else {
        res.status(401).json({ success: false });
    }
});

app.get('/api/users', requireAuth, (req, res) => res.json(DB.getUsers()));
app.post('/api/users', requireAuth, (req, res) => {
    DB.saveUsers(req.body); res.json({ success: true });
});

app.get('/api/menu', (req, res) => res.json(DB.getMenu()));
app.post('/api/menu', requireAuth, requireLicense('menu_edit'), (req, res) => {
    DB.saveMenu(req.body); res.json({ success: true });
});

app.get('/api/categories', (req, res) => res.json(DB.getCategories()));
app.post('/api/categories', requireAuth, (req, res) => {
    DB.saveCategories(req.body); res.json({ success: true });
});

app.get('/api/allergens', (req, res) => res.json(DB.getKV('allergens', {})));
app.post('/api/allergens', requireAuth, (req, res) => {
    DB.setKV('allergens', req.body); res.json({ success: true });
});

app.get('/api/additives', (req, res) => res.json(DB.getKV('additives', {})));
app.post('/api/additives', requireAuth, (req, res) => {
    DB.setKV('additives', req.body); res.json({ success: true });
});

app.get('/api/orders', requireAuth, (req, res) => res.json(DB.getOrders()));
app.post('/api/orders', reservationLimiter, (req, res) => {
    const newOrder = { ...req.body, id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'pending' };
    DB.addOrder(newOrder);
    io.emit('new-order', newOrder);
    res.json({ success: true, order: newOrder });
});

app.get('/api/reservations', requireAuth, (req, res) => res.json(DB.getReservations()));

app.post('/api/reservations/check', reservationLimiter, (req, res) => {
    const settings = DB.getKV('settings', {});
    const { date, time, guests, areaId } = req.body;
    const duration = calculateDuration(guests, settings.reservationConfig);
    const result = findAvailableTables(date, time, duration, guests, areaId);
    res.json(result);
});

app.post('/api/reservations/availability-grid', reservationLimiter, (req, res) => {
    const settings = DB.getKV('settings', {});
    const { date, guests, areaId, times } = req.body;
    const duration = calculateDuration(guests, settings.reservationConfig);
    const grid = {};
    times.forEach(time => {
        const result = findAvailableTables(date, time, duration, guests, areaId);
        grid[time] = { available: result.success, reason: result.success ? null : result.reason };
    });
    res.json({ success: true, grid });
});

app.post('/api/reservations/submit', reservationLimiter, requireLicense('reservations'), (req, res) => {
    const settings = DB.getKV('settings', {});
    const rc = settings.reservationConfig || { allowInquiry: true };

    // Sanitize all user inputs
    const name = sanitizeText(req.body.name);
    const email = sanitizeText(req.body.email);
    const phone = sanitizeText(req.body.phone);
    const date = sanitizeText(req.body.date);
    const time = sanitizeText(req.body.time);
    const guests = parseInt(req.body.guests) || 1;
    const note = sanitizeText(req.body.note);
    const areaId = sanitizeText(req.body.areaId);

    const duration = calculateDuration(guests, settings.reservationConfig);
    const result = findAvailableTables(date, time, duration, guests, areaId);

    if (!result.success && !rc.allowInquiry) {
        return res.status(400).json({ success: false, reason: result.reason });
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (email && !emailRegex.test(email)) {
        return res.status(400).json({ success: false, reason: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' });
    }

    const status = result.success ? 'Pending' : 'Inquiry';
    const assignedTables = result.success ? result.tables : [];
    const endTime = result.endTime || buildEndTime(time, duration);

    const newRes = {
        id: Date.now(),
        // Cryptographically secure token
        token: crypto.randomBytes(32).toString('hex'),
        name, email, phone, date,
        time: time + ' Uhr',
        start_time: time,
        end_time: endTime,
        guests,
        note: note || '',
        status,
        assigned_tables: assignedTables,
        submittedAt: new Date().toISOString(),
        // Anonymized IP: only first two octets for DSGVO compliance
        ip: (req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split('.').slice(0, 2).join('.') + '.x.x'
    };

    DB.addReservation(newRes);
    Mailer.sendConfirmation(newRes).catch(e => console.error('Mailer error:', e));
    res.json({ success: true, reservation: newRes, isInquiry: !result.success });
});

app.put('/api/reservations/:id', requireAuth, (req, res) => {
    const settings = DB.getKV('settings', {});
    const resId = parseInt(req.params.id);
    const dbRes = DB.getReservations();
    const old = dbRes.find(r => r.id === resId);
    if (!old) return res.status(404).json({ success: false });

    const update = req.body;
    const criticalChanged = (update.date && old.date !== update.date) ||
                            (update.start_time && old.start_time !== update.start_time) ||
                            (update.guests && old.guests != update.guests);

    if (criticalChanged) {
        const d = update.date || old.date;
        const t = update.start_time || old.start_time;
        const g = update.guests || old.guests;
        const duration = calculateDuration(g, settings.reservationConfig);
        const result = findAvailableTables(d, t, duration, g);
        update.assigned_tables = result.tables || [];
        update.end_time = result.endTime || buildEndTime(t, duration);
        update.time = (update.start_time || old.start_time) + ' Uhr';
        if (!result.success && old.status === 'Confirmed') update.status = 'Pending';
    }

    const updated = DB.updateReservation(resId, update);
    if (updated && update.status && update.status !== old.status) {
        Mailer.sendStatusChange(updated).catch(e => console.error('Status mailer error:', e));
    }
    res.json({ success: true, reservation: updated });
});

app.delete('/api/reservations/:id', requireAuth, (req, res) => {
    DB.deleteReservation(parseInt(req.params.id));
    res.json({ success: true });
});

app.post('/api/reservations', requireAuth, (req, res) => {
    DB.saveReservations(req.body); res.json({ success: true });
});

// Token-based Actions (Public)
app.get('/api/reservations/cancel/:token', (req, res) => {
    const list = DB.getReservations();
    const r = list.find(x => x.token === req.params.token);
    if (!r) return res.status(404).send('Ungültiger Link.');
    const updated = DB.updateReservation(r.id, { status: 'Cancelled' });
    if (updated) Mailer.sendStatusChange(updated).catch(e => console.error('Cancel mailer error:', e));
    res.send('<h1>Reservierung erfolgreich storniert.</h1>');
});

app.get('/api/reservations/confirm/:token', (req, res) => {
    const list = DB.getReservations();
    const r = list.find(x => x.token === req.params.token);
    if (!r) return res.status(404).send('Ungültiger Link.');
    const updated = DB.updateReservation(r.id, { status: 'Confirmed' });
    if (updated) Mailer.sendStatusChange(updated).catch(e => console.error('Confirm mailer error:', e));
    res.send('<h1>Reservierung erfolgreich bestätigt!</h1>');
});

app.get('/api/tables', (req, res) => res.json(DB.getTables()));
app.post('/api/tables', requireAuth, (req, res) => {
    DB.saveTables(req.body); res.json({ success: true });
});

app.get('/api/homepage', (req, res) => {
    const settings = DB.getKV('settings', {});
    res.json({ ...DB.getKV('homepage', {}), activeModules: settings.activeModules });
});
app.post('/api/homepage', requireAuth, requireLicense('custom_design'), (req, res) => {
    DB.setKV('homepage', req.body); res.json({ success: true });
});

app.get('/api/areas', (req, res) => {
    res.json(DB.getKV('areas', [
        { id: 'main', name: 'Gastraum' },
        { id: 'terrace', name: 'Terrasse' }
    ]));
});
app.post('/api/areas', requireAuth, (req, res) => {
    DB.setKV('areas', req.body);
    res.json({ success: true });
});

// --- Table Plan (Visual Planner) ---
app.get('/api/table-plan', requireAuth, (req, res) => {
    let plan = DB.getKV('table_plan', null);
    if (!plan) {
        const dbTables = DB.getTables() || [];
        const dbAreas = DB.getKV('areas', [{ id: 'main', name: 'Gastraum' }]);
        plan = {
            areas: dbAreas.map(a => ({ id: a.id, name: a.name, icon: a.id === 'terrace' ? '🌿' : '🏠', w: 800, h: 600, locked: false })),
            tables: {}, combined: {}, decors: {}
        };
        dbAreas.forEach(a => {
            const areaTables = dbTables.filter(t => (t.area_id || 'main') === a.id);
            plan.tables[a.id] = areaTables.map((t, i) => ({
                id: t.id, num: t.name, seats: t.capacity,
                shape: t.capacity > 4 ? 'rect-h' : 'square',
                x: 50 + (i % 5) * 120, y: 50 + Math.floor(i / 5) * 120,
                w: t.capacity > 4 ? 100 : 60, h: 60
            }));
        });
        DB.setKV('table_plan', plan);
    }
    res.json(plan);
});

app.post('/api/table-plan', requireAuth, (req, res) => {
    const plan = req.body;
    DB.setKV('table_plan', plan);
    const allTables = [];
    Object.keys(plan.tables || {}).forEach(areaId => {
        (plan.tables[areaId] || []).forEach(t => {
            if (!t.hidden) allTables.push({ id: t.id, name: t.num, capacity: parseInt(t.seats) || 2, combinable: true, active: true, area_id: areaId });
        });
    });
    Object.keys(plan.combined || {}).forEach(areaId => {
        (plan.combined[areaId] || []).forEach(c => {
            allTables.push({ id: 'C' + c.id, name: c.num, capacity: parseInt(c.seats) || 4, combinable: false, active: true, area_id: areaId });
        });
    });
    DB.saveTables(allTables);
    if (plan.areas) DB.setKV('areas', plan.areas.map(a => ({ id: a.id, name: a.name })));
    res.json({ success: true });
});

app.get('/api/branding', (req, res) => res.json(DB.getKV('branding', {})));
app.post('/api/branding', requireAuth, (req, res) => {
    DB.setKV('branding', req.body); res.json({ success: true });
});

app.get('/api/settings', requireAuth, (req, res) => res.json(DB.getKV('settings', {})));
app.post('/api/settings', requireAuth, (req, res) => {
    DB.setKV('settings', req.body); res.json({ success: true });
});

// --- Remote License Bridge (IMMUTABLE BY CLIENTS) ---
app.post('/api/license/validate', async (req, res) => {
    try {
        const response = await fetch(`${CONFIG.LICENSE_SERVER_URL}/api/v1/validate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: req.body.key, domain: req.headers.host || 'localhost' })
        });
        const r = await response.json();
        if (r.status === 'active') {
            const settings = DB.getKV('settings', {});
            settings.license = {
                key: req.body.key, status: 'active', customer: r.customer_name,
                type: r.type, expiresAt: r.expires_at, modules: r.allowed_modules, limits: r.limits
            };
            DB.setKV('settings', settings);
            res.json({ success: true, license: settings.license });
        } else res.status(403).json({ success: false, reason: r.message });
    } catch (e) { res.status(500).json({ success: false, reason: 'Lizenzserver nicht erreichbar.' }); }
});

// --- Image Upload API ---
app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, reason: 'Keine Datei hochgeladen.' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url, filename: req.file.filename, size: req.file.size });
});

app.delete('/api/upload/:filename', requireAuth, (req, res) => {
    const filename = path.basename(req.params.filename); // Prevent path traversal
    const fp = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(fp)) { fs.unlinkSync(fp); return res.json({ success: true }); }
    res.status(404).json({ success: false });
});

// --- Plugin API ---
const getInstalledPlugins = () => {
    if (!fs.existsSync(PLUGINS_DIR)) return [];
    return fs.readdirSync(PLUGINS_DIR)
        .filter(f => fs.statSync(path.join(PLUGINS_DIR, f)).isDirectory())
        .map(dir => {
            const manifestPath = path.join(PLUGINS_DIR, dir, 'plugin.json');
            if (fs.existsSync(manifestPath)) {
                try { return JSON.parse(fs.readFileSync(manifestPath)); } catch(e) { return null; }
            }
            return null;
        }).filter(p => p !== null);
};

app.get('/api/plugins', requireAuth, (req, res) => {
    const installed = getInstalledPlugins();
    const dbPlugins = DB.getKV('plugins', []);
    const result = installed.map(p => {
        const dbP = dbPlugins.find(x => x.id === p.id);
        return { ...p, enabled: dbP ? dbP.enabled : false };
    });
    res.json(result);
});

app.post('/api/plugins/toggle', requireAuth, (req, res) => {
    let dbPlugins = DB.getKV('plugins', []);
    const { id, enabled } = req.body;
    const idx = dbPlugins.findIndex(p => p.id === id);
    if (idx > -1) dbPlugins[idx].enabled = enabled;
    else dbPlugins.push({ id, enabled });
    DB.setKV('plugins', dbPlugins);
    res.json({ success: true });
});

// --- Dynamic Plugin Routes ---
// NOTE: Plugins run server-side code. Only install plugins from trusted sources.
const loadPluginServers = () => {
    const activePlugins = DB.getKV('plugins', []).filter(p => p.enabled);
    activePlugins.forEach(p => {
        // Sanitize plugin ID to prevent path traversal
        const safeId = path.basename(p.id);
        const serverPath = path.join(PLUGINS_DIR, safeId, 'server.js');
        if (fs.existsSync(serverPath)) {
            try {
                const pluginServer = require(serverPath);
                if (typeof pluginServer === 'function') {
                    pluginServer(app, { DB, requireAuth, requireLicense });
                    console.log(`🔌 Loaded server logic for: ${safeId}`);
                }
            } catch(e) { console.error(`❌ Failed to load plugin server (${safeId}):`, e); }
        }
    });
};
loadPluginServers();

app.use('/plugins', express.static(PLUGINS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/admin', express.static(path.join(__dirname, 'cms')));
app.use('/', express.static(path.join(__dirname, 'menu-app')));

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(err.status || 500).json({
        success: false,
        reason: err.message || 'Ein interner Serverfehler ist aufgetreten.'
    });
});

// --- Setup Wizard Endpoint ---
app.post('/api/setup', async (req, res) => {
    if (CONFIG.SETUP_COMPLETE) return res.status(403).json({ success: false, reason: 'Already configured' });
    try {
        const { licenseServer, adminSecret, smtp, dbType, dbDetails } = req.body;
        const newConfig = {
            LICENSE_SERVER_URL: licenseServer || CONFIG.LICENSE_SERVER_URL,
            ADMIN_SECRET: adminSecret || CONFIG.ADMIN_SECRET,
            SMTP: smtp || CONFIG.SMTP,
            DB_TYPE: dbType || 'sqlite',
            DB_DETAILS: dbDetails || {},
            SETUP_COMPLETE: true
        };
        const configPath = path.join(__dirname, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));
        Object.assign(CONFIG, newConfig);
        res.json({ success: true, message: 'Configuration saved. Restart recommended.' });
    } catch (e) {
        console.error('Setup error:', e);
        res.status(500).json({ success: false, reason: e.message });
    }
});

app.get('/setup', (req, res) => {
    res.sendFile(path.join(__dirname, 'cms', 'setup.html'));
});

server.listen(PORT, () => {
    console.log(`\n🚀 RESTAURANT-CMS ONLINE ON PORT ${PORT}`);
    console.log(`🔒 LICENSE SERVER: ${CONFIG.LICENSE_SERVER_URL}\n`);
});
