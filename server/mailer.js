/**
 * Mailer Service for OPA-CMS
 * Using NodeMailer for guest notifications.
 */

const nodemailer = require('nodemailer');
const CONFIG = require('../config.js');

const transporter = nodemailer.createTransport({
    host: CONFIG.SMTP.host,
    port: CONFIG.SMTP.port,
    secure: CONFIG.SMTP.secure,
    auth: {
        user: CONFIG.SMTP.user,
        pass: CONFIG.SMTP.pass
    },
    // Useful for testing with self-signed certificates or local dev
    tls: { rejectUnauthorized: false }
});

const Mailer = {
    /**
     * Send Confirmation Email to Guest
     */
    sendConfirmation: async (reservation) => {
        const { name, email, date, start_time, guests, status } = reservation;
        const isInquiry = status === 'Inquiry';

        const subject = isInquiry 
            ? `Warteliste / Anfrage bestätigt: ${date}` 
            : `Reservierungsbestätigung: OPA! Santorini`;

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: #2b6cb0;">Kalispera ${name}!</h2>
                <p>${isInquiry 
                    ? 'Vielen Dank für Ihre Anfrage. Leider sind wir zum gewählten Zeitpunkt bereits ausgebucht, aber wir haben Sie auf unsere <strong>Warteliste</strong> gesetzt.' 
                    : 'Ihre Reservierung im OPA! Santorini wurde erfolgreich empfangen.'}</p>
                
                <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Datum:</strong> ${date}</p>
                    <p><strong>Uhrzeit:</strong> ${start_time}</p>
                    <p><strong>Personen:</strong> ${guests}</p>
                    <p><strong>Status:</strong> ${isInquiry ? 'Warteliste (Anfrage)' : 'Eingegangen (Wartet auf Bestätigung)'}</p>
                </div>

                <p>Wir freuen uns auf Ihren Besuch!</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="font-size: 12px; color: #718096;">OPA! Santorini | Griechische Spezialitäten</p>
            </div>
        `;

        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                await transporter.sendMail({
                    from: CONFIG.SMTP.from,
                    to: email,
                    subject: subject,
                    html: html
                });
                console.log(`✉️ Email sent to ${email}`);
                return;
            } catch (e) {
                attempts++;
                console.error(`❌ Mail attempt ${attempts} failed:`, e.message);
                if (attempts >= maxAttempts) throw e;
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Backoff
            }
        }
    },

    /**
     * Notify about Status Change (Confirmed / Cancelled)
     */
    sendStatusChange: async (reservation) => {
        const { name, email, status, date, start_time } = reservation;
        let subject = '';
        let statusText = '';
        let color = '#2b6cb0';

        if (status === 'Confirmed') {
            subject = 'BESTÄTIGT: Ihr Tisch im OPA! Santorini';
            statusText = 'Ihre Reservierung wurde soeben von unserem Team bestätigt. Wir freuen uns auf Sie!';
            color = '#38a169';
        } else if (status === 'Cancelled') {
            subject = 'ABSAGE: Ihre Reservierung im OPA! Santorini';
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

        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                await transporter.sendMail({
                    from: CONFIG.SMTP.from,
                    to: email,
                    subject: subject,
                    html: html
                });
                console.log(`✉️ Status change email sent to ${email}`);
                return;
            } catch (e) {
                attempts++;
                console.error(`❌ Status mail attempt ${attempts} failed:`, e.message);
                if (attempts >= maxAttempts) throw e;
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Backoff
            }
        }
    }
};

module.exports = Mailer;
