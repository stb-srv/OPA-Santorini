#!/usr/bin/env node
/**
 * OPA-CMS – Auto-Image Script
 * Sucht für alle Gerichte ohne Bild automatisch ein passendes Foto.
 * Quelle 1: Unsplash (hochwertig, lizenzfrei)
 * Quelle 2: Google Custom Search (Fallback wenn Unsplash nichts findet)
 *
 * Aufruf:
 *   node scripts/auto-images.js              # alle Gerichte ohne Bild
 *   node scripts/auto-images.js --dry-run    # nur anzeigen, nichts speichern
 *   node scripts/auto-images.js --limit 20   # max. 20 Gerichte verarbeiten
 *   node scripts/auto-images.js --overwrite  # auch Gerichte MIT Bild neu bebildern
 *   node scripts/auto-images.js --source google    # nur Google verwenden
 *   node scripts/auto-images.js --source unsplash  # nur Unsplash verwenden
 *
 * .env Variablen:
 *   UNSPLASH_ACCESS_KEY  – https://unsplash.com/developers  (kostenlos, 50 req/h)
 *   GOOGLE_API_KEY       – https://console.cloud.google.com -> Custom Search API
 *   GOOGLE_CSE_ID        – https://programmablesearchengine.google.com (Search Engine ID)
 *                          Tipp: Im CSE "Suche im gesamten Web" aktivieren + "Bilder" einschalten
 */

require('dotenv').config();
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const GOOGLE_KEY   = process.env.GOOGLE_API_KEY       || '';
const GOOGLE_CSE   = process.env.GOOGLE_CSE_ID        || '';
const UPLOADS_DIR  = path.join(__dirname, '..', 'uploads');
const DELAY_MS     = 1400;

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const OVERWRITE = args.includes('--overwrite');
const limitIdx  = args.indexOf('--limit');
const LIMIT     = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 999 : 999;
const sourceIdx = args.indexOf('--source');
const SOURCE    = sourceIdx !== -1 ? args[sourceIdx + 1] : 'auto'; // auto | unsplash | google

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        proto.get(url, { headers: { 'User-Agent': 'OPA-CMS-AutoImage/1.0' } }, (res) => {
            // Redirects folgen
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                return httpGet(res.headers.location).then(resolve).catch(reject);
            }
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const file  = fs.createWriteStream(dest);
        const req   = proto.get(url, { headers: { 'User-Agent': 'OPA-CMS-AutoImage/1.0' } }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                file.close();
                fs.unlinkSync(dest);
                return download(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
        });
        req.on('error', (e) => { if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(e); });
    });
}

// ── Unsplash ──────────────────────────────────────────────────────────────────

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

// ── Google Custom Search ───────────────────────────────────────────────────────

async function fetchGoogle(query) {
    if (!GOOGLE_KEY || !GOOGLE_CSE) return null;
    const q   = encodeURIComponent(query + ' food dish');
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_KEY}&cx=${GOOGLE_CSE}&q=${q}&searchType=image&imgType=photo&imgSize=large&num=1&safe=active`;
    const res = await httpGet(url);
    if (res.status === 429) throw new Error('Google Quota erreicht (100 req/Tag kostenlos)');
    if (res.status !== 200) throw new Error(`Google HTTP ${res.status}: ${res.body.substring(0, 120)}`);
    const data = JSON.parse(res.body);
    const item = data.items?.[0];
    if (!item) return null;
    return { url: item.link, thumb: item.image?.thumbnailLink || item.link, author: item.displayLink, source: 'google' };
}

// ── Kombinierte Suche ─────────────────────────────────────────────────────────

async function findImage(query) {
    if (SOURCE === 'google') {
        return await fetchGoogle(query);
    }
    if (SOURCE === 'unsplash') {
        return await fetchUnsplash(query);
    }
    // auto: Unsplash zuerst, dann Google als Fallback
    const unsplashResult = await fetchUnsplash(query).catch(() => null);
    if (unsplashResult) return unsplashResult;
    const googleResult = await fetchGoogle(query).catch(() => null);
    return googleResult;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n\ud83c\udf04 OPA-CMS Auto-Image Script');
    console.log('='.repeat(50));

    // Key-Check
    const hasUnsplash = !!UNSPLASH_KEY;
    const hasGoogle   = !!(GOOGLE_KEY && GOOGLE_CSE);

    if (!hasUnsplash && !hasGoogle) {
        console.error('\u274c Kein API-Key konfiguriert!');
        console.error('   UNSPLASH_ACCESS_KEY -> https://unsplash.com/developers');
        console.error('   GOOGLE_API_KEY + GOOGLE_CSE_ID -> https://console.cloud.google.com');
        process.exit(1);
    }

    console.log(`\ud83d\udd11 Unsplash: ${hasUnsplash ? '\u2705 aktiv (50 req/h)' : '\u274c kein Key'}`);
    console.log(`\ud83d\udd11 Google:   ${hasGoogle   ? '\u2705 aktiv (100 req/Tag kostenlos)' : '\u274c kein Key/CSE-ID'}`);
    console.log(`\ud83c\udfaf Modus:    ${SOURCE === 'auto' ? 'Auto (Unsplash \u2192 Google Fallback)' : SOURCE}`);
    if (DRY_RUN)   console.log('\u26a0\ufe0f  DRY-RUN aktiv \u2013 keine \u00c4nderungen werden gespeichert.');
    if (OVERWRITE) console.log('\u26a0\ufe0f  OVERWRITE aktiv \u2013 bestehende Bilder werden ersetzt.');
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
                console.log('\u26a0\ufe0f  Kein Bild gefunden \u2013 \u00fcbersprungen.');
                skip++;
                await sleep(DELAY_MS);
                continue;
            }

            const srcLabel = result.source === 'google' ? '\ud83d\udd0d Google' : '\ud83c\udf04 Unsplash';

            if (DRY_RUN) {
                console.log(`\u2705 [DRY] ${srcLabel} | ${result.thumb}`);
                ok++;
                await sleep(DELAY_MS);
                continue;
            }

            const filename = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
            const destPath = path.join(UPLOADS_DIR, filename);

            await download(result.url, destPath);

            // Pr\u00fcfen ob Datei sinnvoll gro\u00df ist (mind. 5 KB)
            const stat = fs.statSync(destPath);
            if (stat.size < 5000) {
                fs.unlinkSync(destPath);
                console.log('\u26a0\ufe0f  Bild zu klein / ung\u00fcltig \u2013 \u00fcbersprungen.');
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
