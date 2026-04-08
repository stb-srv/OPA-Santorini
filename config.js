/**
 * OPA-CMS GLOBAL CONFIGURATION
 * ----------------------------
 * This file handles the loading of configuration from config.json.
 * If config.json does not exist, the app enters SETUP_MODE.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
    LICENSE_SERVER_URL: 'http://localhost:4000',
    PORT: 5000,
    ADMIN_SECRET: 'opa-2026-premium-access',
    DEV_MODE: true,
    SMTP: {
        host: 'smtp.dein-provider.de',
        port: 465,
        secure: true,
        user: 'ihre-email@restaurant.de',
        pass: 'ihr-geheimes-passwort',
        from: '"OPA! Santorini" <noreply@restaurant.de>'
    },
    SETUP_COMPLETE: false
};

let CONFIG = { ...DEFAULT_CONFIG };

if (fs.existsSync(CONFIG_PATH)) {
    try {
        const fileContent = fs.readFileSync(CONFIG_PATH, 'utf8');
        const loadedConfig = JSON.parse(fileContent);
        CONFIG = { ...DEFAULT_CONFIG, ...loadedConfig, SETUP_COMPLETE: true };
    } catch (e) {
        console.error('❌ Error loading config.json, using defaults:', e);
    }
}

module.exports = CONFIG;
