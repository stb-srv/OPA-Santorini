#!/usr/bin/env node
/**
 * OPA-CMS – Einmaliges Fix-Script: Lizenz-Token erneuern
 *
 * Liest den gespeicherten License-Key aus der DB und holt ein frisches
 * RS256-signiertes JWT vom Lizenzserver.
 *
 * Aufruf:
 *   node scripts/fix-license-token.js prodbeta.stb-srv.de
 *
 * Alternativ ohne Argument – dann wird die Domain aus der DB gelesen.
 */

require('dotenv').config();
const path = require('path');

async function main() {
    const CONFIG = require(path.join(__dirname, '..', 'config.js'));
    const DB     = require(path.join(__dirname, '..', 'server', 'database.js'));
    const { verifyLicenseToken } = require(path.join(__dirname, '..', 'server', 'license.js'));

    const LICENSE_SERVER = (CONFIG.LICENSE_SERVER_URL || 'https://licens-prod.stb-srv.de').replace(/\/+$/, '');

    // Domain: CLI-Argument hat Vorrang, dann DB, dann Fehler
    const cliDomain = process.argv[2] ? process.argv[2].replace(/^https?:\/\//, '').split('/')[0] : null;

    console.log('\n🔒 OPA-CMS License Token Fix-Script');
    console.log('='.repeat(45));

    if (typeof DB.init === 'function') await DB.init();

    const settings = await DB.getKV('settings', {});
    const lic      = settings.license || {};

    if (!lic.key) {
        console.error('\u274c Kein License-Key in der DB gefunden.');
        process.exit(1);
    }

    if (lic.isTrial) {
        console.log('ℹ️  Trial-Lizenz – kein Token-Refresh nötig.');
        process.exit(0);
    }

    // Domain ermitteln
    const domain = cliDomain || lic.domain || null;

    if (!domain) {
        console.error('\u274c Keine Domain gefunden.');
        console.log('   → Aufruf: node scripts/fix-license-token.js deine-domain.de');
        process.exit(1);
    }

    console.log(`🔑 License-Key:    ${lic.key}`);
    console.log(`🌐 Domain:         ${domain}`);
    console.log(`🔄 License-Server: ${LICENSE_SERVER}`);
    console.log(`🔄 Hole frisches Token...\n`);

    try {
        const response = await fetch(`${LICENSE_SERVER}/api/v1/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: lic.key, domain }),
            signal: AbortSignal.timeout(15000)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(`\u274c Lizenzserver Fehler (HTTP ${response.status}): ${data.message || data.status}`);
            process.exit(1);
        }

        const rawToken = data.license_token || data.token || null;

        if (data.status !== 'active' || !rawToken) {
            console.error('\u274c Kein gültiges Token. Status:', data.status);
            process.exit(1);
        }

        // Signatur prüfen (ohne Domain-Check – wird beim nächsten Request korrekt geprüft)
        const payload = verifyLicenseToken(rawToken, null);
        if (!payload) {
            console.error('\u274c Token-Signatur ungültig – RSA Public Key stimmt nicht überein.');
            process.exit(1);
        }

        // Token + Domain in DB speichern
        settings.license.licenseToken = rawToken;
        settings.license.domain       = domain;
        delete settings.license.degraded;
        delete settings.license.degradedReason;
        delete settings.license.degradedAt;
        await DB.setKV('settings', settings);

        const exp = payload.exp ? new Date(payload.exp * 1000).toLocaleString('de-DE') : 'unbekannt';
        console.log('\u2705 Token erfolgreich erneuert!');
        console.log(`   Plan:        ${payload.type}`);
        console.log(`   Domain:      ${payload.domain}`);
        console.log(`   Gültig bis:  ${exp}`);
        console.log(`   Max Speisen: ${payload.limits?.max_dishes ?? '?'}`);
        console.log('\n🚀 pm2 restart opa-cms\n');

    } catch (e) {
        console.error('\u274c Fehler:', e.message);
        process.exit(1);
    }

    process.exit(0);
}

main();
