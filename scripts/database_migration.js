const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'database.sqlite');
const DATA_FILE = path.join(__dirname, 'server', 'db.json');

// Initialize Database
const db = new Database(DB_PATH);

function initSchema() {
    console.log('🏛️ Initializing SQLite Schema...');
    
    // Users
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user TEXT UNIQUE,
            pass TEXT,
            name TEXT,
            role TEXT
        )
    `).run();

    // Menu
    db.prepare(`
        CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            price TEXT,
            cat TEXT,
            desc TEXT,
            allergens TEXT, -- JSON array
            additives TEXT, -- JSON array
            image TEXT
        )
    `).run();

    // Categories
    db.prepare(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            label TEXT,
            icon TEXT,
            active INTEGER DEFAULT 1
        )
    `).run();

    // Reservations
    db.prepare(`
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY,
            token TEXT UNIQUE,
            name TEXT,
            email TEXT,
            phone TEXT,
            date TEXT,
            time TEXT,
            start_time TEXT,
            end_time TEXT,
            guests INTEGER,
            note TEXT,
            status TEXT,
            assigned_tables TEXT, -- JSON array
            submittedAt TEXT,
            ip TEXT
        )
    `).run();

    // Tables
    db.prepare(`
        CREATE TABLE IF NOT EXISTS tables (
            id TEXT PRIMARY KEY,
            name TEXT,
            capacity INTEGER,
            combinable INTEGER,
            active INTEGER,
            area_id TEXT
        )
    `).run();

    // Orders
    db.prepare(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            data TEXT -- Bulk JSON for order details
        )
    `).run();

    // Key-Value Store (For Single-Object configurations)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `).run();

    console.log('✅ Schema initialized.');
}

async function migrateData() {
    if (!fs.existsSync(DATA_FILE)) {
        console.log('⚠️ No db.json found. Skipping migration.');
        return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log('📦 Migrating data from db.json...');

    const insertUser = db.prepare('INSERT OR IGNORE INTO users (user, pass, name, role) VALUES (?, ?, ?, ?)');
    const insertMenu = db.prepare('INSERT OR IGNORE INTO menu (id, name, price, cat, desc, allergens, additives, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id, label, icon, active) VALUES (?, ?, ?, ?)');
    const insertRes = db.prepare('INSERT OR IGNORE INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertTable = db.prepare('INSERT OR IGNORE INTO tables (id, name, capacity, combinable, active, area_id) VALUES (?, ?, ?, ?, ?, ?)');
    const insertOrder = db.prepare('INSERT OR IGNORE INTO orders (timestamp, data) VALUES (?, ?)');
    const insertKV = db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)');

    db.transaction(() => {
        // Users
        (data.users || []).forEach(u => insertUser.run(u.user, u.pass, u.name, u.role));
        
        // Menu
        (data.menu || []).forEach(m => insertMenu.run(m.id, m.name, m.price, m.cat, m.desc || '', JSON.stringify(m.allergens || []), JSON.stringify(m.additives || []), m.image || ''));
        
        // Categories
        (data.categories || []).forEach(c => insertCat.run(c.id, c.label, c.icon, c.active ? 1 : 0));
        
        // Reservations
        (data.reservations || []).forEach(r => insertRes.run(r.id, r.token, r.name, r.email, r.phone, r.date, r.time, r.start_time, r.end_time, r.guests, r.note, r.status, JSON.stringify(r.assigned_tables || []), r.submittedAt, r.ip));
        
        // Tables
        (data.tables || []).forEach(t => insertTable.run(t.id, t.name, t.capacity, t.combinable ? 1 : 0, t.active ? 1 : 0, t.area_id || 'main'));
        
        // Orders
        (data.orders || []).forEach(o => insertOrder.run(o.timestamp, JSON.stringify(o)));

        // Config objects
        const kvItems = ['branding', 'homepage', 'settings', 'plugins', 'allergens', 'additives'];
        kvItems.forEach(key => {
            if (data[key]) insertKV.run(key, JSON.stringify(data[key]));
        });
    })();

    console.log('✅ Migration finished.');
}

initSchema();
migrateData();
db.close();
