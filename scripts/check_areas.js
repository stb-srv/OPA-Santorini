const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'database.sqlite');
const db = new Database(DB_PATH);

try {
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'areas'").get();
    console.log('Areas in KV Store:', row ? row.value : 'MISSING');
} catch (e) {
    console.error('Error reading kv_store:', e);
}
db.close();
