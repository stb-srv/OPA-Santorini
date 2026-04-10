/**
 * Mailer Service for OPA-CMS
 * Der Transporter wird bei jedem Aufruf frisch aus der aktuellen Konfiguration
 * erstellt, damit SMTP-Änderungen im CMS sofort ohne Neustart greifen.
 */

const nodemailer = require('nodemailer');
const CONFIG = require('../config.js');

/**
 * Erstellt einen frischen SMTP-Transporter.
 * Greift zuerst auf die DB-Einstellungen zurück (vom CMS gesetzt),
 * dann auf die .env-Konfiguration.
 */
const createTransporter = (DB = null) => {
    let smtp = { ...CONFIG.SMTP };

    if (DB) {
        try {
            const settings = DB.getKV('settings', {});
            if (settings.smtp && settings.smtp.host) {
                smtp = { ...smtp, ...settings.smtp };
            }
        } catch (e) { /* Ignorieren wenn DB noch nicht verfügbar */ }
    }

    return nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port || 465,
        secure: smtp.secure !== false,
        auth: {
            user: smtp.user,
            pass: smtp.pass
        },
        tls: { rejectUnauthorized: false }
    });
};

/**
 * Gibt den Absender-Namen aus DB-Branding oder Config zurück.
 */
const getSenderName = (DB = null) => {
    if (DB) {
        try {
            const branding = DB.getKV('branding', {});
            if (branding.name) {
                const smtp = DB.getKV('settings', {})?.smtp || CONFIG.SMTP;
                const fromEmail = smtp.from || smtp.user || '';
                // Extrahiere reine E-Mail aus "Name <email>" Format
                const emailMatch = fromEmail.match(/<(.+)>/);
                const email = emailMatch ? emailMatch[1] : fromEmail;
                return `"${branding.name}" <${email}>`;
            }
        } catch (e) {}
    }
    return CONFIG.SMTP.from || '';
};

const Mailer = {
    /**
     * Bestätigungs-E-Mail an den Gast senden
     */
    sendConfirmation: async (reservation, DB = null) => {
        const { name, email, date, start_time, guests, status } = reservation;
        if (!email) return;
        const isInquiry = status === 'Inquiry';
        const transporter = createTransporter(DB);
        const from = getSenderName(DB);

        const subject = isInquiry
            ? `Warteliste / Anfrage bestätigt: ${date}`
            : `Reservierungsbestätigung`;

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: #2b6cb0;">Kalispera ${name}!</h2>
                <p>${isInquiry
                    ? 'Vielen Dank für Ihre Anfrage. Leider sind wir zum gewählten Zeitpunkt bereits ausgebucht, aber wir haben Sie auf unsere <strong>Warteliste</strong> gesetzt.'
                    : 'Ihre Reservierung wurde erfolgreich empfangen.'}</p>

                <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Datum:</strong> ${date}</p>
                    <p><strong>Uhrzeit:</strong> ${start_time}</p>
                    <p><strong>Personen:</strong> ${guests}</p>
                    <p><strong>Status:</strong> ${isInquiry ? 'Warteliste (Anfrage)' : 'Eingegangen (Wartet auf Bestätigung)'}</p>
                </div>

                <p>Wir freuen uns auf Ihren Besuch!</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="font-size: 12px; color: #718096;">Restaurant-CMS powered by OPA!</p>
            </div>
        `;

        await sendWithRetry(transporter, { from, to: email, subject, html });
    },

    /**
     * Statusänderungs-E-Mail (Bestätigt / Storniert)
     */
    sendStatusChange: async (reservation, DB = null) => {
        const { name, email, status, date, start_time } = reservation;
        if (!email) return;
        const transporter = createTransporter(DB);
        const from = getSenderName(DB);

        let subject = '', statusText = '', color = '#2b6cb0';

        if (status === 'Confirmed') {
            subject = 'BESTÄTIGT: Ihr Tisch';
            statusText = 'Ihre Reservierung wurde soeben von unserem Team bestätigt. Wir freuen uns auf Sie!';
            color = '#38a169';
        } else if (status === 'Cancelled') {
            subject = 'ABSAGE: Ihre Reservierung';
            statusText = 'Leider müssen wir Ihre Reservierung für den gewählten Termin absagen. Wir hoffen, Sie ein anderes Mal begrüßen zu dürfen.';
            color = '#e53e3e';
        } else { return; }

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: ${color};">${subject}</h2>
                <p>Hallo ${name},</p>
                <p>${statusText}</p>

                <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Termin:</strong> ${date} um ${start_time}</p>
                    <p><strong>Status:</strong> ${status}</p>
                </div>

                <p>Herzliche Grüße,<br>Ihr OPA! Team</p>
            </div>
        `;

        await sendWithRetry(transporter, { from, to: email, subject, html });
    },

    /**
     * Zugangsdaten an neuen Nutzer senden
     */
    sendUserCredentials: async (email, name, username, plainPassword, DB = null) => {
        if (!email) return;
        const transporter = createTransporter(DB);
        const from = getSenderName(DB);

        const subject = 'Ihre Zugangsdaten für das CMS';
        const html = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: #2b6cb0;">Willkommen beim CMS</h2>
                <p>Hallo ${name || username},</p>
                <p>Ein Admin hat soeben einen neuen Account für Sie erstellt oder Ihr Passwort wurde zurückgesetzt.</p>

                <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Benutzername:</strong> ${username}</p>
                    <p><strong>Passwort:</strong> <code>${plainPassword}</code></p>
                </div>

                <p><em>Zu Ihrer Sicherheit werden Sie gebeten, dieses Passwort bei Ihrem ersten Login zu ändern.</em></p>

                <p>Herzliche Grüße,<br>Ihr OPA! Team</p>
            </div>
        `;

        await sendWithRetry(transporter, { from, to: email, subject, html });
    },

    /**
     * Test-E-Mail für SMTP-Konfigurationsprüfung im CMS
     */
    sendTestMail: async (toEmail, DB = null) => {
        const transporter = createTransporter(DB);
        const from = getSenderName(DB);

        await sendWithRetry(transporter, {
            from,
            to: toEmail,
            subject: 'OPA! CMS – SMTP Test erfolgreich ✅',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                    <h2 style="color: #38a169;">✅ SMTP-Konfiguration funktioniert!</h2>
                    <p>Wenn du diese E-Mail siehst, ist die E-Mail-Konfiguration deines OPA! CMS korrekt eingerichtet.</p>
                    <p style="color: #718096; font-size: 13px;">Gesendet am: ${new Date().toLocaleString('de-DE')}</p>
                </div>
            `
        });
    }
};

/**
 * Hilfsfunktion: Sendet eine E-Mail mit bis zu 3 Versuchen (Exponential Backoff)
 */
async function sendWithRetry(transporter, mailOptions, maxAttempts = 3) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        try {
            await transporter.sendMail(mailOptions);
            console.log(`✉️ Email sent to ${mailOptions.to}`);
            return;
        } catch (e) {
            attempts++;
            console.error(`❌ Mail attempt ${attempts} failed:`, e.message);
            if (attempts >= maxAttempts) throw e;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
    }
}

module.exports = Mailer;
