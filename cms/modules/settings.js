/**
 * Settings Module for Grieche-CMS
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

    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div class="designer-tabs" style="margin-bottom:30px;">
                <button class="tab-btn ${settingsTab === 'license' ? 'active' : ''}" id="tab-btn-license">Lizenz & Hub</button>
                <button class="tab-btn ${settingsTab === 'branding' ? 'active' : ''}" id="tab-btn-branding">Restaurant-Info</button>
                <button class="tab-btn ${settingsTab === 'visibility' ? 'active' : ''}" id="tab-btn-visibility">CMS-Ansicht</button>
                <button class="tab-btn ${settingsTab === 'reservations' ? 'active' : ''}" id="tab-btn-reservations">Reservierungen</button>
                <button class="tab-btn ${settingsTab === 'users' ? 'active' : ''}" id="tab-btn-users">Nutzerverwaltung</button>
            </div>

            <div id="settings-content">
                ${renderSettingsTab(settings, branding, users)}
            </div>
            
            <div style="display:flex; justify-content:flex-end; margin-top:30px;">
                <button class="btn-primary" id="save-settings"><i class="fas fa-save"></i> Einstellungen speichern</button>
            </div>
        </div>
    `;

    attachSettingsHandlers(container, settings, branding, users, titleEl);
}

function renderSettingsTab(settings, branding, users) {
    if (settingsTab === 'license') {
        const l = settings.license || {};
        return `
            <div class="form-grid">
                <div class="form-group full">
                    <div style="background:rgba(37,99,235,.05); border:1px solid rgba(37,99,235,.1); border-radius:12px; padding:24px; display:flex; align-items:center; gap:20px;">
                        <div style="width:60px;height:60px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.5rem;"><i class="fas fa-shield-alt"></i></div>
                        <div>
                            <h3 style="margin-bottom:2px;">Oktagon Hub | ${l.status || 'Aktiv'}</h3>
                            <p style="color:var(--text-muted); font-size:.85rem;">Lizenz-Key: <code>${l.key || 'N/A'}</code> • Typ: <strong>${l.type || 'PRO'}</strong></p>
                        </div>
                    </div>
                </div>
                <div class="form-group"><label>Lizenz-Inhaber</label><input class="input-styled" value="${l.customer || 'Admin'}" readonly></div>
                <div class="form-group"><label>Gültig bis</label><input class="input-styled" value="${l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : 'Unbegrenzt'}" readonly></div>
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
        const rc = settings.reservationConfig || { 
            durationSmall: 90, durationMedium: 120, durationLarge: 150, 
            buffer: 15, allowInquiry: true 
        };
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
            <table class="premium-table">
                <thead><tr><th>Name</th><th>Rolle</th><th>Aktion</th></tr></thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td><strong>${u.name}</strong><br><small>${u.user}</small></td>
                            <td>${u.role}</td>
                            <td style="text-align:right;"><button class="btn-delete" onclick="window.deleteUser('${u.user}')"><i class="fas fa-trash"></i></button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    return '';
}

function attachSettingsHandlers(container, settings, branding, users, titleEl) {
    container.querySelector('#tab-btn-license').onclick = () => { settingsTab = 'license'; renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-branding').onclick = () => { settingsTab = 'branding'; renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-visibility').onclick = () => { settingsTab = 'visibility'; renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-reservations').onclick = () => { settingsTab = 'reservations'; renderSettings(container, titleEl); };
    container.querySelector('#tab-btn-users').onclick = () => { settingsTab = 'users'; renderSettings(container, titleEl); };

    container.querySelector('#save-settings').onclick = async () => {
        if (settingsTab === 'branding') {
            const b = {
                name: container.querySelector('#br-name').value,
                slogan: container.querySelector('#br-slogan').value,
                phone: container.querySelector('#br-phone').value
            };
            const r = await apiPost('branding', b);
            if (r.success) showToast('Branding gespeichert!');
        } else if (settingsTab === 'visibility') {
            const s = { ...settings };
            s.activeModules = {
                orders: container.querySelector('#v-orders').checked,
                reservations: container.querySelector('#v-res').checked
            };
            const r = await apiPost('settings', s);
            if (r.success) {
                showToast('Ansicht-Einstellungen gespeichert!');
                updateSidebarVisibility(s);
            }
        } else if (settingsTab === 'reservations') {
            const s = { ...settings };
            s.reservationConfig = {
                durationSmall: parseInt(container.querySelector('#rc-small').value),
                durationMedium: parseInt(container.querySelector('#rc-medium').value),
                durationLarge: parseInt(container.querySelector('#rc-large').value),
                buffer: parseInt(container.querySelector('#rc-buffer').value),
                allowInquiry: container.querySelector('#rc-inquiry').checked
            };
            const r = await apiPost('settings', s);
            if (r.success) showToast('Reservierungs-Konfiguration gespeichert!');
        }
    };
    
    window.deleteUser = async (user) => {
        if (await showConfirm('Nutzer löschen?', `Möchten Sie ${user} wirklich entfernen?`)) {
            // Delete logic...
            showToast(`${user} gelöscht (Demo)`);
        }
    };
}
