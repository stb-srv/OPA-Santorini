/**
 * Meraki CMS – Datenbank-Adapter Loader
 *
 * Wählt automatisch den richtigen Adapter:
 *   DB_TYPE=mysql  → server/database-mysql.js  (MySQL / MariaDB)
 *   DB_TYPE=sqlite → SQLite via better-sqlite3  (Standard / Fallback)
 *
 * Das Interface (alle exportierten Methoden) ist in beiden Adaptern identisch.
 * Sämtliche Methoden im MySQL-Adapter sind async; im SQLite-Adapter synchron.
 * Alle Route-Handler die await nutzen funktionieren mit beiden Adaptern.
 */

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

if (dbType === 'mysql' || dbType === 'mariadb') {
    console.log('\uD83D\uDDC3\uFE0F  Datenbank-Adapter: MySQL/MariaDB');
    module.exports = require('./mysql.js');
} else {
    console.log('\uD83D\uDDC3\uFE0F  Datenbank-Adapter: SQLite (Standard)');

    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');

    const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
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
            active    INTEGER DEFAULT 1,
            available INTEGER DEFAULT 1,
            is_daily_special INTEGER DEFAULT 0,
            translations TEXT DEFAULT '{}',
            sort_order INTEGER DEFAULT 0,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS categories (
            id         TEXT PRIMARY KEY,
            label      TEXT NOT NULL,
            icon       TEXT,
            active     INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            translations TEXT DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS reservations (
            id              TEXT PRIMARY KEY,
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
            orderToken  TEXT,
            type        TEXT DEFAULT 'dine_in',
            status      TEXT DEFAULT 'pending',
            timestamp   TEXT,
            total       REAL DEFAULT 0,
            note        TEXT,
            items       TEXT DEFAULT '[]',
            customerName TEXT,
            customerPhone TEXT,
            customerEmail TEXT,
            deliveryAddress TEXT,
            estimatedTime TEXT,
            confirmedAt   TEXT
        );

        CREATE TABLE IF NOT EXISTS menu_price_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            dish_id    TEXT,
            old_price  REAL,
            new_price  REAL,
            changed_by TEXT,
            changed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            actor      TEXT,
            action     TEXT,
            entity     TEXT,
            entity_id  TEXT,
            detail     TEXT,
            ts         TEXT
        );

        CREATE TABLE IF NOT EXISTS feedback (
            id          TEXT PRIMARY KEY,
            guest_name  TEXT,
            rating      INTEGER DEFAULT 5,
            comment     TEXT,
            created_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS push_subscriptions (
            endpoint     TEXT PRIMARY KEY,
            keys_p256dh  TEXT,
            keys_auth    TEXT,
            created_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS reservation_locks (
            slot_key   TEXT PRIMARY KEY,
            locked_at  INTEGER NOT NULL
        );
    `);

    // --- Migrations (idempotent) ---
    const migrations = [
        'ALTER TABLE users ADD COLUMN email TEXT',
        'ALTER TABLE users ADD COLUMN last_name TEXT',
        'ALTER TABLE users ADD COLUMN require_password_change INTEGER DEFAULT 0',
        "ALTER TABLE users ADD COLUMN recovery_codes TEXT DEFAULT '[]'",
        'ALTER TABLE menu ADD COLUMN number TEXT',
        'ALTER TABLE menu ADD COLUMN active INTEGER DEFAULT 1',
        'ALTER TABLE menu ADD COLUMN available INTEGER DEFAULT 1',
        'ALTER TABLE menu ADD COLUMN updated_at TEXT',
        'ALTER TABLE menu ADD COLUMN sort_order INTEGER DEFAULT 0',
        'ALTER TABLE menu ADD COLUMN is_daily_special INTEGER DEFAULT 0',
        "ALTER TABLE menu ADD COLUMN translations TEXT DEFAULT '{}'",
        "ALTER TABLE menu ADD COLUMN available_days TEXT DEFAULT '[]'",
        'ALTER TABLE orders ADD COLUMN table_id TEXT',
        'ALTER TABLE orders ADD COLUMN table_name TEXT',
        "ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'",
        'ALTER TABLE orders ADD COLUMN total REAL DEFAULT 0',
        'ALTER TABLE orders ADD COLUMN note TEXT',
        "ALTER TABLE orders ADD COLUMN items TEXT DEFAULT '[]'",
        'ALTER TABLE orders ADD COLUMN orderToken TEXT',
        "ALTER TABLE orders ADD COLUMN type TEXT DEFAULT 'dine_in'",
        'ALTER TABLE orders ADD COLUMN customerName TEXT',
        'ALTER TABLE orders ADD COLUMN customerPhone TEXT',
        'ALTER TABLE orders ADD COLUMN customerEmail TEXT',
        'ALTER TABLE orders ADD COLUMN deliveryAddress TEXT',
        'ALTER TABLE orders ADD COLUMN estimatedTime TEXT',
        'ALTER TABLE orders ADD COLUMN confirmedAt TEXT',
        'ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0',
        "ALTER TABLE categories ADD COLUMN translations TEXT DEFAULT '{}'",
        'ALTER TABLE reservations ADD COLUMN reminderSent INTEGER DEFAULT 0',
    ];
    migrations.forEach((sql) => {
        try {
            db.exec(sql + ';');
        } catch (e) {
            /* column already exists */
        }
    });

    [
        'CREATE INDEX IF NOT EXISTS idx_reservations_date   ON reservations(date)',
        'CREATE INDEX IF NOT EXISTS idx_reservations_token  ON reservations(token)',
        'CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)',
        'CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status)',
        'CREATE INDEX IF NOT EXISTS idx_orders_timestamp    ON orders(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_menu_cat            ON menu(cat)',
        'CREATE INDEX IF NOT EXISTS idx_categories_sort     ON categories(sort_order)',
        'CREATE INDEX IF NOT EXISTS idx_price_hist_dish     ON menu_price_history(dish_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_ts            ON audit_log(ts)',
    ].forEach((sql) => {
        try {
            db.exec(sql + ';');
        } catch (e) {}
    });

    const safeJsonParse = (str, fallback = null) => {
        try {
            return str ? JSON.parse(str) : fallback;
        } catch (e) {
            return fallback;
        }
    };

    const stmts = {
        getKV: db.prepare('SELECT value FROM kv_store WHERE key = ?'),
        setKV: db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)'),
        getUsers: db.prepare(
            'SELECT user, pass, name, last_name, email, role, require_password_change, recovery_codes FROM users'
        ),
        getUserByName: db.prepare('SELECT * FROM users WHERE user = ?'),
        setUserPass: db.prepare(
            'UPDATE users SET pass = ?, require_password_change = ? WHERE user = ?'
        ),
        setRequirePwChange: db.prepare(
            'UPDATE users SET require_password_change = ? WHERE user = ?'
        ),
        setRecoveryCodes: db.prepare('UPDATE users SET recovery_codes = ? WHERE user = ?'),
        addUser: db.prepare(
            'INSERT OR REPLACE INTO users (user, pass, name, last_name, email, role, require_password_change, recovery_codes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ),
        updateUser: db.prepare(
            'UPDATE users SET name = ?, last_name = ?, email = ?, role = ? WHERE user = ?'
        ),
        deleteUser: db.prepare('DELETE FROM users WHERE user = ?'),
        getMenu: db.prepare('SELECT * FROM menu ORDER BY cat, COALESCE(sort_order, 0), name'),
        getMenuById: db.prepare('SELECT * FROM menu WHERE id = ?'),
        addMenu: db.prepare(
            'INSERT INTO menu (id, number, name, price, cat, desc, allergens, additives, image, active, available, is_daily_special, translations, sort_order, available_days, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ),
        deleteMenu: db.prepare('DELETE FROM menu WHERE id = ?'),
        deleteAllMenu: db.prepare('DELETE FROM menu'),
        upsertMenu: db.prepare(
            'INSERT OR REPLACE INTO menu (id, number, name, price, cat, desc, allergens, additives, image, active, available, is_daily_special, translations, sort_order, available_days, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ),
        updateMenuRow: db.prepare(
            'UPDATE menu SET number = ?, name = ?, price = ?, cat = ?, desc = ?, allergens = ?, additives = ?, image = ?, active = ?, available = ?, is_daily_special = ?, translations = ?, sort_order = ?, available_days = ?, updated_at = ? WHERE id = ?'
        ),
        addPriceHistory: db.prepare(
            'INSERT INTO menu_price_history (dish_id, old_price, new_price, changed_by, changed_at) VALUES (?, ?, ?, ?, ?)'
        ),
        getPriceHistory: db.prepare(
            'SELECT old_price, new_price, changed_by, changed_at FROM menu_price_history WHERE dish_id = ? ORDER BY id DESC LIMIT 20'
        ),
        addAudit: db.prepare(
            'INSERT INTO audit_log (actor, action, entity, entity_id, detail, ts) VALUES (?, ?, ?, ?, ?, ?)'
        ),
        getAudit: db.prepare(
            'SELECT actor, action, entity, entity_id, detail, ts FROM audit_log ORDER BY id DESC LIMIT ?'
        ),
        getCategories: db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, label ASC'),
        getCategoryById: db.prepare('SELECT * FROM categories WHERE id = ?'),
        addCategory: db.prepare(
            'INSERT INTO categories (id, label, icon, active, sort_order, translations) VALUES (?, ?, ?, ?, ?, ?)'
        ),
        updateCategory: db.prepare(
            'UPDATE categories SET label = ?, icon = ?, active = ?, sort_order = ?, translations = ? WHERE id = ?'
        ),
        deleteCategory: db.prepare('DELETE FROM categories WHERE id = ?'),
        deleteAllCategories: db.prepare('DELETE FROM categories'),
        upsertCategory: db.prepare(
            'INSERT OR REPLACE INTO categories (id, label, icon, active, sort_order, translations) VALUES (?, ?, ?, ?, ?, ?)'
        ),
        getReservations: db.prepare('SELECT * FROM reservations ORDER BY submittedAt DESC'),
        getReservationById: db.prepare('SELECT * FROM reservations WHERE id = ?'),
        addReservation: db.prepare(
            'INSERT INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ),
        updateReservation: db.prepare(
            'UPDATE reservations SET name = ?, email = ?, phone = ?, date = ?, time = ?, start_time = ?, end_time = ?, guests = ?, note = ?, status = ?, assigned_tables = ?, reminderSent = ? WHERE id = ?'
        ),
        deleteReservation: db.prepare('DELETE FROM reservations WHERE id = ?'),
        deleteAllReservations: db.prepare('DELETE FROM reservations'),
        upsertReservation: db.prepare(
            'INSERT OR REPLACE INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip, reminderSent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ),
        getTables: db.prepare('SELECT * FROM tables'),
        upsertTable: db.prepare(
            'INSERT OR REPLACE INTO tables (id, name, capacity, combinable, active, area_id) VALUES (?, ?, ?, ?, ?, ?)'
        ),
        deactivateMissingTables: db.prepare(
            'UPDATE tables SET active = 0 WHERE id NOT IN (SELECT value FROM json_each(?))'
        ),
        getOrders: db.prepare('SELECT * FROM orders ORDER BY timestamp DESC'),
        getOrderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
        getOrderByToken: db.prepare('SELECT * FROM orders WHERE orderToken = ? LIMIT 1'),
        addOrder: db.prepare(
            'INSERT OR REPLACE INTO orders (id, table_id, table_name, orderToken, type, status, timestamp, total, note, items, customerName, customerPhone, customerEmail, deliveryAddress, estimatedTime, confirmedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ),
        updateOrderStatus: db.prepare(
            'UPDATE orders SET status = ?, estimatedTime = ?, confirmedAt = ? WHERE id = ?'
        ),
        deleteOrder: db.prepare('DELETE FROM orders WHERE id = ?'),
        getFeedback: db.prepare('SELECT * FROM feedback ORDER BY created_at DESC'),
        addFeedback: db.prepare(
            'INSERT INTO feedback (id, guest_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)'
        ),
        deleteFeedback: db.prepare('DELETE FROM feedback WHERE id = ?'),
        insertSlotLock: db.prepare(
            'INSERT INTO reservation_locks (slot_key, locked_at) VALUES (?, ?)'
        ),
        stealSlotLock: db.prepare(
            'UPDATE reservation_locks SET locked_at = ? WHERE slot_key = ? AND locked_at < ?'
        ),
        deleteSlotLock: db.prepare('DELETE FROM reservation_locks WHERE slot_key = ?'),
    };

    const DB = {
        getKV: (key, defaultValue = null) => {
            const row = stmts.getKV.get(key);
            return row ? safeJsonParse(row.value, defaultValue) : defaultValue;
        },
        setKV: (key, value) => {
            stmts.setKV.run(key, JSON.stringify(value));
        },
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
                u.user,
                u.pass,
                u.name || '',
                u.last_name || '',
                u.email || '',
                u.role || 'admin',
                u.require_password_change || 0,
                JSON.stringify(u.recovery_codes || [])
            );
        },
        updateUser: (user, u) => {
            stmts.updateUser.run(
                u.name || '',
                u.last_name || '',
                u.email || '',
                u.role || 'admin',
                user
            );
        },
        deleteUser: (user) => stmts.deleteUser.run(user),
        getMenu: () => {
            const rows = stmts.getMenu.all();
            return rows.map((r) => ({
                ...r,
                active: Number(r.active) !== 0,
                available:
                    r.available !== undefined ? Number(r.available) !== 0 : Number(r.active) !== 0,
                allergens: safeJsonParse(r.allergens, []),
                additives: safeJsonParse(r.additives, []),
                translations: safeJsonParse(r.translations, {}),
                available_days: safeJsonParse(r.available_days, []),
            }));
        },
        addMenu: (m) => {
            stmts.addMenu.run(
                m.id,
                m.number || null,
                m.name,
                m.price,
                m.cat,
                m.desc,
                JSON.stringify(m.allergens || []),
                JSON.stringify(m.additives || []),
                m.image || null,
                m.active !== false ? 1 : 0,
                m.available !== false ? 1 : 0,
                m.is_daily_special ? 1 : 0,
                JSON.stringify(m.translations || {}),
                m.sort_order || 0,
                JSON.stringify(m.available_days || []),
                m.updated_at || null
            );
        },
        updateMenu: (id, update) => {
            const existing = stmts.getMenuById.get(id);
            if (!existing) return null;
            const merged = {
                ...existing,
                ...update,
                allergens: safeJsonParse(
                    typeof update.allergens !== 'undefined'
                        ? JSON.stringify(update.allergens)
                        : existing.allergens,
                    []
                ),
                additives: safeJsonParse(
                    typeof update.additives !== 'undefined'
                        ? JSON.stringify(update.additives)
                        : existing.additives,
                    []
                ),
                translations: safeJsonParse(
                    typeof update.translations !== 'undefined'
                        ? JSON.stringify(update.translations)
                        : existing.translations,
                    {}
                ),
            };
            const rawAvail =
                update.available !== undefined
                    ? update.available
                    : update.active !== undefined
                      ? update.active
                      : null;
            const activeVal = rawAvail !== null ? (rawAvail ? 1 : 0) : Number(existing.active);
            const availVal =
                rawAvail !== null
                    ? rawAvail
                        ? 1
                        : 0
                    : existing.available !== undefined
                      ? Number(existing.available)
                      : Number(existing.active);
            const specialVal =
                update.is_daily_special !== undefined
                    ? update.is_daily_special
                        ? 1
                        : 0
                    : Number(existing.is_daily_special || 0);
            const updatedAt = update.updated_at || existing.updated_at || null;
            const sortOrder =
                typeof update.sort_order !== 'undefined'
                    ? update.sort_order
                    : existing.sort_order || 0;
            const availDays =
                typeof update.available_days !== 'undefined'
                    ? JSON.stringify(update.available_days || [])
                    : existing.available_days || '[]';

            // Preishistorie schreiben, falls sich der Preis ändert
            if (
                typeof update.price !== 'undefined' &&
                Number(update.price) !== Number(existing.price)
            ) {
                try {
                    stmts.addPriceHistory.run(
                        id,
                        Number(existing.price),
                        Number(update.price),
                        update._changed_by || null,
                        new Date().toISOString()
                    );
                } catch (e) {}
            }

            stmts.updateMenuRow.run(
                merged.number || null,
                merged.name,
                merged.price,
                merged.cat,
                merged.desc,
                JSON.stringify(merged.allergens),
                JSON.stringify(merged.additives),
                merged.image || null,
                activeVal,
                availVal,
                specialVal,
                JSON.stringify(merged.translations),
                sortOrder,
                availDays,
                updatedAt,
                id
            );
            return {
                ...merged,
                active: activeVal !== 0,
                available: availVal !== 0,
                is_daily_special: specialVal !== 0,
                sort_order: sortOrder,
                available_days: safeJsonParse(availDays, []),
                updated_at: updatedAt,
            };
        },
        deleteMenu: (id) => stmts.deleteMenu.run(id),
        bulkUpdateMenu: (ids, patch) => {
            const list = Array.isArray(ids) ? ids : [];
            db.transaction((arr) => {
                arr.forEach((id) => DB.updateMenu(id, patch));
            })(list);
            return list.length;
        },
        bulkDeleteMenu: (ids) => {
            const list = Array.isArray(ids) ? ids : [];
            db.transaction((arr) => {
                arr.forEach((id) => stmts.deleteMenu.run(id));
            })(list);
            return list.length;
        },
        getMenuPriceHistory: (id) => stmts.getPriceHistory.all(id),
        addAuditLog: (entry) => {
            try {
                stmts.addAudit.run(
                    entry.actor || null,
                    entry.action || '',
                    entry.entity || '',
                    entry.entity_id || '',
                    entry.detail ? JSON.stringify(entry.detail) : null,
                    new Date().toISOString()
                );
            } catch (e) {}
        },
        getAuditLog: (limit = 100) =>
            stmts.getAudit.all(limit).map((r) => ({ ...r, detail: safeJsonParse(r.detail, null) })),
        saveMenu: (items) => {
            db.transaction((list) => {
                stmts.deleteAllMenu.run();
                list.forEach((m, i) =>
                    stmts.upsertMenu.run(
                        m.id || Date.now().toString(),
                        m.number || null,
                        m.name,
                        m.price,
                        m.cat,
                        m.desc,
                        JSON.stringify(m.allergens || []),
                        JSON.stringify(m.additives || []),
                        m.image || null,
                        m.active !== false ? 1 : 0,
                        m.available !== false ? 1 : 0,
                        m.is_daily_special ? 1 : 0,
                        JSON.stringify(m.translations || {}),
                        m.sort_order || i,
                        JSON.stringify(m.available_days || []),
                        m.updated_at || null
                    )
                );
            })(items);
        },
        getCategories: () =>
            stmts.getCategories.all().map((c) => ({
                ...c,
                active: c.active !== 0,
                translations: safeJsonParse(c.translations, {}),
            })),
        addCategory: (c) => {
            stmts.addCategory.run(
                c.id,
                c.label,
                c.icon || '',
                c.active !== false ? 1 : 0,
                c.sort_order || 0,
                JSON.stringify(c.translations || {})
            );
        },
        updateCategory: (id, update) => {
            const existing = stmts.getCategoryById.get(id);
            if (!existing) return null;
            const merged = { ...existing, ...update };
            const translations = safeJsonParse(
                typeof update.translations !== 'undefined'
                    ? JSON.stringify(update.translations)
                    : existing.translations,
                {}
            );
            stmts.updateCategory.run(
                merged.label,
                merged.icon || '',
                merged.active !== false ? 1 : 0,
                merged.sort_order || 0,
                JSON.stringify(translations),
                id
            );
            return {
                ...merged,
                active: merged.active !== 0,
                translations,
            };
        },
        deleteCategory: (id) => stmts.deleteCategory.run(id),
        saveCategories: (items) => {
            db.transaction((list) => {
                stmts.deleteAllCategories.run();
                list.forEach((c, i) =>
                    stmts.upsertCategory.run(
                        c.id,
                        c.label,
                        c.icon || '',
                        c.active !== false ? 1 : 0,
                        typeof c.sort_order !== 'undefined' ? c.sort_order : i,
                        JSON.stringify(c.translations || {})
                    )
                );
            })(items);
        },
        getReservations: () => {
            const rows = stmts.getReservations.all();
            return rows.map((r) => ({
                ...r,
                assigned_tables: safeJsonParse(r.assigned_tables, []),
            }));
        },
        addReservation: (r) => {
            stmts.addReservation.run(
                r.id,
                r.token,
                r.name,
                r.email,
                r.phone,
                r.date,
                r.time,
                r.start_time,
                r.end_time,
                r.guests,
                r.note || '',
                r.status,
                JSON.stringify(r.assigned_tables || []),
                r.submittedAt,
                r.ip || null
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
                merged.name,
                merged.email,
                merged.phone,
                merged.date,
                merged.time,
                merged.start_time,
                merged.end_time,
                merged.guests,
                merged.note || '',
                merged.status,
                JSON.stringify(merged.assigned_tables),
                merged.reminderSent ? 1 : 0,
                id
            );
            return merged;
        },
        deleteReservation: (id) => stmts.deleteReservation.run(id),
        saveReservations: (list) => {
            if (!Array.isArray(list) || list.length === 0) {
                console.warn(
                    '[DB] saveReservations called with empty list – skipping to prevent data loss.'
                );
                return;
            }
            db.transaction((items) => {
                stmts.deleteAllReservations.run();
                items.forEach((r) =>
                    stmts.upsertReservation.run(
                        r.id,
                        r.token,
                        r.name,
                        r.email,
                        r.phone,
                        r.date,
                        r.time,
                        r.start_time,
                        r.end_time,
                        r.guests,
                        r.note || '',
                        r.status,
                        JSON.stringify(r.assigned_tables || []),
                        r.submittedAt,
                        r.ip || null,
                        r.reminderSent ? 1 : 0
                    )
                );
            })(list);
        },
        getTables: () => stmts.getTables.all(),
        saveTables: (tables) => {
            db.transaction((list) => {
                list.forEach((t) =>
                    stmts.upsertTable.run(
                        t.id,
                        t.name,
                        t.capacity || 2,
                        t.combinable !== false ? 1 : 0,
                        t.active !== false ? 1 : 0,
                        t.area_id || 'main'
                    )
                );
                if (list.length > 0)
                    stmts.deactivateMissingTables.run(JSON.stringify(list.map((t) => t.id)));
            })(tables);
        },
        getOrders: () => {
            const rows = stmts.getOrders.all();
            return rows.map((r) => ({ ...r, items: safeJsonParse(r.items, []) }));
        },
        getOrderById: (id) => {
            const r = stmts.getOrderById.get(id);
            if (!r) return null;
            return { ...r, items: safeJsonParse(r.items, []) };
        },
        getOrderByToken: (token) => {
            const r = stmts.getOrderByToken.get(token);
            if (!r) return null;
            return { ...r, items: safeJsonParse(r.items, []) };
        },
        addOrder: (order) => {
            stmts.addOrder.run(
                order.id || Date.now().toString(),
                order.table_id || order.tableId || null,
                order.table_name || order.tableName || null,
                order.orderToken || null,
                order.type || 'dine_in',
                order.status || 'pending',
                order.timestamp || new Date().toISOString(),
                order.total || 0,
                order.note || null,
                JSON.stringify(order.items || []),
                order.customerName || null,
                order.customerPhone || null,
                order.customerEmail || null,
                order.deliveryAddress || null,
                order.estimatedTime || null,
                order.confirmedAt || null
            );
        },
        updateOrderStatus: (id, updateData) => {
            const patch = typeof updateData === 'string' ? { status: updateData } : updateData;
            const existing = stmts.getOrderById.get(id);
            if (!existing) return null;

            const merged = { ...existing, ...patch };
            if (patch.status === 'confirmed' && !merged.confirmedAt) {
                merged.confirmedAt = new Date().toISOString();
            }

            stmts.updateOrderStatus.run(
                merged.status,
                merged.estimatedTime || null,
                merged.confirmedAt || null,
                id
            );
            return { ...merged, items: safeJsonParse(merged.items, []) };
        },
        deleteOrder: (id) => stmts.deleteOrder.run(id),
        getFeedback: () => stmts.getFeedback.all(),
        addFeedback: (f) => {
            stmts.addFeedback.run(
                f.id || Date.now().toString(),
                f.guest_name || null,
                Math.max(1, Math.min(5, parseInt(f.rating, 10) || 5)),
                f.comment || null,
                f.created_at || new Date().toISOString()
            );
        },
        deleteFeedback: (id) => stmts.deleteFeedback.run(id),
        // Atomarer, prozessübergreifender Lock für Reservierungs-Slots (Race-Schutz).
        // Best-effort: better-sqlite3 ist ohnehin single-threaded pro Prozess, der
        // Lock schützt primär gegen Mehrfachinstanzen (PM2-Cluster / mehrere Nodes).
        acquireSlotLock: (key, ttlMs = 10000) => {
            const now = Date.now();
            try {
                stmts.insertSlotLock.run(key, now);
                return true;
            } catch (e) {
                // UNIQUE-Constraint verletzt: bestehender Lock. Nur übernehmen wenn abgelaufen.
                const result = stmts.stealSlotLock.run(now, key, now - ttlMs);
                return result.changes === 1;
            }
        },
        releaseSlotLock: (key) => {
            stmts.deleteSlotLock.run(key);
        },
    };

    module.exports = DB;
}
