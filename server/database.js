const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema initialisieren ---
db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
        user                    TEXT PRIMARY KEY,
        pass                    TEXT NOT NULL,
        name                    TEXT,
        last_name               TEXT,
        email                   TEXT,
        role                    TEXT DEFAULT 'admin',
        require_password_change INTEGER DEFAULT 0,
        recovery_codes          TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS menu (
        id        TEXT PRIMARY KEY,
        number    TEXT,
        name      TEXT NOT NULL,
        price     REAL,
        cat       TEXT,
        desc      TEXT,
        allergens TEXT DEFAULT '[]',
        additives TEXT DEFAULT '[]',
        image     TEXT,
        active    INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS categories (
        id         TEXT PRIMARY KEY,
        label      TEXT NOT NULL,
        icon       TEXT,
        active     INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0
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
        id          TEXT PRIMARY KEY,
        table_id    TEXT,
        table_name  TEXT,
        status      TEXT DEFAULT 'pending',
        timestamp   TEXT,
        total       REAL DEFAULT 0,
        note        TEXT,
        items       TEXT DEFAULT '[]'
    );
`);

// --- Migrations (idempotent - laufen bei jedem Start) ---
const migrations = [
    "ALTER TABLE users ADD COLUMN email TEXT",
    "ALTER TABLE users ADD COLUMN last_name TEXT",
    "ALTER TABLE users ADD COLUMN require_password_change INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN recovery_codes TEXT DEFAULT '[]'",
    "ALTER TABLE menu ADD COLUMN number TEXT",
    "ALTER TABLE menu ADD COLUMN active INTEGER DEFAULT 1",
    "ALTER TABLE orders ADD COLUMN table_id TEXT",
    "ALTER TABLE orders ADD COLUMN table_name TEXT",
    "ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'",
    "ALTER TABLE orders ADD COLUMN total REAL DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN note TEXT",
    "ALTER TABLE orders ADD COLUMN items TEXT DEFAULT '[]'",
    "ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0",
];
migrations.forEach(sql => { try { db.exec(sql + ';'); } catch (e) { /* column already exists */ } });

// --- Performance-Indizes ---
[
    "CREATE INDEX IF NOT EXISTS idx_reservations_date   ON reservations(date)",
    "CREATE INDEX IF NOT EXISTS idx_reservations_token  ON reservations(token)",
    "CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)",
    "CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status)",
    "CREATE INDEX IF NOT EXISTS idx_orders_timestamp    ON orders(timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_menu_cat            ON menu(cat)",
    "CREATE INDEX IF NOT EXISTS idx_categories_sort     ON categories(sort_order)",
].forEach(sql => { try { db.exec(sql + ';'); } catch (e) {} });

const safeJsonParse = (str, fallback = null) => {
    try { return str ? JSON.parse(str) : fallback; }
    catch (e) { return fallback; }
};

// --- Gecachte Prepared Statements (Performance) ---
const stmts = {
    getKV:              db.prepare('SELECT value FROM kv_store WHERE key = ?'),
    setKV:              db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)'),
    getUsers:           db.prepare('SELECT user, pass, name, last_name, email, role, require_password_change, recovery_codes FROM users'),
    getUserByName:      db.prepare('SELECT * FROM users WHERE user = ?'),
    setUserPass:        db.prepare('UPDATE users SET pass = ?, require_password_change = ? WHERE user = ?'),
    setRequirePwChange: db.prepare('UPDATE users SET require_password_change = ? WHERE user = ?'),
    setRecoveryCodes:   db.prepare('UPDATE users SET recovery_codes = ? WHERE user = ?'),
    addUser:            db.prepare('INSERT OR REPLACE INTO users (user, pass, name, last_name, email, role, require_password_change, recovery_codes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    updateUser:         db.prepare('UPDATE users SET name = ?, last_name = ?, email = ?, role = ? WHERE user = ?'),
    deleteUser:         db.prepare('DELETE FROM users WHERE user = ?'),
    getMenu:            db.prepare('SELECT * FROM menu ORDER BY cat, name'),
    getMenuById:        db.prepare('SELECT * FROM menu WHERE id = ?'),
    addMenu:            db.prepare('INSERT INTO menu (id, number, name, price, cat, desc, allergens, additives, image, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    deleteMenu:         db.prepare('DELETE FROM menu WHERE id = ?'),
    deleteAllMenu:      db.prepare('DELETE FROM menu'),
    upsertMenu:         db.prepare('INSERT OR REPLACE INTO menu (id, number, name, price, cat, desc, allergens, additives, image, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    updateMenuRow:      db.prepare('UPDATE menu SET number = ?, name = ?, price = ?, cat = ?, desc = ?, allergens = ?, additives = ?, image = ?, active = ? WHERE id = ?'),
    getCategories:      db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, label ASC'),
    getCategoryById:    db.prepare('SELECT * FROM categories WHERE id = ?'),
    addCategory:        db.prepare('INSERT INTO categories (id, label, icon, active, sort_order) VALUES (?, ?, ?, ?, ?)'),
    updateCategory:     db.prepare('UPDATE categories SET label = ?, icon = ?, active = ?, sort_order = ? WHERE id = ?'),
    deleteCategory:     db.prepare('DELETE FROM categories WHERE id = ?'),
    deleteAllCategories:db.prepare('DELETE FROM categories'),
    upsertCategory:     db.prepare('INSERT OR REPLACE INTO categories (id, label, icon, active, sort_order) VALUES (?, ?, ?, ?, ?)'),
    getReservations:    db.prepare('SELECT * FROM reservations ORDER BY submittedAt DESC'),
    getReservationById: db.prepare('SELECT * FROM reservations WHERE id = ?'),
    addReservation:     db.prepare('INSERT INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    updateReservation:  db.prepare('UPDATE reservations SET name = ?, email = ?, phone = ?, date = ?, time = ?, start_time = ?, end_time = ?, guests = ?, note = ?, status = ?, assigned_tables = ? WHERE id = ?'),
    deleteReservation:  db.prepare('DELETE FROM reservations WHERE id = ?'),
    deleteAllReservations: db.prepare('DELETE FROM reservations'),
    upsertReservation:  db.prepare('INSERT OR REPLACE INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    getTables:          db.prepare('SELECT * FROM tables'),
    upsertTable:        db.prepare('INSERT OR REPLACE INTO tables (id, name, capacity, combinable, active, area_id) VALUES (?, ?, ?, ?, ?, ?)'),
    deactivateMissingTables: db.prepare('UPDATE tables SET active = 0 WHERE id NOT IN (SELECT value FROM json_each(?))'),
    getOrders:          db.prepare('SELECT * FROM orders ORDER BY timestamp DESC'),
    getOrderById:       db.prepare('SELECT * FROM orders WHERE id = ?'),
    addOrder:           db.prepare('INSERT OR REPLACE INTO orders (id, table_id, table_name, status, timestamp, total, note, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    updateOrderStatus:  db.prepare('UPDATE orders SET status = ? WHERE id = ?'),
    deleteOrder:        db.prepare('DELETE FROM orders WHERE id = ?'),
};

const DB = {
    // --- KV Store ---
    getKV: (key, defaultValue = null) => {
        const row = stmts.getKV.get(key);
        return row ? safeJsonParse(row.value, defaultValue) : defaultValue;
    },
    setKV: (key, value) => {
        stmts.setKV.run(key, JSON.stringify(value));
    },

    // --- Users ---
    getUsers: () => stmts.getUsers.all(),

    setUserPass: (user, hashedPass, requireChange = false) => {
        stmts.setUserPass.run(hashedPass, requireChange ? 1 : 0, user);
    },

    setRequirePasswordChange: (user, value) => {
        stmts.setRequirePwChange.run(value ? 1 : 0, user);
    },

    setRecoveryCodes: (user, codes) => {
        stmts.setRecoveryCodes.run(JSON.stringify(codes), user);
    },

    addUser: (u) => {
        stmts.addUser.run(
            u.user, u.pass, u.name || '', u.last_name || '', u.email || '',
            u.role || 'admin', u.require_password_change || 0,
            JSON.stringify(u.recovery_codes || [])
        );
    },

    updateUser: (user, u) => {
        stmts.updateUser.run(u.name || '', u.last_name || '', u.email || '', u.role || 'admin', user);
    },

    deleteUser: (user) => stmts.deleteUser.run(user),

    // --- Menu ---
    getMenu: () => {
        const rows = stmts.getMenu.all();
        return rows.map(r => ({
            ...r,
            active: Number(r.active) !== 0,  // fix: explicit Number() conversion prevents 0 !== false bug
            allergens: safeJsonParse(r.allergens, []),
            additives: safeJsonParse(r.additives, [])
        }));
    },

    addMenu: (m) => {
        stmts.addMenu.run(
            m.id, m.number || null, m.name, m.price, m.cat, m.desc,
            JSON.stringify(m.allergens || []), JSON.stringify(m.additives || []),
            m.image || null, m.active !== false ? 1 : 0
        );
    },

    updateMenu: (id, update) => {
        const existing = stmts.getMenuById.get(id);
        if (!existing) return null;
        const merged = {
            ...existing,
            ...update,
            allergens: safeJsonParse(
                typeof update.allergens !== 'undefined' ? JSON.stringify(update.allergens) : existing.allergens, []
            ),
            additives: safeJsonParse(
                typeof update.additives !== 'undefined' ? JSON.stringify(update.additives) : existing.additives, []
            )
        };
        // fix: use explicit Number() to correctly handle SQLite integer 0
        const activeVal = typeof update.active !== 'undefined'
            ? (update.active ? 1 : 0)
            : Number(existing.active);
        stmts.updateMenuRow.run(
            merged.number || null, merged.name, merged.price, merged.cat, merged.desc,
            JSON.stringify(merged.allergens), JSON.stringify(merged.additives),
            merged.image || null, activeVal, id
        );
        return { ...merged, active: activeVal !== 0 };
    },

    deleteMenu: (id) => stmts.deleteMenu.run(id),

    saveMenu: (items) => {
        db.transaction((list) => {
            stmts.deleteAllMenu.run();
            list.forEach(m => stmts.upsertMenu.run(
                m.id || Date.now().toString(), m.number || null,
                m.name, m.price, m.cat, m.desc,
                JSON.stringify(m.allergens || []), JSON.stringify(m.additives || []),
                m.image || null, m.active !== false ? 1 : 0
            ));
        })(items);
    },

    // --- Categories ---
    getCategories: () => stmts.getCategories.all(),

    addCategory: (c) => {
        stmts.addCategory.run(c.id, c.label, c.icon || '', c.active !== false ? 1 : 0, c.sort_order || 0);
    },

    updateCategory: (id, update) => {
        const existing = stmts.getCategoryById.get(id);
        if (!existing) return null;
        const merged = { ...existing, ...update };
        stmts.updateCategory.run(
            merged.label, merged.icon || '', merged.active !== false ? 1 : 0,
            merged.sort_order || 0, id
        );
        return merged;
    },

    deleteCategory: (id) => stmts.deleteCategory.run(id),

    saveCategories: (items) => {
        db.transaction((list) => {
            stmts.deleteAllCategories.run();
            list.forEach((c, i) => stmts.upsertCategory.run(
                c.id, c.label, c.icon || '', c.active !== false ? 1 : 0,
                typeof c.sort_order !== 'undefined' ? c.sort_order : i
            ));
        })(items);
    },

    // --- Reservations ---
    getReservations: () => {
        const rows = stmts.getReservations.all();
        return rows.map(r => ({ ...r, assigned_tables: safeJsonParse(r.assigned_tables, []) }));
    },

    addReservation: (r) => {
        stmts.addReservation.run(
            r.id, r.token, r.name, r.email, r.phone, r.date, r.time,
            r.start_time, r.end_time, r.guests, r.note || '', r.status,
            JSON.stringify(r.assigned_tables || []), r.submittedAt, r.ip || null
        );
    },

    updateReservation: (id, update) => {
        const existing = stmts.getReservationById.get(id);
        if (!existing) return null;
        const merged = { ...existing, ...update };
        merged.assigned_tables = safeJsonParse(
            typeof update.assigned_tables !== 'undefined'
                ? JSON.stringify(update.assigned_tables)
                : existing.assigned_tables,
            []
        );
        stmts.updateReservation.run(
            merged.name, merged.email, merged.phone, merged.date, merged.time,
            merged.start_time, merged.end_time, merged.guests, merged.note || '',
            merged.status, JSON.stringify(merged.assigned_tables), id
        );
        return merged;
    },

    deleteReservation: (id) => stmts.deleteReservation.run(id),

    // fix: guard against empty list to prevent accidental full data wipe
    saveReservations: (list) => {
        if (!Array.isArray(list) || list.length === 0) {
            console.warn('[DB] saveReservations called with empty list – skipping to prevent data loss.');
            return;
        }
        db.transaction((items) => {
            stmts.deleteAllReservations.run();
            items.forEach(r => stmts.upsertReservation.run(
                r.id, r.token, r.name, r.email, r.phone,
                r.date, r.time, r.start_time, r.end_time, r.guests,
                r.note || '', r.status, JSON.stringify(r.assigned_tables || []),
                r.submittedAt, r.ip || null
            ));
        })(list);
    },

    // --- Tables ---
    getTables: () => stmts.getTables.all(),

    saveTables: (tables) => {
        db.transaction((list) => {
            list.forEach(t => stmts.upsertTable.run(
                t.id, t.name, t.capacity || 2,
                t.combinable !== false ? 1 : 0,
                t.active !== false ? 1 : 0,
                t.area_id || 'main'
            ));
            if (list.length > 0) {
                stmts.deactivateMissingTables.run(JSON.stringify(list.map(t => t.id)));
            }
        })(tables);
    },

    // --- Orders ---
    getOrders: () => {
        const rows = stmts.getOrders.all();
        return rows.map(r => ({ ...r, items: safeJsonParse(r.items, []) }));
    },

    getOrderById: (id) => {
        const r = stmts.getOrderById.get(id);
        if (!r) return null;
        return { ...r, items: safeJsonParse(r.items, []) };
    },

    addOrder: (order) => {
        stmts.addOrder.run(
            order.id || Date.now().toString(),
            order.table_id || order.tableId || null,
            order.table_name || order.tableName || null,
            order.status || 'pending',
            order.timestamp || new Date().toISOString(),
            order.total || 0,
            order.note || null,
            JSON.stringify(order.items || [])
        );
    },

    updateOrderStatus: (id, status) => stmts.updateOrderStatus.run(status, id),

    deleteOrder: (id) => stmts.deleteOrder.run(id),
};

module.exports = DB;
