/**
 * Visual Table Planner Module for Grieche-CMS
 */

import { apiGet, apiPost } from './api.js';
import { showToast, showConfirm, showPrompt } from './utils.js';

let state = {
    areas: [],
    tables: {},
    combined: {},
    decors: {},
    currentView: 'all',
    roomEditMode: false,
    activeTool: null,
    selectedDecor: null,
    snapEnabled: true,
    reservations: [],
    selectedTableIds: [],
    isDirty: false
};

const SNAP = 20;
let ptr = { mode: null };
let combineMode = false;

export async function renderTablePlanner(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-th"></i> Visueller Tischplaner';

    const plan         = await apiGet('table-plan');
    const reservations = await apiGet('reservations');

    state.areas        = plan.areas    || [];
    state.tables       = plan.tables   || {};
    state.combined     = plan.combined || {};
    state.decors       = plan.decors   || {};
    state.reservations = reservations  || [];

    buildLayout(container);
    renderAll();
    updateStats();
}

// ─── Layout ────────────────────────────────────────────────────────────────
function buildLayout(container) {
    container.innerHTML = `
    <div class="planner-container">

        <!-- Compact Sidebar -->
        <aside class="planner-sidebar" id="planner-sidebar" style="width:220px; min-width:220px; display:flex; flex-direction:column; gap:0; padding:0; overflow:hidden;">

            <!-- Tab Header -->
            <div style="display:flex; border-bottom:1px solid rgba(0,0,0,0.08); background:rgba(255,255,255,0.3);">
                <button class="ptab-btn active" data-tab="overview" style="flex:1; padding:12px 4px; border:none; background:none; cursor:pointer; font-size:11px; font-weight:700; color:var(--primary);">📊 Status</button>
                <button class="ptab-btn" data-tab="add"      style="flex:1; padding:12px 4px; border:none; background:none; cursor:pointer; font-size:11px; font-weight:600; color:#666;">➕ Tisch</button>
                <button class="ptab-btn" data-tab="layout"   style="flex:1; padding:12px 4px; border:none; background:none; cursor:pointer; font-size:11px; font-weight:600; color:#666;">🛠 Layout</button>
            </div>

            <!-- Tab: Status/Overview -->
            <div class="ptab-panel" id="ptab-overview" style="flex:1; padding:16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
                
                <!-- Live Status -->
                <div style="background:rgba(255,255,255,0.4); border-radius:12px; padding:12px;">
                    <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; margin-bottom:10px;">Live Status</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:12px; border-bottom:1px solid rgba(0,0,0,0.05);"><span>🟢 Frei</span> <span class="badge badge-free" id="stat-free" style="font-size:11px;">0</span></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:12px; border-bottom:1px solid rgba(0,0,0,0.05);"><span>🟡 Reserviert</span> <span class="badge badge-res" id="stat-res" style="font-size:11px;">0</span></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:12px;"><span>🔴 Belegt</span> <span class="badge badge-occ" id="stat-occ" style="font-size:11px;">0</span></div>
                </div>

                <!-- Bereiche -->
                <div style="background:rgba(255,255,255,0.4); border-radius:12px; padding:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8;">Bereiche</span>
                        <button class="btn-edit" id="btn-add-area" style="font-size:10px; padding:3px 8px;"><i class="fas fa-plus"></i></button>
                    </div>
                    <div id="area-list"></div>
                </div>

                <!-- Speichern -->
                <button class="btn-premium" id="btn-save-plan" style="width:100%; margin-top:auto;"><i class="fas fa-save"></i> Speichern</button>
            </div>

            <!-- Tab: Tisch hinzufügen -->
            <div class="ptab-panel" id="ptab-add" style="flex:1; padding:16px; display:none; flex-direction:column; gap:10px;">
                <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; margin-bottom:4px;">Neuen Tisch hinzufügen</div>

                <div class="form-group">
                    <label style="font-size:10px;">Bereich</label>
                    <select id="add-area-sel" class="input-styled" style="font-size:12px;"></select>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    <div class="form-group">
                        <label style="font-size:10px;">Nummer</label>
                        <input id="add-num" class="input-styled" placeholder="z.B. 5" style="font-size:12px;">
                    </div>
                    <div class="form-group">
                        <label style="font-size:10px;">Plätze</label>
                        <input id="add-seats" type="number" class="input-styled" value="4" style="font-size:12px;">
                    </div>
                </div>
                <div class="form-group">
                    <label style="font-size:10px;">Form</label>
                    <select id="add-shape" class="input-styled" style="font-size:12px;">
                        <option value="square">Quadrat</option>
                        <option value="rect-h">Rechteck ↔</option>
                        <option value="rect-v">Rechteck ↕</option>
                        <option value="round">Rund</option>
                    </select>
                </div>

                <button class="btn-primary" id="btn-add-table" style="width:100%; margin-top:8px;"><i class="fas fa-plus"></i> Tisch hinzufügen</button>

                <!-- Tische kombinieren -->
                <div style="border-top:1px solid rgba(0,0,0,0.08); padding-top:12px; margin-top:4px;">
                    <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; margin-bottom:8px;">Tische verbinden</div>
                    <button class="btn-secondary" id="btn-toggle-select" style="width:100%; font-size:12px;">🖱️ Auswahl-Modus</button>
                    <div id="selection-tools" style="display:none; margin-top:8px;">
                        <p style="font-size:11px; color:#64748b; margin-bottom:8px;">Klicke mehrere Tische an, dann verbinden.</p>
                        <button class="btn-primary" id="btn-combine-selected" style="width:100%; font-size:12px;" disabled>🔗 Verbinden</button>
                    </div>
                </div>
            </div>

            <!-- Tab: Layout -->
            <div class="ptab-panel" id="ptab-layout" style="flex:1; padding:16px; display:none; flex-direction:column; gap:10px;">
                <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; margin-bottom:4px;">Raum-Layout</div>

                <button class="btn-secondary" id="btn-toggle-edit" style="width:100%; font-size:12px;">✏️ Layout-Modus aktivieren</button>

                <div id="edit-tools" style="display:none; margin-top:4px;">
                    <div style="font-size:10px; font-weight:700; color:#64748b; margin-bottom:8px;">Dekoration zeichnen:</div>
                    <div class="tool-grid">
                        <button class="tool-btn" data-tool="wall"><i class="fas fa-border-all"></i>Wand</button>
                        <button class="tool-btn" data-tool="window"><i class="fas fa-window-maximize"></i>Fenster</button>
                        <button class="tool-btn" data-tool="door"><i class="fas fa-door-open"></i>Tür</button>
                        <button class="tool-btn" data-tool="plant"><i class="fas fa-leaf"></i>Pflanze</button>
                    </div>
                </div>

                <div style="border-top:1px solid rgba(0,0,0,0.08); padding-top:12px; margin-top:4px;">
                    <div style="font-size:10px; font-weight:700; color:#64748b; margin-bottom:6px;">Snap-Raster</div>
                    <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                        <input type="checkbox" id="snap-toggle" checked style="accent-color:var(--primary); width:14px; height:14px;">
                        Am Raster einrasten (${SNAP}px)
                    </label>
                </div>

                <button class="btn-premium" id="btn-save-plan-layout" style="width:100%; margin-top:auto;"><i class="fas fa-save"></i> Plan speichern</button>
            </div>

        </aside>

        <!-- Canvas Area -->
        <main class="planner-main">
            <header class="planner-header" id="planner-tabs"></header>
            <div class="planner-content" id="planner-content"></div>
        </main>
    </div>`;

    // Tab switching
    container.querySelectorAll('.ptab-btn').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('.ptab-btn').forEach(b => {
                b.classList.remove('active');
                b.style.color = '#666';
                b.style.fontWeight = '600';
            });
            btn.classList.add('active');
            btn.style.color = 'var(--primary)';
            btn.style.fontWeight = '700';
            const tab = btn.dataset.tab;
            container.querySelectorAll('.ptab-panel').forEach(p => p.style.display = 'none');
            const panel = container.querySelector(`#ptab-${tab}`);
            if (panel) panel.style.display = 'flex';
        };
    });

    // Wire up controls
    container.querySelector('#btn-save-plan').onclick        = savePlan;
    container.querySelector('#btn-save-plan-layout').onclick = savePlan;
    container.querySelector('#btn-toggle-edit').onclick      = toggleEditMode;
    container.querySelector('#btn-toggle-select').onclick    = toggleCombineMode;
    container.querySelector('#btn-add-table').onclick        = addNewTable;
    container.querySelector('#btn-add-area').onclick         = () => showAreaModal();
    container.querySelector('#btn-combine-selected').onclick = combineSelected;
    container.querySelector('#snap-toggle').onchange        = (e) => { state.snapEnabled = e.target.checked; };

    container.querySelectorAll('.tool-btn').forEach(btn => {
        btn.onclick = () => selectTool(btn.dataset.tool);
    });

    window.addEventListener('beforeunload', (e) => {
        if (state.isDirty) { e.preventDefault(); e.returnValue = ''; }
    });

    buildAreaTabs();
    buildAreaSideList();
}

// ─── Area Tabs (top of canvas) ──────────────────────────────────────────────
function buildAreaTabs() {
    const tabs = document.getElementById('planner-tabs');
    if (!tabs) return;
    tabs.innerHTML = `<div class="nav-subitem ${state.currentView === 'all' ? 'active' : ''}" onclick="window.switchPlannerView('all')">Alle</div>`;
    state.areas.forEach(a => {
        tabs.innerHTML += `<div class="nav-subitem ${state.currentView === a.id ? 'active' : ''}" onclick="window.switchPlannerView('${a.id}')">${a.icon || ''} ${a.name}</div>`;
    });
    tabs.innerHTML += `<div style="margin-left:auto; border-left:1px solid rgba(0,0,0,0.05); padding-left:15px; display:flex; align-items:center;">` +
                      `<div class="nav-subitem" onclick="window.switchTab('tables', 'qrcodes')" style="font-size:11px; opacity:.7;"><i class="fas fa-qrcode"></i> QR-Codes</div>` +
                      `</div>`;
    window.switchPlannerView = (v) => {
        state.currentView = v;
        buildAreaTabs();
        renderAll();
    };
}

function buildAreaSideList() {
    const list = document.getElementById('area-list');
    const sel  = document.getElementById('add-area-sel');
    if (!list) return;
    list.innerHTML = '';
    if (sel) sel.innerHTML = '';
    state.areas.forEach(a => {
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; font-size:12px; border-bottom:1px solid rgba(0,0,0,0.05);">
                <span>${a.icon || '🏠'} ${a.name}</span>
                <button class="btn-edit" onclick="window.editArea('${a.id}')" style="font-size:10px; padding:3px 8px;"><i class="fas fa-edit"></i></button>
            </div>`;
        if (sel) sel.innerHTML += `<option value="${a.id}">${a.name}</option>`;
    });
    window.editArea = (id) => showAreaModal(id);
}

// ─── Canvas Rendering ──────────────────────────────────────────────────────
function renderAll() {
    const content = document.getElementById('planner-content');
    if (!content) return;
    content.innerHTML = '';
    state.areas.forEach(a => {
        if (state.currentView !== 'all' && state.currentView !== a.id) return;
        const wrap = document.createElement('div');
        wrap.className = 'planner-plan-wrapper';
        wrap.style.width = a.w + 'px';
        wrap.innerHTML = `
            <div class="planner-plan-title">
                <span>${a.icon || ''} ${a.name}</span>
                <span style="opacity:.4;">${a.w} x ${a.h}</span>
            </div>
            <div class="planner-canvas" id="canvas-${a.id}" style="width:${a.w}px; height:${a.h}px;">
                <div class="draw-preview" id="preview-${a.id}" style="display:none; position:absolute; border:2px dashed var(--primary); background:rgba(99,102,241,0.1); pointer-events:none; z-index:100;"></div>
                ${state.roomEditMode ? `<div class="resize-handle" id="resize-${a.id}"></div>` : ''}
            </div>`;
        content.appendChild(wrap);
        renderTables(a.id);
        renderDecors(a.id);
        const canvas = wrap.querySelector('.planner-canvas');
        canvas.onmousedown = (e) => onCanvasDown(e, a.id);
        if (state.roomEditMode) {
            const res = wrap.querySelector(`#resize-${a.id}`);
            if (res) res.onmousedown = (e) => onResizeDown(e, a.id);
        }
    });
}

function renderTables(areaId) {
    const canvas = document.getElementById(`canvas-${areaId}`);
    if (!canvas) return;
    canvas.querySelectorAll('.table-el').forEach(el => el.remove());
    canvas.querySelectorAll('.combo-container').forEach(el => el.remove());
    const tables = state.tables[areaId] || [];
    tables.forEach(t => {
        if (t.hidden) return;
        const status     = getLiveStatus(t.id, areaId);
        const isSelected = state.selectedTableIds.includes(t.id);
        const activeRes  = getActiveReservation(t.id, areaId);
        const guestHint  = activeRes ? `<div class="t-guest">${activeRes.name.split(' ')[0]}</div>` : '';
        const el = document.createElement('div');
        el.className = `table-el t-${status} ${t.shape === 'round' ? 'round' : ''} ${isSelected ? 'selected' : ''}`;
        el.style.cssText = `left:${t.x}px; top:${t.y}px; width:${t.w}px; height:${t.h}px;`;
        el.innerHTML = `<div class="t-num">${t.num}</div><div class="t-seats">${t.seats} Pl.</div>${guestHint}${isSelected ? '<div style="position:absolute;top:-10px;right:-10px;background:var(--primary);color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;"><i class="fas fa-check"></i></div>' : ''}`;
        el.onmousedown = (e) => onTableDown(e, t, areaId);
        el.onclick = (e) => {
            e.stopPropagation();
            if (Math.abs(e.clientX - (ptr.startX || 0)) < 5) {
                if (combineMode) {
                    if (isSelected) state.selectedTableIds = state.selectedTableIds.filter(id => id !== t.id);
                    else state.selectedTableIds.push(t.id);
                    renderTables(areaId);
                    updateSelectionButtons();
                } else {
                    showTableInfo(t, areaId);
                }
            }
        };
        el.ondblclick = (e) => { e.stopPropagation(); if (!combineMode) showTableEditModal(t, areaId); };
        canvas.appendChild(el);
    });
    const combined = state.combined[areaId] || [];
    combined.forEach(c => {
        const memberTables = tables.filter(t => c.tableIds.includes(t.id));
        if (memberTables.length < 2) return;
        const minX = Math.min(...memberTables.map(t => t.x));
        const minY = Math.min(...memberTables.map(t => t.y));
        const maxX = Math.max(...memberTables.map(t => t.x + t.w));
        const maxY = Math.max(...memberTables.map(t => t.y + t.h));
        const pad = 10;
        const el = document.createElement('div');
        el.className = `combo-container combo-${getLiveStatus('C' + c.id, areaId)}`;
        el.style.cssText = `left:${minX - pad}px; top:${minY - pad}px; width:${maxX - minX + pad * 2}px; height:${maxY - minY + pad * 2}px;`;
        el.innerHTML = `<div class="combo-label">${c.num} (${c.seats} Pl.)</div><button class="combo-unlink" onclick="window.unlinkCombo(${c.id}, '${areaId}')"><i class="fas fa-unlink"></i></button>`;
        canvas.appendChild(el);
    });
}

function renderDecors(areaId) {
    const canvas = document.getElementById(`canvas-${areaId}`);
    if (!canvas) return;
    canvas.querySelectorAll('.dec').forEach(el => el.remove());
    const decs = state.decors[areaId] || [];
    decs.forEach(d => {
        const el = document.createElement('div');
        el.className = 'dec';
        el.style.cssText = `left:${d.x}px; top:${d.y}px; width:${d.w}px; height:${d.h}px;`;
        const inner = document.createElement('div');
        inner.className = `dec-inner dec-${d.type}`;
        if (d.type === 'plant') inner.innerHTML = '🌿';
        el.appendChild(inner);
        if (state.roomEditMode) {
            el.style.pointerEvents = 'all';
            el.onmousedown = (e) => onDecorDown(e, d, areaId);
        }
        canvas.appendChild(el);
    });
}

// ─── Status Helpers ─────────────────────────────────────────────────────────
function getLiveStatus(tableId, areaId) {
    const now     = new Date();
    const curTime = now.getHours() * 60 + now.getMinutes();
    const curDate = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
    const isBlocked = (r) => {
        if (r.assigned_tables.includes(tableId)) return true;
        if (tableId.startsWith('C')) {
            const cid   = parseInt(tableId.substring(1));
            const combo = (state.combined[areaId] || []).find(c => c.id === cid);
            if (combo && combo.tableIds.some(tid => r.assigned_tables.includes(tid))) return true;
        }
        const parentCombo = (state.combined[areaId] || []).find(c => c.tableIds.includes(tableId));
        if (parentCombo && r.assigned_tables.includes('C' + parentCombo.id)) return true;
        return false;
    };
    const res = state.reservations.find(r => r.date === curDate && r.status !== 'Cancelled' && isBlocked(r) && isTimeInRange(curTime, r.start_time, r.end_time));
    if (res) return 'occupied';
    const future = state.reservations.find(r => r.date === curDate && r.status !== 'Cancelled' && isBlocked(r) && parseTimeToMins(r.start_time) > curTime);
    if (future) return 'reserved';
    return 'free';
}

function getActiveReservation(tableId, areaId) {
    const now     = new Date();
    const curTime = now.getHours() * 60 + now.getMinutes();
    const curDate = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
    const isBlocked = (r) => {
        if (r.assigned_tables.includes(tableId)) return true;
        if (tableId.startsWith('C')) {
            const cid   = parseInt(tableId.substring(1));
            const combo = (state.combined[areaId] || []).find(c => c.id === cid);
            if (combo && combo.tableIds.some(tid => r.assigned_tables.includes(tid))) return true;
        }
        const parentCombo = (state.combined[areaId] || []).find(c => c.tableIds.includes(tableId));
        if (parentCombo && r.assigned_tables.includes('C' + parentCombo.id)) return true;
        return false;
    };
    const active = state.reservations.find(r => r.date === curDate && r.status !== 'Cancelled' && isBlocked(r) && isTimeInRange(curTime, r.start_time, r.end_time));
    if (active) return active;
    return state.reservations
        .filter(r => r.date === curDate && r.status !== 'Cancelled' && isBlocked(r) && parseTimeToMins(r.start_time) > curTime)
        .sort((a, b) => parseTimeToMins(a.start_time) - parseTimeToMins(b.start_time))[0] || null;
}

function getAllReservationsForTable(tableId, areaId) {
    const now     = new Date();
    const curDate = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
    const isBlocked = (r) => {
        if (r.assigned_tables.includes(tableId)) return true;
        if (tableId.startsWith('C')) {
            const cid   = parseInt(tableId.substring(1));
            const combo = (state.combined[areaId] || []).find(c => c.id === cid);
            if (combo && combo.tableIds.some(tid => r.assigned_tables.includes(tid))) return true;
        }
        const parentCombo = (state.combined[areaId] || []).find(c => c.tableIds.includes(tableId));
        if (parentCombo && r.assigned_tables.includes('C' + parentCombo.id)) return true;
        return false;
    };
    return state.reservations
        .filter(r => r.date === curDate && r.status !== 'Cancelled' && isBlocked(r))
        .sort((a, b) => parseTimeToMins(a.start_time) - parseTimeToMins(b.start_time));
}

function isTimeInRange(now, start, end) {
    return now >= parseTimeToMins(start) && now <= parseTimeToMins(end);
}

function parseTimeToMins(str) {
    if (!str) return 0;
    const [h, m] = str.replace(/[^0-9:]/g, '').split(':').map(Number);
    return h * 60 + (m || 0);
}

function statusLabel(s) {
    return { Confirmed: 'Bestätigt', Pending: 'Ausstehend', Inquiry: 'Anfrage', Blocked: 'Gesperrt' }[s] || s;
}

function statusColor(s) {
    return { Confirmed: '#059669', Pending: '#d97706', Inquiry: '#7c3aed', Blocked: '#64748b' }[s] || '#64748b';
}

// ─── Interaction ────────────────────────────────────────────────────────────
function onTableDown(e, t, areaId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    ptr = { mode: 'table', t, areaId, startX: e.clientX, startY: e.clientY, offX: e.clientX - t.x, offY: e.clientY - t.y };
    document.onmousemove = onGlobalMove;
    document.onmouseup   = onGlobalUp;
}

function onDecorDown(e, d, areaId) {
    if (e.button !== 0 || !state.roomEditMode) return;
    e.stopPropagation();
    ptr = { mode: 'decor', d, areaId, startX: e.clientX, startY: e.clientY, offX: e.clientX - d.x, offY: e.clientY - d.y };
    document.onmousemove = onGlobalMove;
    document.onmouseup   = onGlobalUp;
}

function onCanvasDown(e, areaId) {
    if (!state.roomEditMode || !state.activeTool) return;
    const canvas = document.getElementById(`canvas-${areaId}`);
    const rect = canvas.getBoundingClientRect();
    ptr = { mode: 'draw', areaId, tool: state.activeTool, startX: snap(e.clientX - rect.left), startY: snap(e.clientY - rect.top) };
    document.onmousemove = onGlobalMove;
    document.onmouseup   = onGlobalUp;
}

function onResizeDown(e, areaId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    ptr = { mode: 'room', areaId, startX: e.clientX, startY: e.clientY };
    document.onmousemove = onGlobalMove;
    document.onmouseup   = onGlobalUp;
}

function onGlobalMove(e) {
    if (!ptr.mode) return;
    if (ptr.mode === 'table') {
        ptr.t.x = snap(e.clientX - ptr.offX);
        ptr.t.y = snap(e.clientY - ptr.offY);
        state.isDirty = true;
        renderTables(ptr.areaId);
    } else if (ptr.mode === 'decor') {
        ptr.d.x = snap(e.clientX - ptr.offX);
        ptr.d.y = snap(e.clientY - ptr.offY);
        state.isDirty = true;
        renderDecors(ptr.areaId);
    } else if (ptr.mode === 'draw') {
        const canvas = document.getElementById(`canvas-${ptr.areaId}`);
        const rect   = canvas.getBoundingClientRect();
        const cx = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const cy = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
        const prev = document.getElementById(`preview-${ptr.areaId}`);
        if (prev) {
            prev.style.display = 'block';
            prev.style.left    = Math.min(ptr.startX, cx) + 'px';
            prev.style.top     = Math.min(ptr.startY, cy) + 'px';
            prev.style.width   = Math.abs(cx - ptr.startX) + 'px';
            prev.style.height  = Math.abs(cy - ptr.startY) + 'px';
        }
    } else if (ptr.mode === 'room') {
        const canvas = document.getElementById(`canvas-${ptr.areaId}`);
        const rect   = canvas.getBoundingClientRect();
        const a = state.areas.find(x => x.id === ptr.areaId);
        if (a) {
            a.w = snap(Math.max(300, e.clientX - rect.left));
            a.h = snap(Math.max(200, e.clientY - rect.top));
            canvas.style.width  = a.w + 'px';
            canvas.style.height = a.h + 'px';
            canvas.parentElement.style.width = a.w + 'px';
        }
    }
}

function onGlobalUp(e) {
    if (ptr.mode === 'draw') {
        const canvas = document.getElementById(`canvas-${ptr.areaId}`);
        const rect   = canvas.getBoundingClientRect();
        const prev   = document.getElementById(`preview-${ptr.areaId}`);
        if (prev) prev.style.display = 'none';
        const cx = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const cy = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
        const x = snap(Math.min(ptr.startX, cx)), y = snap(Math.min(ptr.startY, cy));
        const w = snap(Math.abs(cx - ptr.startX)),  h = snap(Math.abs(cy - ptr.startY));
        if (w > 10 && h > 4) {
            if (!state.decors[ptr.areaId]) state.decors[ptr.areaId] = [];
            state.decors[ptr.areaId].push({ id: Date.now(), type: ptr.tool, x, y, w, h });
            state.isDirty = true;
            renderDecors(ptr.areaId);
        }
    }
    ptr.mode = null;
    document.onmousemove = null;
    document.onmouseup   = null;
    updateStats();
}

function snap(v) {
    return state.snapEnabled ? Math.round(v / SNAP) * SNAP : v;
}

// ─── Actions ────────────────────────────────────────────────────────────────
async function savePlan() {
    const res = await apiPost('table-plan', { areas: state.areas, tables: state.tables, combined: state.combined, decors: state.decors });
    if (res.success) { state.isDirty = false; showToast('Planer gespeichert und synchronisiert'); }
}

function toggleEditMode() {
    state.roomEditMode = !state.roomEditMode;
    const btn = document.getElementById('btn-toggle-edit');
    document.getElementById('edit-tools').style.display = state.roomEditMode ? 'block' : 'none';
    if (btn) {
        btn.textContent = state.roomEditMode ? '✅ Layout-Modus aktiv' : '✏️ Layout-Modus aktivieren';
        btn.classList.toggle('btn-premium', state.roomEditMode);
    }
    renderAll();
}

function selectTool(tool) {
    state.activeTool = state.activeTool === tool ? null : tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === state.activeTool));
}

function addNewTable() {
    const areaId = document.getElementById('add-area-sel').value;
    const num    = document.getElementById('add-num').value.trim();
    const seats  = parseInt(document.getElementById('add-seats').value) || 4;
    const shape  = document.getElementById('add-shape').value;
    if (!num) return showToast('Bitte Tischnummer eingeben');
    if (!state.tables[areaId]) state.tables[areaId] = [];
    let w = 60, h = 60;
    if (shape === 'rect-h') { w = 100; h = 60; }
    if (shape === 'rect-v') { w = 60;  h = 100; }
    state.tables[areaId].push({ id: 'T' + Date.now(), num, seats, shape, x: 20, y: 20, w, h });
    state.isDirty = true;
    renderTables(areaId);
    updateStats();
    document.getElementById('add-num').value = '';
    showToast(`Tisch ${num} hinzugefügt`);
}

function toggleCombineMode() {
    combineMode = !combineMode;
    state.selectedTableIds = [];
    document.getElementById('selection-tools').style.display   = combineMode ? 'block' : 'none';
    const btn = document.getElementById('btn-toggle-select');
    if (btn) {
        btn.textContent = combineMode ? '❌ Auswahl beenden' : '🖱️ Auswahl-Modus';
        btn.classList.toggle('btn-premium', combineMode);
    }
    if (combineMode && state.roomEditMode) toggleEditMode();
    renderAll();
    updateSelectionButtons();
}

function updateSelectionButtons() {
    const btn = document.getElementById('btn-combine-selected');
    if (btn) btn.disabled = state.selectedTableIds.length < 2;
}

async function combineSelected() {
    if (state.selectedTableIds.length < 2) return;
    let areaId = null;
    const selectedTables = [];
    Object.keys(state.tables).forEach(aid => {
        state.tables[aid].forEach(t => {
            if (state.selectedTableIds.includes(t.id)) { areaId = aid; selectedTables.push(t); }
        });
    });
    if (!areaId) return;
    const defaultNum = selectedTables.map(t => t.num).join('+');
    const num = await showPrompt('Tischkombination', 'Neue Tischnummer für diese Kombination:', defaultNum);
    if (num === null) return;
    const id = Date.now();
    if (!state.combined[areaId]) state.combined[areaId] = [];
    state.combined[areaId].push({ id, num: num || defaultNum, seats: selectedTables.reduce((s, t) => s + t.seats, 0), tableIds: [...state.selectedTableIds] });
    state.isDirty = true;
    state.selectedTableIds = [];
    toggleCombineMode();
    renderAll();
    showToast(`Tischkombination ${num || defaultNum} erstellt.`);
}

window.unlinkCombo = (id, areaId) => {
    if (!state.combined[areaId]) return;
    state.combined[areaId] = state.combined[areaId].filter(c => c.id !== id);
    state.isDirty = true;
    renderTables(areaId);
    showToast('Kombination aufgehoben.');
};

function updateStats() {
    let free = 0, res = 0, occ = 0;
    Object.keys(state.tables).forEach(area => {
        state.tables[area].forEach(t => {
            const s = getLiveStatus(t.id, area);
            if (s === 'free') free++;
            else if (s === 'reserved') res++;
            else occ++;
        });
    });
    const sFree = document.getElementById('stat-free');
    const sRes  = document.getElementById('stat-res');
    const sOcc  = document.getElementById('stat-occ');
    if (sFree) sFree.textContent = free;
    if (sRes)  sRes.textContent  = res;
    if (sOcc)  sOcc.textContent  = occ;
}

// ─── Modals ──────────────────────────────────────────────────────────────────
async function showAreaModal(id = null) {
    const a = id ? state.areas.find(x => x.id === id) : { id: 'A' + Date.now(), name: '', icon: '🏠', w: 600, h: 450 };
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:400px;">
            <h3 style="margin-bottom:20px;">${id ? 'Bereich bearbeiten' : 'Neuer Bereich'}</h3>
            <div class="form-group" style="margin-bottom:12px;"><label>Name</label><input id="area-name" class="input-styled" value="${a.name}"></div>
            <div class="form-group" style="margin-bottom:12px;"><label>Icon (Emoji)</label><input id="area-icon" class="input-styled" value="${a.icon}"></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
                <div class="form-group"><label>Breite (px)</label><input id="area-w" type="number" class="input-styled" value="${a.w}"></div>
                <div class="form-group"><label>Höhe (px)</label><input id="area-h" type="number" class="input-styled" value="${a.h}"></div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                ${id ? '<button class="btn-delete" id="btn-del-area"><i class="fas fa-trash"></i> Löschen</button>' : ''}
                <button class="btn-secondary" id="area-cancel">Abbrechen</button>
                <button class="btn-primary" id="area-save">Speichern</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#area-cancel').onclick = () => modal.remove();
    modal.querySelector('#area-save').onclick = () => {
        a.name = modal.querySelector('#area-name').value;
        a.icon = modal.querySelector('#area-icon').value;
        a.w    = parseInt(modal.querySelector('#area-w').value);
        a.h    = parseInt(modal.querySelector('#area-h').value);
        if (!id) { state.areas.push(a); state.tables[a.id] = []; state.decors[a.id] = []; }
        modal.remove();
        buildAreaTabs();
        buildAreaSideList();
        renderAll();
    };
    if (id) {
        modal.querySelector('#btn-del-area').onclick = async () => {
            if (await showConfirm('Bereich wirklich löschen? Alle Tische gehen verloren.')) {
                state.areas = state.areas.filter(x => x.id !== id);
                delete state.tables[id];
                state.isDirty = true;
                modal.remove();
                buildAreaTabs();
                buildAreaSideList();
                renderAll();
            }
        };
    }
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function showTableInfo(t, areaId) {
    const status           = getLiveStatus(t.id, areaId);
    const todayReservations = getAllReservationsForTable(t.id, areaId);
    const now     = new Date();
    const curTime = now.getHours() * 60 + now.getMinutes();
    let resHTML = '';
    if (todayReservations.length === 0) {
        resHTML = `<div style="text-align:center; padding:20px; opacity:0.5; font-size:13px;"><i class="fas fa-calendar-check" style="font-size:24px; display:block; margin-bottom:8px;"></i>Keine Reservierungen heute</div>`;
    } else {
        todayReservations.forEach(r => {
            const isNow  = isTimeInRange(curTime, r.start_time, r.end_time);
            const isPast = parseTimeToMins(r.end_time) < curTime;
            const hl     = isNow ? 'border-left:4px solid #059669;' : isPast ? 'opacity:0.5;' : 'border-left:4px solid #d97706;';
            const tl     = isNow ? '● Jetzt' : isPast ? 'Vergangen' : 'Kommend';
            const tc     = isNow ? '#059669' : isPast ? '#94a3b8' : '#d97706';
            resHTML += `
                <div style="background:#f8fafc; border-radius:12px; padding:15px; margin-bottom:10px; ${hl}">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-weight:700; font-size:14px;">${r.name}</span>
                        <span style="font-size:10px; font-weight:700; color:${tc};">${tl}</span>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; color:#475569;">
                        <div><i class="fas fa-clock" style="width:14px; color:#94a3b8;"></i> ${r.start_time} – ${r.end_time}</div>
                        <div><i class="fas fa-users" style="width:14px; color:#94a3b8;"></i> ${r.guests} Person${r.guests != 1 ? 'en' : ''}</div>
                        ${r.phone ? `<div><i class="fas fa-phone" style="width:14px; color:#94a3b8;"></i> ${r.phone}</div>` : ''}
                        ${r.email ? `<div style="grid-column:span 2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><i class="fas fa-envelope" style="width:14px; color:#94a3b8;"></i> ${r.email}</div>` : ''}
                    </div>
                    ${r.note ? `<div style="margin-top:8px; padding:8px; background:#e2e8f0; border-radius:8px; font-size:11px; color:#64748b;"><i class="fas fa-sticky-note" style="margin-right:4px;"></i>${r.note}</div>` : ''}
                    <div style="margin-top:8px; display:flex; justify-content:space-between;">
                        <span style="font-size:10px; padding:2px 8px; border-radius:10px; background:${statusColor(r.status)}22; color:${statusColor(r.status)}; font-weight:700;">${statusLabel(r.status)}</span>
                        <span style="font-size:10px; color:#94a3b8;">#${r.id}</span>
                    </div>
                </div>`;
        });
    }
    const statusBadge = status === 'free' ? 'badge-free' : status === 'reserved' ? 'badge-res' : 'badge-occ';
    const statusText  = status === 'free' ? 'Frei' : status === 'reserved' ? 'Reserviert' : 'Belegt';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:460px; padding:0; overflow:hidden;">
            <div style="padding:25px 25px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h3 style="margin:0; font-size:20px;">Tisch ${t.num}</h3>
                    <p style="margin:4px 0 0; color:#64748b; font-size:13px;">${t.seats} Sitzplätze</p>
                </div>
                <span class="badge ${statusBadge}" style="font-size:12px; padding:4px 12px;">${statusText}</span>
            </div>
            <div style="padding:20px 25px; max-height:380px; overflow-y:auto;">
                <div style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; margin-bottom:12px;">
                    <i class="fas fa-calendar-alt" style="margin-right:6px;"></i>Heute
                    ${todayReservations.length > 0 ? `<span style="background:#e2e8f0; color:#475569; border-radius:20px; padding:1px 8px; margin-left:6px;">${todayReservations.length}</span>` : ''}
                </div>
                ${resHTML}
            </div>
            <div style="padding:15px 25px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                <div style="display:flex; gap:8px;">
                    <button class="btn-edit" id="btn-block-table" style="background:rgba(100,116,139,0.1); color:#475569; font-size:12px;"><i class="fas fa-ban"></i> Sperren</button>
                    <button class="btn-edit" id="btn-edit-table" style="font-size:12px;"><i class="fas fa-edit"></i> Bearbeiten</button>
                </div>
                <button class="btn-primary" id="table-close" style="font-size:13px;">Schließen</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#table-close').onclick    = () => modal.remove();
    modal.querySelector('#btn-edit-table').onclick  = () => { modal.remove(); showTableEditModal(t, areaId); };
    modal.querySelector('#btn-block-table').onclick = async () => {
        const time = await showPrompt('Tisch sperren', 'Ab wann sperren? (HH:mm)', '18:00');
        if (!time) return;
        const ok = await apiPost('reservations/submit', {
            name: 'GESPERRT',
            date: `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`,
            time, guests: 0, note: 'Manuell gesperrt via Tischplaner', status: 'Blocked', areaId
        });
        if (ok.success) {
            showToast('Tisch gesperrt.');
            modal.remove();
            state.reservations = await apiGet('reservations') || [];
            renderTables(areaId);
            updateStats();
        }
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function showTableEditModal(t, areaId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:400px;">
            <h3 style="margin-bottom:20px;">Tisch bearbeiten</h3>
            <div class="form-group" style="margin-bottom:12px;"><label>Nummer / Name</label><input id="edit-num" class="input-styled" value="${t.num}"></div>
            <div class="form-group" style="margin-bottom:12px;"><label>Sitzplätze</label><input id="edit-seats" type="number" class="input-styled" value="${t.seats}"></div>
            <div class="form-group" style="margin-bottom:24px;">
                <label>Form</label>
                <select id="edit-shape" class="input-styled">
                    <option value="square" ${t.shape==='square'?'selected':''}>Quadrat</option>
                    <option value="rect-h" ${t.shape==='rect-h'?'selected':''}>Rechteck ↔</option>
                    <option value="rect-v" ${t.shape==='rect-v'?'selected':''}>Rechteck ↕</option>
                    <option value="round"  ${t.shape==='round' ?'selected':''}>Rund</option>
                </select>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <button class="btn-delete" id="btn-del-table"><i class="fas fa-trash"></i> Löschen</button>
                <div style="display:flex; gap:10px;">
                    <button class="btn-secondary" id="edit-cancel">Abbrechen</button>
                    <button class="btn-primary"   id="edit-save">Übernehmen</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#edit-cancel').onclick = () => modal.remove();
    modal.querySelector('#edit-save').onclick   = () => {
        t.num   = modal.querySelector('#edit-num').value;
        t.seats = parseInt(modal.querySelector('#edit-seats').value) || 4;
        t.shape = modal.querySelector('#edit-shape').value;
        if (t.shape === 'rect-h') { t.w = 100; t.h = 60; }
        else if (t.shape === 'rect-v') { t.w = 60; t.h = 100; }
        else { t.w = 60; t.h = 60; }
        state.isDirty = true;
        modal.remove();
        renderTables(areaId);
        updateStats();
    };
    modal.querySelector('#btn-del-table').onclick = async () => {
        if (await showConfirm('Tisch wirklich entfernen?')) {
            state.tables[areaId] = state.tables[areaId].filter(x => x.id !== t.id);
            state.isDirty = true;
            modal.remove();
            renderTables(areaId);
            updateStats();
        }
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}
