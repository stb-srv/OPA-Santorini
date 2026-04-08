const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'database.sqlite');
const db = new Database(DB_PATH);

try {
    const row = db.prepare("SELECT value FROM kv_store WHERE key = 'areas'").get();
    if (!row) {
        const defaultAreas = [
            { id: 'main', name: 'Gastraum' },
            { id: 'terrace', name: 'Terrasse' }
        ];
        db.prepare("INSERT INTO kv_store (key, value) VALUES ('areas', ?)").run(JSON.stringify(defaultAreas));
        console.log('✅ Default areas initialized.');
    } else {
        console.log('ℹ️ Areas already initialized.');
    }
} catch (e) {
    console.error('Error:', e);
}
db.close();
