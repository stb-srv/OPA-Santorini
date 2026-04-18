/**
 * Reservation Management Module for Grieche-CMS
 */

import { apiGet, apiPost, apiPut, apiDelete } from './api.js';
import { showToast, showConfirm, showPrompt } from './utils.js';

let resFilterText = '';
let resFilterStatus = 'All';
let resFilterDate = '';
let resSortField = 'date';
let resSortOrder = 'desc';
let resPage = 1;
const RES_PAGE_SIZE = 20;

export async function renderReservations(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-calendar-check"></i> Reservierungen';
    const [resRaw, tables] = await Promise.all([apiGet('reservations'), apiGet('tables')]);
    
    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                <div>
                    <h3 style="margin-bottom:4px;">Aktive Reservierungen</h3>
                    <p style="color:var(--text-muted); font-size:.85rem;">Status und Tischzuweisungen bearbeiten.</p>
                </div>
                <button class="btn-premium" id="btn-manual-res"><i class="fas fa-plus"></i> Manuelle Buchung</button>
            </div>

            <div style="display:flex; gap:15px; margin-bottom:30px; flex-wrap:wrap;">
                <div style="flex:1; min-width:250px; position:relative;">
                    <i class="fas fa-search" style="position:absolute; left:15px; top:50%; transform:translateY(-50%); opacity:.3;"></i>
                    <input type="text" class="input-styled" id="res-search" placeholder="Suchen..." value="${resFilterText}" style="padding-left:45px;">
                </div>
                <select class="input-styled" id="res-status-filter" style="width:180px;">
                    <option value="All" ${resFilterStatus === 'All' ? 'selected' : ''}>Alle Status</option>
                    <option value="Pending" ${resFilterStatus === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Confirmed" ${resFilterStatus === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                    <option value="Inquiry" ${resFilterStatus === 'Inquiry' ? 'selected' : ''}>Anfrage</option>
                    <option value="Blocked" ${resFilterStatus === 'Blocked' ? 'selected' : ''}>Gesperrt</option>
                    <option value="Cancelled" ${resFilterStatus === 'Cancelled' ? 'selected' : ''}>Storniert</option>
                    <option value="No-Show" ${resFilterStatus === 'No-Show' ? 'selected' : ''}>No-Show</option>
                </select>
                <input type="date" class="input-styled" id="res-date-filter" value="${resFilterDate}" style="width:160px;">
                <button class="btn-secondary" id="res-reset-filters" style="width:48px; height:48px; padding:0; display:flex; align-items:center; justify-content:center;"><i class="fas fa-undo"></i></button>
            </div>

            <div id="res-list-container"></div>
        </div>
    `;

    const refreshList = () => {
        try {
            const listContainer = container.querySelector('#res-list-container');
            if (!listContainer) return;

            let res = resFilterStatus === 'Cancelled' || resFilterStatus === 'No-Show'
                ? (resRaw || [])
                : (resRaw || []).filter(r => r.status !== 'Cancelled' && r.status !== 'No-Show');
            
            // Text Search
            if (resFilterText) {
                const txt = resFilterText.toLowerCase();
                res = res.filter(r => 
                    (r.name || '').toLowerCase().includes(txt) || 
                    (r.email || '').toLowerCase().includes(txt) ||
                    (r.phone || '').includes(txt)
                );
            }
            
            // Status Filter
            if (resFilterStatus !== 'All') {
                res = res.filter(r => r.status === resFilterStatus);
            }
            
            // Date Filter (Robust comparison)
            if (resFilterDate) {
                const dParts = resFilterDate.split('-');
                const searchD = parseInt(dParts[2]);
                const searchM = parseInt(dParts[1]);
                const searchY = parseInt(dParts[0]);

                res = res.filter(r => {
                    if (!r.date) return false;
                    const parts = r.date.split('.');
                    if (parts.length !== 3) return false;
                    return parseInt(parts[0]) === searchD && 
                        parseInt(parts[1]) === searchM && 
                        parseInt(parts[2]) === searchY;
                });
            }

            // Sorting (Defensive)
            res.sort((a,b) => {
                try {
                    let valA, valB;
                    if (resSortField === 'date') {
                        const parseD = (str, time) => {
                            if (!str) return new Date(0);
                            const p = str.split('.');
                            if (p.length !== 3) return new Date(0);
                            const t = (time || '00:00').replace(' Uhr','').trim();
                            return new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T${t}`);
                        };
                        valA = parseD(a.date, a.start_time);
                        valB = parseD(b.date, b.start_time);
                    } else if (resSortField === 'guests') {
                        valA = parseInt(a.guests) || 0; 
                        valB = parseInt(b.guests) || 0;
                    } else {
                        valA = (a[resSortField] || '').toString().toLowerCase();
                        valB = (b[resSortField] || '').toString().toLowerCase();
                    }
                    return resSortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                } catch(e) { return 0; }
            });

            const totalRes = res.length;
            const totalPages = Math.ceil(totalRes / RES_PAGE_SIZE);
            const safePage = Math.max(1, Math.min(resPage, totalPages || 1));
            resPage = safePage;
            const paginated = res.slice((safePage - 1) * RES_PAGE_SIZE, safePage * RES_PAGE_SIZE);

            listContainer.innerHTML = `
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th onclick="window.setResSort('name')" style="cursor:pointer;">Gast</th>
                            <th onclick="window.setResSort('date')" style="cursor:pointer;">Zeitraum</th>
                            <th>Gäste</th>
                            <th>Status</th>
                            <th>Tische</th>
                            <th style="text-align:right;">Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paginated.map(r => `
                            <tr>
                                <td><strong>${r.name || 'Unbekannt'}</strong><br><small>${r.email || ''}</small></td>
                                <td><strong>${r.date || '---'}</strong><br><small>${r.start_time || ''} - ${r.end_time || ''}</small></td>
                                <td>${r.guests || 0}</td>
                                <td>
                                    <span style="font-weight:700; color:${r.status === 'Blocked' ? '#ef4444' : 'var(--primary)'};">
                                        ${r.status === 'Blocked' ? '<i class="fas fa-ban"></i> Gesperrt' : (r.status || 'Pending')}
                                    </span>
                                </td>
                                <td><small>${(Array.isArray(r.assigned_tables) ? r.assigned_tables : []).map(tid => tid.startsWith('C') ? 'Combo ' + tid.substring(1) : tid).join(', ') || '<i style="opacity:.5;">Keine</i>'}</small></td>
                                <td style="text-align:right;">
                                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                                        <button class="btn-edit" onclick="window.assignTable(${r.id})" title="Tisch zuweisen" style="background:rgba(255,255,255,0.1); border:none;"><i class="fas fa-chair"></i></button>
                                        <button class="btn-edit" onclick="window.editRes(${r.id})" title="Bearbeiten"><i class="fas fa-pen"></i></button>
                                        
                                        <!-- Actions -->
                                        ${r.status !== 'Confirmed' ? `
                                            <button class="btn-edit action-btn-green" onclick="window.updateResStatus(${r.id}, 'Confirmed')" title="Akzeptieren"><i class="fas fa-check"></i></button>
                                        ` : `
                                            <button class="btn-edit action-btn-gray" onclick="window.markNoShow(${r.id})" title="No-Show markieren" style="background:rgba(107,114,128,0.15); color:#6b7280;">
                                                <i class="fas fa-user-slash"></i>
                                            </button>
                                        `}
                                        
                                        ${r.status !== 'Cancelled' ? `
                                            <button class="btn-edit action-btn-yellow" onclick="window.cancelRes(${r.id})" title="Stornieren mit Grund"><i class="fas fa-undo"></i></button>
                                        ` : ''}
                                        
                                        <button class="btn-edit action-btn-red" onclick="window.deleteRes(${r.id})" title="Löschen (Permanent)"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${res.length === 0 ? '<div style="padding:60px;text-align:center;opacity:.5;"><h3>Keine passenden Reservierungen</h3></div>' : ''}
                
                ${totalPages > 1 ? `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; font-size:.82rem; opacity:.7;">
                    <span>${(safePage-1)*RES_PAGE_SIZE+1}–${Math.min(safePage*RES_PAGE_SIZE, totalRes)} von ${totalRes} Einträgen</span>
                    <div style="display:flex; gap:6px;">
                        <button onclick="window.resGoToPage(${safePage-1})" ${safePage <= 1 ? 'disabled' : ''} style="padding:4px 12px; border-radius:8px; border:none; cursor:pointer;">‹</button>
                        <span style="padding:4px 12px;">Seite ${safePage} / ${totalPages}</span>
                        <button onclick="window.resGoToPage(${safePage+1})" ${safePage >= totalPages ? 'disabled' : ''} style="padding:4px 12px; border-radius:8px; border:none; cursor:pointer;">›</button>
                    </div>
                </div>` : ''}
            `;
        } catch (err) {
            console.error('Error in refreshList:', err);
            container.querySelector('#res-list-container').innerHTML = `<div class="alert error">Fehler beim Laden der Liste: ${err.message}</div>`;
        }
    };

    // Attach Event Handlers (BEFORE first refreshList to ensure responsiveness)
    container.querySelector('#res-search').oninput = (e) => { resFilterText = e.target.value; resPage = 1; refreshList(); };
    container.querySelector('#res-status-filter').onchange = (e) => { resFilterStatus = e.target.value; resPage = 1; refreshList(); };
    container.querySelector('#res-date-filter').onchange = (e) => { resFilterDate = e.target.value; resPage = 1; refreshList(); };
    container.querySelector('#res-reset-filters').onclick = () => { 
        resFilterText = ''; resFilterStatus = 'All'; resFilterDate = ''; resPage = 1;
        renderReservations(container, titleEl); 
    };
    container.querySelector('#btn-manual-res').onclick = () => showManualResModal(container, titleEl);

    // Initial Render
    refreshList();

    // Global Hooks
    window.setResSort = (field) => { 
        if (resSortField === field) resSortOrder = resSortOrder === 'asc' ? 'desc' : 'asc';
        else { resSortField = field; resSortOrder = 'asc'; }
        refreshList();
    };

    window.resGoToPage = (p) => { resPage = p; refreshList(); };

    window.markNoShow = async (id) => {
        const ok = await showConfirm('No-Show markieren', 'Gast ist nicht erschienen. Als No-Show markieren?');
        if (!ok) return;
        const result = await apiPut(`reservations/${id}`, { status: 'No-Show' });
        if (result.success) {
            showToast('Als No-Show markiert.', 'warning');
            const activeItem = document.querySelector('.nav-item.active') || document.querySelector('.nav-subitem.active');
            if (activeItem) activeItem.click();
        }
    };
}

let archiveSearch = '';
let archiveDateFrom = '';
let archiveDateTo = '';

export async function renderArchive(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-archive"></i> Archiv';
    
    if (!archiveDateFrom) {
        const now = new Date();
        archiveDateFrom = new Date(now.getFullYear(), now.getMonth(), 2).toISOString().split('T')[0];
        archiveDateTo = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];
    }

    const resRaw = await apiGet('reservations') || [];
    const now = new Date();
    now.setHours(0,0,0,0);

    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div style="margin-bottom:30px;">
                <h3>Reservierungs-Archiv</h3>
                <p style="color:var(--text-muted); font-size:.85rem;">Historische Daten durchsuchen und verwalten.</p>
            </div>

            <div style="display:flex; gap:15px; margin-bottom:40px; padding:20px; background:rgba(255,255,255,0.2); border-radius:20px; border:1px solid rgba(0,0,0,0.05); align-items:center; flex-wrap:wrap;">
                <div style="flex:1; min-width:250px; position:relative;">
                    <i class="fas fa-search" style="position:absolute; left:15px; top:50%; transform:translateY(-50%); opacity:.3;"></i>
                    <input type="text" id="arc-search" class="input-styled" style="padding-left:45px;" placeholder="Mustermann, E-Mail oder Tel..." value="${archiveSearch}">
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:.7rem; font-weight:800; text-transform:uppercase; opacity:.5;">Zeitraum:</span>
                    <input type="date" id="arc-from" class="input-styled" style="width:160px;" value="${archiveDateFrom}">
                    <span style="opacity:.4;">bis</span>
                    <input type="date" id="arc-to" class="input-styled" style="width:160px;" value="${archiveDateTo}">
                </div>
                <button class="btn-secondary" id="arc-reset" style="width:48px; height:48px; padding:0; display:flex; align-items:center; justify-content:center;"><i class="fas fa-undo"></i></button>
            </div>

            <div id="archive-list-container" class="accordion-list"></div>
        </div>
    `;

    const refreshArchive = () => {
        try {
            const listContainer = container.querySelector('#archive-list-container');
            if (!listContainer) return;

            const parseD = (str) => {
                if (!str) return new Date(0);
                const p = str.split('.');
                if (p.length !== 3) return new Date(0);
                return new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}T00:00:00`);
            };

            let archive = (resRaw || []).filter(r => {
                const rDate = parseD(r.date);
                return r.status === 'Cancelled' || r.status === 'No-Show' || rDate < now;
            });

            if (archiveSearch) {
                const s = archiveSearch.toLowerCase();
                archive = archive.filter(r => 
                    (r.name || '').toLowerCase().includes(s) || 
                    (r.email || '').toLowerCase().includes(s) || 
                    (r.phone || '').includes(s)
                );
            }

            if (archiveDateFrom && archiveDateTo) {
                const dFrom = new Date(archiveDateFrom);
                const dTo = new Date(archiveDateTo);
                dTo.setHours(23,59,59,999); 
                archive = archive.filter(r => {
                    const rd = parseD(r.date);
                    return rd >= dFrom && rd <= dTo;
                });
            }

            const grouped = {};
            archive.forEach(r => {
                const dStr = r.date || 'Unbekannt';
                if (!grouped[dStr]) grouped[dStr] = [];
                grouped[dStr].push(r);
            });

            const sortedDates = Object.keys(grouped).sort((a,b) => {
                const da = parseD(a);
                const db = parseD(b);
                return db - da;
            });

            listContainer.innerHTML = sortedDates.map(date => `
                <div class="accordion-item glass-panel" style="margin-bottom:15px; background:rgba(255,255,255,0.15); border-radius:16px; overflow:hidden;">
                    <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')" style="padding:20px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:rgba(255,255,255,0.2);">
                        <h4 style="margin:0;"><i class="fas fa-calendar-day"></i> ${date} <small style="margin-left:10px; opacity:.5;">(${grouped[date].length} Reservierungen)</small></h4>
                        <i class="fas fa-chevron-down toggle-icon" style="transition:transform 0.3s ease;"></i>
                    </div>
                    <div class="accordion-content" style="padding:0 20px 20px 20px; display:none;">
                        <table class="premium-table small" style="box-shadow:none; border:none; margin-top:10px;">
                            <thead>
                                <tr>
                                    <th>Gast</th><th>Uhrzeit</th><th>Gäste</th><th>Status</th><th style="text-align:right;">Info</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${grouped[date].map(r => `
                                    <tr>
                                        <td><strong>${r.name || '---'}</strong><br><small>${r.email || ''}</small></td>
                                        <td>${r.start_time || '---'}</td>
                                        <td>${r.guests || 0}</td>
                                        <td><span class="status-badge ${r.status?.toLowerCase() || 'pending'}" style="font-weight:700; color:${r.status === 'Cancelled' ? '#ef4444' : 'inherit'};">${r.status || 'Pending'}</span></td>
                                        <td style="text-align:right;"><i class="fas fa-info-circle" title="${(r.note || 'Keine Notiz').replace(/"/g, '&quot;')}" style="cursor:help; opacity:.5;"></i></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `).join('');

            if (archive.length === 0) {
                listContainer.innerHTML = '<div style="padding:60px;text-align:center;opacity:.5;"><h3>Keine Archiv-Einträge gefunden</h3></div>';
            }
        } catch (err) {
            console.error('Error in refreshArchive:', err);
            container.querySelector('#archive-list-container').innerHTML = `<div class="alert error">Archiv konnte nicht geladen werden: ${err.message}</div>`;
        }
    };

    // Attach Event Handlers (BEFORE first refreshArchive)
    container.querySelector('#arc-search').oninput = (e) => { archiveSearch = e.target.value; refreshArchive(); };
    container.querySelector('#arc-from').onchange = (e) => { archiveDateFrom = e.target.value; refreshArchive(); };
    container.querySelector('#arc-to').onchange = (e) => { archiveDateTo = e.target.value; refreshArchive(); };
    container.querySelector('#arc-reset').onclick = () => { 
        archiveSearch = ''; archiveDateFrom = ''; archiveDateTo = ''; 
        renderArchive(container, titleEl); 
    };

    // Initial Render
    refreshArchive();
}

window.updateResStatus = async (id, status) => {
    const result = await apiPut(`reservations/${id}`, { status });
    if (result.success) {
        showToast(`Status auf ${status} geändert.`);
        const activeItem = document.querySelector('.nav-item.active') || document.querySelector('.nav-subitem.active');
        if (activeItem) activeItem.click();
    }
};

window.cancelRes = async (id) => {
    const reason = await showPrompt('Reservierung stornieren', 'Bitte gib einen Grund für die Stornierung ein (optional):');
    if (reason === null) return; // Cancelled by user
    
    // Update status and append reason to notes
    const resRaw = await apiGet('reservations') || [];
    const res = resRaw.find(r => r.id === id);
    if (!res) return;

    const newNote = res.note ? `${res.note}\n--- STORNO-GRUND: ${reason || 'Kein Grund angegeben'}` : `STORNO-GRUND: ${reason || 'Kein Grund angegeben'}`;
    const result = await apiPut(`reservations/${id}`, { status: 'Cancelled', note: newNote });
    
    if (result.success) {
        showToast('Reservierung storniert.');
        const activeItem = document.querySelector('.nav-item.active') || document.querySelector('.nav-subitem.active');
        if (activeItem) activeItem.click();
    }
};

window.deleteRes = async (id) => {
    const ok = await showConfirm('Reservierung löschen', 'Möchtest du diese Reservierung wirklich unwiderruflich löschen?');
    if (!ok) return;

    const result = await apiDelete(`reservations/${id}`);
    if (result.success) {
        showToast('Reservierung gelöscht.');
        const activeItem = document.querySelector('.nav-item.active') || document.querySelector('.nav-subitem.active');
        if (activeItem) activeItem.click();
    }
};

function escVal(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.editRes = async (id) => {
    const resRaw = await apiGet('reservations') || [];
    const res = resRaw.find(r => r.id === id);
    if (!res) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:600px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px;">
                <h3>Reservierung bearbeiten</h3>
                <span class="badge" style="background:rgba(0,0,0,0.05); color:var(--text-muted);">ID: ${res.id}</span>
            </div>
            
            <div class="form-grid">
                <div class="form-group"><label>Name</label><input type="text" id="er-name" class="input-styled" value="${escVal(res.name)}"></div>
                <div class="form-group"><label>Personen</label><input type="number" id="er-guests" class="input-styled" value="${escVal(res.guests)}"></div>
                <div class="form-group"><label>Datum</label><input type="text" id="er-date" class="input-styled" value="${escVal(res.date)}" placeholder="DD.MM.YYYY"></div>
                <div class="form-group"><label>Uhrzeit</label><input type="text" id="er-time" class="input-styled" value="${escVal(res.start_time)}" placeholder="HH:mm"></div>
                <div class="form-group full"><label>E-Mail</label><input type="email" id="er-email" class="input-styled" value="${escVal(res.email)}"></div>
                <div class="form-group full"><label>Notizen</label><textarea id="er-note" class="input-styled" style="height:100px;">${escVal(res.note || '')}</textarea></div>
            </div>

            <div class="modal-actions" style="margin-top:30px; display:flex; justify-content:flex-end; gap:12px;">
                <button class="btn-secondary" id="btn-er-cancel">Abbrechen</button>
                <button class="btn-primary" id="btn-er-save"><i class="fas fa-save"></i> Speichern</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#btn-er-cancel').onclick = () => modal.remove();
    modal.querySelector('#btn-er-save').onclick = async () => {
        const update = {
            name: modal.querySelector('#er-name').value,
            guests: parseInt(modal.querySelector('#er-guests').value),
            date: modal.querySelector('#er-date').value,
            start_time: modal.querySelector('#er-time').value,
            email: modal.querySelector('#er-email').value,
            note: modal.querySelector('#er-note').value
        };

        const result = await apiPut(`reservations/${id}`, update);
        if (result.success) {
            showToast('Änderungen gespeichert.');
            modal.remove();
            const activeItem = document.querySelector('.nav-item.active') || document.querySelector('.nav-subitem.active');
            if (activeItem) activeItem.click();
        }
    };
};

async function showManualResModal(container, titleEl) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:550px;">
            <h3 style="margin-bottom:20px;">Manuelle Reservierung</h3>
            <div class="form-grid">
                <div class="form-group full"><label>Gast Name</label><input type="text" id="mr-name" class="input-styled" placeholder="Name des Gastes"></div>
                <div class="form-group"><label>E-Mail</label><input type="email" id="mr-email" class="input-styled" placeholder="gast@email.de"></div>
                <div class="form-group"><label>Telefon</label><input type="text" id="mr-phone" class="input-styled" placeholder="0176..."></div>
                <div class="form-group"><label>Personen</label><input type="number" id="mr-guests" class="input-styled" value="2"></div>
                <div class="form-group"><label>Uhrzeit</label><input type="time" id="mr-time" class="input-styled" value="18:00"></div>
                <div class="form-group full"><label>Datum</label><input type="date" id="mr-date" class="input-styled" value="${new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group full"><label>Notiz (intern)</label><textarea id="mr-note" class="input-styled" style="height:80px;" placeholder="Besondere Wünsche..."></textarea></div>
            </div>
            <div class="modal-actions" style="margin-top:30px; display:flex; justify-content:flex-end; gap:10px;">
                <button class="btn-secondary" id="mr-cancel">Abbrechen</button>
                <button class="btn-primary" id="mr-save">Reservierung anlegen</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#mr-cancel').onclick = () => modal.remove();
    modal.querySelector('#mr-save').onclick = async () => {
        const rawDate = modal.querySelector('#mr-date').value; // YYYY-MM-DD
        const date = rawDate.split('-').reverse().join('.'); // DD.MM.YYYY
        
        const data = {
            name: modal.querySelector('#mr-name').value,
            email: modal.querySelector('#mr-email').value,
            phone: modal.querySelector('#mr-phone').value,
            guests: parseInt(modal.querySelector('#mr-guests').value),
            time: modal.querySelector('#mr-time').value,
            date: date,
            note: modal.querySelector('#mr-note').value,
            status: 'Confirmed'
        };

        if (!data.name) return showToast('Bitte Namen eingeben', 'error');

        const res = await apiPost('reservations/submit', data);
        if (res.success) {
            showToast('Manuelle Reservierung angelegt.');
            modal.remove();
            renderReservations(container, titleEl);
        } else {
            showToast(res.reason || 'Fehler beim Anlegen', 'error');
        }
    };
}

window.assignTable = async (id) => {
    const list = await apiGet('reservations') || [];
    const res = list.find(r => r.id === id);
    if (!res) return;

    // Fetch availability for this specific slot
    const check = await apiPost('reservations/check', {
        date: res.date,
        time: res.start_time,
        guests: res.guests
    });

    const tables = await apiGet('tables') || [];
    const currentAssigned = Array.isArray(res.assigned_tables) ? res.assigned_tables : [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:500px;">
            <h3>Tischzuweisung</h3>
            <p style="font-size:.8rem; margin-bottom:20px; opacity:.7;">
                ${res.name} (B-ID: ${res.id})<br>
                ${res.date} | ${res.start_time} - ${res.end_time} | ${res.guests} Gäste
            </p>
            
            <div style="margin-bottom:20px; max-height:400px; overflow-y:auto; padding-right:10px;">
                <label style="display:block; margin-bottom:10px; font-weight:700; font-size:.8rem;">Verfügbare Tische & Kombinationen:</label>
                <div id="table-selection-list" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    ${tables.map(t => {
                        const isAssigned = currentAssigned.includes(t.id);
                        const isAvailable = check.success && check.tables.includes(t.id);
                        const label = t.id.startsWith('C') ? 'Combo ' + t.name : 'Tisch ' + t.name;
                        
                        return `
                            <div class="table-opt" data-id="${t.id}" style="
                                padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.1); 
                                background: ${isAssigned ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'};
                                border-color: ${isAssigned ? 'var(--primary)' : 'rgba(255,255,255,0.1)'};
                                cursor:pointer; display:flex; justify-content:space-between; align-items:center;
                                opacity: ${isAvailable || isAssigned ? '1' : '.4'};
                            ">
                                <div>
                                    <div style="font-weight:700;">${label}</div>
                                    <div style="font-size:10px; opacity:.7;">Kapazität: ${t.capacity}</div>
                                </div>
                                <div class="opt-indicator">
                                    ${isAssigned ? '<i class="fas fa-check-circle" style="color:var(--primary);"></i>' : ''}
                                    ${!isAvailable && !isAssigned ? '<i class="fas fa-clock" title="Voraussichtlich belegt" style="opacity:.3;"></i>' : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:10px;">
                <button class="btn-secondary" id="assign-cancel">Abbrechen</button>
                <button class="btn-primary" id="assign-save">Speichern</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const selectedIds = new Set(currentAssigned);
    modal.querySelectorAll('.table-opt').forEach(opt => {
        opt.onclick = () => {
            const id = opt.dataset.id;
            const indicator = opt.querySelector('.opt-indicator');
            if (selectedIds.has(id)) {
                selectedIds.delete(id);
                opt.style.background = 'rgba(255,255,255,0.05)';
                opt.style.borderColor = 'rgba(255,255,255,0.1)';
                indicator.innerHTML = '';
            } else {
                selectedIds.add(id);
                opt.style.background = 'rgba(99,102,241,0.2)';
                opt.style.borderColor = 'var(--primary)';
                indicator.innerHTML = '<i class="fas fa-check-circle" style="color:var(--primary);"></i>';
            }
        };
    });

    modal.querySelector('#assign-cancel').onclick = () => modal.remove();
    modal.querySelector('#assign-save').onclick = async () => {
        const result = await apiPut(`reservations/${res.id}`, { assigned_tables: Array.from(selectedIds) });
        if (result.success) {
            showToast('Tische erfolgreich zugewiesen.');
            modal.remove();
            const activeItem = document.querySelector('.nav-item.active') || document.querySelector('.nav-subitem.active');
            if (activeItem) activeItem.click();
        }
    };
};

