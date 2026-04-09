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

const CONFIG = require('./config.js');
const DB = require('./server/database.js');
const Mailer = require('./server/mailer.js');
const { getCurrentLicense, PLAN_DEFINITIONS } = require('./server/license.js');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
app.set('trust proxy', 1);
const PORT = CONFIG.PORT || 5000;
const ADMIN_SECRET = CONFIG.ADMIN_SECRET;

// Trailing Slash aus LICENSE_SERVER_URL entfernen (defensiv)
const LICENSE_SERVER = (CONFIG.LICENSE_SERVER_URL || 'https://licens-prod.stb-srv.de').replace(/\/+$/, '');

// --- CORS ---
const rawOrigins = process.env.CORS_ORIGINS || '';
const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map(o => o.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true
}));
app.use(express.json());

// --- Rate Limiters ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { success: false, reason: 'Zu viele Login-Versuche. Bitte 15 Minuten warten.' }
});
const reservationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 20,
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

if (!fs.existsSync(path.join(__dirname, 'server'))) fs.mkdirSync(path.join(__dirname, 'server'));
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
const PLUGINS_DIR = path.join(__dirname, 'plugins');
if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
});
const upload = multer({
    storage, limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path.extname(file.originalname))) cb(null, true);
        else cb(new Error('Nur Bilddateien erlaubt'));
    }
});

const sanitizeText = (str) => {
    if (!str) return '';
    return sanitizeHtml(String(str), { allowedTags: [], allowedAttributes: {} }).trim();
};

const calculateDuration = (guestCount, rc = null) => {
    const config = rc || { durationSmall: 90, durationMedium: 120, durationLarge: 150 };
    const count = parseInt(guestCount);
    if (count <= 2) return config.durationSmall || 90;
    if (count <= 4) return config.durationMedium || 120;
    return config.durationLarge || 150;
};

const parseTime = (timeStr, dateStr = null) => {
    if (!timeStr) return new Date();
    const cleanTime = timeStr.replace(/[^0-9:]/g, '');
    const [hrs, mins] = cleanTime.split(':').map(Number);
    const d = dateStr ? new Date(dateStr.split('.').reverse().join('-')) : new Date();
    d.setHours(hrs || 0, mins || 0, 0, 0);
    return d;
};

const buildEndTime = (startTime, durationMinutes) => {
    const d = parseTime(startTime);
    d.setMinutes(d.getMinutes() + durationMinutes);
    const h = d.getHours(), m = d.getMinutes();
    if (h >= 24) return '23:59';
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
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
    const homepage = DB.getKV('homepage', {});
    const oh = homepage.openingHours || {};
    const d = new Date(date.split('.').reverse().join('-'));
    const dayKey = ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()];
    const dayConfig = oh[dayKey];
    if (dayConfig) {
        if (dayConfig.closed) return { success: false, reason: `Wir haben am ${dayKey} leider Ruhetag.` };
        const start = parseTime(startTime, date).getTime();
        const open = parseTime(dayConfig.open, date).getTime();
        const close = parseTime(dayConfig.close, date).getTime();
        if (start < open || start > close)
            return { success: false, reason: `Reservierung außerhalb der Öffnungszeiten (${dayConfig.open} - ${dayConfig.close} Uhr).` };
    }
    const endTime = buildEndTime(startTime, duration);
    const tables = DB.getTables() || [];
    let activeTables = tables.filter(t => t.active);
    const plan = DB.getKV('table_plan', { combined: {} });
    const combinedMapping = {}, parentMapping = {};
    Object.values(plan.combined || {}).forEach(areaCombos => {
        areaCombos.forEach(c => {
            const pid = 'C' + c.id, tids = c.tableIds || [];
            parentMapping[pid] = tids;
            tids.forEach(tid => { if (!combinedMapping[tid]) combinedMapping[tid] = []; combinedMapping[tid].push(pid); });
        });
    });
    if (areaId) activeTables = activeTables.filter(t => t.area_id === areaId);
    const blockedStatuses = ['Confirmed','Pending','Blocked','Inquiry'];
    const existingReservations = (DB.getReservations() || []).filter(r =>
        r.date === date && blockedStatuses.includes(r.status) && r.start_time && r.end_time
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
    let fit = availableTables.filter(t => t.capacity >= guestCount).sort((a,b) => a.capacity - b.capacity)[0];
    if (fit) return { success: true, tables: [fit.id], endTime };
    const combinable = availableTables.filter(t => t.combinable).sort((a,b) => b.capacity - a.capacity);
    let combinedCapacity = 0, selectedIds = [];
    for (const t of combinable) {
        combinedCapacity += t.capacity; selectedIds.push(t.id);
        if (combinedCapacity >= guestCount) return { success: true, tables: selectedIds, endTime };
    }
    return { success: false, reason: `Keine Kapazität im Bereich ${areaId || 'Gesamt'} verfügbar` };
};

const requireAuth = (req, res, next) => {
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

// --- API Routes ---
app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const { user, pass } = req.body;
    const u = (DB.getUsers() || []).find(x => x.user === user);
    if (!u) return res.status(401).json({ success: false });
    let isValid = false;
    try { isValid = await bcrypt.compare(pass, u.pass); } catch(e) { isValid = false; }
    if (!isValid && pass === u.pass) {
        isValid = true;
        const hashed = await bcrypt.hash(pass, 10);
        DB.setUserPass(user, hashed);
    }
    if (isValid) {
        const requirePasswordChange = !!u.require_password_change;
        const token = jwt.sign({ user: u.user, role: u.role, requirePasswordChange }, ADMIN_SECRET, { expiresIn: '12h' });
        res.json({ success: true, token, user: { ...u, pass: undefined }, requirePasswordChange });
    } else res.status(401).json({ success: false });
});

app.post('/api/admin/change-password', requireAuth, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, reason: 'Passwort zu kurz.' });
    
    const hashed = await bcrypt.hash(newPassword, 10);
    DB.setUserPass(req.admin.user, hashed);
    
    // Auto-login with fresh token
    const token = jwt.sign({ user: req.admin.user, role: req.admin.role, requirePasswordChange: false }, ADMIN_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token });
});

app.get('/api/users', requireAuth, (req, res) => {
    const safeUsers = DB.getUsers().map(u => {
        const copy = { ...u };
        delete copy.pass;
        return copy;
    });
    res.json(safeUsers);
});
app.post('/api/users', requireAuth, async (req, res) => {
    const u = req.body;
    const existing = DB.getUsers().find(x => x.user === u.user);
    if (existing) return res.status(400).json({ success: false, reason: 'Benutzername existiert bereits.' });

    const plainPass = crypto.randomBytes(4).toString('hex');
    u.pass = await bcrypt.hash(plainPass, 10);
    u.require_password_change = 1;
    
    DB.addUser(u);
    if (u.email) Mailer.sendUserCredentials(u.email, u.name, u.user, plainPass).catch(e => console.error(e));
    
    res.json({ success: true });
});

app.put('/api/users/:user', requireAuth, (req, res) => {
    DB.updateUser(req.params.user, req.body);
    res.json({ success: true });
});

app.delete('/api/users/:user', requireAuth, (req, res) => {
    if (req.params.user === req.admin.user) return res.status(400).json({ success: false, reason: 'Kann sich selbst nicht löschen.' });
    DB.deleteUser(req.params.user);
    res.json({ success: true });
});

app.post('/api/users/:user/reset', requireAuth, async (req, res) => {
    const target = DB.getUsers().find(x => x.user === req.params.user);
    if (!target) return res.status(404).json({ success: false, reason: 'Benutzer nicht gefunden.' });
    if (!target.email) return res.status(400).json({ success: false, reason: 'Benutzer hat keine E-Mail Adresse hinterlegt.' });
    
    const plainPass = crypto.randomBytes(4).toString('hex');
    const hashed = await bcrypt.hash(plainPass, 10);
    DB.setUserPass(target.user, hashed); // Sets require_password_change to 0 by default
    
    // Force require change
    const Database = require('better-sqlite3');
    const db = new Database(require('path').join(__dirname, 'server', 'database.sqlite'));
    db.prepare('UPDATE users SET require_password_change = 1 WHERE user = ?').run(target.user);
    db.close();

    if (target.email) Mailer.sendUserCredentials(target.email, target.name, target.user, plainPass).catch(e => console.error(e));
    res.json({ success: true });
});

app.get('/api/menu', (req, res) => res.json(DB.getMenu()));
app.post('/api/menu', requireAuth, requireLicense('menu_edit'), (req, res) => {
    // Check limit dynamically for a single insert
    const lic = res.locals.license;
    const maxDishes = lic?.limits?.maxDishes || 25;
    const currentDishes = DB.getMenu().length;
    if (currentDishes >= maxDishes) {
        return res.status(403).json({ success: false, reason: `Ihr ${lic.label || lic.type}-Plan erlaubt maximal ${maxDishes} Speisen.` });
    }
    const m = req.body;
    m.id = m.id || Date.now().toString();
    DB.addMenu(m); 
    res.json({ success: true, id: m.id });
});
app.put('/api/menu/:id', requireAuth, requireLicense('menu_edit'), (req, res) => {
    const updated = DB.updateMenu(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, reason: 'Gericht nicht gefunden.' });
    res.json({ success: true, item: updated });
});
app.delete('/api/menu/:id', requireAuth, requireLicense('menu_edit'), (req, res) => {
    DB.deleteMenu(req.params.id);
    res.json({ success: true });
});

app.get('/api/categories', (req, res) => res.json(DB.getCategories()));
app.post('/api/categories', requireAuth, (req, res) => {
    const c = req.body;
    c.id = c.id || Date.now().toString();
    DB.addCategory(c);
    res.json({ success: true, id: c.id });
});
app.put('/api/categories/:id', requireAuth, (req, res) => {
    const updated = DB.updateCategory(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, reason: 'Kategorie nicht gefunden.' });
    res.json({ success: true, item: updated });
});
app.delete('/api/categories/:id', requireAuth, (req, res) => {
    DB.deleteCategory(req.params.id);
    res.json({ success: true });
});
app.get('/api/allergens', (req, res) => res.json(DB.getKV('allergens', {})));
app.post('/api/allergens', requireAuth, (req, res) => { DB.setKV('allergens', req.body); res.json({ success: true }); });
app.get('/api/additives', (req, res) => res.json(DB.getKV('additives', {})));
app.post('/api/additives', requireAuth, (req, res) => { DB.setKV('additives', req.body); res.json({ success: true }); });
app.get('/api/orders', requireAuth, (req, res) => res.json(DB.getOrders()));
app.post('/api/orders', reservationLimiter, (req, res) => {
    const newOrder = { ...req.body, id: Date.now().toString(), timestamp: new Date().toISOString(), status: 'pending' };
    DB.addOrder(newOrder); io.emit('new-order', newOrder);
    res.json({ success: true, order: newOrder });
});

app.get('/api/reservations', requireAuth, (req, res) => res.json(DB.getReservations()));
app.post('/api/reservations/check', reservationLimiter, (req, res) => {
    const settings = DB.getKV('settings', {});
    const { date, time, guests, areaId } = req.body;
    const duration = calculateDuration(guests, settings.reservationConfig);
    res.json(findAvailableTables(date, time, duration, guests, areaId));
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
    const name = sanitizeText(req.body.name), email = sanitizeText(req.body.email),
          phone = sanitizeText(req.body.phone), date = sanitizeText(req.body.date),
          time = sanitizeText(req.body.time), guests = parseInt(req.body.guests) || 1,
          note = sanitizeText(req.body.note), areaId = sanitizeText(req.body.areaId);
    const duration = calculateDuration(guests, settings.reservationConfig);
    const result = findAvailableTables(date, time, duration, guests, areaId);
    if (!result.success && !rc.allowInquiry) return res.status(400).json({ success: false, reason: result.reason });
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (email && !emailRegex.test(email)) return res.status(400).json({ success: false, reason: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' });
    const status = result.success ? 'Pending' : 'Inquiry';
    const newRes = {
        id: Date.now(), token: crypto.randomBytes(32).toString('hex'),
        name, email, phone, date, time: time + ' Uhr', start_time: time,
        end_time: result.endTime || buildEndTime(time, duration),
        guests, note: note || '', status, assigned_tables: result.success ? result.tables : [],
        submittedAt: new Date().toISOString(),
        ip: (req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split('.').slice(0,2).join('.') + '.x.x'
    };
    DB.addReservation(newRes);
    Mailer.sendConfirmation(newRes).catch(e => console.error('Mailer error:', e));
    res.json({ success: true, reservation: newRes, isInquiry: !result.success });
});

app.put('/api/reservations/:id', requireAuth, (req, res) => {
    const settings = DB.getKV('settings', {});
    const resId = parseInt(req.params.id);
    const dbRes = DB.getReservations(), old = dbRes.find(r => r.id === resId);
    if (!old) return res.status(404).json({ success: false });
    const update = req.body;
    const criticalChanged = (update.date && old.date !== update.date) ||
                            (update.start_time && old.start_time !== update.start_time) ||
                            (update.guests && old.guests != update.guests);
    if (criticalChanged) {
        const d = update.date || old.date, t = update.start_time || old.start_time, g = update.guests || old.guests;
        const duration = calculateDuration(g, settings.reservationConfig);
        const result = findAvailableTables(d, t, duration, g);
        update.assigned_tables = result.tables || [];
        update.end_time = result.endTime || buildEndTime(t, duration);
        update.time = (update.start_time || old.start_time) + ' Uhr';
        if (!result.success && old.status === 'Confirmed') update.status = 'Pending';
    }
    const updated = DB.updateReservation(resId, update);
    if (updated && update.status && update.status !== old.status)
        Mailer.sendStatusChange(updated).catch(e => console.error('Status mailer error:', e));
    res.json({ success: true, reservation: updated });
});

app.delete('/api/reservations/:id', requireAuth, (req, res) => { DB.deleteReservation(parseInt(req.params.id)); res.json({ success: true }); });
app.post('/api/reservations', requireAuth, (req, res) => { DB.saveReservations(req.body); res.json({ success: true }); });

app.get('/api/reservations/cancel/:token', (req, res) => {
    const r = (DB.getReservations()||[]).find(x => x.token === req.params.token);
    if (!r) return res.status(404).send('Ungültiger Link.');
    const updated = DB.updateReservation(r.id, { status: 'Cancelled' });
    if (updated) Mailer.sendStatusChange(updated).catch(e => console.error('Cancel mailer error:', e));
    res.send('<h1>Reservierung erfolgreich storniert.</h1>');
});

app.get('/api/reservations/confirm/:token', (req, res) => {
    const r = (DB.getReservations()||[]).find(x => x.token === req.params.token);
    if (!r) return res.status(404).send('Ungültiger Link.');
    const updated = DB.updateReservation(r.id, { status: 'Confirmed' });
    if (updated) Mailer.sendStatusChange(updated).catch(e => console.error('Confirm mailer error:', e));
    res.send('<h1>Reservierung erfolgreich bestätigt!</h1>');
});

app.get('/api/tables', (req, res) => res.json(DB.getTables()));
app.post('/api/tables', requireAuth, (req, res) => { DB.saveTables(req.body); res.json({ success: true }); });

app.get('/api/homepage', (req, res) => {
    const settings = DB.getKV('settings', {});
    res.json({ ...DB.getKV('homepage', {}), activeModules: settings.activeModules });
});
app.post('/api/homepage', requireAuth, requireLicense('custom_design'), (req, res) => { DB.setKV('homepage', req.body); res.json({ success: true }); });

app.get('/api/areas', (req, res) => res.json(DB.getKV('areas', [{ id:'main',name:'Gastraum' },{ id:'terrace',name:'Terrasse' }])));
app.post('/api/areas', requireAuth, (req, res) => { DB.setKV('areas', req.body); res.json({ success: true }); });

app.get('/api/table-plan', requireAuth, (req, res) => {
    let plan = DB.getKV('table_plan', null);
    if (!plan) {
        const dbTables = DB.getTables() || [];
        const dbAreas = DB.getKV('areas', [{ id:'main',name:'Gastraum' }]);
        plan = { areas: dbAreas.map(a => ({ id:a.id,name:a.name,icon:a.id==='terrace'?'🌿':'🏠',w:800,h:600,locked:false })), tables:{},combined:{},decors:{} };
        dbAreas.forEach(a => {
            const areaTables = dbTables.filter(t => (t.area_id||'main') === a.id);
            plan.tables[a.id] = areaTables.map((t,i) => ({ id:t.id,num:t.name,seats:t.capacity,shape:t.capacity>4?'rect-h':'square',x:50+(i%5)*120,y:50+Math.floor(i/5)*120,w:t.capacity>4?100:60,h:60 }));
        });
        DB.setKV('table_plan', plan);
    }
    res.json(plan);
});

app.post('/api/table-plan', requireAuth, (req, res) => {
    const plan = req.body;
    DB.setKV('table_plan', plan);
    const allTables = [];
    Object.keys(plan.tables||{}).forEach(areaId => {
        (plan.tables[areaId]||[]).forEach(t => { if (!t.hidden) allTables.push({ id:t.id,name:t.num,capacity:parseInt(t.seats)||2,combinable:true,active:true,area_id:areaId }); });
    });
    Object.keys(plan.combined||{}).forEach(areaId => {
        (plan.combined[areaId]||[]).forEach(c => { allTables.push({ id:'C'+c.id,name:c.num,capacity:parseInt(c.seats)||4,combinable:false,active:true,area_id:areaId }); });
    });
    DB.saveTables(allTables);
    if (plan.areas) DB.setKV('areas', plan.areas.map(a => ({ id:a.id,name:a.name })));
    res.json({ success: true });
});

app.get('/api/branding', (req, res) => res.json(DB.getKV('branding', {})));
app.post('/api/branding', requireAuth, (req, res) => { DB.setKV('branding', req.body); res.json({ success: true }); });
app.get('/api/settings', requireAuth, (req, res) => res.json(DB.getKV('settings', {})));
app.post('/api/settings', requireAuth, (req, res) => { DB.setKV('settings', req.body); res.json({ success: true }); });

// --- License API ---
app.get('/api/license/info', requireAuth, (req, res) => {
    const lic = getCurrentLicense(DB);
    res.json({ ...lic, menu_items_used: (DB.getMenu()||[]).length, plans: PLAN_DEFINITIONS });
});

app.post('/api/license/validate', async (req, res) => {
    try {
        const response = await fetch(`${LICENSE_SERVER}/api/v1/validate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: req.body.key, domain: req.headers.host || 'localhost' })
        });
        const r = await response.json();
        if (r.status === 'active') {
            const settings = DB.getKV('settings', {});
            settings.license = {
                key: req.body.key, status: 'active', customer: r.customer_name,
                type: r.type, label: r.plan_label, expiresAt: r.expires_at,
                modules: r.allowed_modules, limits: r.limits
            };
            DB.setKV('settings', settings);
            res.json({ success: true, license: settings.license });
        } else res.status(403).json({ success: false, reason: r.message });
    } catch (e) { res.status(500).json({ success: false, reason: 'Lizenzserver nicht erreichbar.' }); }
});

// --- License Module Override (Admin) ---
// Erlaubt es einzelne Module pro Lizenz manuell zu aktivieren/deaktivieren
app.post('/api/license/modules', requireAuth, (req, res) => {
    const { modules } = req.body;
    if (!modules || typeof modules !== 'object') {
        return res.status(400).json({ success: false, reason: 'Ungültige Module-Daten.' });
    }
    const settings = DB.getKV('settings', {});
    if (!settings.license) return res.status(400).json({ success: false, reason: 'Keine Lizenz aktiv.' });
    settings.license.modules = { ...settings.license.modules, ...modules };
    DB.setKV('settings', settings);
    res.json({ success: true, modules: settings.license.modules });
});

// --- Menu Import (kein requireLicense – Import ist für alle Pläne erlaubt) ---
app.post('/api/menu/import', requireAuth, (req, res) => {
    const { menu, categories, allergens, additives } = req.body;
    const lic = getCurrentLicense(DB);
    const maxDishes = lic.limits?.max_dishes ?? 10;
    if (menu && Array.isArray(menu) && menu.length > maxDishes) {
        return res.status(403).json({
            success: false,
            reason: `Ihr ${lic.label || lic.type}-Plan erlaubt maximal ${maxDishes} Speisen. Die Backup-Datei enthält ${menu.length} Einträge – bitte upgraden oder Backup kürzen.`,
            limit: maxDishes, current: menu.length
        });
    }
    if (menu && Array.isArray(menu)) DB.saveMenu(menu);
    if (categories && Array.isArray(categories)) DB.saveCategories(categories);
    if (allergens && typeof allergens === 'object') DB.setKV('allergens', allergens);
    if (additives && typeof additives === 'object') DB.setKV('additives', additives);
    res.json({ success: true });
});

// --- Image Upload API ---
app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, reason: 'Keine Datei hochgeladen.' });
    res.json({ success: true, url: `/uploads/${req.file.filename}`, filename: req.file.filename, size: req.file.size });
});
app.delete('/api/upload/:filename', requireAuth, (req, res) => {
    const fp = path.join(UPLOADS_DIR, path.basename(req.params.filename));
    if (fs.existsSync(fp)) { fs.unlinkSync(fp); return res.json({ success: true }); }
    res.status(404).json({ success: false });
});

// --- Plugin API ---
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

const loadPluginServers = () => {
    const activePlugins = DB.getKV('plugins', []).filter(p => p.enabled);
    activePlugins.forEach(p => {
        const safeId = path.basename(p.id);
        const serverPath = path.join(PLUGINS_DIR, safeId, 'server.js');
        if (fs.existsSync(serverPath)) {
            try {
                const pluginServer = require(serverPath);
                if (typeof pluginServer === 'function') pluginServer(app, { DB, requireAuth, requireLicense });
            } catch(e) { console.error(`❌ Failed to load plugin server (${safeId}):`, e); }
        }
    });
};
loadPluginServers();

app.use('/plugins', express.static(PLUGINS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/admin', express.static(path.join(__dirname, 'cms')));
app.use('/', express.static(path.join(__dirname, 'menu-app')));

app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(err.status || 500).json({ success: false, reason: err.message || 'Interner Serverfehler.' });
});

// --- Setup Wizard ---
app.post('/api/setup', async (req, res) => {
    if (CONFIG.SETUP_COMPLETE) return res.status(403).json({ success: false, reason: 'Already configured' });
    try {
        const { restaurantName, licenseServer, adminSecret, smtp, adminUser, adminPass } = req.body;
        const licenseServerUrl = (licenseServer || 'https://licens-prod.stb-srv.de').replace(/\/+$/, '');

        let trialLicense = null;
        try {
            const trialPlan = PLAN_DEFINITIONS['FREE'];
            trialLicense = {
                key: 'OPA-TRIAL-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '-' + new Date().getFullYear(),
                status: 'trial', customer: restaurantName || 'Trial',
                type: 'FREE', label: trialPlan.label,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                modules: trialPlan.modules,
                limits: { max_dishes: trialPlan.menu_items, max_tables: trialPlan.max_tables },
                isTrial: true
            };
        } catch(e) {
            const trialPlan = PLAN_DEFINITIONS['FREE'];
            trialLicense = {
                key: 'OPA-TRIAL-OFFLINE-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
                status: 'trial', customer: restaurantName || 'Trial',
                type: 'FREE', label: trialPlan.label,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                modules: trialPlan.modules,
                limits: { max_dishes: trialPlan.menu_items, max_tables: trialPlan.max_tables },
                isTrial: true
            };
        }

        const newConfig = {
            LICENSE_SERVER_URL: licenseServerUrl,
            ADMIN_SECRET: adminSecret || crypto.randomBytes(32).toString('hex'),
            SMTP: smtp || {},
            SETUP_COMPLETE: true
        };
        const configPath = path.join(__dirname, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));
        Object.assign(CONFIG, newConfig);

        const settings = DB.getKV('settings', {});
        settings.license = trialLicense;
        DB.setKV('settings', settings);

        if (restaurantName) {
            const branding = DB.getKV('branding', {});
            branding.name = restaurantName;
            DB.setKV('branding', branding);
        }

        if (adminUser && adminPass) {
            const hash = await bcrypt.hash(adminPass, 10);
            DB.saveUsers([{ user: adminUser, pass: hash, role: 'admin' }]);
        }

        res.json({ success: true, trial: trialLicense, message: 'Setup abgeschlossen.' });
    } catch (e) {
        console.error('Setup error:', e);
        res.status(500).json({ success: false, reason: e.message });
    }
});

app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, 'cms', 'setup.html')));

// --- Trial license cleanup job ---
setInterval(() => {
    const settings = DB.getKV('settings', {});
    const lic = settings.license;
    if (lic && lic.isTrial && lic.expiresAt && new Date(lic.expiresAt) < new Date()) {
        console.log('⏰ Trial license expired - removing.');
        delete settings.license;
        DB.setKV('settings', settings);
    }
}, 60 * 60 * 1000);

server.listen(PORT, () => {
    console.log(`\n🚀 RESTAURANT-CMS ONLINE ON PORT ${PORT}`);
    console.log(`🔒 LICENSE SERVER: ${LICENSE_SERVER}`);
    console.log(`🌐 CORS ORIGINS: ${allowedOrigins.join(', ')}\n`);
});
