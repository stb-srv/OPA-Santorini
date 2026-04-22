/**
 * Mailer Service for OPA-CMS
 * Der Transporter wird bei jedem Aufruf frisch aus der aktuellen Konfiguration
 * erstellt, damit SMTP-Änderungen im CMS sofort ohne Neustart greifen.
 */

const nodemailer = require('nodemailer');
const CONFIG = require('../config.js');

/**
 * Erstellt einen frischen SMTP-Transporter (async).
 * Gibt null zurück wenn keine gültige SMTP-Konfiguration vorhanden ist.
 */
const createTransporter = async (DB = null) => {
    let smtp = { ...CONFIG.SMTP };

    if (DB) {
        try {
            const settings = await DB.getKV('settings', {});
            if (settings.smtp && settings.smtp.host) {
                smtp = { ...smtp, ...settings.smtp };
            }
        } catch (e) { /* Ignorieren wenn DB noch nicht verfügbar */ }
    }

    if (!smtp.host) {
        console.warn('[Mailer] Kein SMTP-Host konfiguriert. E-Mail wird nicht gesendet.');
        return null;
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
 * Gibt den Absender-String zurück (async).
 */
const getSenderName = async (DB = null) => {
    let smtpConfig = { ...CONFIG.SMTP };
    if (DB) {
        try {
            const settings = await DB.getKV('settings', {});
            if (settings.smtp && settings.smtp.host) smtpConfig = { ...smtpConfig, ...settings.smtp };
        } catch (e) {}
    }

    const fromEmail = smtpConfig.from || smtpConfig.user || null;
    if (!fromEmail) {
        throw new Error('SMTP from/user-Adresse nicht konfiguriert. Bitte SMTP-Einstellungen prüfen.');
    }

    if (DB) {
        try {
            const branding = await DB.getKV('branding', {});
            if (branding.name) {
                const emailMatch = fromEmail.match(/<(.+)>/);
                const email = emailMatch ? emailMatch[1] : fromEmail;
                return `"${branding.name}" <${email}>`;
            }
        } catch (e) {}
    }
    return fromEmail;
};

/**
 * Gibt den Restaurant-Namen aus Branding oder einen Fallback zurück (async).
 */
const getRestaurantName = async (DB = null) => {
    if (DB) {
        try {
            const branding = await DB.getKV('branding', {});
            if (branding.name) return branding.name;
        } catch (e) {}
    }
    return 'Das Team';
};

/**
 * Ersetzt Platzhalter in einem String.
 */
const replacePlaceholders = (text, data) => {
    if (!text) return '';
    let result = text;
    for (const key in data) {
        result = result.replaceAll(`{{${key}}}`, data[key] || '');
    }
    return result;
};

const Mailer = {
    /**
     * Bestätigungs-E-Mail an den Gast senden
     */
    sendConfirmation: async (reservation, DB = null) => {
        const { name, email, date, start_time, guests, status } = reservation;
        if (!email) return;

        const transporter = await createTransporter(DB);
        if (!transporter) return; // kein SMTP konfiguriert

        const from = await getSenderName(DB);
        const restaurantName = await getRestaurantName(DB);
        const isInquiry = status === 'Inquiry';

        // Templates laden
        const settings = await DB.getKV('settings', {});
        const templates = settings.emailTemplates || {};
        const tplKey = isInquiry ? 'tpl_inquiry' : 'tpl_confirmation';
        const tpl = templates[tplKey] || {};

        const data = { name, date, start_time, guests, restaurantName };

        const subject = replacePlaceholders(tpl.subject || (isInquiry
            ? `Warteliste / Anfrage bestätigt: {{date}}`
            : `Reservierungsbestätigung – {{date}}`), data);

        const defaultBody = isInquiry
            ? `<h2 style="color: #2b6cb0;">Hallo {{name}}!</h2>
               <p>Vielen Dank für Ihre Anfrage. Leider sind wir zum gewählten Zeitpunkt bereits ausgebucht, aber wir haben Sie auf unsere <strong>Warteliste</strong> gesetzt.</p>
               <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                   <p><strong>Datum:</strong> {{date}}</p>
                   <p><strong>Uhrzeit:</strong> {{start_time}}</p>
                   <p><strong>Personen:</strong> {{guests}}</p>
                   <p><strong>Status:</strong> Warteliste (Anfrage)</p>
               </div>
               <p>Wir freuen uns auf Ihren Besuch!</p>`
            : `<h2 style="color: #2b6cb0;">Hallo {{name}}!</h2>
               <p>Ihre Reservierung wurde erfolgreich empfangen.</p>
               <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                   <p><strong>Datum:</strong> {{date}}</p>
                   <p><strong>Uhrzeit:</strong> {{start_time}}</p>
                   <p><strong>Personen:</strong> {{guests}}</p>
                   <p><strong>Status:</strong> Eingegangen (Wartet auf Bestätigung)</p>
               </div>
               <p>Wir freuen uns auf Ihren Besuch!</p>`;

        const bodyContent = replacePlaceholders(tpl.body || defaultBody, data);

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                ${bodyContent}
                <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="font-size: 12px; color: #718096;">Herzliche Grüße, ${restaurantName}</p>
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

        const transporter = await createTransporter(DB);
        if (!transporter) return;

        const from = await getSenderName(DB);
        const restaurantName = await getRestaurantName(DB);

        // Templates laden
        const settings = await DB.getKV('settings', {});
        const templates = settings.emailTemplates || {};
        const isConfirmed = status === 'Confirmed';
        const tplKey = isConfirmed ? 'tpl_confirmed' : 'tpl_cancelled';
        const tpl = templates[tplKey] || {};

        const data = { name, date, start_time, restaurantName };

        let defaultSubject = '', defaultBody = '', color = '#2b6cb0';

        if (isConfirmed) {
            defaultSubject = 'BESTÄTIGT: Ihr Tisch am {{date}}';
            defaultBody = `<h2 style="color: #38a169;">BESTÄTIGT: Ihr Tisch</h2>
                           <p>Hallo {{name}},</p>
                           <p>Ihre Reservierung wurde soeben von unserem Team bestätigt. Wir freuen uns auf Sie!</p>
                           <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                               <p><strong>Termin:</strong> {{date}} um {{start_time}}</p>
                               <p><strong>Status:</strong> Bestätigt</p>
                           </div>`;
            color = '#38a169';
        } else if (status === 'Cancelled') {
            defaultSubject = 'ABSAGE: Ihre Reservierung am {{date}}';
            defaultBody = `<h2 style="color: #e53e3e;">ABSAGE: Ihre Reservierung</h2>
                           <p>Hallo {{name}},</p>
                           <p>Leider müssen wir Ihre Reservierung für den gewählten Termin absagen. Wir hoffen, Sie ein anderes Mal begrüßen zu dürfen.</p>
                           <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                               <p><strong>Termin:</strong> {{date}} um {{start_time}}</p>
                               <p><strong>Status:</strong> Storniert</p>
                           </div>`;
            color = '#e53e3e';
        } else { return; }

        const subject = replacePlaceholders(tpl.subject || defaultSubject, data);
        const bodyContent = replacePlaceholders(tpl.body || defaultBody, data);

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                ${bodyContent}
                <p>Herzliche Grüße,<br>${restaurantName}</p>
            </div>
        `;

        await sendWithRetry(transporter, { from, to: email, subject, html });
    },

    /**
     * Zugangsdaten an neuen Nutzer senden
     */
    sendUserCredentials: async (email, name, username, plainPassword, DB = null) => {
        if (!email) return;

        const transporter = await createTransporter(DB);
        if (!transporter) return;

        const from = await getSenderName(DB);
        const restaurantName = await getRestaurantName(DB);

        // Templates laden
        const settings = await DB.getKV('settings', {});
        const templates = settings.emailTemplates || {};
        const tpl = templates['tpl_credentials'] || {};

        const data = { name, username, password: plainPassword, restaurantName };

        const defaultSubject = 'Ihre Zugangsdaten für das CMS';
        const defaultBody = `<h2 style="color: #2b6cb0;">Willkommen beim CMS</h2>
                            <p>Hallo {{name}},</p>
                            <p>Ein Admin hat soeben einen neuen Account für Sie erstellt oder Ihr Passwort wurde zurückgesetzt.</p>
                            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>Benutzername:</strong> {{username}}</p>
                                <p><strong>Passwort:</strong> <code>{{password}}</code></p>
                            </div>
                            <p><em>Zu Ihrer Sicherheit werden Sie gebeten, dieses Passwort bei Ihrem ersten Login zu ändern.</em></p>`;

        const subject = replacePlaceholders(tpl.subject || defaultSubject, data);
        const bodyContent = replacePlaceholders(tpl.body || defaultBody, data);

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                ${bodyContent}
                <p>Herzliche Grüße,<br>${restaurantName}</p>
            </div>
        `;

        await sendWithRetry(transporter, { from, to: email, subject, html });
    },

    /**
     * Test-E-Mail für SMTP-Konfigurationsprüfung im CMS
     */
    sendTestMail: async (toEmail, DB = null) => {
        const transporter = await createTransporter(DB);
        if (!transporter) throw new Error('Kein SMTP-Host konfiguriert.');
        const from = await getSenderName(DB);

        await sendWithRetry(transporter, {
            from,
            to: toEmail,
            subject: 'OPA! CMS - SMTP Test erfolgreich ✅',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                    <h2 style="color: #38a169;">✅ SMTP-Konfiguration funktioniert!</h2>
                    <p>Wenn du diese E-Mail siehst, ist die E-Mail-Konfiguration deines OPA! CMS korrekt eingerichtet.</p>
                    <p style="color: #718096; font-size: 13px;">Gesendet am: ${new Date().toLocaleString('de-DE')}</p>
                </div>
            `
        });
    },

    /**
     * Automatische Erinnerungs-E-Mail (24h vorher)
     */
    sendReminder: async (reservation, DB = null) => {
        const { name, email, date, start_time, guests } = reservation;
        if (!email) return;

        const transporter = await createTransporter(DB);
        if (!transporter) return;

        const from = await getSenderName(DB);
        const restaurantName = await getRestaurantName(DB);
        const subject = `Erinnerung: Ihre Reservierung morgen – ${restaurantName}`;
        
        const html = `
            <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                <p>Hallo ${name},</p>
                <p>wir möchten Sie an Ihre Reservierung erinnern:</p>
                <ul style="list-style: none; padding: 0;">
                    <li><strong>Datum:</strong> ${date}</li>
                    <li><strong>Uhrzeit:</strong> ${start_time} Uhr</li>
                    <li><strong>Personen:</strong> ${guests}</li>
                </ul>
                <p>Bei Fragen oder falls Sie stornieren möchten, antworten Sie einfach auf diese E-Mail.</p>
                <p>Wir freuen uns auf Ihren Besuch!<br>${restaurantName}</p>
            </div>
        `;

        await sendWithRetry(transporter, { from, to: email, subject, html });
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

/**
 * Hilfsfunktion: Umhüllt den Content mit einem Standard-HTML-Rahmen.
 */
function wrapHtml(restaurantName, content) {
    return `
        <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
            ${content}
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #718096;">Herzliche Grüße, ${restaurantName}</p>
        </div>
    `;
}

/**
 * Basale Mail-Send-Funktion.
 */
async function sendMail({ to, subject, html }, smtp) {
    const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port || 465,
        secure: smtp.secure !== false,
        auth: {
            user: smtp.user,
            pass: smtp.pass
        },
        tls: { rejectUnauthorized: false }
    });
    await transporter.sendMail({
        from: smtp.from || smtp.user,
        to,
        subject,
        html
    });
}

/**
 * Sendet dem Kunden eine E-Mail wenn eine Bestellung bestätigt oder abgelehnt wird.
 */
async function sendOrderStatusMail(order, DB) {
    const settings = await DB.getKV('settings', {});
    const branding = await DB.getKV('branding', {});
    const restaurantName = branding.name || 'Unser Restaurant';
    const smtp = settings.smtp || {};
    if (!smtp.host || !order.customerEmail) return;

    const isConfirmed = order.status === 'confirmed';
    const typeLabel   = order.type === 'pickup' ? 'Abholung' : 'Lieferung';

    const subject = isConfirmed
        ? `✅ Deine ${typeLabel} wurde bestätigt – ${restaurantName}`
        : `❌ Deine Bestellung wurde abgelehnt – ${restaurantName}`;

    const body = isConfirmed ? `
        <h2 style="color:#22c55e;">Bestellung bestätigt! 🎉</h2>
        <p>Hallo ${order.customerName || 'Gast'},</p>
        <p>deine <strong>${typeLabel}</strong> wurde von uns bestätigt und wird jetzt vorbereitet.</p>
        ${order.estimatedTime ? `<p><strong>Voraussichtliche Zeit:</strong> ${order.estimatedTime}</p>` : ''}
        ${order.type === 'pickup' ? `<p>Du kannst deine Bestellung ab der oben genannten Zeit abholen.</p>` : `<p>Wir liefern dir deine Bestellung so schnell wie möglich.</p>`}
        <hr>
        <p style="font-size:0.85em; color:#6b7280;">Bestell-Referenz: #${order.id}</p>
    ` : `
        <h2 style="color:#ef4444;">Bestellung abgelehnt</h2>
        <p>Hallo ${order.customerName || 'Gast'},</p>
        <p>leider konnten wir deine Bestellung diesmal nicht annehmen.</p>
        <p>Bitte ruf uns an oder versuche es zu einem anderen Zeitpunkt erneut.</p>
        <hr>
        <p style="font-size:0.85em; color:#6b7280;">Bestell-Referenz: #${order.id}</p>
    `;

    await sendMail({ to: order.customerEmail, subject, html: wrapHtml(restaurantName, body) }, smtp);
}

Mailer.sendOrderStatusMail = sendOrderStatusMail;
module.exports = Mailer;
