/**
 * OPA-CMS – MySQL/MariaDB Datenbank-Adapter
 *
 * Identisches Interface wie database.js (SQLite-Adapter).
 * Wird geladen wenn DB_TYPE=mysql in der .env gesetzt ist.
 *
 * Voraussetzung: npm install mysql2
 * Verbindungsparameter: DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT || '3306'),
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASS     || '',
    database:           process.env.DB_NAME     || 'opa_cms',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    charset:            'utf8mb4',
    timezone:           '+00:00',
    // Stabilitäts-Fix: ECONNRESET vermeiden
    enableKeepAlive:    true,
    keepAliveInitialDelay: 10000,
    // Netcup / Remote-Server: SSL optional
    ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

// Fehlerbehandlung am Pool
pool.on('error', (err) => {
    console.error('❌ MySQL Pool Error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.log('🔄 Verbindung verloren, Pool wird neu verbunden...');
    }
});

// --- Schema initialisieren ---
async function initSchema() {
    const conn = await pool.getConnection();
    try {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS kv_store (
                \`key\`   VARCHAR(255) PRIMARY KEY,
                value LONGTEXT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                user                    VARCHAR(100) PRIMARY KEY,
                pass                    TEXT NOT NULL,
                name                    TEXT,
                last_name               TEXT,
                email                   TEXT,
                role                    VARCHAR(50) DEFAULT 'admin',
                require_password_change TINYINT(1) DEFAULT 0,
                recovery_codes          LONGTEXT DEFAULT ('[]')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS menu (
                id        VARCHAR(100) PRIMARY KEY,
                number    VARCHAR(50),
                name      TEXT NOT NULL,
                price     DOUBLE,
                cat       TEXT,
                \`desc\`  LONGTEXT,
                allergens LONGTEXT DEFAULT ('[]'),
                additives LONGTEXT DEFAULT ('[]'),
                image     TEXT,
                active    TINYINT(1) DEFAULT 1,
                available TINYINT(1) DEFAULT 1,
                updated_at VARCHAR(50),
                sort_order INT DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id         VARCHAR(100) PRIMARY KEY,
                label      TEXT NOT NULL,
                icon       TEXT,
                active     TINYINT(1) DEFAULT 1,
                sort_order INT DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id              BIGINT PRIMARY KEY,
                token           VARCHAR(100) UNIQUE,
                name            TEXT,
                email           TEXT,
                phone           TEXT,
                date            VARCHAR(20),
                time            VARCHAR(30),
                start_time      VARCHAR(10),
                end_time        VARCHAR(10),
                guests          INT DEFAULT 1,
                note            LONGTEXT,
                status          VARCHAR(50) DEFAULT 'Pending',
                assigned_tables LONGTEXT DEFAULT ('[]'),
                submittedAt     VARCHAR(50),
                ip              VARCHAR(50)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`tables\` (
                id         VARCHAR(100) PRIMARY KEY,
                name       TEXT NOT NULL,
                capacity   INT DEFAULT 2,
                combinable TINYINT(1) DEFAULT 1,
                active     TINYINT(1) DEFAULT 1,
                area_id    VARCHAR(100) DEFAULT 'main'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id         VARCHAR(100) PRIMARY KEY,
                table_id   VARCHAR(100),
                table_name TEXT,
                status     VARCHAR(50) DEFAULT 'pending',
                timestamp  VARCHAR(50),
                total      DOUBLE DEFAULT 0,
                note       LONGTEXT,
                items      LONGTEXT DEFAULT ('[]')
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // --- MIGRATIONEN ---
        // Migration: sort_order in menu hinzufügen falls es eine Bestands-DB ist
        try {
            const [cols] = await conn.query("SHOW COLUMNS FROM menu LIKE 'sort_order'");
            if (cols.length === 0) {
                await conn.query("ALTER TABLE menu ADD COLUMN sort_order INT DEFAULT 0");
                console.log('✅ Migration: Spalte sort_order zu Tabelle menu hinzugefügt.');
            }
        } catch(e) { console.warn('⚠️  Migration sort_order fehlgeschlagen:', e.message); }

        // Indizes
        const idxQueries = [
            `CREATE INDEX IF NOT EXISTS idx_res_date   ON reservations(date)`,
            `CREATE INDEX IF NOT EXISTS idx_res_token  ON reservations(token)`,
            `CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status)`,
            `CREATE INDEX IF NOT EXISTS idx_ord_status ON orders(status)`,
            `CREATE INDEX IF NOT EXISTS idx_ord_ts     ON orders(timestamp)`,
            `CREATE INDEX IF NOT EXISTS idx_menu_cat   ON menu(cat(100))`,
            `CREATE INDEX IF NOT EXISTS idx_cat_sort   ON categories(sort_order)`,
        ];
        for (const sql of idxQueries) {
            try { await conn.query(sql); } catch(e) { /* Index existiert bereits */ }
        }
        console.log('\u2705  MySQL-Schema bereit.');
    } finally {
        conn.release();
    }
}

const safeJsonParse = (str, fallback = null) => {
    try { return str ? JSON.parse(str) : fallback; }
    catch (e) { return fallback; }
};

const q = (sql, params = []) => pool.query(sql, params).then(([rows]) => rows);

const DB = {
    // Gibt die Pool-Instanz zurück (für Hilfsskripte wie Migrations-Checks)
    _pool: pool,

    // --- KV Store ---
    getKV: async (key, defaultValue = null) => {
        const rows = await q('SELECT value FROM kv_store WHERE `key` = ?', [key]);
        return rows.length ? safeJsonParse(rows[0].value, defaultValue) : defaultValue;
    },
    setKV: async (key, value) => {
        await q('INSERT INTO kv_store (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [key, JSON.stringify(value)]);
    },

    // --- Users ---
    getUsers: async () => q('SELECT user, pass, name, last_name, email, role, require_password_change, recovery_codes FROM users'),
    getUserByName: async (user) => {
        const rows = await q('SELECT * FROM users WHERE user = ?', [user]);
        return rows[0] || null;
    },
    setUserPass: async (user, hashedPass, requireChange = false) => {
        await q('UPDATE users SET pass = ?, require_password_change = ? WHERE user = ?', [hashedPass, requireChange ? 1 : 0, user]);
    },
    setRequirePasswordChange: async (user, value) => {
        await q('UPDATE users SET require_password_change = ? WHERE user = ?', [value ? 1 : 0, user]);
    },
    setRecoveryCodes: async (user, codes) => {
        await q('UPDATE users SET recovery_codes = ? WHERE user = ?', [JSON.stringify(codes), user]);
    },
    addUser: async (u) => {
        await q('INSERT INTO users (user, pass, name, last_name, email, role, require_password_change, recovery_codes) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE pass=VALUES(pass), name=VALUES(name), last_name=VALUES(last_name), email=VALUES(email), role=VALUES(role)',
            [u.user, u.pass, u.name||'', u.last_name||'', u.email||'', u.role||'admin', u.require_password_change||0, JSON.stringify(u.recovery_codes||[])]);
    },
    updateUser: async (user, u) => {
        await q('UPDATE users SET name=?, last_name=?, email=?, role=? WHERE user=?', [u.name||'', u.last_name||'', u.email||'', u.role||'admin', user]);
    },
    deleteUser: async (user) => q('DELETE FROM users WHERE user = ?', [user]),

    // --- Menu ---
    getMenu: async () => {
        const rows = await q('SELECT * FROM menu ORDER BY cat, COALESCE(sort_order, 0), name');
        return rows.map(r => ({
            ...r,
            active: Number(r.active) !== 0,
            available: r.available !== undefined ? Number(r.available) !== 0 : Number(r.active) !== 0,
            allergens: safeJsonParse(r.allergens, []),
            additives: safeJsonParse(r.additives, [])
        }));
    },
    addMenu: async (m) => {
        await q('INSERT INTO menu (id, number, name, price, cat, `desc`, allergens, additives, image, active, available, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [m.id, m.number||null, m.name, m.price, m.cat, m.desc, JSON.stringify(m.allergens||[]), JSON.stringify(m.additives||[]), m.image||null, m.active!==false?1:0, m.available!==false?1:0, m.updated_at||null]);
    },
    updateMenu: async (id, update) => {
        const rows = await q('SELECT * FROM menu WHERE id = ?', [id]);
        if (!rows[0]) return null;
        const existing = rows[0];
        const merged = { ...existing, ...update,
            allergens: safeJsonParse(typeof update.allergens!=='undefined'?JSON.stringify(update.allergens):existing.allergens,[]),
            additives: safeJsonParse(typeof update.additives!=='undefined'?JSON.stringify(update.additives):existing.additives,[]) };
        const rawAvail = update.available !== undefined ? update.available : (update.active !== undefined ? update.active : null);
        const activeVal = rawAvail !== null ? (rawAvail ? 1 : 0) : Number(existing.active);
        const availVal = rawAvail !== null ? (rawAvail ? 1 : 0) : (existing.available !== undefined ? Number(existing.available) : Number(existing.active));
        const updatedAt = update.updated_at || existing.updated_at || null;
        await q('UPDATE menu SET number=?, name=?, price=?, cat=?, `desc`=?, allergens=?, additives=?, image=?, active=?, available=?, updated_at=? WHERE id=?',
            [merged.number||null, merged.name, merged.price, merged.cat, merged.desc, JSON.stringify(merged.allergens), JSON.stringify(merged.additives), merged.image||null, activeVal, availVal, updatedAt, id]);
        return { ...merged, active: activeVal!==0, available: availVal!==0, updated_at: updatedAt };
    },
    deleteMenu: async (id) => q('DELETE FROM menu WHERE id = ?', [id]),
    saveMenu: async (items) => {
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
            await conn.query('DELETE FROM menu');
            for (const m of items) {
                await conn.query('INSERT INTO menu (id, number, name, price, cat, `desc`, allergens, additives, image, active, available, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                    [m.id||Date.now().toString(), m.number||null, m.name, m.price, m.cat, m.desc, JSON.stringify(m.allergens||[]), JSON.stringify(m.additives||[]), m.image||null, m.active!==false?1:0, m.available!==false?1:0, m.updated_at||null]);
            }
            await conn.commit();
        } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
    },

    // --- Categories ---
    getCategories: async () => q('SELECT * FROM categories ORDER BY sort_order ASC, label ASC'),
    addCategory: async (c) => {
        await q('INSERT INTO categories (id, label, icon, active, sort_order) VALUES (?,?,?,?,?)',
            [c.id, c.label, c.icon||'', c.active!==false?1:0, c.sort_order||0]);
    },
    updateCategory: async (id, update) => {
        const rows = await q('SELECT * FROM categories WHERE id = ?', [id]);
        if (!rows[0]) return null;
        const merged = { ...rows[0], ...update };
        await q('UPDATE categories SET label=?, icon=?, active=?, sort_order=? WHERE id=?',
            [merged.label, merged.icon||'', merged.active!==false?1:0, merged.sort_order||0, id]);
        return merged;
    },
    deleteCategory: async (id) => q('DELETE FROM categories WHERE id = ?', [id]),
    saveCategories: async (items) => {
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
            await conn.query('DELETE FROM categories');
            for (const [i, c] of items.entries()) {
                await conn.query('INSERT INTO categories (id, label, icon, active, sort_order) VALUES (?,?,?,?,?)',
                    [c.id, c.label, c.icon||'', c.active!==false?1:0, typeof c.sort_order!=='undefined'?c.sort_order:i]);
            }
            await conn.commit();
        } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
    },

    // --- Reservations ---
    getReservations: async () => {
        const rows = await q('SELECT * FROM reservations ORDER BY submittedAt DESC');
        return rows.map(r => ({ ...r, assigned_tables: safeJsonParse(r.assigned_tables, []) }));
    },
    addReservation: async (r) => {
        await q('INSERT INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [r.id, r.token, r.name, r.email, r.phone, r.date, r.time, r.start_time, r.end_time, r.guests, r.note||'', r.status, JSON.stringify(r.assigned_tables||[]), r.submittedAt, r.ip||null]);
    },
    updateReservation: async (id, update) => {
        const rows = await q('SELECT * FROM reservations WHERE id = ?', [id]);
        if (!rows[0]) return null;
        const existing = rows[0];
        const merged = { ...existing, ...update };
        merged.assigned_tables = safeJsonParse(typeof update.assigned_tables!=='undefined'?JSON.stringify(update.assigned_tables):existing.assigned_tables, []);
        await q('UPDATE reservations SET name=?, email=?, phone=?, date=?, time=?, start_time=?, end_time=?, guests=?, note=?, status=?, assigned_tables=? WHERE id=?',
            [merged.name, merged.email, merged.phone, merged.date, merged.time, merged.start_time, merged.end_time, merged.guests, merged.note||'', merged.status, JSON.stringify(merged.assigned_tables), id]);
        return merged;
    },
    deleteReservation: async (id) => q('DELETE FROM reservations WHERE id = ?', [id]),
    saveReservations: async (list) => {
        if (!Array.isArray(list) || list.length === 0) {
            console.warn('[DB] saveReservations called with empty list – skipping to prevent data loss.');
            return;
        }
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
            await conn.query('DELETE FROM reservations');
            for (const r of list) {
                await conn.query('INSERT INTO reservations (id, token, name, email, phone, date, time, start_time, end_time, guests, note, status, assigned_tables, submittedAt, ip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    [r.id, r.token, r.name, r.email, r.phone, r.date, r.time, r.start_time, r.end_time, r.guests, r.note||'', r.status, JSON.stringify(r.assigned_tables||[]), r.submittedAt, r.ip||null]);
            }
            await conn.commit();
        } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
    },

    // --- Tables ---
    getTables: async () => q('SELECT * FROM `tables`'),
    saveTables: async (tables) => {
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
            for (const t of tables) {
                await conn.query('INSERT INTO `tables` (id, name, capacity, combinable, active, area_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), capacity=VALUES(capacity), combinable=VALUES(combinable), active=VALUES(active), area_id=VALUES(area_id)',
                    [t.id, t.name, t.capacity||2, t.combinable!==false?1:0, t.active!==false?1:0, t.area_id||'main']);
            }
            if (tables.length > 0) {
                const ids = tables.map(t => t.id);
                await conn.query(`UPDATE \`tables\` SET active = 0 WHERE id NOT IN (${ids.map(()=>'?').join(',')})`, ids);
            }
            await conn.commit();
        } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
    },

    // --- Orders ---
    getOrders: async () => {
        const rows = await q('SELECT * FROM orders ORDER BY timestamp DESC');
        return rows.map(r => ({ ...r, items: safeJsonParse(r.items, []) }));
    },
    getOrderById: async (id) => {
        const rows = await q('SELECT * FROM orders WHERE id = ?', [id]);
        if (!rows[0]) return null;
        return { ...rows[0], items: safeJsonParse(rows[0].items, []) };
    },
    addOrder: async (order) => {
        await q('INSERT INTO orders (id, table_id, table_name, status, timestamp, total, note, items) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',
            [order.id||Date.now().toString(), order.table_id||order.tableId||null, order.table_name||order.tableName||null,
             order.status||'pending', order.timestamp||new Date().toISOString(), order.total||0, order.note||null, JSON.stringify(order.items||[])]);
    },
    updateOrderStatus: async (id, status) => q('UPDATE orders SET status = ? WHERE id = ?', [status, id]),
    deleteOrder: async (id) => q('DELETE FROM orders WHERE id = ?', [id]),
};

// Schema beim Import initialisieren
initSchema().catch(e => { console.error('\u274c MySQL Schema-Init fehlgeschlagen:', e.message); process.exit(1); });

module.exports = DB;
