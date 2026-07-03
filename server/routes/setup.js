const express = require('express');
const bcrypt = require('bcryptjs');
const DB = require('../db');
const CONFIG = require('../../config.js');
const logger = require('../core/logger.js');

const router = express.Router();

const _isLocalIp = (ip) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);

// SEC: Mindest-Passwortlänge – identisch zum Haupt-Setup-Flow in server/app.js
const MIN_ADMIN_PASSWORD_LENGTH = 12;

/**
 * POST /api/v1/setup
 * Einmalige Ersteinrichtung: Admin-Account + Restaurant-Name speichern.
 * Nur von localhost erlaubt. Danach wird Setup deaktiviert.
 *
 * SECURITY: Dieser Legacy-Endpunkt wird hart gegen CONFIG.SETUP_COMPLETE
 * gesperrt. Der Haupt-Setup-Flow (POST /api/setup in server/app.js) setzt
 * CONFIG.SETUP_COMPLETE=true, ohne settings.isSetupDone zu setzen – daher
 * war dieser Endpunkt zuvor auch NACH abgeschlossenem Setup noch aktiv und
 * konnte (nur IP-geschützt) einen zusätzlichen Admin-Account anlegen.
 */
router.post('/', async (req, res) => {
    try {
        // Harte Sperre: sobald das System eingerichtet ist, ist dieser
        // Endpunkt vollständig deaktiviert (kein zweiter Setup-Pfad).
        if (CONFIG.SETUP_COMPLETE) {
            return res
                .status(403)
                .json({ success: false, message: 'Setup wurde bereits abgeschlossen.' });
        }

        const clientIp = req.ip || req.socket?.remoteAddress || '';
        if (!_isLocalIp(clientIp)) {
            return res
                .status(403)
                .json({ success: false, message: 'Setup ist nur von localhost erlaubt.' });
        }

        const settings = await DB.getKV('settings', {});
        if (settings.isSetupDone === true || settings.isSetupDone === 'true') {
            return res
                .status(403)
                .json({ success: false, message: 'Setup wurde bereits abgeschlossen.' });
        }

        const { adminName, adminEmail, adminPassword, restaurantName, licenseKey } = req.body;

        if (!adminEmail || !adminPassword || !restaurantName) {
            return res.status(400).json({
                success: false,
                message: 'adminEmail, adminPassword und restaurantName sind erforderlich.',
            });
        }

        // SEC: Passwort-Mindestlänge erzwingen (analog zum Haupt-Setup-Flow)
        if (String(adminPassword).length < MIN_ADMIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Admin-Passwort muss mindestens ${MIN_ADMIN_PASSWORD_LENGTH} Zeichen lang sein.`,
            });
        }

        // Admin-Passwort hashen
        const hashedPassword = await bcrypt.hash(adminPassword, 12);

        // Admin-User anlegen
        // Wir nutzen adminEmail als Benutzernamen (user)
        await DB.addUser({
            user: adminEmail,
            pass: hashedPassword,
            name: adminName || 'Administrator',
            email: adminEmail,
            role: 'admin',
            require_password_change: 0,
        });

        // Restaurant-Name + LicenseKey speichern (in branding und settings)
        const branding = await DB.getKV('branding', {});
        branding.name = restaurantName;
        await DB.setKV('branding', branding);

        if (licenseKey) {
            // Typ wird beim ersten LicenseChecker-Start vom Server ermittelt
            settings.license = { key: licenseKey.trim(), status: 'pending_validation' };
        }

        // Setup als abgeschlossen markieren
        settings.isSetupDone = true;
        await DB.setKV('settings', settings);

        return res.json({ success: true, message: 'Setup erfolgreich abgeschlossen.' });
    } catch (err) {
        logger.error({ err }, 'Setup-Fehler');
        return res.status(500).json({ success: false, message: 'Fehler beim Setup.' });
    }
});

module.exports = router;
