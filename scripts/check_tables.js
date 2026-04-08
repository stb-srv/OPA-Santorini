const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, 'server', 'database.sqlite');
const db = new Database(DB_PATH);
const tables = db.prepare('SELECT * FROM tables').all();
console.log('Tables Data:', JSON.stringify(tables, null, 2));
db.close();
