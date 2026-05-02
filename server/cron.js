/**
 * OPA-CMS – Background Cron Jobs
 * Trial Expiry & Reservation Reminders
 */
const DB = require('./database.js');
const Mailer = require('./mailer.js');
const logger = require('./logger.js');

/**
 * Job 1: Trial Expiry Check
 * Markiert Trial-Lizenzen als abgelaufen wenn das Datum erreicht ist.
 */
const checkTrialExpiry = async () => {
    try {
        const settings = await DB.getKV('settings', {});
        const lic = settings.license;
        if (lic && lic.isTrial && lic.expiresAt && new Date(lic.expiresAt) < new Date() && lic.status !== 'expired') {
            logger.warn('Trial-Lizenz abgelaufen.');
            lic.status = 'expired';
            await DB.setKV('settings', settings);
        }
    } catch (e) {
        logger.error({ err: e }, 'Trial cleanup error');
    }
};

/**
 * Job 2: Reservation Reminders
 * Sendet 24h vor einer Reservierung eine Erinnerungs-E-Mail (täglich um 10:00 Uhr).
 */
const checkReminders = async () => {
    try {
        const now = new Date();
        // Nur um 10 Uhr morgens prüfen (Berlin Time)
        const nowHour = parseInt(new Intl.DateTimeFormat('de-DE', { hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin' }).format(now), 10);
        if (nowHour !== 10) return;
        
        const reservations = await DB.getReservations();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Format DD.MM.YYYY konsistent mit der App
        const tomorrowStr = `${String(tomorrow.getDate()).padStart(2,'0')}.${String(tomorrow.getMonth()+1).padStart(2,'0')}.${tomorrow.getFullYear()}`;
        
        const toRemind = reservations.filter(r => 
            r.date === tomorrowStr && 
            r.status === 'Confirmed' && 
            r.email &&
            !r.reminderSent
        );
        
        if (toRemind.length > 0) {
            logger.info(`[Cron] Sende ${toRemind.length} Reservierungs-Erinnerungen...`);
        }
        
        for (const r of toRemind) {
            try {
                await Mailer.sendReminder(r, DB);
                await DB.updateReservation(r.id, { reminderSent: true });
                console.log(`✉️ Reminder sent to ${r.email} for reservation ${r.id}`);
            } catch (mailErr) {
                logger.error({ err: mailErr, name: r.name }, 'Fehler beim Senden der Erinnerung');
            }
        }
    } catch(e) {
        logger.error({ err: e }, 'Reminder-Check Fehler');
    }
};

const startCron = () => {
    logger.info('Background Jobs initialisiert.');
    
    // Trial Check: Stündlich
    setInterval(checkTrialExpiry, 60 * 60 * 1000);
    checkTrialExpiry();

    // Reminder Check: Stündlich (filtert intern auf 10:00 Uhr)
    setInterval(checkReminders, 60 * 60 * 1000);
    checkReminders();
};

module.exports = { startCron };
