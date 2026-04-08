const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'server', 'database.sqlite');
const db = new Database(DB_PATH);

try {
    const info = db.prepare('PRAGMA table_info(tables)').all();
    console.log('Columns in tables:', info.map(c => c.name).join(', '));
} catch (e) {
    console.error('Error reading table info:', e);
}
db.close();
