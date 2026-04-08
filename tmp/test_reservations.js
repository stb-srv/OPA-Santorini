const DB = require('../server/database.js');
// Simulation of findAvailableTables logic
const calculateDuration = (guestCount) => {
    const count = parseInt(guestCount);
    if (count <= 2) return 90;
    if (count <= 4) return 120;
    return 150;
};

const findAvailableTablesManual = (date, startTime, duration, guestCount, areaId = null) => {
    // Check Opening Hours
    const homepage = DB.getKV('homepage', {});
    const oh = homepage.openingHours || {};
    const d = new Date(date);
    const dayKey = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
    const dayConfig = oh[dayKey];

    // Simulating parseTime since requirement of server.js might fail
    const internalParseTime = (timeStr) => {
        const cleanTime = timeStr.replace(/[^0-9:]/g, '');
        const [hrs, mins] = cleanTime.split(':').map(Number);
        const d = new Date(2000, 0, 1); // Fixed date for test
        d.setHours(hrs || 0, mins || 0, 0, 0);
        return d;
    };

    if (dayConfig) {
        if (dayConfig.closed) return { success: false, reason: `Wir haben am ${dayKey} leider Ruhetag.` };
        
        const start = internalParseTime(startTime).getTime();
        const open = internalParseTime(dayConfig.open).getTime();
        const close = internalParseTime(dayConfig.close).getTime();

        if (start < open || start > close) {
            return { success: false, reason: `Reservierung außerhalb der Öffnungszeiten (${dayConfig.open} - ${dayConfig.close} Uhr).` };
        }
    }
    return { success: true };
};

// Test Cases
const testDate = '2026-04-13'; // Montag
const homepage = DB.getKV('homepage', {});
homepage.openingHours = {
    'Mo': { open: '17:00', close: '22:00', closed: false },
    'Di': { open: '17:00', close: '22:00', closed: true }
};
DB.setKV('homepage', homepage);

console.log('Test 1: Normal Time (18:00) ->', findAvailableTablesManual('2026-04-13', '18:00', 90, 2));
console.log('Test 2: Too Early (15:00) ->', findAvailableTablesManual('2026-04-13', '15:00', 90, 2));
console.log('Test 3: Too Late (23:00) ->', findAvailableTablesManual('2026-04-13', '23:00', 90, 2));
console.log('Test 4: Ruhetag (Dienstag) ->', findAvailableTablesManual('2026-04-14', '18:00', 90, 2));
