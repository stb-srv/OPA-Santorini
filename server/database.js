const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema initialisieren (wird nur beim ersten Start ausgeführt) ---
db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
        user TEXT PRIMARY KEY,
        pass TEXT NOT NULL,
        name TEXT,
        role TEXT DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS menu (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        price     REAL,
        cat       TEXT,
        desc      TEXT,
        allergens TEXT DEFAULT '[]',
        additives TEXT DEFAULT '[]',
        image     TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
        id     TEXT PRIMARY KEY,
        label  TEXT NOT NULL,
        icon   TEXT,
        active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reservations (
        id              INTEGER PRIMARY KEY,
        token           TEXT UNIQUE,
        name            TEXT,
        email           TEXT,
        phone           TEXT,
        date            TEXT,
        time            TEXT,
        start_time      TEXT,
        end_time        TEXT,
        guests          INTEGER DEFAULT 1,
        note            TEXT,
        status          TEXT DEFAULT 'Pending',
        assigned_tables TEXT DEFAULT '[]',
        submittedAt     TEXT,
        ip              TEXT
    );

    CREATE TABLE IF NOT EXISTS tables (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        capacity   INTEGER DEFAULT 2,
        combinable INTEGER DEFAULT 1,
        active     INTEGER DEFAULT 1,
        area_id    TEXT DEFAULT 'main'
    );

    CREATE TABLE IF NOT EXISTS orders (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        data      TEXT NOT NULL
    );
`);

// --- Migrations for users table ---
try { db.exec("ALTER TABLE users ADD COLUMN email TEXT;"); } catch (e) { /* Ignore if it exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN last_name TEXT;"); } catch (e) { /* Ignore if it exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN require_password_change INTEGER DEFAULT 0;"); } catch (e) { /* Ignore if it exists */ }

const safeJsonParse = (str, fallback = null) => {
    try { return str ? JSON.parse(str) : fallback; }
    catch (e) { return fallback; }
};

const DB = {
    // KV Store
    getKV: (key, defaultValue = null) => {
        const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
        return row ? safeJsonParse(row.value, defaultValue) : defaultValue;
    },
    setKV: (key, value) => {
        db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    },

    // Users
    getUsers: () => db.prepare('SELECT user, name, last_name, email, role, require_password_change FROM users').all(),
    setUserPass: (user, hashedPass) => {
        db.prepare('UPDATE users SET pass = ?, require_password_change = 0 WHERE user = ?').run(hashedPass, user);
    },
    addUser: (u) => {
        db.prepare('INSERT INTO users (user, pass, name, last_name, email, role, require_password_change) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            u.user, u.pass, u.name, u.last_name || '', u.email || '', u.role || 'admin', u.require_password_change || 0
        );
    },
    updateUser: (user, u) => {
        db.prepare('UPDATE users SET name = ?, last_name = ?, email = ?, role = ? WHERE user = ?').run(
            u.name, u.last_name || '', u.email || '', u.role, user
        );
    },
    deleteUser: (user) => {
        db.prepare('DELETE FROM users WHERE user = ?').run(user);
    },

    // Menu
    getMenu: () => {
        const rows = db.prepare('SELECT * FROM menu').all();
        return rows.map(r => ({ ...r, allergens: safeJsonParse(r.allergens, []), additives: safeJsonParse(r.additives, []) }));
    },
    saveMenu: (items) => {
        const insert = db.prepare('INSERT OR REPLACE INTO menu (id, name, price, cat, desc, allergens, additives, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        db.transaction((list) => {
            db.prepare('DELETE FROM menu').run();
            list.forEach(m => insert.run(m.id, m.name, m.price, m.cat, m.desc, JSON.stringify(m.allergens || []), JSON.stringify(m.additives || []), m.image));
        })(items);
    },

    // Categories
    getCategories: () => db.prepare('SELECT * FROM categories').all(),
    saveCategories: (cats) => {
        const insert = db.prepare('INSERT OR REPLACE INTO categories (id, label, icon, active) VALUES (?, ?, ?, ?)');
        db.transaction((list) => {
            db.prepare('DELETE FROM categories').run();
            list.forEach(c => insert.run(c.id, c.label, c.icon, c.active ? 1 : 0));
        })(cats);
    },

    // Reservations
    getReservations: () => {
        const rows = db.prepare('SELECT * FROM reservations ORDER BY submittedAt DESC').all();
        return rows.map(r => ({ ...r, assigned_tables: safeJsonParse(r.assigned_tables, []) }));
    },
    addReservation: (r) => {
        db.prepare(`
            INSERT INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(r.id, r.token, r.name, r.email, r.phone, r.date, r.time, r.start_time, r.end_time, r.guests, r.note, r.status, JSON.stringify(r.assigned_tables || []), r.submittedAt, r.ip);
    },
    updateReservation: (id, update) => {
        const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
        if (!existing) return null;
        const merged = { ...existing, ...update };
        merged.assigned_tables = safeJsonParse(
            typeof update.assigned_tables !== 'undefined'
                ? JSON.stringify(update.assigned_tables)
                : existing.assigned_tables,
            []
        );
        db.prepare(`
            UPDATE reservations SET
            name = ?, email = ?, phone = ?, date = ?, time = ?, start_time = ?, end_time = ?,
            guests = ?, note = ?, status = ?, assigned_tables = ?
            WHERE id = ?
        `).run(merged.name, merged.email, merged.phone, merged.date, merged.time, merged.start_time, merged.end_time, merged.guests, merged.note, merged.status, JSON.stringify(merged.assigned_tables), id);
        return merged;
    },
    deleteReservation: (id) => {
        db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
    },
    saveReservations: (list) => {
        const insert = db.prepare('INSERT OR REPLACE INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        db.transaction((items) => {
            db.prepare('DELETE FROM reservations').run();
            items.forEach(r => insert.run(r.id, r.token, r.name, r.email, r.phone, r.date, r.time, r.start_time, r.end_time, r.guests, r.note, r.status, JSON.stringify(r.assigned_tables || []), r.submittedAt, r.ip));
        })(list);
    },

    // Tables
    getTables: () => db.prepare('SELECT * FROM tables').all(),
    saveTables: (tables) => {
        const upsert = db.prepare('INSERT OR REPLACE INTO tables (id, name, capacity, combinable, active, area_id) VALUES (?, ?, ?, ?, ?, ?)');
        const deactivateOthers = db.prepare('UPDATE tables SET active = 0 WHERE id NOT IN (SELECT value FROM json_each(?))');
        db.transaction((list) => {
            list.forEach(t => upsert.run(t.id, t.name, t.capacity, t.combinable ? 1 : 0, t.active ? 1 : 0, t.area_id || 'main'));
            deactivateOthers.run(JSON.stringify(list.map(t => t.id)));
        })(tables);
    },

    // Orders
    getOrders: () => {
        const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
        return rows.map(r => safeJsonParse(r.data, {}));
    },
    addOrder: (order) => {
        db.prepare('INSERT INTO orders (timestamp, data) VALUES (?, ?)').run(order.timestamp || new Date().toISOString(), JSON.stringify(order));
    }
};

module.exports = DB;
