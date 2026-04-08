import express from 'express';
import cors from 'cors';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'db.json');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DB Utility
const getDB = async () => JSON.parse(await readFile(DB_PATH, 'utf-8'));
const saveDB = async (data) => await writeFile(DB_PATH, JSON.stringify(data, null, 2));

/**
 * Public Validation API (Track Last Access)
 */
app.post('/api/v1/validate', async (req, res) => {
    const { license_key, domain } = req.body;
    try {
        const data = await getDB();
        const l = data.licenses.find(lic => lic.license_key === license_key);
        if (!l) return res.status(404).json({ status: 'invalid', message: 'Key not found' });
        
        // Expiry Check
        const isExpired = new Date(l.expires_at) < new Date();
        if (isExpired) return res.status(403).json({ status: 'invalid', message: 'Expired' });

        // Update Usage Info
        l.last_validated = new Date().toISOString();
        l.validated_domain = domain;
        l.usage_count = (l.usage_count || 0) + 1;
        await saveDB(data);

        return res.json({
            status: 'active', customer_name: l.customer_name, type: l.type,
            expires_at: l.expires_at, allowed_modules: l.allowed_modules, limits: l.limits
        });
    } catch (e) { res.status(500).send("Error"); }
});

/**
 * Management API
 */
app.get('/api/admin/licenses', async (req, res) => {
    const db = await getDB();
    // Logic to calculate stats
    const now = new Date();
    const stats = {
        total: db.licenses.length,
        active: db.licenses.filter(l => l.status === 'active' && new Date(l.expires_at) > now).length,
        expiring: db.licenses.filter(l => {
            const exp = new Date(l.expires_at);
            const diff = (exp - now) / (1000 * 60 * 60 * 24);
            return diff > 0 && diff < 30; // Expiring within 30 days
        }).length,
        total_usage: db.licenses.reduce((s,l) => s + (l.usage_count || 0), 0)
    };
    res.json({ licenses: db.licenses, stats });
});

app.post('/api/admin/licenses', async (req, res) => {
    const db = await getDB();
    const newLic = req.body;
    const idx = db.licenses.findIndex(l => l.license_key === newLic.license_key);
    
    if (idx > -1) {
        db.licenses[idx] = { ...db.licenses[idx], ...newLic };
    } else {
        db.licenses.unshift({ 
            ...newLic, 
            status: 'active', 
            usage_count: 0, 
            last_validated: null 
        });
    }
    
    await saveDB(db);
    res.json({ success: true });
});

app.delete('/api/admin/licenses/:key', async (req, res) => {
    const db = await getDB();
    db.licenses = db.licenses.filter(l => l.license_key !== req.params.key);
    await saveDB(db);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🏛️ Master Hub (Stats Enabled): http://localhost:${PORT}`);
});
