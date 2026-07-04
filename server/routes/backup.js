const router = require('express').Router();
const DB = require('../db');
const bcrypt = require('bcryptjs');
const { sanitizeText } = require('../helpers.js');
const multer = require('multer');
const logger = require('../core/logger.js');
const fs = require('fs');
const path = require('path');
const CONFIG = require('../../config.js');

const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
});

const BACKUP_VERSION = 2;
const { requireRole } = require('../core/middleware.js');

module.exports = (requireAuth) => {
    // -------------------------------------------------------
    // GET /api/backup/list
    // Gibt alle vorhandenen Backup-Dateien zurück
    // -------------------------------------------------------
    router.get('/list', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            const backupDir = CONFIG.BACKUP_DIR;
            if (!fs.existsSync(backupDir)) return res.json([]);

            const now = Date.now();
            const files = fs
                .readdirSync(backupDir)
                .map((f) => {
                    const filePath = path.join(backupDir, f);
                    const stat = fs.statSync(filePath);
                    if (!stat.isFile()) return null;
                    const ageInDays = Math.floor(
                        (now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    return {
                        name: f,
                        groesse_mb: parseFloat((stat.size / (1024 * 1024)).toFixed(2)),
                        datum: stat.mtime.toISOString(),
                        alter_in_tagen: ageInDays,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => new Date(b.datum) - new Date(a.datum)); // Neueste zuerst

            res.json(files);
        } catch (e) {
            logger.error({ err: e }, 'Backup List Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    // -------------------------------------------------------
    // GET /api/backup/export
    // Erstellt einen vollständigen Snapshot aller Daten
    // -------------------------------------------------------
    router.get('/export', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            // Alle KV-Keys laden
            const KV_KEYS = [
                'settings',
                'homepage',
                'visuals',
                'allergens',
                'additives',
                'orderConfig',
                'tables',
                'openingHours',
                'branding',
                'reservationConfig',
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
                DB.getUsers(),
            ]);

            const backup = {
                _meta: {
                    version: BACKUP_VERSION,
                    createdAt: new Date().toISOString(),
                    generator: 'Meraki CMS',
                    recordCount: {
                        kv: Object.keys(kv).length,
                        menu: menu.length,
                        categories: categories.length,
                        reservations: reservations.length,
                        tables: tables.length,
                        orders: orders.length,
                        users: users.length,
                    },
                },
                kv,
                menu,
                categories,
                reservations,
                tables,
                orders,
                // Passwörter werden NICHT exportiert — User werden
                // ohne Pass gespeichert, Passwort muss nach Restore gesetzt werden
                users: users.map((u) => ({
                    user: u.user,
                    name: u.name,
                    last_name: u.last_name,
                    email: u.email,
                    role: u.role,
                    // pass und recovery_codes werden bewusst weggelassen
                })),
            };

            const filename = `opa-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.json(backup);
        } catch (e) {
            logger.error({ err: e }, 'Backup Export Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    // -------------------------------------------------------
    // POST /api/backup/import
    // Spielt ein Backup vollständig ein (Restore)
    // Body: multipart/form-data mit field "backup" (JSON-Datei)
    //       ODER application/json direkt
    // -------------------------------------------------------
    router.post(
        '/import',
        requireAuth,
        requireRole('admin'),
        uploadMiddleware.single('backup'),
        async (req, res) => {
            try {
                let data = req.body;

                // Falls als Datei-Upload (multipart) gesendet
                if (req.file) {
                    try {
                        data = JSON.parse(req.file.buffer.toString('utf-8'));
                    } catch {
                        return res.status(400).json({
                            success: false,
                            reason: 'Backup-Datei ist kein gültiges JSON.',
                        });
                    }
                }

                if (!data || !data._meta) {
                    return res
                        .status(400)
                        .json({ success: false, reason: 'Ungültiges Backup-Format. _meta fehlt.' });
                }

                if (data._meta.version > BACKUP_VERSION) {
                    return res.status(400).json({
                        success: false,
                        reason: `Backup-Version ${data._meta.version} wird nicht unterstützt (max. ${BACKUP_VERSION}).`,
                    });
                }

                const results = { restored: {}, errors: [] };

                // 1. KV-Store wiederherstellen (mit Whitelist gegen Manipulation von z.B. license)
                if (data.kv && typeof data.kv === 'object') {
                    const ALLOWED_KV_KEYS = new Set([
                        'settings',
                        'homepage',
                        'visuals',
                        'allergens',
                        'additives',
                        'orderConfig',
                        'tables',
                        'openingHours',
                        'branding',
                        'reservationConfig',
                    ]);
                    for (const [key, value] of Object.entries(data.kv)) {
                        if (!ALLOWED_KV_KEYS.has(key)) {
                            results.errors.push(`kv[${key}]: Nicht erlaubter Key – übersprungen.`);
                            continue;
                        }
                        try {
                            // Strip license from settings — must be re-validated against license server after restore
                            if (key === 'settings' && value && typeof value === 'object') {
                                const { license: _stripped, ...safeSettings } = value;
                                await DB.setKV(key, safeSettings);
                            } else {
                                await DB.setKV(key, value);
                            }
                        } catch (e) {
                            results.errors.push(`kv[${key}]: ${e.message}`);
                        }
                    }
                    results.restored.kv = Object.keys(data.kv).filter((k) =>
                        ALLOWED_KV_KEYS.has(k)
                    ).length;
                }

                // 2. Kategorien wiederherstellen
                if (Array.isArray(data.categories) && data.categories.length > 0) {
                    try {
                        await DB.saveCategories(data.categories);
                        results.restored.categories = data.categories.length;
                    } catch (e) {
                        results.errors.push(`categories: ${e.message}`);
                    }
                }

                // 3. Speisekarte wiederherstellen
                if (Array.isArray(data.menu) && data.menu.length > 0) {
                    try {
                        await DB.saveMenu(data.menu);
                        results.restored.menu = data.menu.length;
                    } catch (e) {
                        results.errors.push(`menu: ${e.message}`);
                    }
                }

                // 4. Tische wiederherstellen
                if (Array.isArray(data.tables) && data.tables.length > 0) {
                    try {
                        await DB.saveTables(data.tables);
                        results.restored.tables = data.tables.length;
                    } catch (e) {
                        results.errors.push(`tables: ${e.message}`);
                    }
                }

                // 5. Reservierungen wiederherstellen
                if (Array.isArray(data.reservations) && data.reservations.length > 0) {
                    try {
                        await DB.saveReservations(data.reservations);
                        results.restored.reservations = data.reservations.length;
                    } catch (e) {
                        results.errors.push(`reservations: ${e.message}`);
                    }
                }

                // 6. Bestellungen wiederherstellen (vorhandene IDs überspringen)
                if (Array.isArray(data.orders) && data.orders.length > 0) {
                    let ordersRestored = 0;
                    const existingOrders = await DB.getOrders();
                    const existingOrderIds = new Set(existingOrders.map((o) => o.id));
                    for (const order of data.orders) {
                        if (existingOrderIds.has(order.id)) continue;
                        try {
                            await DB.addOrder(order);
                            ordersRestored++;
                        } catch (e) {
                            results.errors.push(`order[${order.id}]: ${e.message}`);
                        }
                    }
                    results.restored.orders = ordersRestored;
                }

                // 7. Benutzer wiederherstellen (ohne Passwörter)
                // Nur neue User werden angelegt, bestehende werden NICHT überschrieben
                if (Array.isArray(data.users) && data.users.length > 0) {
                    let usersRestored = 0;
                    const existingUsers = await DB.getUsers();
                    const existingNames = new Set(existingUsers.map((u) => u.user));
                    for (const u of data.users) {
                        if (existingNames.has(u.user)) continue; // Nicht überschreiben
                        try {
                            const tempPass = await bcrypt.hash('ChangeMe123!', 12);
                            await DB.addUser({
                                ...u,
                                pass: tempPass,
                                require_password_change: 1,
                                recovery_codes: [],
                            });
                            usersRestored++;
                        } catch (e) {
                            results.errors.push(`user[${u.user}]: ${e.message}`);
                        }
                    }
                    results.restored.users = usersRestored;
                }

                const hasErrors = results.errors.length > 0;
                res.status(hasErrors ? 207 : 200).json({
                    success: !hasErrors,
                    message: hasErrors
                        ? `Backup teilweise eingespielt – ${results.errors.length} Fehler aufgetreten.`
                        : 'Backup erfolgreich eingespielt.',
                    meta: data._meta,
                    results,
                });
            } catch (e) {
                logger.error({ err: e }, 'Backup Import Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    // -------------------------------------------------------
    // GET /api/backup/info
    // Gibt Metadaten über die aktuelle Instanz zurück
    // (Anzahl Datensätze, DB-Typ, Version)
    // -------------------------------------------------------
    router.get('/info', requireAuth, requireRole('admin'), async (req, res) => {
        try {
            const [menu, categories, reservations, tables, orders, users] = await Promise.all([
                DB.getMenu(),
                DB.getCategories(),
                DB.getReservations(),
                DB.getTables(),
                DB.getOrders(),
                DB.getUsers(),
            ]);
            res.json({
                success: true,
                dbType: process.env.DB_TYPE || 'sqlite',
                counts: {
                    menu: menu.length,
                    categories: categories.length,
                    reservations: reservations.length,
                    tables: tables.length,
                    orders: orders.length,
                    users: users.length,
                },
            });
        } catch (e) {
            logger.error({ err: e }, 'Backup Info Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    return router;
};
