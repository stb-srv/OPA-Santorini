const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const DATA_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());

// --- Database Helper ---
const readDB = () => {
    const defaultDB = {
        menu: [],
        orders: [],
        reservations: [],
        tables: [],
        branding: { name: 'OPA! Santorini', slogan: 'Restaurant Management', logo: '' },
        inventory: []
    };
    if (!fs.existsSync(DATA_FILE)) return defaultDB;
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE));
        return { ...defaultDB, ...data };
    } catch (e) {
        console.error("DB Read Error:", e);
        return defaultDB;
    }
};

const writeDB = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// --- Reservation Logic Helpers ---
const calculateDuration = (guestCount) => {
    const count = parseInt(guestCount);
    if (count <= 2) return 90; // 90 minutes
    if (count <= 4) return 120; // 120 minutes
    return 150; // 150 minutes for larger groups
};

const parseTime = (timeStr) => {
    const [hrs, mins] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(hrs, mins, 0, 0);
    return d;
};

const checkOverlap = (start1, end1, start2, end2, buffer = 15) => {
    const s1 = parseTime(start1).getTime();
    const e1 = parseTime(end1).getTime() + (buffer * 60000);
    const s2 = parseTime(start2).getTime();
    const e2 = parseTime(end2).getTime() + (buffer * 60000);
    return s1 < e2 && s2 < e1;
};

const findAvailableTables = (db, date, startTime, duration, guestCount) => {
    const endTimeObj = parseTime(startTime);
    endTimeObj.setMinutes(endTimeObj.getMinutes() + duration);
    const endTime = `${String(endTimeObj.getHours()).padStart(2, '0')}:${String(endTimeObj.getMinutes()).padStart(2, '0')}`;

    const activeTables = db.tables.filter(t => t.active);
    const existingReservations = db.reservations.filter(r => r.date === date && r.status?.toLowerCase() !== 'cancelled' && r.start_time && r.end_time);

    // Filter tables that are occupied during this time
    const unavailableTableIds = new Set();
    existingReservations.forEach(res => {
        if (checkOverlap(startTime, endTime, res.start_time, res.end_time)) {
            (res.assigned_tables || []).forEach(id => unavailableTableIds.add(id));
        }
    });

    const availableTables = activeTables.filter(t => !unavailableTableIds.has(t.id));

    // Simple table assignment logic
    // 1. Find a single table that fits
    let fit = availableTables.filter(t => t.capacity >= guestCount).sort((a, b) => a.capacity - b.capacity)[0];
    if (fit) return { success: true, tables: [fit.id], endTime };

    // 2. Try combining tables (only if combinable)
    const combinable = availableTables.filter(t => t.combinable).sort((a, b) => b.capacity - a.capacity);
    let combinedCapacity = 0;
    let selectedIds = [];
    for (const t of combinable) {
        combinedCapacity += t.capacity;
        selectedIds.push(t.id);
        if (combinedCapacity >= guestCount) return { success: true, tables: selectedIds, endTime };
    }

    return { success: false, reason: 'Keine Kapazität verfügbar' };
};

// --- API Endpoints ---

// Menu
app.get('/api/menu', (req, res) => res.json(readDB().menu));
app.post('/api/menu', (req, res) => {
    const db = readDB();
    db.menu = req.body;
    writeDB(db);
    res.json({ success: true });
});

// Orders
app.get('/api/orders', (req, res) => res.json(readDB().orders));
app.post('/api/orders', (req, res) => {
    const db = readDB();
    db.orders.unshift(req.body);
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/orders/:id', (req, res) => {
    const db = readDB();
    db.orders = db.orders.filter(o => o.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});
app.put('/api/orders/:id/status', (req, res) => {
    const db = readDB();
    db.orders = db.orders.map(o => o.id == req.params.id ? { ...o, status: req.body.status } : o);
    writeDB(db);
    res.json({ success: true });
});

// Tables
app.get('/api/tables', (req, res) => res.json(readDB().tables || []));
app.post('/api/tables', (req, res) => {
    const db = readDB();
    db.tables = req.body;
    writeDB(db);
    res.json({ success: true });
});

// Reservations
app.get('/api/reservations', (req, res) => res.json(readDB().reservations));
app.post('/api/reservations', (req, res) => {
    const db = readDB();
    db.reservations = req.body;
    writeDB(db);
    res.json({ success: true });
});

app.delete('/api/reservations/:id', (req, res) => {
    const db = readDB();
    db.reservations = db.reservations.filter(r => r.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/reservations/check', (req, res) => {
    const { date, time, guests } = req.body;
    const db = readDB();
    const duration = calculateDuration(guests);
    const result = findAvailableTables(db, date, time, duration, guests);
    res.json(result);
});

app.post('/api/reservations/submit', (req, res) => {
    const db = readDB();
    const { name, email, phone, date, time, guests, note } = req.body;
    
    // Auto-calculate logic
    const duration = calculateDuration(guests);
    const result = findAvailableTables(db, date, time, duration, guests);

    if (!result.success) {
        return res.status(400).json(result);
    }

    const newRes = {
        id: Date.now(),
        token: Math.random().toString(36).substring(2, 15),
        name,
        email,
        phone,
        date,
        time: time + ' Uhr',
        start_time: time,
        end_time: result.endTime,
        guests,
        note: note || '',
        status: 'Pending',
        assigned_tables: result.tables
    };

    db.reservations.push(newRes);
    writeDB(db);
    res.json({ success: true, reservation: newRes });
});

// Update Reservation (Admin)
app.put('/api/reservations/:id', (req, res) => {
    const db = readDB();
    const idx = db.reservations.findIndex(r => r.id == req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, reason: 'Nicht gefunden' });

    const old = db.reservations[idx];
    const update = req.body;
    
    // Check if critical fields changed (time, date, guests)
    const criticalChanged = old.date !== update.date || old.start_time !== update.start_time || old.guests != update.guests;
    
    if (criticalChanged) {
        // Recalculate capacity/tables if critical fields changed
        const duration = calculateDuration(update.guests);
        const result = findAvailableTables(db, update.date, update.start_time, duration, update.guests);
        if (!result.success) return res.status(400).json(result);
        
        update.assigned_tables = result.tables;
        update.end_time = result.endTime;
        update.time = update.start_time + ' Uhr';
        update.status = 'Requires Confirmation';
    }

    db.reservations[idx] = { ...old, ...update };
    writeDB(db);
    res.json({ success: true, reservation: db.reservations[idx] });
});

// Token-based Actions (Public)
app.get('/api/reservations/cancel/:token', (req, res) => {
    const db = readDB();
    const idx = db.reservations.findIndex(r => r.token === req.params.token);
    if (idx === -1) return res.status(404).send('Invalid token or reservation expired.');
    
    db.reservations[idx].status = 'Cancelled';
    writeDB(db);
    res.send('<h1>Reservierung erfolgreich storniert.</h1><p>Wir hoffen, Sie bald wieder begrüßen zu dürfen.</p>');
});

app.get('/api/reservations/confirm/:token', (req, res) => {
    const db = readDB();
    const idx = db.reservations.findIndex(r => r.token === req.params.token);
    if (idx === -1) return res.status(404).send('Invalid token.');
    
    db.reservations[idx].status = 'Confirmed';
    writeDB(db);
    res.send('<h1>Reservierung erfolgreich bestätigt!</h1><p>Wir freuen uns auf Ihren Besuch.</p>');
});

// Branding
app.get('/api/branding', (req, res) => res.json(readDB().branding));
app.post('/api/branding', (req, res) => {
    const db = readDB();
    db.branding = req.body;
    writeDB(db);
    res.json({ success: true });
});

// Inventory
app.get('/api/inventory', (req, res) => res.json(readDB().inventory));
app.post('/api/inventory', (req, res) => {
    const db = readDB();
    db.inventory = req.body;
    writeDB(db);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`OPA! Backend running on http://localhost:${PORT}`);
});
