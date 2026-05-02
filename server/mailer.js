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
        const html = wrapHtml(restaurantName, bodyContent);

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

        let defaultSubject = '', defaultBody = '';

        if (isConfirmed) {
            defaultSubject = 'BESTÄTIGT: Ihr Tisch am {{date}}';
            defaultBody = `<h2 style="color: #38a169;">BESTÄTIGT: Ihr Tisch</h2>
                           <p>Hallo {{name}},</p>
                           <p>Ihre Reservierung wurde soeben von unserem Team bestätigt. Wir freuen uns auf Sie!</p>
                           <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                               <p><strong>Termin:</strong> {{date}} um {{start_time}}</p>
                               <p><strong>Status:</strong> Bestätigt</p>
                           </div>`;
        } else if (status === 'Cancelled') {
            defaultSubject = 'ABSAGE: Ihre Reservierung am {{date}}';
            defaultBody = `<h2 style="color: #e53e3e;">ABSAGE: Ihre Reservierung</h2>
                           <p>Hallo {{name}},</p>
                           <p>Leider müssen wir Ihre Reservierung für den gewählten Termin absagen. Wir hoffen, Sie ein anderes Mal begrüßen zu dürfen.</p>
                           <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                               <p><strong>Termin:</strong> {{date}} um {{start_time}}</p>
                               <p><strong>Status:</strong> Storniert</p>
                           </div>`;
        } else { return; }

        const subject = replacePlaceholders(tpl.subject || defaultSubject, data);
        const bodyContent = replacePlaceholders(tpl.body || defaultBody, data);
        const html = wrapHtml(restaurantName, bodyContent);

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
        const html = wrapHtml(restaurantName, bodyContent);

        await sendWithRetry(transporter, { from, to: email, subject, html });
    },

    /**
     * Test-E-Mail für SMTP-Konfigurationsprüfung im CMS
     */
    sendTestMail: async (toEmail, DB = null) => {
        const transporter = await createTransporter(DB);
        if (!transporter) throw new Error('Kein SMTP-Host konfiguriert.');
        const from = await getSenderName(DB);
        const restaurantName = await getRestaurantName(DB);

        const bodyContent = `
            <h2 style="color: #38a169;">✅ SMTP-Konfiguration funktioniert!</h2>
            <p>Wenn du diese E-Mail siehst, ist die E-Mail-Konfiguration deines OPA! CMS korrekt eingerichtet.</p>
            <p style="color: #718096; font-size: 13px;">Gesendet am: ${new Date().toLocaleString('de-DE')}</p>
        `;
        const html = wrapHtml(restaurantName, bodyContent);

        await sendWithRetry(transporter, {
            from,
            to: toEmail,
            subject: 'OPA! CMS - SMTP Test erfolgreich ✅',
            html
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
        
        const bodyContent = `
            <p>Hallo ${name},</p>
            <p>wir möchten Sie an Ihre Reservierung erinnern:</p>
            <ul style="list-style: none; padding: 0;">
                <li><strong>Datum:</strong> ${date}</li>
                <li><strong>Uhrzeit:</strong> ${start_time} Uhr</li>
                <li><strong>Personen:</strong> ${guests}</li>
            </ul>
            <p>Bei Fragen oder falls Sie stornieren möchten, antworten Sie einfach auf diese E-Mail.</p>
            <p>Wir freuen uns auf Ihren Besuch!</p>
        `;
        const html = wrapHtml(restaurantName, bodyContent);

        await sendWithRetry(transporter, { from, to: email, subject, html });
    }
};

/**
 * Sendet dem Kunden eine E-Mail wenn eine Bestellung bestätigt oder abgelehnt wird.
 */
async function sendOrderStatusMail(order, DB) {
    const settings      = await DB.getKV('settings', {});
    const branding      = await DB.getKV('branding', {});
    const restaurantName = branding.name || 'Unser Restaurant';
    const primaryColor  = branding.primaryColor || '#1B3A5C';
    const accentColor   = branding.accentColor  || '#C8A96E';
    const smtp = settings.smtp || {};
    if (!smtp.host || !order.customerEmail) return;

    const isConfirmed = order.status === 'confirmed';
    const isCancelled = order.status === 'cancelled';
    const isReady     = order.status === 'ready';
    const typeLabel   = order.type === 'pickup' ? 'Abholung' : 'Lieferung';

    // Artikel-Tabelle
    const itemsRows = (order.items || []).map(i => `
        <tr>
            <td style="padding:8px 12px; color:#9ca3af; font-size:.8rem; width:24px;">${i.number || ''}</td>
            <td style="padding:8px 12px;">
                <strong style="font-size:.9rem;">${i.quantity}× ${i.name}</strong>
                ${i.desc ? `<br><span style="font-size:.78rem; color:#9ca3af;">${i.desc}</span>` : ''}
                ${i.note ? `<br><span style="font-size:.78rem; color:${accentColor};">📝 ${i.note}</span>` : ''}
            </td>
            <td style="padding:8px 12px; text-align:right; font-weight:700; white-space:nowrap; font-size:.88rem;">
                ${(parseFloat(i.price||0) * (i.quantity||1)).toFixed(2).replace('.',',')} €
            </td>
        </tr>`).join('');

    const publicHost = process.env.PUBLIC_HOST || process.env.HOST || 'localhost:5000';
    const protocol   = publicHost.includes('localhost') ? 'http' : 'https';
    const statusUrl  = order.orderToken
        ? `${protocol}://${publicHost}/status?token=${order.orderToken}`
        : null;

    // Templates aus DB laden (editierbar im CMS)
    const tplKey = isConfirmed ? 'tpl_order_confirmed'
                 : isCancelled ? 'tpl_order_cancelled'
                 : isReady     ? 'tpl_order_ready'
                 : null;
    const tpl = tplKey ? (settings.emailTemplates || {})[tplKey] || {} : {};

    let subject, headerColor, headerIcon, headerTitle, bodyContent;

    if (isConfirmed) {
        subject     = tpl.subject || `✅ ${typeLabel} bestätigt – ${restaurantName}`;
        headerColor = '#22c55e';
        headerIcon  = '🎉';
        headerTitle = `Deine ${typeLabel} ist bestätigt!`;
        bodyContent = tpl.body || `
            <p style="font-size:1rem; color:#374151;">
                Hallo <strong>${order.customerName || 'Gast'}</strong>,<br><br>
                super – wir haben deine Bestellung angenommen und bereiten sie jetzt vor!
            </p>
            ${order.estimatedTime ? `
            <div style="background:#fef9c3; border-left:4px solid #fbbf24; border-radius:8px; padding:14px 18px; margin:20px 0;">
                <p style="margin:0; font-size:.85rem; color:#92400e; font-weight:700;">⏰ Voraussichtliche ${typeLabel}szeit</p>
                <p style="margin:4px 0 0; font-size:1.3rem; font-weight:800; color:#78350f;">${order.estimatedTime}</p>
            </div>` : ''}`;
    } else if (isCancelled) {
        subject     = tpl.subject || `❌ Bestellung abgelehnt – ${restaurantName}`;
        headerColor = '#ef4444';
        headerIcon  = '😔';
        headerTitle = 'Bestellung leider abgelehnt';
        bodyContent = tpl.body || `
            <p style="font-size:1rem; color:#374151;">
                Hallo <strong>${order.customerName || 'Gast'}</strong>,<br><br>
                leider konnten wir deine Bestellung diesmal nicht annehmen.
                Bitte ruf uns an oder versuche es zu einem anderen Zeitpunkt erneut.
            </p>`;
    } else if (isReady) {
        subject     = tpl.subject || `🍽️ Deine Bestellung ist fertig – ${restaurantName}`;
        headerColor = '#f59e0b';
        headerIcon  = '🛎️';
        headerTitle = 'Deine Bestellung ist abholbereit!';
        bodyContent = tpl.body || `
            <p style="font-size:1rem; color:#374151;">
                Hallo <strong>${order.customerName || 'Gast'}</strong>,<br><br>
                deine Bestellung wurde frisch zubereitet und steht ab jetzt zur Abholung bereit. Wir freuen uns auf dich!
            </p>
            <div style="background:#fff7ed; border-left:4px solid #f97316; border-radius:8px; padding:14px 18px; margin:20px 0;">
                <p style="margin:0; font-size:.85rem; color:#c2410c; font-weight:700;">📍 Abholung</p>
                <p style="margin:4px 0 0; font-size:1rem; color:#9a3412;">Du kannst deine Bestellung jetzt bei uns im Restaurant abholen.</p>
            </div>`;
    } else { return; }

    const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6; padding:40px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:560px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08);">

  <!-- Header -->
  <tr>
    <td style="background:${headerColor}; padding:32px 40px; text-align:center;">
      <p style="margin:0; font-size:2.5rem;">${headerIcon}</p>
      <h1 style="margin:8px 0 0; color:#ffffff; font-size:1.3rem; font-weight:800;">${headerTitle}</h1>
      <p style="margin:6px 0 0; color:rgba(255,255,255,.7); font-size:.82rem;">
          ${restaurantName}
      </p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:32px 40px;">
      ${bodyContent}

      <!-- Artikel-Tabelle -->
      ${itemsRows ? `
      <p style="font-size:.7rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#9ca3af; margin:24px 0 8px;">Deine Bestellung</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-radius:10px; overflow:hidden; border:1px solid #e5e7eb;">
          <tbody>${itemsRows}</tbody>
          <tfoot>
              <tr style="background:#f9fafb; border-top:2px solid #e5e7eb;">
                  <td colspan="2" style="padding:10px 12px; font-weight:800; font-size:.9rem;">Gesamt</td>
                  <td style="padding:10px 12px; text-align:right; font-weight:800; color:${accentColor}; font-size:1rem;">
                      ${parseFloat(order.total||0).toFixed(2).replace('.',',')} €
                  </td>
              </tr>
          </tfoot>
      </table>` : ''}

      <!-- Infos -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
          ${order.pickupTime ? `<tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 14px; font-size:.82rem; color:#6b7280; font-weight:600; background:#f9fafb;">Gewünschte Zeit</td>
              <td style="padding:10px 14px; font-size:.88rem; font-weight:700;">${order.pickupTime}</td>
          </tr>` : ''}
          <tr>
              <td style="padding:10px 14px; font-size:.82rem; color:#6b7280; font-weight:600; background:#f9fafb;">Bestell-Ref.</td>
              <td style="padding:10px 14px; font-size:.78rem; font-weight:700; color:#9ca3af;">#${String(order.id).slice(0,12).toUpperCase()}</td>
          </tr>
      </table>

      <!-- Status-Button -->
      ${statusUrl ? `
      <div style="text-align:center; margin:28px 0 8px;">
          <a href="${statusUrl}" style="display:inline-block; background:${primaryColor}; color:#ffffff;
             padding:14px 32px; border-radius:12px; text-decoration:none;
             font-weight:800; font-size:.95rem; letter-spacing:.3px;">
              📦 Bestellstatus live verfolgen
          </a>
          <p style="margin:10px 0 0; font-size:.72rem; color:#9ca3af;">
              Falls der Button nicht funktioniert:<br>
              <a href="${statusUrl}" style="color:${accentColor};">${statusUrl}</a>
          </p>
      </div>` : ''}
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f9fafb; padding:20px 40px; text-align:center; border-top:1px solid #e5e7eb;">
        <p style="margin:0; font-size:.78rem; color:#9ca3af;">
            Mit freundlichen Grüßen · <strong>${restaurantName}</strong>
        </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const from = await getSenderName(DB);
    const transporter = await createTransporter(DB);
    if (!transporter) return;

    await sendWithRetry(transporter, { from, to: order.customerEmail, subject, html });
}

Mailer.sendOrderStatusMail = sendOrderStatusMail;
module.exports = Mailer;
