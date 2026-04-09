/**
 * Settings Module for OPA-CMS
 */

import { apiGet, apiPost } from './api.js';
import { showToast, showConfirm } from './utils.js';
import { updateSidebarVisibility } from '../app.js';

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
                <button class="tab-btn ${settingsTab === 'license' ? 'active' : ''}" id="tab-btn-license">Lizenz & Hub</button>
                <button class="tab-btn ${settingsTab === 'plan_modules' ? 'active' : ''}" id="tab-btn-plan_modules">Plan-Module</button>
                <button class="tab-btn ${settingsTab === 'branding' ? 'active' : ''}" id="tab-btn-branding">Restaurant-Info</button>
                <button class="tab-btn ${settingsTab === 'visibility' ? 'active' : ''}" id="tab-btn-visibility">CMS-Ansicht</button>
                <button class="tab-btn ${settingsTab === 'reservations' ? 'active' : ''}" id="tab-btn-reservations">Reservierungen</button>
                <button class="tab-btn ${settingsTab === 'users' ? 'active' : ''}" id="tab-btn-users">Nutzerverwaltung</button>
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
    menu_edit:      { label: 'Speisekarte bearbeiten', icon: 'utensils', desc: 'Gerichte hinzufügen, bearbeiten & löschen' },
    orders_kitchen: { label: 'Küchen-Monitor',         icon: 'concierge-bell', desc: 'Bestellungen in Echtzeit anzeigen' },
    reservations:   { label: 'Online-Reservierung',    icon: 'calendar-check', desc: 'Gäste können online reservieren' },
    custom_design:  { label: 'Design anpassen',        icon: 'paint-brush', desc: 'Farben, Logo & Homepage bearbeiten' },
    analytics:      { label: 'Statistiken',             icon: 'chart-bar', desc: 'Umsatz- und Bestellstatistiken' },
    qr_pay:         { label: 'QR-Pay',                  icon: 'qrcode', desc: 'Bezahlung per QR-Code am Tisch' },
};

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
                    <i class="fas fa-clock"></i>&nbsp; Ihre Trial-Lizenz läuft in <strong>${daysLeft} Tagen</strong> ab. Aktivieren Sie jetzt einen vollwertigen Plan.
                </div>` : ''}
                ${expired ? `
                <div style="margin-top:16px; padding:12px 16px; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.2); border-radius:8px; font-size:.85rem; color:#ef4444;">
                    <i class="fas fa-exclamation-triangle"></i>&nbsp; Ihre Lizenz ist abgelaufen. Bitte aktivieren Sie einen neuen Lizenz-Key.
                </div>` : ''}
            </div>

            <div style="background:rgba(16,185,129,.05); border:1px solid rgba(16,185,129,.15); border-radius:12px; padding:24px; margin-bottom:28px;">
                <h4 style="margin:0 0 16px; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-key" style="color:#10b981;"></i> Lizenz aktivieren / wechseln
                </h4>
                <p style="color:var(--text-muted); font-size:.85rem; margin-bottom:16px;">
                    Geben Sie Ihren Lizenz-Key ein um auf einen höheren Plan zu wechseln oder eine abgelaufene Lizenz zu erneuern.
                </p>
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
        const allModuleKeys = Object.keys(MODULE_LABELS);
        return `
            <div style="margin-bottom:20px;">
                <h4 style="margin:0 0 6px;"><i class="fas fa-sliders-h"></i> Plan-Module verwalten</h4>
                <p style="color:var(--text-muted); font-size:.85rem; margin:0;">
                    Hier kannst du einzelne Features für die aktive Lizenz manuell aktivieren oder deaktivieren.
                    Änderungen gelten sofort – unabhängig vom zugewiesenen Plan.
                </p>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:14px;">
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
            <div style="display:flex; justify-content:flex-end; margin-top:24px;">
                <button class="btn-primary" id="btn-save-modules" style="background:var(--accent);">
                    <i class="fas fa-save"></i> Module speichern
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
                <p class="field-hint" style="grid-column:1/-1;">Wird Gästen angezeigt, wenn keine Online-Reservierung möglich ist.</p>
            </div>
        `;
    }

    if (settingsTab === 'visibility') {
        const mod = settings.activeModules || { orders: true, reservations: true };
        return `
            <div class="form-grid">
                <div class="form-group">
                    <label class="switch-label">
                        <label class="switch small"><input type="checkbox" id="v-orders" ${mod.orders ? 'checked' : ''}><span class="slider round"></span></label>
                        Küchen-Monitor aktiv
                    </label>
                </div>
                <div class="form-group">
                    <label class="switch-label">
                        <label class="switch small"><input type="checkbox" id="v-res" ${mod.reservations ? 'checked' : ''}><span class="slider round"></span></label>
                        Online-Reservierung erlaubt
                    </label>
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
                    <label class="switch-label">
                        <label class="switch small"><input type="checkbox" id="rc-inquiry" ${rc.allowInquiry ? 'checked' : ''}><span class="slider round"></span></label>
                        Warteliste/Anfrage erlauben (wenn voll)
                    </label>
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

    return '';
}

function attachSettingsHandlers(container, settings, branding, users, licInfo, titleEl) {
    container.querySelector('#tab-btn-license').onclick      = () => { settingsTab = 'license';      renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-plan_modules').onclick = () => { settingsTab = 'plan_modules'; renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-branding').onclick     = () => { settingsTab = 'branding';     renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-visibility').onclick   = () => { settingsTab = 'visibility';   renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-reservations').onclick = () => { settingsTab = 'reservations'; renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-users').onclick        = () => { settingsTab = 'users';        renderSettings(container, titleEl); };

    // --- Plan-Module speichern ---
    const btnSaveModules = container.querySelector('#btn-save-modules');
    if (btnSaveModules) {
        btnSaveModules.onclick = async () => {
            const modules = {};
            container.querySelectorAll('.module-toggle').forEach(cb => {
                modules[cb.dataset.module] = cb.checked;
            });
            const res = await apiPost('license/modules', { modules });
            if (res && res.success) {
                showToast('Module gespeichert!');
                renderSettings(container, titleEl);
            } else {
                showToast(res?.reason || 'Fehler beim Speichern.', 'error');
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
                resultEl.innerHTML = `
                    <div style="padding:12px 16px; background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.25); border-radius:8px; color:#10b981; font-size:.88rem;">
                        <i class="fas fa-check-circle"></i>&nbsp;
                        <strong>Lizenz aktiviert!</strong> Plan: ${lic.label || lic.type}
                        &nbsp;&bull;&nbsp; Gültig bis: ${lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString('de-DE') : 'Unbegrenzt'}
                    </div>`;
                showToast('Lizenz erfolgreich aktiviert! 🎉', 'success');
                setTimeout(() => renderSettings(container, titleEl), 1500);
            } else {
                resultEl.innerHTML = `
                    <div style="padding:12px 16px; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.25); border-radius:8px; color:#ef4444; font-size:.88rem;">
                        <i class="fas fa-times-circle"></i>&nbsp;
                        ${res?.reason || 'Lizenz-Key ungültig oder Lizenzserver nicht erreichbar.'}
                    </div>`;
                showToast(res?.reason || 'Aktivierung fehlgeschlagen.', 'error');
            }
        };

        container.querySelector('#license-key-input').onkeydown = (e) => {
            if (e.key === 'Enter') btnActivate.click();
        };
    }

    // --- Speichern ---
    const saveBtn = container.querySelector('#save-settings');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            if (settingsTab === 'branding') {
                const b = {
                    name: container.querySelector('#br-name').value,
                    slogan: container.querySelector('#br-slogan').value,
                    phone: container.querySelector('#br-phone').value
                };
                const r = await apiPost('branding', b);
                if (r?.success) showToast('Branding gespeichert!');
            } else if (settingsTab === 'visibility') {
                const s = { ...settings };
                s.activeModules = {
                    orders: container.querySelector('#v-orders').checked,
                    reservations: container.querySelector('#v-res').checked
                };
                const r = await apiPost('settings', s);
                if (r?.success) { showToast('Ansicht-Einstellungen gespeichert!'); updateSidebarVisibility(s); }
            } else if (settingsTab === 'reservations') {
                const s = { ...settings };
                s.reservationConfig = {
                    durationSmall:  parseInt(container.querySelector('#rc-small').value),
                    durationMedium: parseInt(container.querySelector('#rc-medium').value),
                    durationLarge:  parseInt(container.querySelector('#rc-large').value),
                    buffer:         parseInt(container.querySelector('#rc-buffer').value),
                    allowInquiry:   container.querySelector('#rc-inquiry').checked
                };
                const r = await apiPost('settings', s);
                if (r?.success) showToast('Reservierungs-Konfiguration gespeichert!');
            }
        };
    }

    window.deleteUser = async (user) => {
        if (await showConfirm('Nutzer löschen?', `Möchten Sie den Zugang für ${user} wirklich entfernen?`)) {
            const res = await fetch(\`/api/users/\${user}\`, { method: 'DELETE', headers: { 'x-admin-token': sessionStorage.getItem('opa_admin_token') }});
            const data = await res.json();
            if (data.success) { showToast('Nutzer gelöscht'); renderSettings(container, titleEl); }
            else showToast(data.reason || 'Fehler beim Löschen', 'error');
        }
    };

    window.resetUserPassword = async (user) => {
        if (await showConfirm('Passwort zurücksetzen?', \`Dem Nutzer \${user} wird ein neues Passwort generiert und an seine E-Mail-Adresse gesendet.\`)) {
            const res = await fetch(\`/api/users/\${user}/reset\`, { method: 'POST', headers: { 'x-admin-token': sessionStorage.getItem('opa_admin_token') }});
            const data = await res.json();
            if (data.success) { showToast('Passwort zurückgesetzt & E-Mail gesendet!'); }
            else showToast(data.reason || 'Senden fehlgeschlagen', 'error');
        }
    };

    window.editUser = (u = null) => {
        const isNew = !u;
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = \`
            <div class="modal-content glass-panel" style="max-width:500px;">
                <h3>\${isNew ? 'Neuer Nutzer' : 'Nutzer bearbeiten'}</h3>
                \${isNew ? \`<div class="form-group"><label>Benutzername</label><input id="mu-user" class="input-styled" required></div>\` : ''}
                <div class="form-group"><label>Vorname</label><input id="mu-name" class="input-styled" value="\${u?.name || ''}" required></div>
                <div class="form-group"><label>Nachname</label><input id="mu-last" class="input-styled" value="\${u?.last_name || ''}"></div>
                <div class="form-group"><label>E-Mail-Adresse</label><input id="mu-email" class="input-styled" type="email" value="\${u?.email || ''}" required></div>
                <div class="form-group"><label>Rolle</label>
                    <select id="mu-role" class="input-styled">
                        <option value="admin" \${u?.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="manager" \${u?.role === 'manager' ? 'selected' : ''}>Manager</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" id="mu-cancel">Abbrechen</button>
                    <button class="btn-primary" id="mu-save">Speichern</button>
                </div>
            </div>
        \`;
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
            if (isNew) {
                res = await fetch('/api/users', { method: 'POST', headers, body: JSON.stringify(payload) });
            } else {
                res = await fetch(\`/api/users/\${u.user}\`, { method: 'PUT', headers, body: JSON.stringify(payload) });
            }
            
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
