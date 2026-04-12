#!/usr/bin/env node
/**
 * OPA-CMS – Einmaliges Fix-Script: Lizenz-Token erneuern
 *
 * Aufruf: node scripts/fix-license-token.js prodbeta.stb-srv.de
 */

require('dotenv').config();
const path = require('path');
const jwt  = require('jsonwebtoken');

async function main() {
    const CONFIG = require(path.join(__dirname, '..', 'config.js'));
    const DB     = require(path.join(__dirname, '..', 'server', 'database.js'));

    const LICENSE_SERVER = (CONFIG.LICENSE_SERVER_URL || 'https://licens-prod.stb-srv.de').replace(/\/+$/, '');
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

    const domain = cliDomain || lic.domain || null;
    if (!domain) {
        console.error('\u274c Keine Domain – Aufruf: node scripts/fix-license-token.js deine-domain.de');
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
            console.error('\u274c Kein gültiges Token erhalten. Status:', data.status);
            process.exit(1);
        }

        // JWT-Payload dekodieren (OHNE Signaturprüfung) nur zum Anzeigen der Infos
        const payload = jwt.decode(rawToken);

        // Token direkt in DB speichern
        settings.license.licenseToken = rawToken;
        settings.license.domain       = domain;
        delete settings.license.degraded;
        delete settings.license.degradedReason;
        delete settings.license.degradedAt;
        await DB.setKV('settings', settings);

        const exp = payload?.exp ? new Date(payload.exp * 1000).toLocaleString('de-DE') : 'unbekannt';
        console.log('\u2705 Token erfolgreich in DB gespeichert!');
        console.log(`   Plan:        ${payload?.type}`);
        console.log(`   Domain:      ${payload?.domain}`);
        console.log(`   Gültig bis:  ${exp}`);
        console.log(`   Max Speisen: ${payload?.limits?.max_dishes ?? '?'}`);
        console.log('\n🚀 CMS neu starten: pm2 restart opa-cms\n');

    } catch (e) {
        console.error('\u274c Fehler:', e.message);
        process.exit(1);
    }

    process.exit(0);
}

main();
