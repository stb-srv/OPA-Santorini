const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Performance boost
 
const safeJsonParse = (str, fallback = null) => {
    try { return str ? JSON.parse(str) : fallback; }
    catch (e) { return fallback; }
};

const DB = {
    // KV Store Helpers
    getKV: (key, defaultValue = null) => {
        const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
        return row ? safeJsonParse(row.value, defaultValue) : defaultValue;
    },
    setKV: (key, value) => {
        db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    },

    // Users
    getUsers: () => db.prepare('SELECT * FROM users').all(),
    setUserPass: (user, hashedPass) => db.prepare('UPDATE users SET pass = ? WHERE user = ?').run(hashedPass, user),
    saveUsers: (users) => {
        const insert = db.prepare('INSERT OR REPLACE INTO users (user, pass, name, role) VALUES (?, ?, ?, ?)');
        db.transaction((list) => {
            db.prepare('DELETE FROM users').run(); // Bulk update by flushing first (matching current logic)
            list.forEach(u => insert.run(u.user, u.pass, u.name, u.role));
        })(users);
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
            list.forEach(m => insert.run(m.id, m.name, m.price, m.cat, m.desc, JSON.stringify(m.allergens), JSON.stringify(m.additives), m.image));
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
        `).run(r.id, r.token, r.name, r.email, r.phone, r.date, r.time, r.start_time, r.end_time, r.guests, r.note, r.status, JSON.stringify(r.assigned_tables), r.submittedAt, r.ip);
    },
    updateReservation: (id, update) => {
        const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
        if (!existing) return null;
        
        const parsedExisting = { ...existing };
        parsedExisting.assigned_tables = safeJsonParse(parsedExisting.assigned_tables, []);

        const merged = { ...parsedExisting, ...update };
        db.prepare(`
            UPDATE reservations SET
            name = ?, email = ?, phone = ?, date = ?, time = ?, start_time = ?, end_time = ?, guests = ?, note = ?, status = ?, assigned_tables = ?
            WHERE id = ?
        `).run(merged.name, merged.email, merged.phone, merged.date, merged.time, merged.start_time, merged.end_time, merged.guests, merged.note, merged.status, JSON.stringify(merged.assigned_tables || []), id);
        return merged;
    },
    deleteReservation: (id) => {
        db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
    },
    saveReservations: (list) => {
        const insert = db.prepare('INSERT OR REPLACE INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        db.transaction((items) => {
            db.prepare('DELETE FROM reservations').run();
            items.forEach(r => insert.run(r.id, r.token, r.name, r.email, r.phone, r.date, r.time, r.start_time, r.end_time, r.guests, r.note, r.status, JSON.stringify(r.assigned_tables), r.submittedAt, r.ip));
        })(list);
    },

    // Tables
    getTables: () => db.prepare('SELECT * FROM tables').all(),
    saveTables: (tables) => {
        const upsert = db.prepare('INSERT OR REPLACE INTO tables (id, name, capacity, combinable, active, area_id) VALUES (?, ?, ?, ?, ?, ?)');
        const deactivateOthers = db.prepare('UPDATE tables SET active = 0 WHERE id NOT IN (SELECT value FROM json_each(?))');
        
        db.transaction((list) => {
            list.forEach(t => upsert.run(t.id, t.name, t.capacity, t.combinable ? 1 : 0, t.active ? 1 : 0, t.area_id || 'main'));
            const ids = list.map(t => t.id);
            deactivateOthers.run(JSON.stringify(ids));
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
