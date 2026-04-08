const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'database.sqlite');
const db = new Database(DB_PATH);

try {
    console.log('🔄 Adding area_id to tables table...');
    db.prepare('ALTER TABLE tables ADD COLUMN area_id TEXT DEFAULT "main"').run();
    console.log('✅ Column added successfully.');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('ℹ️ Column already exists.');
    } else {
        console.error('❌ Error adding column:', e);
    }
}

// Initialize default areas if not present
const kv = db.prepare("SELECT value FROM kv_store WHERE key = 'areas'").get();
if (!kv) {
    const defaultAreas = [
        { id: 'main', name: 'Gastraum' },
        { id: 'terrace', name: 'Terrasse' }
    ];
    db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES ("areas", ?)').run(JSON.stringify(defaultAreas));
    console.log('✅ Default areas initialized.');
}

db.close();
