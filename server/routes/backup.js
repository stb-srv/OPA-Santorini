const router  = require('express').Router();
const DB      = require('../database.js');
const bcrypt  = require('bcryptjs');
const { sanitizeText } = require('../helpers.js');
const multer = require('multer');
const logger = require('../logger.js');

const uploadMiddleware = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 50 * 1024 * 1024 } 
});

const BACKUP_VERSION = 2;

// -------------------------------------------------------
// GET /api/backup/export
// Erstellt einen vollständigen Snapshot aller Daten
// -------------------------------------------------------
router.get('/export', async (req, res) => {
    try {
        // Alle KV-Keys laden
        const KV_KEYS = [
            'settings', 'homepage', 'visuals', 'allergens',
            'additives', 'orderConfig', 'tables', 'openingHours', 'branding', 'reservationConfig'
        ];
        const kv = {};
        for (const key of KV_KEYS) {
            const val = await DB.getKV(key, null);
            if (val !== null) kv[key] = val;
        }

        const [menu, categories, reservations, tables, orders, users] = await Promise.all([
            DB.getMenu(),
            DB.getCategories(),
            DB.getReservations(),
            DB.getTables(),
            DB.getOrders(),
            DB.getUsers()
        ]);

        const backup = {
            _meta: {
                version:     BACKUP_VERSION,
                createdAt:   new Date().toISOString(),
                generator:   'OPA-Santorini CMS',
                recordCount: {
                    kv:           Object.keys(kv).length,
                    menu:         menu.length,
                    categories:   categories.length,
                    reservations: reservations.length,
                    tables:       tables.length,
                    orders:       orders.length,
                    users:        users.length
                }
            },
            kv,
            menu,
            categories,
            reservations,
            tables,
            orders,
            // Passwörter werden NICHT exportiert — User werden 
            // ohne Pass gespeichert, Passwort muss nach Restore gesetzt werden
            users: users.map(u => ({
                user:  u.user,
                name:  u.name,
                last_name: u.last_name,
                email: u.email,
                role:  u.role
                // pass und recovery_codes werden bewusst weggelassen
            }))
        };

        const filename = `opa-backup-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(backup);

    } catch (e) {
        logger.error({ err: e }, 'Backup Export Fehler');
        res.status(500).json({ success: false, reason: e.message });
    }
});

// -------------------------------------------------------
// POST /api/backup/import
// Spielt ein Backup vollständig ein (Restore)
// Body: multipart/form-data mit field "backup" (JSON-Datei)
//       ODER application/json direkt
// -------------------------------------------------------
router.post('/import', uploadMiddleware.single('backup'), async (req, res) => {
    try {
        let data = req.body;

        // Falls als Datei-Upload (multipart) gesendet
        if (req.file) {
            try { data = JSON.parse(req.file.buffer.toString('utf-8')); }
            catch { return res.status(400).json({ success: false, reason: 'Backup-Datei ist kein gültiges JSON.' }); }
        }

        if (!data || !data._meta) {
            return res.status(400).json({ success: false, reason: 'Ungültiges Backup-Format. _meta fehlt.' });
        }

        if (data._meta.version > BACKUP_VERSION) {
            return res.status(400).json({ success: false, reason: `Backup-Version ${data._meta.version} wird nicht unterstützt (max. ${BACKUP_VERSION}).` });
        }

        const results = { restored: {}, errors: [] };

        // 1. KV-Store wiederherstellen
        if (data.kv && typeof data.kv === 'object') {
            for (const [key, value] of Object.entries(data.kv)) {
                try { await DB.setKV(key, value); } 
                catch (e) { results.errors.push(`kv[${key}]: ${e.message}`); }
            }
            results.restored.kv = Object.keys(data.kv).length;
        }

        // 2. Kategorien wiederherstellen
        if (Array.isArray(data.categories) && data.categories.length > 0) {
            try { await DB.saveCategories(data.categories); results.restored.categories = data.categories.length; }
            catch (e) { results.errors.push(`categories: ${e.message}`); }
        }

        // 3. Speisekarte wiederherstellen
        if (Array.isArray(data.menu) && data.menu.length > 0) {
            try { await DB.saveMenu(data.menu); results.restored.menu = data.menu.length; }
            catch (e) { results.errors.push(`menu: ${e.message}`); }
        }

        // 4. Tische wiederherstellen
        if (Array.isArray(data.tables) && data.tables.length > 0) {
            try { await DB.saveTables(data.tables); results.restored.tables = data.tables.length; }
            catch (e) { results.errors.push(`tables: ${e.message}`); }
        }

        // 5. Reservierungen wiederherstellen
        if (Array.isArray(data.reservations) && data.reservations.length > 0) {
            try { await DB.saveReservations(data.reservations); results.restored.reservations = data.reservations.length; }
            catch (e) { results.errors.push(`reservations: ${e.message}`); }
        }

        // 6. Bestellungen wiederherstellen
        if (Array.isArray(data.orders) && data.orders.length > 0) {
            try {
                for (const order of data.orders) {
                    await DB.addOrder(order);
                }
                results.restored.orders = data.orders.length;
            } catch (e) { results.errors.push(`orders: ${e.message}`); }
        }

        // 7. Benutzer wiederherstellen (ohne Passwörter)
        // Nur neue User werden angelegt, bestehende werden NICHT überschrieben
        if (Array.isArray(data.users) && data.users.length > 0) {
            let usersRestored = 0;
            const existingUsers = await DB.getUsers();
            const existingNames = new Set(existingUsers.map(u => u.user));
            for (const u of data.users) {
                if (existingNames.has(u.user)) continue; // Nicht überschreiben
                try {
                    const tempPass = await bcrypt.hash('ChangeMe123!', 10);
                    await DB.addUser({
                        ...u,
                        pass: tempPass,
                        require_password_change: 1,
                        recovery_codes: []
                    });
                    usersRestored++;
                } catch (e) { results.errors.push(`user[${u.user}]: ${e.message}`); }
            }
            results.restored.users = usersRestored;
        }

        res.json({
            success: true,
            message: 'Backup erfolgreich eingespielt.',
            meta:    data._meta,
            results
        });

    } catch (e) {
        logger.error({ err: e }, 'Backup Import Fehler');
        res.status(500).json({ success: false, reason: e.message });
    }
});

// -------------------------------------------------------
// GET /api/backup/info
// Gibt Metadaten über die aktuelle Instanz zurück
// (Anzahl Datensätze, DB-Typ, Version)
// -------------------------------------------------------
router.get('/info', async (req, res) => {
    try {
        const [menu, categories, reservations, tables, orders, users] = await Promise.all([
            DB.getMenu(), DB.getCategories(), DB.getReservations(),
            DB.getTables(), DB.getOrders(), DB.getUsers()
        ]);
        res.json({
            success: true,
            dbType:  process.env.DB_TYPE || 'sqlite',
            counts:  {
                menu:         menu.length,
                categories:   categories.length,
                reservations: reservations.length,
                tables:       tables.length,
                orders:       orders.length,
                users:        users.length
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, reason: e.message });
    }
});

module.exports = router;
