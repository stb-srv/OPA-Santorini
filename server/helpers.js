/**
 * Server Helpers – shared utility functions
 */
const sanitizeHtml = require('sanitize-html');
const DB = require('./database.js');

const sanitizeText = (str) => {
    if (!str) return '';
    return sanitizeHtml(String(str), { allowedTags: [], allowedAttributes: {} }).trim();
};

const calculateDuration = (guestCount, rc = null) => {
    const config = rc || { durationSmall: 90, durationMedium: 120, durationLarge: 150 };
    const count = parseInt(guestCount);
    if (count <= 2) return config.durationSmall || 90;
    if (count <= 4) return config.durationMedium || 120;
    return config.durationLarge || 150;
};

const parseTime = (timeStr, dateStr = null) => {
    if (!timeStr) return new Date();
    const cleanTime = timeStr.replace(/[^0-9:]/g, '');
    const [hrs, mins] = cleanTime.split(':').map(Number);
    const d = dateStr ? new Date(dateStr.split('.').reverse().join('-')) : new Date();
    d.setHours(hrs || 0, mins || 0, 0, 0);
    return d;
};

const buildEndTime = (startTime, durationMinutes) => {
    const d = parseTime(startTime);
    d.setMinutes(d.getMinutes() + durationMinutes);
    const h = d.getHours(), m = d.getMinutes();
    if (h >= 24) return '23:59';
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};

const checkOverlap = (date, start1, end1, start2, end2, buffer = 15) => {
    const s1 = parseTime(start1, date).getTime();
    const e1 = parseTime(end1, date).getTime() + (buffer * 60000);
    const s2 = parseTime(start2, date).getTime();
    const e2 = parseTime(end2, date).getTime() + (buffer * 60000);
    return s1 < e2 && s2 < e1;
};

const findAvailableTables = (date, startTime, duration, guestCount, areaId = null) => {
    const settings = DB.getKV('settings', {});
    const rc = settings.reservationConfig || { buffer: 15 };
    const homepage = DB.getKV('homepage', {});
    const oh = homepage.openingHours || {};
    const d = new Date(date.split('.').reverse().join('-'));
    const dayKey = ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()];
    const dayConfig = oh[dayKey];
    if (dayConfig) {
        if (dayConfig.closed) return { success: false, reason: `Wir haben am ${dayKey} leider Ruhetag.` };
        const start = parseTime(startTime, date).getTime();
        const open  = parseTime(dayConfig.open, date).getTime();
        const close = parseTime(dayConfig.close, date).getTime();
        if (start < open || start > close)
            return { success: false, reason: `Reservierung außerhalb der Öffnungszeiten (${dayConfig.open} - ${dayConfig.close} Uhr).` };
    }
    const endTime = buildEndTime(startTime, duration);
    const tables = DB.getTables() || [];
    let activeTables = tables.filter(t => t.active);
    const plan = DB.getKV('table_plan', { combined: {} });
    const combinedMapping = {}, parentMapping = {};
    Object.values(plan.combined || {}).forEach(areaCombos => {
        areaCombos.forEach(c => {
            const pid = 'C' + c.id, tids = c.tableIds || [];
            parentMapping[pid] = tids;
            tids.forEach(tid => { if (!combinedMapping[tid]) combinedMapping[tid] = []; combinedMapping[tid].push(pid); });
        });
    });
    if (areaId) activeTables = activeTables.filter(t => t.area_id === areaId);
    const blockedStatuses = ['Confirmed','Pending','Blocked','Inquiry'];
    const existingReservations = (DB.getReservations() || []).filter(r =>
        r.date === date && blockedStatuses.includes(r.status) && r.start_time && r.end_time
    );
    const unavailableTableIds = new Set();
    existingReservations.forEach(res => {
        if (checkOverlap(date, startTime, endTime, res.start_time, res.end_time, rc.buffer)) {
            (res.assigned_tables || []).forEach(id => {
                unavailableTableIds.add(id);
                if (parentMapping[id]) parentMapping[id].forEach(cid => unavailableTableIds.add(cid));
                if (combinedMapping[id]) combinedMapping[id].forEach(pid => unavailableTableIds.add(pid));
            });
        }
    });
    const availableTables = activeTables.filter(t => !unavailableTableIds.has(t.id));
    let fit = availableTables.filter(t => t.capacity >= guestCount).sort((a,b) => a.capacity - b.capacity)[0];
    if (fit) return { success: true, tables: [fit.id], endTime };
    const combinable = availableTables.filter(t => t.combinable).sort((a,b) => b.capacity - a.capacity);
    let combinedCapacity = 0, selectedIds = [];
    for (const t of combinable) {
        combinedCapacity += t.capacity; selectedIds.push(t.id);
        if (combinedCapacity >= guestCount) return { success: true, tables: selectedIds, endTime };
    }
    return { success: false, reason: `Keine Kapazität im Bereich ${areaId || 'Gesamt'} verfügbar` };
};

const tokenResponsePage = (DB, title, message, color, emoji) => {
    const branding = DB.getKV('branding', {});
    const restaurantName = branding.name || 'Restaurant';
    const accentColor = branding.primaryColor || color;
    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} – ${restaurantName}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               background: #f7f8fa; display: flex; align-items: center;
               justify-content: center; min-height: 100vh; padding: 20px; }
        .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);
                max-width: 480px; width: 100%; padding: 48px 40px; text-align: center; }
        .emoji { font-size: 56px; margin-bottom: 20px; }
        h1 { color: ${accentColor}; font-size: 1.6rem; margin-bottom: 12px; }
        p  { color: #555; line-height: 1.6; font-size: 1rem; }
        .restaurant { margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee;
                      color: #999; font-size: 0.85rem; }
    </style>
</head>
<body>
    <div class="card">
        <div class="emoji">${emoji}</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <div class="restaurant">${restaurantName}</div>
    </div>
</body>
</html>`;
};

module.exports = { sanitizeText, calculateDuration, parseTime, buildEndTime, checkOverlap, findAvailableTables, tokenResponsePage };
