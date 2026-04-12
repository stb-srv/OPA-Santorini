#!/usr/bin/env node
/**
 * OPA-CMS – Auto-Image Script
 * Sucht für alle Gerichte ohne Bild automatisch ein passendes Foto.
 *
 * Quellen (Reihenfolge im Auto-Modus):
 *   1. Pexels    – kostenlos, 200 req/h, kein Tageslimit, kein CSE-Setup
 *   2. Unsplash  – kostenlos, 50 req/h, hochwertig
 *
 * Aufruf:
 *   node scripts/auto-images.js              # alle Gerichte ohne Bild
 *   node scripts/auto-images.js --dry-run    # nur anzeigen, nichts speichern
 *   node scripts/auto-images.js --limit 20   # max. 20 Gerichte verarbeiten
 *   node scripts/auto-images.js --overwrite  # auch Gerichte MIT Bild neu bebildern
 *   node scripts/auto-images.js --source pexels    # nur Pexels
 *   node scripts/auto-images.js --source unsplash  # nur Unsplash
 *
 * .env Variablen:
 *   PEXELS_API_KEY       – https://www.pexels.com/api/ -> kostenlos registrieren -> API Key
 *   UNSPLASH_ACCESS_KEY  – https://unsplash.com/developers (optional, 50 req/h)
 */

require('dotenv').config();
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

const PEXELS_KEY   = process.env.PEXELS_API_KEY       || '';
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY   || '';
const UPLOADS_DIR  = path.join(__dirname, '..', 'uploads');
const DELAY_MS     = 800; // Pexels erlaubt 200/h – können schneller sein

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const OVERWRITE = args.includes('--overwrite');
const limitIdx  = args.indexOf('--limit');
const LIMIT     = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 999 : 999;
const sourceIdx = args.indexOf('--source');
const SOURCE    = sourceIdx !== -1 ? args[sourceIdx + 1] : 'auto'; // auto | pexels | unsplash

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        proto.get(url, { headers: { 'User-Agent': 'OPA-CMS-AutoImage/1.0', ...headers } }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                return httpGet(res.headers.location, headers).then(resolve).catch(reject);
            }
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

function download(url, dest, headers = {}) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const file  = fs.createWriteStream(dest);
        proto.get(url, { headers: { 'User-Agent': 'OPA-CMS-AutoImage/1.0', ...headers } }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                file.close(); fs.unlinkSync(dest);
                return download(res.headers.location, dest, headers).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (e) => { if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(e); });
    });
}

// ── Pexels ────────────────────────────────────────────────────────────────────

async function fetchPexels(query) {
    if (!PEXELS_KEY) return null;
    const q   = encodeURIComponent(query);
    const url = `https://api.pexels.com/v1/search?query=${q}&per_page=1&orientation=landscape`;
    const res = await httpGet(url, { Authorization: PEXELS_KEY });
    if (res.status === 429) throw new Error('Pexels Rate-Limit erreicht (200 req/h) – kurz warten.');
    if (res.status !== 200) throw new Error(`Pexels HTTP ${res.status}`);
    const data = JSON.parse(res.body);
    const photo = data.photos?.[0];
    if (!photo) return null;
    return {
        url:    photo.src.large,   // ~1200px Breite
        thumb:  photo.src.small,
        author: photo.photographer,
        source: 'pexels'
    };
}

// ── Unsplash ─────────────────────────────────────────────────────────────────

async function fetchUnsplash(query) {
    if (!UNSPLASH_KEY) return null;
    const q   = encodeURIComponent(query);
    const url = `https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape&client_id=${UNSPLASH_KEY}`;
    const res = await httpGet(url);
    if (res.status !== 200) throw new Error(`Unsplash HTTP ${res.status}`);
    const data = JSON.parse(res.body);
    if (data.errors) throw new Error(data.errors[0]);
    const r = data.results?.[0];
    if (!r) return null;
    return { url: r.urls.regular, thumb: r.urls.thumb, author: r.user.name, source: 'unsplash' };
}

// ── Kombinierte Suche ────────────────────────────────────────────────────────

async function findImage(query) {
    if (SOURCE === 'pexels')   return await fetchPexels(query);
    if (SOURCE === 'unsplash') return await fetchUnsplash(query);

    // auto: Pexels zuerst (200/h), Unsplash als Fallback (50/h)
    const pexels = await fetchPexels(query).catch(() => null);
    if (pexels) return pexels;
    return await fetchUnsplash(query).catch(() => null);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n\ud83c\udf04 OPA-CMS Auto-Image Script');
    console.log('='.repeat(50));

    const hasPexels   = !!PEXELS_KEY;
    const hasUnsplash = !!UNSPLASH_KEY;

    if (!hasPexels && !hasUnsplash) {
        console.error('\u274c Kein API-Key konfiguriert!');
        console.error('   PEXELS_API_KEY   -> https://www.pexels.com/api/  (empfohlen, 200 req/h)');
        console.error('   UNSPLASH_ACCESS_KEY -> https://unsplash.com/developers (50 req/h)');
        process.exit(1);
    }

    console.log(`\ud83d\udd11 Pexels:   ${hasPexels   ? '\u2705 aktiv (200 req/h, kein Tageslimit)' : '\u274c kein Key – PEXELS_API_KEY in .env setzen'}`);
    console.log(`\ud83d\udd11 Unsplash: ${hasUnsplash ? '\u2705 aktiv (50 req/h)' : '\u274c kein Key (optional)'}`);
    console.log(`\ud83c\udfaf Modus:    ${SOURCE === 'auto' ? 'Auto (Pexels \u2192 Unsplash Fallback)' : SOURCE}`);
    if (DRY_RUN)   console.log('\u26a0\ufe0f  DRY-RUN aktiv – keine \u00c4nderungen werden gespeichert.');
    if (OVERWRITE) console.log('\u26a0\ufe0f  OVERWRITE aktiv – bestehende Bilder werden ersetzt.');
    console.log('');

    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    const DB = require(path.join(__dirname, '..', 'server', 'database.js'));
    if (typeof DB.init === 'function') await DB.init();

    const menu = await DB.getMenu();
    const todo = menu.filter(d => OVERWRITE ? true : !d.image || d.image.trim() === '').slice(0, LIMIT);

    console.log(`\ud83d\udcca Gerichte gesamt:  ${menu.length}`);
    console.log(`\ud83d\udd0d Zu bebildern:     ${todo.length}`);
    if (todo.length === 0) { console.log('\u2705 Alle Gerichte haben bereits ein Bild.'); process.exit(0); }
    console.log('');

    let ok = 0, skip = 0, fail = 0;

    for (const dish of todo) {
        const query = [dish.name, dish.desc].filter(Boolean).join(' ').substring(0, 80);
        process.stdout.write(`[${ok + skip + fail + 1}/${todo.length}] "${dish.name}" ... `);

        try {
            const result = await findImage(query);

            if (!result) {
                console.log('\u26a0\ufe0f  Kein Bild gefunden – \u00fcbersprungen.');
                skip++;
                await sleep(DELAY_MS);
                continue;
            }

            const srcLabel = result.source === 'pexels' ? '\ud83d\udcf8 Pexels' : '\ud83c\udf04 Unsplash';

            if (DRY_RUN) {
                console.log(`\u2705 [DRY] ${srcLabel} | ${result.author}`);
                ok++;
                await sleep(DELAY_MS);
                continue;
            }

            const filename = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
            const destPath = path.join(UPLOADS_DIR, filename);

            await download(result.url, destPath);

            const stat = fs.statSync(destPath);
            if (stat.size < 5000) {
                fs.unlinkSync(destPath);
                console.log('\u26a0\ufe0f  Bild zu klein / ung\u00fcltig – \u00fcbersprungen.');
                skip++;
                await sleep(DELAY_MS);
                continue;
            }

            await DB.updateMenu(dish.id, { ...dish, image: `/uploads/${filename}` });
            console.log(`\u2705 ${srcLabel} | ${result.author} -> /uploads/${filename}`);
            ok++;

        } catch (e) {
            console.log(`\u274c ${e.message}`);
            fail++;
        }

        await sleep(DELAY_MS);
    }

    console.log('\n' + '='.repeat(50));
    console.log(`\u2705 Erfolgreich:  ${ok}`);
    console.log(`\u26a0\ufe0f  Kein Bild:    ${skip}`);
    console.log(`\u274c Fehler:       ${fail}`);
    console.log('');
    if (!DRY_RUN && ok > 0) console.log('\ud83d\ude80 pm2 restart opa-cms  (optional, Bilder sind sofort sichtbar)\n');

    process.exit(0);
}

main();
