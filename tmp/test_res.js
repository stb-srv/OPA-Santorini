const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'server', 'db.json');
const db = JSON.parse(fs.readFileSync(DATA_FILE));

// Copy-paste helper functions from api.js for testing
const calculateDuration = (guestCount) => {
    const count = parseInt(guestCount);
    if (count <= 2) return 90;
    if (count <= 4) return 120;
    return 150;
};

const parseTime = (timeStr) => {
    const [hrs, mins] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(hrs, mins, 0, 0);
    return d;
};

const checkOverlap = (start1, end1, start2, end2, buffer = 15) => {
    const s1 = parseTime(start1).getTime();
    const e1 = parseTime(end1).getTime() + (buffer * 60000);
    const s2 = parseTime(start2).getTime();
    const e2 = parseTime(end2).getTime() + (buffer * 60000);
    return s1 < e2 && s2 < e1;
};

const findAvailableTables = (db, date, startTime, duration, guestCount) => {
    const endTimeObj = parseTime(startTime);
    endTimeObj.setMinutes(endTimeObj.getMinutes() + duration);
    const endTime = `${String(endTimeObj.getHours()).padStart(2, '0')}:${String(endTimeObj.getMinutes()).padStart(2, '0')}`;

    const activeTables = db.tables.filter(t => t.active);
    const existingReservations = db.reservations.filter(r => r.date === date && r.status !== 'cancelled');

    const unavailableTableIds = new Set();
    existingReservations.forEach(res => {
        if (checkOverlap(startTime, endTime, res.start_time, res.end_time)) {
            res.assigned_tables.forEach(id => unavailableTableIds.add(id));
        }
    });

    const availableTables = activeTables.filter(t => !unavailableTableIds.has(t.id));

    let fit = availableTables.filter(t => t.capacity >= guestCount).sort((a, b) => a.capacity - b.capacity)[0];
    if (fit) return { success: true, tables: [fit.id], endTime };

    const combinable = availableTables.filter(t => t.combinable).sort((a, b) => b.capacity - a.capacity);
    let combinedCapacity = 0;
    let selectedIds = [];
    for (const t of combinable) {
        combinedCapacity += t.capacity;
        selectedIds.push(t.id);
        if (combinedCapacity >= guestCount) return { success: true, tables: selectedIds, endTime };
    }

    return { success: false, reason: 'Keine Kapazität verfügbar' };
};

// Test Case 1: Booking 2 people at 17:00 (Steven is already at Tisch 1)
console.log("Test 1: 2 people at 17:00 on 15.04.2026");
console.log(findAvailableTables(db, "15.04.2026", "17:00", 90, 2));

// Test Case 2: Booking 10 people (Should combine tables)
console.log("\nTest 2: 10 people at 19:00 on 15.04.2026");
console.log(findAvailableTables(db, "15.04.2026", "19:00", 150, 10));

// Test Case 3: Booking 20 people (Should fail)
console.log("\nTest 3: 50 people at 19:00 (Oversized)");
console.log(findAvailableTables(db, "15.04.2026", "19:00", 150, 50));
