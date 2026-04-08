/**
 * OPA-CMS GLOBAL CONFIGURATION
 * ----------------------------
 * Loads config from config.json (written by Setup Wizard).
 * Sensitive defaults should be set via .env (see .env.example).
 * If config.json does not exist, the app enters SETUP_MODE.
 */

const fs = require('fs');
const path = require('path');

// Load .env if present (for local development)
try { require('dotenv').config(); } catch(e) { /* dotenv optional */ }

const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
    LICENSE_SERVER_URL: process.env.LICENSE_SERVER_URL || 'http://localhost:4000',
    PORT: parseInt(process.env.PORT) || 5000,
    ADMIN_SECRET: process.env.ADMIN_SECRET || 'change-me-before-production',
    DEV_MODE: process.env.DEV_MODE === 'true',
    SMTP: {
        host: process.env.SMTP_HOST || 'smtp.dein-provider.de',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE !== 'false',
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || '"OPA! Santorini" <noreply@restaurant.de>'
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
