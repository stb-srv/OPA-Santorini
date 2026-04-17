/**
 * Website Designer Module for Grieche-CMS
 */

import { apiGet, apiPost, apiUpload } from './api.js';
import { showToast, renderHelpIcon } from './utils.js';

let designerTab = 'visuals';

export async function renderDesigner(container, titleEl, initialTab = null) {
    if (initialTab) designerTab = initialTab;
    
    const tabTitles = {
        visuals: 'Design & Bilder',
        location: 'Standort & Karte',
        pages: 'Seiten verwalten',
        vacation: 'Urlaub',
        holiday: 'Feiertage',
        legal: 'Impressum & Datenschutz',
        cookies: 'Cookie Banner',
        consent_log: 'Consent-Log'
    };
    
    titleEl.innerHTML = `<div style="display:flex;align-items:center;">${tabTitles[designerTab] || 'Website Designer'} ${renderHelpIcon(designerTab)}</div>`;
    const home = await apiGet('homepage') || {};

    let cookieConfig = null;
    let consentLog = null;
    if (designerTab === 'cookies') {
        cookieConfig = await _fetchCookieConfig();
    }
    if (designerTab === 'consent_log') {
        consentLog = await _fetchConsentLog();
    }

    const isCookieTab = designerTab === 'cookies' || designerTab === 'consent_log';

    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div id="designer-content">
                ${renderDesignerTab(home, cookieConfig, consentLog)}
            </div>
            <div style="display:flex; justify-content:flex-end; margin-top:30px;" id="save-bar-wrap">
                ${isCookieTab ? '' : '<button class="btn-primary" id="save-designer"><i class="fas fa-save"></i> \u00c4nderungen speichern</button>'}
            </div>
        </div>
    `;

    attachDesignerHandlers(container, home, titleEl, cookieConfig);
}

// ── Cookie-Config ────────────────────────────────────────────────────────────
async function _fetchCookieConfig() {
    try {
        const token = sessionStorage.getItem('opa_admin_token');
        const res = await fetch('/api/cookie-config/admin', { headers: { 'x-admin-token': token } });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

async function _saveCookieConfig(config) {
    try {
        const token = sessionStorage.getItem('opa_admin_token');
        const res = await fetch('/api/cookie-config/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
            body: JSON.stringify(config)
        });
        return await res.json();
    } catch (e) { return { success: false, reason: e.message }; }
}

async function _fetchConsentLog(page = 1) {
    try {
        const token = sessionStorage.getItem('opa_admin_token');
        const res = await fetch(`/api/cookie-consent/log?page=${page}&limit=50`, { headers: { 'x-admin-token': token } });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

async function _triggerRecons() {
    try {
        const token = sessionStorage.getItem('opa_admin_token');
        const res = await fetch('/api/cookie-consent/recons', { method: 'POST', headers: { 'x-admin-token': token } });
        return await res.json();
    } catch (e) { return { success: false, reason: e.message }; }
}

async function _clearConsentLog() {
    try {
        const token = sessionStorage.getItem('opa_admin_token');
        const res = await fetch('/api/cookie-consent/log', { method: 'DELETE', headers: { 'x-admin-token': token } });
        return await res.json();
    } catch (e) { return { success: false, reason: e.message }; }
}

// ── Tab-Renderer ─────────────────────────────────────────────────────────────
function renderDesignerTab(home, cookieConfig = null, consentLog = null) {
    switch (designerTab) {
        case 'visuals':
            return `
                <div class="form-grid">
                    <div class="form-group full"><label>Hero Titel</label><input id="ds-title" class="input-styled" value="${home.heroTitle || ''}"></div>
                    <div class="form-group full"><label>Hero Slogan</label><input id="ds-slogan" class="input-styled" value="${home.heroSlogan || ''}"></div>
                    <div class="form-group">
                        <label>Hintergrundbild (Hero)</label>
                        <div id="ds-bg-preview" class="upload-preview" style="height:180px;">
                            ${home.bgImage ? `<img src="${home.bgImage}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-image"></i>'}
                        </div>
                        <input type="hidden" id="ds-bg" value="${home.bgImage || ''}">
                        <input type="file" id="ds-bg-file" style="display:none;" accept="image/*">
                    </div>
                    <div class="form-group">
                        <label>Willkommen-Bild</label>
                        <div id="ds-wimg-preview" class="upload-preview" style="height:180px;">
                            ${home.welcomeImage ? `<img src="${home.welcomeImage}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-image"></i>'}
                        </div>
                        <input type="hidden" id="ds-w-img" value="${home.welcomeImage || ''}">
                        <input type="file" id="ds-wimg-file" style="display:none;" accept="image/*">
                    </div>
                </div>
            `;

        case 'location': {
            const loc = home.location || {};
            return `
                <div class="form-grid">
                    <div class="form-group full"><label>Adresse (f\u00fcr Anzeige & Maps)</label><textarea id="ds-loc-addr" class="input-styled" style="height:100px;">${loc.address || ''}</textarea></div>
                    <div class="form-group full"><label>Google Maps Embed URL (Iframe-Quelle)</label><input id="ds-loc-map" class="input-styled" value="${loc.embedUrl || ''}"></div>
                </div>
            `;
        }

        case 'pages': {
            const pages = home.pages || [];
            return `
                <div style="margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
                    <h4>Eigene Unterseiten</h4>
                    <button class="btn-edit" id="add-custom-page"><i class="fas fa-plus"></i> Neue Seite</button>
                </div>
                <div id="pages-list" style="display:grid; gap:15px;">
                    ${pages.map((p) => `
                        <div class="glass-panel" style="padding:20px; background:rgba(0,0,0,0.03); display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <strong style="font-size:1.1rem;">${p.title}</strong><br>
                                <small style="opacity:.6;">URL: /#custom-${p.id}</small>
                            </div>
                            <div>
                                <button class="btn-edit" onclick="window.editCustomPage('${p.id}')"><i class="fas fa-pen"></i></button>
                                <button class="btn-edit" onclick="window.deleteCustomPage('${p.id}')" style="color:#ef4444;"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    `).join('')}
                    ${pages.length === 0 ? '<p style="text-align:center; opacity:.5; padding:40px;">Noch keine eigenen Seiten erstellt.</p>' : ''}
                </div>
            `;
        }

        case 'vacation': {
            const vac = home.vacation || {};
            return `
                <div class="form-grid">
                    <div class="form-group full">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <label class="switch small"><input type="checkbox" id="ds-v-on" ${vac.enabled ? 'checked' : ''}><span class="slider round"></span></label>
                            <label for="ds-v-on" style="margin:0; cursor:pointer; font-weight:normal;">Urlaubs-Sperre aktiv (Reservierung deaktiviert)</label>
                        </div>
                    </div>

                    <div class="form-group"><label>Popup Titel</label><input id="ds-v-title" class="input-styled" value="${vac.title || ''}"></div>
                    <div class="form-group"><label>Popup Text</label><input id="ds-v-text" class="input-styled" value="${vac.text || ''}"></div>
                    <div class="form-group"><label>Start (Datum)</label><input id="ds-v-start" type="date" class="input-styled" value="${vac.start || ''}"></div>
                    <div class="form-group"><label>Ende (Datum)</label><input id="ds-v-end" type="date" class="input-styled" value="${vac.end || ''}"></div>
                </div>
            `;
        }

        case 'holiday': {
            const hol = home.holiday || {};
            return `
                <div class="form-grid">
                    <div class="form-group full">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <label class="switch small"><input type="checkbox" id="ds-h-on" ${hol.enabled ? 'checked' : ''}><span class="slider round"></span></label>
                            <label for="ds-h-on" style="margin:0; cursor:pointer; font-weight:normal;">Feiertags-Ank\u00fcndigung aktiv</label>
                        </div>
                    </div>
                    <div class="form-group"><label>Event Titel</label><input id="ds-h-title" class="input-styled" value="${hol.title || ''}"></div>
                    <div class="form-group"><label>Ank\u00fcndigungs-Text</label><textarea id="ds-h-text" class="input-styled" style="height:80px;">${hol.text || ''}</textarea></div>
                    <div class="form-group"><label>Angebots-Start</label><input id="ds-h-start" type="date" class="input-styled" value="${hol.start || ''}"></div>
                    <div class="form-group"><label>Angebots-Ende</label><input id="ds-h-end" type="date" class="input-styled" value="${hol.end || ''}"></div>
                </div>
            `;
        }

        case 'legal': {
            const leg = home.legal || { impressum: '', privacy: '' };
            return `
                <div class="form-group full" style="margin-bottom:20px;"><label>Impressum</label><textarea id="ds-leg-imp" class="input-styled" style="height:200px;">${leg.impressum || ''}</textarea></div>
                <div class="form-group full"><label>Datenschutzerkl\u00e4rung</label><textarea id="ds-leg-priv" class="input-styled" style="height:200px;">${leg.privacy || ''}</textarea></div>
            `;
        }

        case 'cookies':
            return _renderCookiesTab(cookieConfig);

        case 'consent_log':
            return _renderConsentLogTab(consentLog);

        default: return '<p>Sektion nicht gefunden.</p>';
    }
}

// ── Cookie-Banner Tab ─────────────────────────────────────────────────────────
function _renderCookiesTab(cfg) {
    if (!cfg) {
        return `<div style="text-align:center; padding:60px; opacity:.5;">
            <i class="fas fa-exclamation-circle" style="font-size:2rem; margin-bottom:12px; display:block;"></i>
            Cookie-Konfiguration konnte nicht geladen werden.
        </div>`;
    }

    const cats = cfg.categories || {};
    const catIcons  = { necessary: 'shield-alt', functional: 'cogs', analytics: 'chart-bar', marketing: 'bullhorn' };
    const catColors = { necessary: '#10b981', functional: '#3b82f6', analytics: '#f59e0b', marketing: '#8b5cf6' };

    const categoriesHtml = Object.entries(cats).map(([id, cat]) => {
        const icon      = catIcons[id]  || 'cookie-bite';
        const color     = catColors[id] || '#6b7280';
        const isRequired = cat.required === true;
        const isEnabled  = cat.enabled  !== false;
        const cookieRows = (cat.cookies || []).map(c => `
            <tr style="font-size:.78rem; color:var(--text-muted);">
                <td style="padding:4px 8px;"><code>${c.name || '\u2013'}</code></td>
                <td style="padding:4px 8px;">${c.purpose  || '\u2013'}</td>
                <td style="padding:4px 8px;">${c.duration || '\u2013'}</td>
                <td style="padding:4px 8px;">${c.provider || '\u2013'}</td>
            </tr>`).join('');

        return `
        <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:20px; margin-bottom:14px;" data-cat-id="${id}">
            <div style="display:flex; align-items:center; gap:14px;">
                <div style="width:40px;height:40px;border-radius:10px;background:${color}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas fa-${icon}" style="color:${color};"></i>
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:.95rem; display:flex; align-items:center; gap:8px;">
                        ${cat.label || id}
                        ${isRequired ? '<span style="background:rgba(16,185,129,.15);color:#10b981;border-radius:20px;padding:1px 8px;font-size:.7rem;">Pflicht</span>' : ''}
                    </div>
                    <div style="color:var(--text-muted); font-size:.8rem; margin-top:2px;">${cat.description || ''}</div>
                </div>
                <label class="switch small" style="flex-shrink:0;">
                    <input type="checkbox" class="cat-toggle" data-cat="${id}"
                        ${isEnabled  ? 'checked'  : ''}
                        ${isRequired ? 'disabled' : ''}>
                    <span class="slider round"></span>
                </label>
            </div>
            ${cookieRows ? `
            <div style="margin-top:14px; border-top:1px solid rgba(255,255,255,0.06); padding-top:10px;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead><tr style="font-size:.72rem; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted);">
                        <th style="padding:4px 8px; text-align:left; font-weight:600;">Cookie</th>
                        <th style="padding:4px 8px; text-align:left; font-weight:600;">Zweck</th>
                        <th style="padding:4px 8px; text-align:left; font-weight:600;">Dauer</th>
                        <th style="padding:4px 8px; text-align:left; font-weight:600;">Anbieter</th>
                    </tr></thead>
                    <tbody>${cookieRows}</tbody>
                </table>
            </div>` : ''}
        </div>`;
    }).join('');

    return `
        <div style="background:rgba(37,99,235,.06); border:1px solid rgba(37,99,235,.15); border-radius:12px; padding:20px; margin-bottom:24px; display:flex; align-items:center; gap:16px;">
            <div style="flex:1;">
                <div style="font-weight:700; font-size:1rem; margin-bottom:3px;">Cookie-Banner anzeigen</div>
                <div style="color:var(--text-muted); font-size:.83rem;">Wenn deaktiviert, wird auf der Website kein Cookie-Banner eingeblendet.</div>
            </div>
            <label class="switch" style="flex-shrink:0;">
                <input type="checkbox" id="ck-enabled" ${cfg.bannerEnabled !== false ? 'checked' : ''}>
                <span class="slider round"></span>
            </label>
        </div>
        <div style="display:grid; gap:14px; margin-bottom:24px;">
            <div class="form-group full"><label>Banner-Text</label><textarea id="ck-text" class="input-styled" style="height:80px;">${cfg.banner_text || ''}</textarea></div>
            <div class="form-group full"><label>Datenschutz-URL</label><input id="ck-privacy-url" class="input-styled" value="${cfg.privacy_url || '/datenschutz'}" placeholder="/datenschutz"></div>
        </div>
        <h4 style="margin-bottom:14px;"><i class="fas fa-layer-group"></i> Cookie-Kategorien</h4>
        ${categoriesHtml}
        <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:flex-end; margin-top:24px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.07);">
            <button id="btn-recons" class="btn-secondary" title="Erh\u00f6ht die Config-Version \u2192 alle Besucher werden beim n\u00e4chsten Besuch erneut um Zustimmung gebeten">
                <i class="fas fa-sync-alt"></i> Re-Consent ausl\u00f6sen
            </button>
            <button id="btn-save-cookies" class="btn-primary">
                <i class="fas fa-save"></i> Cookie-Einstellungen speichern
            </button>
        </div>
        <div id="cookie-save-result" style="margin-top:12px;"></div>
    `;
}

// ── Consent-Log Tab ───────────────────────────────────────────────────────────
function _renderConsentLogTab(log) {
    if (!log) {
        return `<div style="text-align:center; padding:60px; opacity:.5;">
            <i class="fas fa-exclamation-circle" style="font-size:2rem; margin-bottom:12px; display:block;"></i>
            Consent-Log konnte nicht geladen werden.
        </div>`;
    }
    const entries = log.entries || [];
    const rows = entries.map(e => {
        const choices = Object.entries(e.choices || {})
            .map(([k, v]) => `<span style="color:${v ? '#10b981' : '#ef4444'}; margin-right:6px; font-size:.75rem;">${k}: ${v ? '\u2713' : '\u2717'}</span>`)
            .join('');
        return `
            <tr style="font-size:.82rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:8px 10px; color:var(--text-muted);">${new Date(e.timestamp).toLocaleString('de-DE')}</td>
                <td style="padding:8px 10px;">${choices}</td>
                <td style="padding:8px 10px; color:var(--text-muted);">${e.source || '\u2013'}</td>
                <td style="padding:8px 10px; font-family:monospace; font-size:.72rem; color:var(--text-muted);">${e.config_version || '\u2013'}</td>
            </tr>`;
    }).join('');

    return `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
            <div>
                <h4 style="margin:0;">Consent-Protokoll</h4>
                <p style="color:var(--text-muted); font-size:.83rem; margin:4px 0 0;">
                    ${log.total || 0} Eintr\u00e4ge gesamt &nbsp;\u00b7&nbsp; Seite ${log.page || 1}
                    &nbsp;\u00b7&nbsp; DSGVO Art. 7 \u2013 Nachweis der Einwilligung
                </p>
            </div>
            <button id="btn-clear-log" class="btn-edit" style="color:#ef4444;" title="Alle Consent-Eintr\u00e4ge l\u00f6schen">
                <i class="fas fa-trash"></i> Log leeren
            </button>
        </div>
        ${entries.length === 0 ? '<p style="text-align:center; opacity:.5; padding:40px;">Noch keine Consent-Eintr\u00e4ge vorhanden.</p>' : `
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="font-size:.75rem; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); border-bottom:1px solid rgba(255,255,255,0.1);">
                        <th style="padding:8px 10px; text-align:left;">Zeitstempel</th>
                        <th style="padding:8px 10px; text-align:left;">Auswahl</th>
                        <th style="padding:8px 10px; text-align:left;">Quelle</th>
                        <th style="padding:8px 10px; text-align:left;">Version</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`}
    `;
}

// ── Handler ───────────────────────────────────────────────────────────────────
function attachDesignerHandlers(container, home, titleEl, cookieConfig) {
    const f = (id) => container.querySelector(`#${id}`);

    // Cookie-Banner-Tab
    if (designerTab === 'cookies') {
        const btnSave   = f('btn-save-cookies');
        const btnRecons = f('btn-recons');

        if (btnSave) {
            btnSave.onclick = async () => {
                const resultEl = f('cookie-save-result');
                const updated  = JSON.parse(JSON.stringify(cookieConfig || {}));
                updated.bannerEnabled = f('ck-enabled').checked;
                updated.banner_text   = f('ck-text').value;
                updated.privacy_url   = f('ck-privacy-url').value;
                container.querySelectorAll('.cat-toggle').forEach(cb => {
                    const catId = cb.dataset.cat;
                    if (updated.categories && updated.categories[catId]) updated.categories[catId].enabled = cb.checked;
                });
                btnSave.disabled = true;
                btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wird gespeichert...';
                const res = await _saveCookieConfig(updated);
                btnSave.disabled = false;
                btnSave.innerHTML = '<i class="fas fa-save"></i> Cookie-Einstellungen speichern';
                if (res && res.success) {
                    showToast('Cookie-Einstellungen gespeichert!');
                    if (resultEl) resultEl.innerHTML = `
                        <div style="padding:10px 14px; background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.25); border-radius:8px; color:#10b981; font-size:.85rem;">
                            <i class="fas fa-check-circle"></i> Gespeichert \u2013 \u00c4nderungen sind sofort auf der Website aktiv.
                        </div>`;
                } else {
                    showToast(res?.reason || 'Fehler beim Speichern.', 'error');
                }
            };
        }

        if (btnRecons) {
            btnRecons.onclick = async () => {
                btnRecons.disabled = true;
                btnRecons.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                const res = await _triggerRecons();
                btnRecons.disabled = false;
                btnRecons.innerHTML = '<i class="fas fa-sync-alt"></i> Re-Consent ausl\u00f6sen';
                if (res && res.success) showToast(`Re-Consent ausgel\u00f6st! Neue Version: ${res.new_version}`);
                else showToast(res?.reason || 'Fehler beim Re-Consent.', 'error');
            };
        }
    }

    // Consent-Log
    if (designerTab === 'consent_log') {
        const btnClear = f('btn-clear-log');
        if (btnClear) {
            btnClear.onclick = async () => {
                const modal = document.createElement('div');
                modal.className = 'modal active';
                modal.innerHTML = `
                    <div class="modal-content glass-panel" style="max-width:420px; text-align:center; padding:32px;">
                        <i class="fas fa-trash" style="font-size:2rem; color:#ef4444; margin-bottom:16px; display:block;"></i>
                        <h4 style="margin-bottom:8px;">Consent-Log leeren?</h4>
                        <p style="color:var(--text-muted); font-size:.85rem; margin-bottom:24px;">
                            Alle gespeicherten Einwilligungsnachweise werden unwiderruflich gel\u00f6scht.<br>
                            Dies ist aus DSGVO-Sicht nur erlaubt wenn die Aufbewahrungsfrist abgelaufen ist.
                        </p>
                        <div style="display:flex; gap:12px; justify-content:center;">
                            <button class="btn-secondary" data-action="cancel">Abbrechen</button>
                            <button class="btn-primary" data-action="confirm" style="background:#ef4444;">Ja, Log leeren</button>
                        </div>
                    </div>`;
                document.body.appendChild(modal);
                modal.querySelector('[data-action="cancel"]').onclick = () => modal.remove();
                modal.querySelector('[data-action="confirm"]').onclick = async () => {
                    modal.remove();
                    const res = await _clearConsentLog();
                    if (res && res.success) { showToast('Consent-Log geleert.'); renderDesigner(container, titleEl, 'consent_log'); }
                    else showToast(res?.reason || 'Fehler beim Leeren.', 'error');
                };
            };
        }
    }

    // Pages Tab
    if (designerTab === 'pages') {
        container.querySelector('#add-custom-page').onclick = () => window.editCustomPage();

        /**
         * Seiten-Modal – KEINE globalen IDs!
         * Alle Felder werden \u00fcber data-field Attribute referenziert,
         * damit der Browser keine "Duplicate id" Warnung wirft.
         */
        window.editCustomPage = (id = null) => {
            const page = id
                ? (home.pages || []).find(p => p.id === id) || { id, title: '', content: '', headline: '' }
                : { id: 'new-' + Date.now(), title: '', content: '', headline: '' };

            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content glass-panel" style="max-width:800px;">
                    <h3>${id ? 'Seite bearbeiten' : 'Neue Seite erstellen'}</h3>
                    <div class="form-group">
                        <label>Men\u00fc-Titel</label>
                        <input data-field="title" class="input-styled" value="${(page.title || '').replace(/"/g, '&quot;')}" placeholder="z.B. \u00dcber uns">
                    </div>
                    <div class="form-group">
                        <label>Haupt-\u00dcberschrift (in der Seite)</label>
                        <input data-field="headline" class="input-styled" value="${(page.headline || '').replace(/"/g, '&quot;')}" placeholder="Gro\u00dfe \u00dcberschrift auf der Seite">
                    </div>
                    <div class="form-group">
                        <label>Inhalt (HTML erlaubt)</label>
                        <textarea data-field="content" class="input-styled" style="height:300px;">${page.content || ''}</textarea>
                    </div>
                    <div class="modal-actions">
                        <button class="btn-secondary" data-action="cancel">Abbrechen</button>
                        <button class="btn-primary"   data-action="save"><i class="fas fa-save"></i> Speichern</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const q          = (sel) => modal.querySelector(sel);
            const saveBtn    = q('[data-action="save"]');
            const cancelBtn  = q('[data-action="cancel"]');
            const titleInput = q('[data-field="title"]');

            cancelBtn.onclick = () => modal.remove();
            titleInput.focus();

            saveBtn.onclick = async () => {
                const updated = {
                    id:       page.id,
                    title:    q('[data-field="title"]').value.trim(),
                    headline: q('[data-field="headline"]').value.trim(),
                    content:  q('[data-field="content"]').value,
                    active:   true
                };

                if (!updated.title) {
                    showToast('Bitte einen Men\u00fc-Titel eingeben.', 'error');
                    q('[data-field="title"]').focus();
                    return;
                }

                if (!home.pages) home.pages = [];
                const idx = home.pages.findIndex(p => p.id === page.id);
                if (idx >= 0) home.pages[idx] = updated;
                else home.pages.push(updated);

                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Speichern...';

                const res = await apiPost('homepage', home);
                if (res && res.success) {
                    modal.remove();
                    renderDesigner(container, titleEl, 'pages');
                } else {
                    showToast(res?.reason || 'Fehler beim Speichern!', 'error');
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> Speichern';
                }
            };
        };

        window.deleteCustomPage = async (id) => {
            if (!home.pages) return;
            home.pages = home.pages.filter(p => p.id !== id);
            const res = await apiPost('homepage', home);
            if (res && res.success) renderDesigner(container, titleEl, 'pages');
            else showToast(res?.reason || 'Fehler beim L\u00f6schen!', 'error');
        };
    }

    // Standard Speichern
    const saveBtn = f('save-designer');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const u = { ...home };
            if (designerTab === 'visuals') {
                u.heroTitle    = f('ds-title').value;
                u.heroSlogan   = f('ds-slogan').value;
                u.bgImage      = f('ds-bg').value;
                u.welcomeImage = f('ds-w-img').value;
            } else if (designerTab === 'location') {
                u.location = { address: f('ds-loc-addr').value, embedUrl: f('ds-loc-map').value };
            } else if (designerTab === 'vacation') {
                u.vacation = { enabled: f('ds-v-on').checked, title: f('ds-v-title').value, text: f('ds-v-text').value, start: f('ds-v-start').value, end: f('ds-v-end').value };
            } else if (designerTab === 'holiday') {
                u.holiday = { enabled: f('ds-h-on').checked, title: f('ds-h-title').value, text: f('ds-h-text').value, start: f('ds-h-start').value, end: f('ds-h-end').value };
            } else if (designerTab === 'legal') {
                u.legal = { impressum: f('ds-leg-imp').value, privacy: f('ds-leg-priv').value };
            }
            const res = await apiPost('homepage', u);
            if (res && res.success) showToast('Website Designer gespeichert!');
            else showToast(res?.reason || 'Fehler beim Speichern!', 'error');
        };
    }

    // Upload handlers
    const setupUpload = (previewId, fileInputId, hiddenId) => {
        const btn    = container.querySelector(`#${previewId}`);
        const file   = container.querySelector(`#${fileInputId}`);
        const hidden = container.querySelector(`#${hiddenId}`);
        if (!btn || !file) return;
        btn.onclick = () => file.click();
        file.onchange = async (e) => {
            const fi = e.target.files[0];
            if (!fi) return;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            const r = await apiUpload(fi);
            if (r.success) {
                hidden.value = r.url;
                btn.innerHTML = `<img src="${r.url}" style="width:100%;height:100%;object-fit:cover;">`;
                showToast('Bild hochgeladen!');
            } else {
                btn.innerHTML = originalHTML;
            }
        };
    };
    if (designerTab === 'visuals') {
        setupUpload('ds-bg-preview',   'ds-bg-file',   'ds-bg');
        setupUpload('ds-wimg-preview', 'ds-wimg-file', 'ds-w-img');
    }
}
