/**
 * Website Designer Module for Grieche-CMS
 */

import { apiGet, apiPost, apiUpload } from './api.js';
import { showToast, renderHelpIcon } from './utils.js';

let designerTab = 'visuals';

export async function renderDesigner(container, titleEl, initialTab = null) {
    if (initialTab) designerTab = initialTab;
    
    // Set Title based on Tab
    const tabTitles = {
        visuals: 'Design & Bilder',
        location: 'Standort & Karte',
        pages: 'Seiten verwalten',
        vacation: 'Urlaub',
        holiday: 'Feiertage',
        legal: 'Impressum & Datenschutz',
        cookies: 'Cookie Banner'
    };
    
    titleEl.innerHTML = `<div style="display:flex;align-items:center;">${tabTitles[designerTab] || 'Website Designer'} ${renderHelpIcon(designerTab)}</div>`;
    const home = await apiGet('homepage') || {};

    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div id="designer-content">
                ${renderDesignerTab(home)}
            </div>
            
            <div style="display:flex; justify-content:flex-end; margin-top:30px;">
                <button class="btn-primary" id="save-designer"><i class="fas fa-save"></i> Änderungen speichern</button>
            </div>
        </div>
    `;

    attachDesignerHandlers(container, home, titleEl);
}

function renderDesignerTab(home) {
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
        
        case 'location':
            const loc = home.location || {};
            return `
                <div class="form-grid">
                    <div class="form-group full"><label>Adresse (für Anzeige & Maps)</label><textarea id="ds-loc-addr" class="input-styled" style="height:100px;">${loc.address || ''}</textarea></div>
                    <div class="form-group full"><label>Google Maps Embed URL (Iframe-Quelle)</label><input id="ds-loc-map" class="input-styled" value="${loc.embedUrl || ''}"></div>
                </div>
            `;

        case 'pages':
            const pages = home.pages || [];
            return `
                <div style="margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
                    <h4>Eigene Unterseiten</h4>
                    <button class="btn-edit" id="add-custom-page"><i class="fas fa-plus"></i> Neue Seite</button>
                </div>
                <div id="pages-list" style="display:grid; gap:15px;">
                    ${pages.map((p, idx) => `
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

        case 'vacation':
            const vac = home.vacation || {};
            return `
                <div class="form-grid">
                    <div class="form-group full">
                        <label class="switch-label">
                            <label class="switch small"><input type="checkbox" id="ds-v-on" ${vac.enabled ? 'checked' : ''}><span class="slider round"></span></label>
                            Urlaubs-Sperre aktiv (Reservierung deaktiviert)
                        </label>
                    </div>
                    <div class="form-group"><label>Popup Titel</label><input id="ds-v-title" class="input-styled" value="${vac.title || ''}"></div>
                    <div class="form-group"><label>Popup Text</label><input id="ds-v-text" class="input-styled" value="${vac.text || ''}"></div>
                    <div class="form-group"><label>Start (Datum)</label><input id="ds-v-start" type="date" class="input-styled" value="${vac.start || ''}"></div>
                    <div class="form-group"><label>Ende (Datum)</label><input id="ds-v-end" type="date" class="input-styled" value="${vac.end || ''}"></div>
                </div>
            `;

        case 'holiday':
            const hol = home.holiday || {};
            return `
                <div class="form-grid">
                    <div class="form-group full">
                        <label class="switch-label">
                            <label class="switch small"><input type="checkbox" id="ds-h-on" ${hol.enabled ? 'checked' : ''}><span class="slider round"></span></label>
                            Feiertags-Ankündigung aktiv
                        </label>
                    </div>
                    <div class="form-group"><label>Event Titel</label><input id="ds-h-title" class="input-styled" value="${hol.title || ''}"></div>
                    <div class="form-group"><label>Ankündigungs-Text</label><textarea id="ds-h-text" class="input-styled" style="height:80px;">${hol.text || ''}</textarea></div>
                    <div class="form-group"><label>Angebots-Start</label><input id="ds-h-start" type="date" class="input-styled" value="${hol.start || ''}"></div>
                    <div class="form-group"><label>Angebots-Ende</label><input id="ds-h-end" type="date" class="input-styled" value="${hol.end || ''}"></div>
                </div>
            `;

        case 'legal':
            const leg = home.legal || { impressum: '', privacy: '' };
            return `
                <div class="form-group full" style="margin-bottom:20px;"><label>Impressum</label><textarea id="ds-leg-imp" class="input-styled" style="height:200px;">${leg.impressum || ''}</textarea></div>
                <div class="form-group full"><label>Datenschutzerklärung</label><textarea id="ds-leg-priv" class="input-styled" style="height:200px;">${leg.privacy || ''}</textarea></div>
            `;

        case 'cookies':
            const coo = home.cookieBanner || { enabled: true };
            return `
                <div class="form-grid">
                    <div class="form-group full">
                        <label class="switch-label">
                            <label class="switch small"><input type="checkbox" id="ds-c-on" ${coo.enabled ? 'checked' : ''}><span class="slider round"></span></label>
                            Cookie Banner auf Website anzeigen
                        </label>
                    </div>
                    <div class="form-group full"><label>Überschrift</label><input id="ds-c-title" class="input-styled" value="${coo.title || 'Cookie-Einstellungen'}"></div>
                    <div class="form-group full"><label>Cookie Nachricht</label><textarea id="ds-c-text" class="input-styled" style="height:100px;">${coo.text || 'Wir verwenden Cookies um...'}</textarea></div>
                </div>
            `;

        default: return '<p>Sektion nicht gefunden.</p>';
    }
}

function attachDesignerHandlers(container, home, titleEl) {
    const f = (id) => container.querySelector(`#${id}`);

    // Pages specific logic
    if (designerTab === 'pages') {
        container.querySelector('#add-custom-page').onclick = () => window.editCustomPage();
        
        window.editCustomPage = (id = null) => {
            const page = id ? home.pages.find(p => p.id === id) : { id: 'new-' + Date.now(), title: '', content: '', headline: '' };
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content glass-panel" style="max-width:800px;">
                    <h3>Seite bearbeiten</h3>
                    <div class="form-group"><label>Menü-Titel</label><input id="mp-title" class="input-styled" value="${page.title}"></div>
                    <div class="form-group"><label>Haupt-Überschrift (in der Seite)</label><input id="mp-head" class="input-styled" value="${page.headline || ''}"></div>
                    <div class="form-group"><label>Inhalt (HTML erlaubt)</label><textarea id="mp-content" class="input-styled" style="height:300px;">${page.content || ''}</textarea></div>
                    <div class="modal-actions">
                        <button class="btn-secondary" id="mp-cancel">Abbrechen</button>
                        <button class="btn-primary" id="mp-save">Speichern</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#mp-cancel').onclick = () => modal.remove();
            modal.querySelector('#mp-save').onclick = async () => {
                const updated = {
                    id: page.id,
                    title: modal.querySelector('#mp-title').value,
                    headline: modal.querySelector('#mp-head').value,
                    content: modal.querySelector('#mp-content').value,
                    active: true
                };
                if (!home.pages) home.pages = [];
                const idx = home.pages.findIndex(p => p.id === page.id);
                if (idx >= 0) home.pages[idx] = updated;
                else home.pages.push(updated);
                
                await apiPost('homepage', home);
                modal.remove();
                renderDesigner(container, titleEl);
            };
        };

        window.deleteCustomPage = async (id) => {
            home.pages = home.pages.filter(p => p.id !== id);
            await apiPost('homepage', home);
            renderDesigner(container, titleEl);
        };
    }

    container.querySelector('#save-designer').onclick = async () => {
        const u = { ...home };
        
        if (designerTab === 'visuals') {
            u.heroTitle = f('ds-title').value;
            u.heroSlogan = f('ds-slogan').value;
            u.bgImage = f('ds-bg').value;
            u.welcomeImage = f('ds-w-img').value;
        } else if (designerTab === 'location') {
            u.location = { address: f('ds-loc-addr').value, embedUrl: f('ds-loc-map').value };
        } else if (designerTab === 'vacation') {
            u.vacation = { enabled: f('ds-v-on').checked, title: f('ds-v-title').value, text: f('ds-v-text').value, start: f('ds-v-start').value, end: f('ds-v-end').value };
        } else if (designerTab === 'holiday') {
            u.holiday = { enabled: f('ds-h-on').checked, title: f('ds-h-title').value, text: f('ds-h-text').value, start: f('ds-h-start').value, end: f('ds-h-end').value };
        } else if (designerTab === 'legal') {
            u.legal = { impressum: f('ds-leg-imp').value, privacy: f('ds-leg-priv').value };
        } else if (designerTab === 'cookies') {
            u.cookieBanner = { enabled: f('ds-c-on').checked, title: f('ds-c-title').value, text: f('ds-c-text').value };
        }

        const res = await apiPost('homepage', u);
        if (res.success) showToast('Website Designer gespeichert!');
    };

    // Upload handlers
    const setupUpload = (btnId, inputId, hiddenId) => {
        const btn = container.querySelector(`#${btnId}`);
        const file = container.querySelector(`#${inputId}`);
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
        setupUpload('ds-bg-preview', 'ds-bg-file', 'ds-bg');
        setupUpload('ds-wimg-preview', 'ds-wimg-file', 'ds-w-img');
    }
}
