/**
 * Settings Module for OPA-CMS
 */

import { apiGet, apiPost } from './api.js';
import { showToast, showConfirm } from './utils.js';
import { updateSidebarVisibility } from '../app.js';

const MAIL_TYPES = [
    {
        key: 'tpl_confirmation',
        label: 'Reservierungsbestätigung (Eingang)',
        default_subject: 'Reservierungsbestätigung – {{date}}',
        placeholders: ['name', 'date', 'start_time', 'guests', 'restaurantName']
    },
    {
        key: 'tpl_confirmed',
        label: 'Reservierung bestätigt',
        default_subject: 'BESTÄTIGT: Ihr Tisch am {{date}}',
        placeholders: ['name', 'date', 'start_time', 'restaurantName']
    },
    {
        key: 'tpl_cancelled',
        label: 'Reservierung storniert',
        default_subject: 'ABSAGE: Ihre Reservierung am {{date}}',
        placeholders: ['name', 'date', 'start_time', 'restaurantName']
    },
    {
        key: 'tpl_inquiry',
        label: 'Warteliste / Anfrage',
        default_subject: 'Warteliste – Anfrage für {{date}}',
        placeholders: ['name', 'date', 'start_time', 'guests', 'restaurantName']
    },
    {
        key: 'tpl_credentials',
        label: 'Zugangsdaten (neuer Nutzer)',
        default_subject: 'Ihre Zugangsdaten für das CMS',
        placeholders: ['name', 'username', 'password', 'restaurantName']
    }
];

let settingsTab = 'license';

export async function renderSettings(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-cog"></i> Einstellungen';
    const settings = await apiGet('settings') || {};
    const branding = await apiGet('branding') || {};
    const users = await apiGet('users') || [];
    const licInfo = await apiGet('license/info') || {};

    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div class="designer-tabs" style="margin-bottom:30px;">
                <button class="tab-btn ${settingsTab === 'license' ? 'active' : ''}" id="tab-btn-license">Lizenz &amp; Hub</button>
                <button class="tab-btn ${settingsTab === 'plan_modules' ? 'active' : ''}" id="tab-btn-plan_modules">Plan-Module</button>
                <button class="tab-btn ${settingsTab === 'branding' ? 'active' : ''}" id="tab-btn-branding">Restaurant-Info</button>
                <button class="tab-btn ${settingsTab === 'reservations' ? 'active' : ''}" id="tab-btn-reservations">Reservierungen</button>
                <button class="tab-btn ${settingsTab === 'users' ? 'active' : ''}" id="tab-btn-users">Nutzerverwaltung</button>
                <button class="tab-btn ${settingsTab === 'smtp' ? 'active' : ''}" id="tab-btn-smtp"><i class="fas fa-envelope" style="margin-right:6px;"></i>E-Mail / SMTP</button>
            </div>

            <div id="settings-content">
                ${renderSettingsTab(settings, branding, users, licInfo)}
            </div>

            <div id="settings-save-bar" style="display:${(settingsTab === 'license' || settingsTab === 'plan_modules') ? 'none' : 'flex'}; justify-content:flex-end; margin-top:30px;">
                <button class="btn-primary" id="save-settings"><i class="fas fa-save"></i> Einstellungen speichern</button>
            </div>
        </div>
    `;

    attachSettingsHandlers(container, settings, branding, users, licInfo, titleEl);
}

const MODULE_LABELS = {
    menu_edit:      { label: 'Speisekarte bearbeiten', icon: 'utensils',       desc: 'Gerichte hinzufügen, bearbeiten & löschen' },
    orders_kitchen: { label: 'Küchen-Monitor',         icon: 'concierge-bell', desc: 'Bestellungen in Echtzeit anzeigen' },
    reservations:   { label: 'Online-Reservierung',    icon: 'calendar-check', desc: 'Gäste können online reservieren' },
    custom_design:  { label: 'Design anpassen',        icon: 'paint-brush',    desc: 'Farben, Logo & Homepage bearbeiten' },
    analytics:      { label: 'Statistiken',             icon: 'chart-bar',      desc: 'Umsatz- und Bestellstatistiken' },
    qr_pay:         { label: 'QR-Pay',                  icon: 'qrcode',         desc: 'Bezahlung per QR-Code am Tisch' },
};

function isValidImageSrc(val) {
    if (!val || typeof val !== 'string') return false;
    return val.startsWith('data:image') || val.startsWith('http') || val.startsWith('/');
}

function renderImagePreview(id, src, width, height, label) {
    const hasImg = isValidImageSrc(src);
    const placeholderStyle = `
        display:flex; align-items:center; justify-content:center;
        width:${width}; height:${height};
        background:rgba(0,0,0,0.06); border-radius:8px;
        border:2px dashed rgba(0,0,0,0.15);
        color:rgba(0,0,0,0.3); font-size:.8rem; text-align:center; padding:8px;
    `;
    return hasImg
        ? `<img id="${id}" src="${src}" style="width:${width}; height:${height}; object-fit:contain; border-radius:8px; background:rgba(0,0,0,0.05); display:block;" alt="${label}">`
        : `<div id="${id}" style="${placeholderStyle}"><span><i class="fas fa-image" style="display:block; font-size:1.2rem; margin-bottom:4px;"></i>${label}</span></div>`;
}

function renderSettingsTab(settings, branding, users, licInfo) {
    if (settingsTab === 'license') {
        const l = settings.license || {};
        const isTrial = l.isTrial || l.status === 'trial';
        const isActive = l.status === 'active';
        const expiresAt = l.expiresAt ? new Date(l.expiresAt) : null;
        const daysLeft = expiresAt ? Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24)) : null;
        const expired = daysLeft !== null && daysLeft <= 0;

        let badgeColor = '#6b7280', badgeText = 'Unbekannt';
        if (isTrial && !expired)  { badgeColor = '#f59e0b'; badgeText = `Trial • noch ${daysLeft} Tage`; }
        if (isTrial && expired)   { badgeColor = '#ef4444'; badgeText = 'Trial abgelaufen'; }
        if (isActive)             { badgeColor = '#10b981'; badgeText = 'Aktiv'; }

        const plans = licInfo.plans || {};
        const planKeys = Object.keys(plans);

        return `
            <div style="background:rgba(37,99,235,.05); border:1px solid rgba(37,99,235,.15); border-radius:12px; padding:24px; margin-bottom:28px;">
                <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
                    <div style="width:56px;height:56px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.4rem;flex-shrink:0;">
                        <i class="fas fa-shield-alt"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                            <h3 style="margin:0;">OPA! Santorini CMS</h3>
                            <span style="background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}44; border-radius:20px; padding:2px 12px; font-size:.78rem; font-weight:600;">${badgeText}</span>
                        </div>
                        <p style="color:var(--text-muted); font-size:.85rem; margin:0;">
                            Plan: <strong>${l.label || l.type || 'FREE'}</strong>
                            &nbsp;&bull;&nbsp; Inhaber: <strong>${l.customer || '–'}</strong>
                            &nbsp;&bull;&nbsp; Key: <code style="font-size:.8rem;">${l.key || 'N/A'}</code>
                        </p>
                    </div>
                </div>
                ${isTrial && !expired ? `
                <div style="margin-top:16px; padding:12px 16px; background:rgba(245,158,11,.1); border:1px solid rgba(245,158,11,.2); border-radius:8px; font-size:.85rem; color:#f59e0b;">
                    <i class="fas fa-clock"></i>&nbsp; Ihre Trial-Lizenz läuft in <strong>${daysLeft} Tagen</strong> ab.
                </div>` : ''}
                ${expired ? `
                <div style="margin-top:16px; padding:12px 16px; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.2); border-radius:8px; font-size:.85rem; color:#ef4444;">
                    <i class="fas fa-exclamation-triangle"></i>&nbsp; Ihre Lizenz ist abgelaufen.
                </div>` : ''}
            </div>

            <div style="background:rgba(16,185,129,.05); border:1px solid rgba(16,185,129,.15); border-radius:12px; padding:24px; margin-bottom:28px;">
                <h4 style="margin:0 0 16px; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-key" style="color:#10b981;"></i> Lizenz aktivieren / wechseln
                </h4>
                <p style="color:var(--text-muted); font-size:.85rem; margin-bottom:16px;">Geben Sie Ihren Lizenz-Key ein um auf einen höheren Plan zu wechseln oder eine abgelaufene Lizenz zu erneuern.</p>
                <div style="display:flex; gap:12px; flex-wrap:wrap;">
                    <input id="license-key-input" class="input-styled" style="flex:1; min-width:260px; font-family:monospace; letter-spacing:.05em;"
                        placeholder="z.B. OPA-XXXX-XXXX-XXXX-XXXX"
                        value="${isActive ? (l.key || '') : ''}">
                    <button id="btn-activate-license" class="btn-primary" style="white-space:nowrap;">
                        <i class="fas fa-check-circle"></i> Lizenz aktivieren
                    </button>
                </div>
                <div id="license-activate-result" style="margin-top:12px;"></div>
            </div>

            <h4 style="margin-bottom:16px;"><i class="fas fa-th-large"></i> Verfügbare Pläne</h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:12px;">
                ${planKeys.map(key => {
                    const p = plans[key];
                    const isCurrent = (l.type || 'FREE') === key;
                    return `
                    <div style="border:1px solid ${isCurrent ? 'var(--primary)' : 'rgba(255,255,255,0.08)'};
                        border-radius:10px; padding:16px;
                        background:${isCurrent ? 'rgba(37,99,235,.08)' : 'rgba(255,255,255,.02)'};
                        position:relative;">
                        ${isCurrent ? '<span style="position:absolute;top:8px;right:8px;background:var(--primary);color:#fff;border-radius:10px;padding:1px 8px;font-size:.7rem;">Aktiv</span>' : ''}
                        <div style="font-weight:700; font-size:1rem; margin-bottom:4px;">${p.label}</div>
                        <div style="color:var(--text-muted); font-size:.78rem; margin-bottom:10px;">${p.note || ''}</div>
                        <div style="font-size:.8rem; display:flex; flex-direction:column; gap:3px;">
                            <span><i class="fas fa-utensils" style="width:14px;"></i> ${p.menu_items} Speisen</span>
                            <span><i class="fas fa-chair" style="width:14px;"></i> ${p.max_tables} Tische</span>
                            ${Object.entries(p.modules || {}).map(([mod, on]) =>
                                `<span style="color:${on ? '#10b981' : '#6b7280'}">
                                    <i class="fas fa-${on ? 'check' : 'times'}" style="width:14px;"></i>
                                    ${{ menu_edit:'Speisekarte', orders_kitchen:'Küche', reservations:'Reservierung', custom_design:'Design', analytics:'Statistiken', qr_pay:'QR-Pay' }[mod] || mod}
                                </span>`
                            ).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    if (settingsTab === 'plan_modules') {
        const l = settings.license || {};
        const activeModules = l.modules || {};
        const mod = settings.activeModules || { orders: true, reservations: true };
        const allModuleKeys = Object.keys(MODULE_LABELS);
        return `
            <div style="margin-bottom:20px;">
                <h4 style="margin:0 0 6px;"><i class="fas fa-sliders-h"></i> Plan-Module verwalten</h4>
                <p style="color:var(--text-muted); font-size:.85rem; margin:0;">
                    Hier kannst du einzelne Features für die aktive Lizenz manuell aktivieren oder deaktivieren.
                    Änderungen gelten sofort – unabhängig vom zugewiesenen Plan.
                </p>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:14px; margin-bottom:30px;">
                ${allModuleKeys.map(key => {
                    const m = MODULE_LABELS[key];
                    const isOn = activeModules[key] === true;
                    return `
                    <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.06); border-radius:14px; padding:18px; display:flex; align-items:center; gap:16px;">
                        <div style="width:40px;height:40px;border-radius:10px;background:${isOn ? 'rgba(16,185,129,.15)' : 'rgba(107,114,128,.1)'}; display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-${m.icon}" style="color:${isOn ? '#10b981' : '#9ca3af'};"></i>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:700; font-size:.9rem;">${m.label}</div>
                            <div style="color:var(--text-muted); font-size:.78rem; margin-top:2px;">${m.desc}</div>
                        </div>
                        <label class="switch small" style="flex-shrink:0;">
                            <input type="checkbox" class="module-toggle" data-module="${key}" ${isOn ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>`;
                }).join('')}
            </div>

            <div style="border-top:1px solid rgba(0,0,0,0.07); padding-top:24px; margin-bottom:8px;">
                <h4 style="margin:0 0 6px;"><i class="fas fa-eye"></i> CMS-Sichtbarkeit</h4>
                <p style="color:var(--text-muted); font-size:.85rem; margin:0 0 18px;">Steuert welche Module im CMS-Menü angezeigt werden – unabhängig von der Lizenz.</p>
                <div style="display:flex; flex-direction:column; gap:14px;">
                    <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.06); border-radius:14px; padding:18px; display:flex; align-items:center; gap:16px;">
                        <div style="width:40px;height:40px;border-radius:10px;background:${mod.orders ? 'rgba(16,185,129,.15)' : 'rgba(107,114,128,.1)'}; display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-concierge-bell" style="color:${mod.orders ? '#10b981' : '#9ca3af'};"></i>
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:.9rem;">Küchen-Monitor</div>
                            <div style="color:var(--text-muted); font-size:.78rem; margin-top:2px;">Bestellungs-Modul im CMS-Menü anzeigen</div>
                        </div>
                        <label class="switch small" style="flex-shrink:0;">
                            <input type="checkbox" id="v-orders" ${mod.orders ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div style="background:rgba(255,255,255,0.5); border:1px solid rgba(0,0,0,0.06); border-radius:14px; padding:18px; display:flex; align-items:center; gap:16px;">
                        <div style="width:40px;height:40px;border-radius:10px;background:${mod.reservations ? 'rgba(16,185,129,.15)' : 'rgba(107,114,128,.1)'}; display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-calendar-check" style="color:${mod.reservations ? '#10b981' : '#9ca3af'};"></i>
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:.9rem;">Online-Reservierung</div>
                            <div style="color:var(--text-muted); font-size:.78rem; margin-top:2px;">Reservierungs-Modul im CMS-Menü anzeigen</div>
                        </div>
                        <label class="switch small" style="flex-shrink:0;">
                            <input type="checkbox" id="v-res" ${mod.reservations ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div style="display:flex; justify-content:flex-end; margin-top:24px;">
                <button class="btn-primary" id="btn-save-modules">
                    <i class="fas fa-save"></i> Speichern
                </button>
            </div>
        `;
    }

    if (settingsTab === 'branding') {
        return `
            <div class="form-grid">
                <div class="form-group full"><label>Restaurant Name</label><input id="br-name" class="input-styled" value="${branding.name || ''}" placeholder="z.B. OPA! Santorini"></div>
                <div class="form-group"><label>Slogan</label><input id="br-slogan" class="input-styled" value="${branding.slogan || ''}" placeholder="z.B. Griechische Meeresfrüchte"></div>
                <div class="form-group"><label>Telefon (Gästeansicht)</label><input id="br-phone" class="input-styled" value="${branding.phone || ''}" placeholder="0123 / 456789"></div>
                <div class="form-group full" style="border-top:1px solid rgba(0,0,0,0.05); padding-top:15px; margin-top:10px;">
                    <label>Logo &amp; Favicon</label>
                </div>
                <div class="form-group">
                    <label>Haupt-Logo</label>
                    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                        ${renderImagePreview('br-logo-preview', branding.logo, 'auto', '60px', 'Kein Logo')}
                        <input type="file" id="br-logo-upload" accept="image/*" style="display:none;">
                        <button class="btn-secondary" id="btn-upload-logo"><i class="fas fa-upload"></i> Hochladen</button>
                        ${isValidImageSrc(branding.logo) ? '<button class="btn-edit" id="btn-remove-logo" style="color:#ef4444;"><i class="fas fa-times"></i></button>' : ''}
                    </div>
                    <input type="hidden" id="br-logo-value" value="${isValidImageSrc(branding.logo) ? branding.logo : ''}">
                </div>
                <div class="form-group">
                    <label>Favicon (Browser-Tab Symbol)</label>
                    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                        ${renderImagePreview('br-favicon-preview', branding.favicon, '32px', '32px', 'Kein Favicon')}
                        <input type="file" id="br-favicon-upload" accept="image/*" style="display:none;">
                        <button class="btn-secondary" id="btn-upload-favicon"><i class="fas fa-upload"></i> Hochladen</button>
                        ${isValidImageSrc(branding.favicon) ? '<button class="btn-edit" id="btn-remove-favicon" style="color:#ef4444;"><i class="fas fa-times"></i></button>' : ''}
                    </div>
                    <input type="hidden" id="br-favicon-value" value="${isValidImageSrc(branding.favicon) ? branding.favicon : ''}">
                </div>
                <p class="field-hint" style="grid-column:1/-1;">Logos werden im Gäste-Web und im CMS-Header angezeigt.</p>
            </div>
        `;
    }

    if (settingsTab === 'visibility') {
        const mod = settings.activeModules || { orders: true, reservations: true };
        return `
            <div class="form-grid">
                <div class="form-group">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <label class="switch small"><input type="checkbox" id="v-orders" ${mod.orders ? 'checked' : ''}><span class="slider round"></span></label>
                        <label for="v-orders" style="margin:0; cursor:pointer; font-weight:normal;">Küchen-Monitor aktiv</label>
                    </div>
                </div>
                <div class="form-group">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <label class="switch small"><input type="checkbox" id="v-res" ${mod.reservations ? 'checked' : ''}><span class="slider round"></span></label>
                        <label for="v-res" style="margin:0; cursor:pointer; font-weight:normal;">Online-Reservierung erlaubt</label>
                    </div>
                </div>

            </div>
        `;
    }

    if (settingsTab === 'reservations') {
        const rc = settings.reservationConfig || { durationSmall: 90, durationMedium: 120, durationLarge: 150, buffer: 15, allowInquiry: true };
        return `
            <div class="form-grid">
                <div class="form-group full"><h4 style="margin-bottom:10px;">Aufenthaltsdauer (Minuten)</h4></div>
                <div class="form-group"><label>Bis 2 Personen</label><input id="rc-small" type="number" class="input-styled" value="${rc.durationSmall}"></div>
                <div class="form-group"><label>Bis 4 Personen</label><input id="rc-medium" type="number" class="input-styled" value="${rc.durationMedium}"></div>
                <div class="form-group"><label>Ab 5 Personen</label><input id="rc-large" type="number" class="input-styled" value="${rc.durationLarge}"></div>
                <div class="form-group full" style="border-top:1px solid rgba(255,255,255,0.05); margin-top:20px; padding-top:20px;"><h4 style="margin-bottom:10px;">Sicherheits-Puffer</h4></div>
                <div class="form-group"><label>Puffer zw. Belegung (Min)</label><input id="rc-buffer" type="number" class="input-styled" value="${rc.buffer}"></div>
                <div class="form-group">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <label class="switch small"><input type="checkbox" id="rc-inquiry" ${rc.allowInquiry ? 'checked' : ''}><span class="slider round"></span></label>
                        <label for="rc-inquiry" style="margin:0; cursor:pointer; font-weight:normal;">Warteliste/Anfrage erlauben (wenn voll)</label>
                    </div>
                </div>
            </div>
        `;
    }

    if (settingsTab === 'users') {
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h4 style="margin:0;"><i class="fas fa-users"></i> Nutzerverwaltung</h4>
                <button class="btn-primary" onclick="window.editUser()"><i class="fas fa-plus"></i> Neuer Nutzer</button>
            </div>
            <table class="premium-table">
                <thead><tr><th>Benutzername</th><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Aktion</th></tr></thead>
                <tbody>
                    ${users.map(u => {
                        const fullName = [u.name, u.last_name].filter(Boolean).join(' ') || '-';
                        return `
                        <tr>
                            <td><strong>${u.user}</strong></td>
                            <td>${fullName}</td>
                            <td>${u.email || '-'}</td>
                            <td>${u.role}</td>
                            <td style="text-align:right;">
                                <button class="btn-edit" onclick='window.editUser(${JSON.stringify(u)})' title="Bearbeiten"><i class="fas fa-pen"></i></button>
                                <button class="btn-edit" onclick="window.resetUserPassword('${u.user}')" title="Passwort zurücksetzen"><i class="fas fa-key"></i></button>
                                <button class="btn-delete" onclick="window.deleteUser('${u.user}')" title="Löschen"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">Hinweis: Neue Nutzer erhalten ihr Passwort per E-Mail und müssen es beim ersten Login ändern.</p>
        `;
    }

    if (settingsTab === 'smtp') {
        const smtp = settings.smtp || {};
        const isConfigured = !!smtp.host;
        return `
            <div style="background:rgba(37,99,235,.05); border:1px solid rgba(37,99,235,.15); border-radius:12px; padding:24px; margin-bottom:28px;">
                <div style="display:flex; align-items:center; gap:14px; margin-bottom:6px;">
                    <div style="width:42px;height:42px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.1rem;flex-shrink:0;">
                        <i class="fas fa-envelope"></i>
                    </div>
                    <div>
                        <h4 style="margin:0;">E-Mail / SMTP Konfiguration</h4>
                        <p style="color:var(--text-muted); font-size:.82rem; margin:2px 0 0;">
                            ${isConfigured
                                ? `<span style="color:#10b981;"><i class="fas fa-check-circle"></i> Konfiguriert &ndash; Host: <strong>${smtp.host}</strong></span>`
                                : `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Noch nicht konfiguriert &ndash; E-Mail-Versand deaktiviert</span>`
                            }
                        </p>
                    </div>
                </div>
            </div>
            <div class="form-grid">
                <div class="form-group"><label>SMTP Host</label><input id="smtp-host" class="input-styled" type="text" value="${smtp.host || ''}" placeholder="z.B. smtp.strato.de"></div>
                <div class="form-group"><label>Port</label><input id="smtp-port" class="input-styled" type="number" value="${smtp.port || 465}" placeholder="465"></div>
                <div class="form-group"><label>Benutzername / E-Mail</label><input id="smtp-user" class="input-styled" type="text" value="${smtp.user || ''}" placeholder="noreply@example.com"></div>
                <div class="form-group">
                    <label>Passwort</label>
                    <input id="smtp-pass" class="input-styled" type="password" value="" placeholder="${isConfigured ? '(unverändert lassen = bestehendes Passwort)' : 'Passwort eingeben'}">
                    ${isConfigured ? '<p class="field-hint" style="margin-top:4px;"><i class="fas fa-info-circle"></i> Leer lassen, um das gespeicherte Passwort beizubehalten.</p>' : ''}
                </div>
                <div class="form-group"><label>Absender-Adresse (From)</label><input id="smtp-from" class="input-styled" type="email" value="${smtp.from || smtp.user || ''}" placeholder="noreply@example.com"></div>
                <div class="form-group" style="display:flex; align-items:center; padding-top:28px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <label class="switch small">
                            <input type="checkbox" id="smtp-secure" ${smtp.secure !== false ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                        <label for="smtp-secure" style="margin:0; cursor:pointer; font-weight:normal;">SSL/TLS aktivieren (empfohlen für Port 465)</label>
                    </div>
                </div>
                <div class="form-group full" style="border-top:1px solid rgba(0,0,0,0.06); margin-top:10px; padding-top:20px;">
                    <h4 style="margin:0 0 12px;"><i class="fas fa-paper-plane"></i> Test-E-Mail senden</h4>
                    <p style="color:var(--text-muted); font-size:.85rem; margin-bottom:14px;">Nach dem Speichern kannst du hier eine Test-Mail senden, um die Konfiguration zu prüfen.</p>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                        <input id="smtp-test-email" class="input-styled" type="email" style="flex:1; min-width:220px;" placeholder="test@example.com" value="">
                        <button class="btn-secondary" id="btn-smtp-test" style="white-space:nowrap;"><i class="fas fa-paper-plane"></i> Testmail senden</button>
                    </div>
                    <div id="smtp-test-result" style="margin-top:10px;"></div>
                </div>
            </div>

            <div style="border-top:1px solid rgba(0,0,0,0.1); margin-top:30px; padding-top:30px;">
                <h3 style="margin-bottom:20px;"><i class="fas fa-file-alt"></i> E-Mail Templates</h3>
                <p style="color:var(--text-muted); font-size:.85rem; margin-bottom:24px;">
                    Passen Sie Betreff und Inhalt der automatischen E-Mails an. Klicken Sie auf die Platzhalter-Chips, um sie an der Schreibmarke einzufügen.
                </p>

                ${MAIL_TYPES.map(type => {
                    const tpl = (settings.emailTemplates || {})[type.key] || {};
                    return `
                    <div class="template-box" style="background:rgba(255,255,255,0.4); border:1px solid rgba(0,0,0,0.08); border-radius:12px; padding:20px; margin-bottom:20px;" data-tpl-key="${type.key}">
                        <h4 style="margin:0 0 16px; color:var(--primary);">${type.label}</h4>
                        <div class="form-group full">
                            <label>Betreff</label>
                            <input class="input-styled tpl-subject" value="${tpl.subject || ''}" placeholder="${type.default_subject}">
                        </div>
                        <div class="form-group full" style="margin-top:12px;">
                            <label>E-Mail Text (HTML erlaubt)</label>
                            <textarea class="input-styled tpl-body" rows="6" style="min-height:120px; resize:vertical; font-family:inherit;">${tpl.body || ''}</textarea>
                        </div>
                        <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:10px;">
                            <div class="placeholder-chips">
                                <span style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:6px;">Verfügbare Platzhalter:</span>
                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    ${type.placeholders.map(p => `<span class="placeholder-chip" style="cursor:pointer; background:rgba(0,0,0,0.05); padding:3px 8px; border-radius:12px; font-size:.72rem; border:1px solid rgba(0,0,0,0.1);" onclick="window.insertAtCursor(this, '{{${p}}}')">{{${p}}}</span>`).join('')}
                                </div>
                            </div>
                            <button class="btn-secondary btn-sm btn-reset-tpl" style="padding:4px 10px; font-size:.75rem;"><i class="fas fa-undo"></i> Zurücksetzen</button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    return '';
}

function attachSettingsHandlers(container, settings, branding, users, licInfo, titleEl) {
    container.querySelector('#tab-btn-license').onclick      = () => { settingsTab = 'license';      renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-plan_modules').onclick = () => { settingsTab = 'plan_modules'; renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-branding').onclick     = () => { settingsTab = 'branding';     renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-reservations').onclick = () => { settingsTab = 'reservations'; renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-users').onclick        = () => { settingsTab = 'users';        renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-smtp').onclick         = () => { settingsTab = 'smtp';         renderSettings(container, titleEl); };

    // --- Plan-Module + CMS-Sichtbarkeit speichern ---
    const btnSaveModules = container.querySelector('#btn-save-modules');
    if (btnSaveModules) {
        btnSaveModules.onclick = async () => {
            const modules = {};
            container.querySelectorAll('.module-toggle').forEach(cb => {
                modules[cb.dataset.module] = cb.checked;
            });
            const [modRes, visRes] = await Promise.all([
                apiPost('license/modules', { modules }),
                apiPost('settings', {
                    ...settings,
                    activeModules: {
                        orders:       container.querySelector('#v-orders')?.checked ?? (settings.activeModules?.orders ?? true),
                        reservations: container.querySelector('#v-res')?.checked    ?? (settings.activeModules?.reservations ?? true)
                    }
                })
            ]);
            if (modRes?.success && visRes?.success) {
                showToast('Einstellungen gespeichert!');
                updateSidebarVisibility({ ...settings, activeModules: { orders: container.querySelector('#v-orders')?.checked, reservations: container.querySelector('#v-res')?.checked } });
                renderSettings(container, titleEl);
            } else {
                showToast((modRes?.reason || visRes?.reason) || 'Fehler beim Speichern.', 'error');
            }
        };
    }

    // --- Lizenz aktivieren ---
    const btnActivate = container.querySelector('#btn-activate-license');
    if (btnActivate) {
        btnActivate.onclick = async () => {
            const key = container.querySelector('#license-key-input').value.trim();
            const resultEl = container.querySelector('#license-activate-result');
            if (!key) { showToast('Bitte Lizenz-Key eingeben.', 'error'); return; }
            btnActivate.disabled = true;
            btnActivate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wird geprüft...';
            resultEl.innerHTML = '';
            const res = await apiPost('license/validate', { key });
            btnActivate.disabled = false;
            btnActivate.innerHTML = '<i class="fas fa-check-circle"></i> Lizenz aktivieren';
            if (res && res.success) {
                const lic = res.license;
                resultEl.innerHTML = `<div style="padding:12px 16px; background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.25); border-radius:8px; color:#10b981; font-size:.88rem;">
                    <i class="fas fa-check-circle"></i>&nbsp; <strong>Lizenz aktiviert!</strong> Plan: ${lic.label || lic.type}
                    &nbsp;&bull;&nbsp; Gültig bis: ${lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString('de-DE') : 'Unbegrenzt'}
                </div>`;
                showToast('Lizenz erfolgreich aktiviert! 🎉', 'success');
                setTimeout(() => renderSettings(container, titleEl), 1500);
            } else {
                resultEl.innerHTML = `<div style="padding:12px 16px; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.25); border-radius:8px; color:#ef4444; font-size:.88rem;">
                    <i class="fas fa-times-circle"></i>&nbsp; ${res?.reason || 'Lizenz-Key ungültig oder Lizenzserver nicht erreichbar.'}
                </div>`;
                showToast(res?.reason || 'Aktivierung fehlgeschlagen.', 'error');
            }
        };
        container.querySelector('#license-key-input').onkeydown = (e) => { if (e.key === 'Enter') btnActivate.click(); };
    }

    // --- Branding Upload-Handler ---
    if (settingsTab === 'branding') {
        const setupImageUpload = (btnId, fileInputId, previewId, hiddenId, previewWidth, previewHeight) => {
            const btn = container.querySelector(`#${btnId}`);
            const fileInput = container.querySelector(`#${fileInputId}`);
            const hidden = container.querySelector(`#${hiddenId}`);
            if (!btn || !fileInput || !hidden) return;
            btn.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    hidden.value = dataUrl;
                    const existing = container.querySelector(`#${previewId}`);
                    if (existing) {
                        if (existing.tagName === 'IMG') { existing.src = dataUrl; }
                        else {
                            const img = document.createElement('img');
                            img.id = previewId; img.src = dataUrl; img.alt = 'Vorschau';
                            img.style.cssText = `width:${previewWidth}; height:${previewHeight}; object-fit:contain; border-radius:8px; background:rgba(0,0,0,0.05); display:block;`;
                            existing.replaceWith(img);
                        }
                    }
                    showToast('Bild ausgewählt – bitte speichern.');
                };
                reader.readAsDataURL(file);
            };
        };
        setupImageUpload('btn-upload-logo',    'br-logo-upload',    'br-logo-preview',    'br-logo-value',    'auto', '60px');
        setupImageUpload('btn-upload-favicon', 'br-favicon-upload', 'br-favicon-preview', 'br-favicon-value', '32px', '32px');

        const btnRemoveLogo = container.querySelector('#btn-remove-logo');
        if (btnRemoveLogo) {
            btnRemoveLogo.onclick = () => {
                container.querySelector('#br-logo-value').value = '';
                const el = container.querySelector('#br-logo-preview');
                if (el) {
                    const ph = document.createElement('div');
                    ph.id = 'br-logo-preview';
                    ph.style.cssText = 'display:flex;align-items:center;justify-content:center;width:auto;height:60px;background:rgba(0,0,0,0.06);border-radius:8px;border:2px dashed rgba(0,0,0,0.15);color:rgba(0,0,0,0.3);font-size:.8rem;padding:8px;min-width:80px;';
                    ph.innerHTML = '<span><i class="fas fa-image" style="display:block;font-size:1.2rem;margin-bottom:4px;"></i>Kein Logo</span>';
                    el.replaceWith(ph);
                }
                btnRemoveLogo.remove();
            };
        }
        const btnRemoveFav = container.querySelector('#btn-remove-favicon');
        if (btnRemoveFav) {
            btnRemoveFav.onclick = () => {
                container.querySelector('#br-favicon-value').value = '';
                const el = container.querySelector('#br-favicon-preview');
                if (el) {
                    const ph = document.createElement('div');
                    ph.id = 'br-favicon-preview';
                    ph.style.cssText = 'display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:rgba(0,0,0,0.06);border-radius:8px;border:2px dashed rgba(0,0,0,0.15);color:rgba(0,0,0,0.3);font-size:.7rem;';
                    ph.innerHTML = '<i class="fas fa-image"></i>';
                    el.replaceWith(ph);
                }
                btnRemoveFav.remove();
            };
        }
    }

    // --- SMTP Test-Mail ---
    if (settingsTab === 'smtp') {
        const btnSmtpTest = container.querySelector('#btn-smtp-test');
        if (btnSmtpTest) {
            btnSmtpTest.onclick = async () => {
                const testEmail = container.querySelector('#smtp-test-email').value.trim();
                const resultEl  = container.querySelector('#smtp-test-result');
                if (!testEmail) { showToast('Bitte eine Ziel-E-Mail-Adresse eingeben.', 'error'); return; }
                btnSmtpTest.disabled = true;
                btnSmtpTest.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sende...';
                resultEl.innerHTML = '';
                const res = await apiPost('settings/test-smtp', { email: testEmail });
                btnSmtpTest.disabled = false;
                btnSmtpTest.innerHTML = '<i class="fas fa-paper-plane"></i> Testmail senden';
                if (res && res.success) {
                    resultEl.innerHTML = `<div style="padding:10px 14px; background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.25); border-radius:8px; color:#10b981; font-size:.85rem;">
                        <i class="fas fa-check-circle"></i>&nbsp; Test-E-Mail erfolgreich gesendet an <strong>${res.sentTo || testEmail}</strong>
                    </div>`;
                    showToast('Test-Mail gesendet! ✅');
                } else {
                    resultEl.innerHTML = `<div style="padding:10px 14px; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.25); border-radius:8px; color:#ef4444; font-size:.85rem;">
                        <i class="fas fa-times-circle"></i>&nbsp; ${res?.reason || 'Fehler beim Senden.'}
                    </div>`;
                    showToast(res?.reason || 'Test-Mail fehlgeschlagen.', 'error');
                }
            };
        }

        // Reset Template Buttons
        container.querySelectorAll('.btn-reset-tpl').forEach(btn => {
            btn.onclick = () => {
                const box = btn.closest('.template-box');
                const tplKey = box.dataset.tplKey;
                const type = MAIL_TYPES.find(t => t.key === tplKey);
                box.querySelector('.tpl-subject').value = '';
                box.querySelector('.tpl-body').value = '';
                showToast(`${type.label} wurde auf Standard zurückgesetzt (Speichern erforderlich)`);
            };
        });

        window.insertAtCursor = (chip, text) => {
            const box = chip.closest('.template-box');
            const target = box.querySelector('.tpl-body:focus, .tpl-subject:focus') || box.querySelector('.tpl-body');
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const val = target.value;
            target.value = val.substring(0, start) + text + val.substring(end);
            target.selectionStart = target.selectionEnd = start + text.length;
            target.focus();
        };
    }

    // --- Allgemeiner Speichern-Button ---
    const saveBtn = container.querySelector('#save-settings');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            if (settingsTab === 'branding') {
                const b = { ...branding };
                b.name   = container.querySelector('#br-name').value;
                b.slogan = container.querySelector('#br-slogan').value;
                b.phone  = container.querySelector('#br-phone').value;
                const logoVal    = container.querySelector('#br-logo-value').value;
                const faviconVal = container.querySelector('#br-favicon-value').value;
                b.logo    = isValidImageSrc(logoVal)    ? logoVal    : '';
                b.favicon = isValidImageSrc(faviconVal) ? faviconVal : '';
                const r = await apiPost('branding', b);
                if (r?.success) {
                    showToast('Branding aktualisiert!');
                    const nameEl   = document.getElementById('disp-res-name');
                    const sloganEl = document.getElementById('disp-res-slogan');
                    if (nameEl)   nameEl.textContent   = b.name;
                    if (sloganEl) sloganEl.textContent = b.slogan;
                    if (b.name)   document.title = b.name + ' CMS';
                    const cmsLogoEl = document.getElementById('cms-header-logo');
                    if (cmsLogoEl) { if (b.logo) { cmsLogoEl.src = b.logo; cmsLogoEl.style.display = 'block'; } else cmsLogoEl.style.display = 'none'; }
                    if (b.favicon) {
                        let link = document.querySelector("link[rel~='icon']");
                        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
                        link.href = b.favicon;
                    }
                }
            } else if (settingsTab === 'visibility') {
                const activeModules = {
                    orders: container.querySelector('#v-orders').checked,
                    reservations: container.querySelector('#v-res').checked
                };
                const r = await apiPost('settings', { activeModules });
                if (r?.success) { showToast('Ansicht-Einstellungen gespeichert!'); updateSidebarVisibility({ ...settings, activeModules }); }
            } else if (settingsTab === 'reservations') {
                const reservationConfig = {
                    durationSmall:  parseInt(container.querySelector('#rc-small').value),
                    durationMedium: parseInt(container.querySelector('#rc-medium').value),
                    durationLarge:  parseInt(container.querySelector('#rc-large').value),
                    buffer:         parseInt(container.querySelector('#rc-buffer').value),
                    allowInquiry:   container.querySelector('#rc-inquiry').checked
                };
                const r = await apiPost('settings', { reservationConfig });
                if (r?.success) showToast('Reservierungs-Konfiguration gespeichert!');
            } else if (settingsTab === 'smtp') {
                const s = { ...settings };
                const passInput = container.querySelector('#smtp-pass').value;
                const smtpData = {
                    host:   container.querySelector('#smtp-host').value.trim(),
                    port:   parseInt(container.querySelector('#smtp-port').value) || 465,
                    user:   container.querySelector('#smtp-user').value.trim(),
                    from:   container.querySelector('#smtp-from').value.trim(),
                    secure: container.querySelector('#smtp-secure').checked
                };
                if (passInput) { smtpData.pass = passInput; }
                else if (s.smtp?.pass) { smtpData.pass = s.smtp.pass; }
                if (!smtpData.host) { showToast('Bitte einen SMTP-Host eingeben.', 'error'); return; }
                s.smtp = smtpData;

                const emailTemplates = {};
                container.querySelectorAll('.template-box').forEach(box => {
                    const key = box.dataset.tplKey;
                    const subject = box.querySelector('.tpl-subject').value.trim();
                    const body = box.querySelector('.tpl-body').value.trim();
                    if (subject || body) {
                        emailTemplates[key] = { subject, body };
                    }
                });

                const r = await apiPost('settings', { smtp: smtpData, emailTemplates });
                if (r?.success) {
                    showToast('Einstellungen gespeichert! ✉️');
                    renderSettings(container, titleEl);
                } else {
                    showToast(r?.reason || 'Fehler beim Speichern.', 'error');
                }
            }
        };
    }

    window.deleteUser = async (user) => {
        if (await showConfirm('Nutzer löschen?', `Möchten Sie den Zugang für ${user} wirklich entfernen?`)) {
            const res = await fetch(`/api/users/${user}`, { method: 'DELETE', headers: { 'x-admin-token': sessionStorage.getItem('opa_admin_token') }});
            const data = await res.json();
            if (data.success) { showToast('Nutzer gelöscht'); renderSettings(container, titleEl); }
            else showToast(data.reason || 'Fehler beim Löschen', 'error');
        }
    };

    window.resetUserPassword = async (user) => {
        if (await showConfirm('Passwort zurücksetzen?', `Dem Nutzer ${user} wird ein neues Passwort generiert und an seine E-Mail-Adresse gesendet.`)) {
            const res = await fetch(`/api/users/${user}/reset`, { method: 'POST', headers: { 'x-admin-token': sessionStorage.getItem('opa_admin_token') }});
            const data = await res.json();
            if (data.success) { showToast('Passwort zurückgesetzt & E-Mail gesendet!'); }
            else showToast(data.reason || 'Senden fehlgeschlagen', 'error');
        }
    };

    window.editUser = (u = null) => {
        const isNew = !u;
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content glass-panel" style="max-width:500px;">
                <h3>${isNew ? 'Neuer Nutzer' : 'Nutzer bearbeiten'}</h3>
                ${isNew ? `<div class="form-group"><label>Benutzername</label><input id="mu-user" class="input-styled" required></div>` : ''}
                <div class="form-group"><label>Vorname</label><input id="mu-name" class="input-styled" value="${u?.name || ''}" required></div>
                <div class="form-group"><label>Nachname</label><input id="mu-last" class="input-styled" value="${u?.last_name || ''}"></div>
                <div class="form-group"><label>E-Mail-Adresse</label><input id="mu-email" class="input-styled" type="email" value="${u?.email || ''}" required></div>
                <div class="form-group"><label>Rolle</label>
                    <select id="mu-role" class="input-styled">
                        <option value="admin" ${u?.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="manager" ${u?.role === 'manager' ? 'selected' : ''}>Manager</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" id="mu-cancel">Abbrechen</button>
                    <button class="btn-primary" id="mu-save">Speichern</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#mu-cancel').onclick = () => modal.remove();
        modal.querySelector('#mu-save').onclick = async () => {
            const payload = {
                user: isNew ? modal.querySelector('#mu-user').value : u.user,
                name: modal.querySelector('#mu-name').value,
                last_name: modal.querySelector('#mu-last').value,
                email: modal.querySelector('#mu-email').value,
                role: modal.querySelector('#mu-role').value
            };
            let res, data;
            const headers = { 'Content-Type': 'application/json', 'x-admin-token': sessionStorage.getItem('opa_admin_token') };
            if (isNew) { res = await fetch('/api/users', { method: 'POST', headers, body: JSON.stringify(payload) }); }
            else { res = await fetch(`/api/users/${u.user}`, { method: 'PUT', headers, body: JSON.stringify(payload) }); }
            data = await res.json();
            if (data.success) {
                modal.remove();
                showToast(isNew ? 'Nutzer angelegt & E-Mail gesendet!' : 'Nutzer aktualisiert!');
                renderSettings(container, titleEl);
            } else {
                showToast(data.reason || 'Fehler beim Speichern', 'error');
            }
        };
    };
}
