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

export async function renderTablePlanner(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-th"></i> Visueller Tischplaner';
    
    // Load Data
    const plan = await apiGet('table-plan');
    const reservations = await apiGet('reservations');
    
    state.areas = plan.areas || [];
    state.tables = plan.tables || {};
    state.combined = plan.combined || {};
    state.decors = plan.decors || {};
    state.reservations = reservations || [];
    
    // Initial Render
    buildLayout(container);
    renderAll();
    updateStats();
}

function buildLayout(container) {
    container.innerHTML = `
        <div class="planner-container">
            <aside class="planner-sidebar" id="planner-sidebar">
                <div class="section-title">Status-Übersicht</div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; font-size:12px;"><span>Frei</span> <span class="badge badge-free" id="stat-free">0</span></div>
                    <div style="display:flex; justify-content:space-between; font-size:12px;"><span>Reserviert</span> <span class="badge badge-res" id="stat-res">0</span></div>
                    <div style="display:flex; justify-content:space-between; font-size:12px;"><span>Belegt</span> <span class="badge badge-occ" id="stat-occ">0</span></div>
                </div>

                <div class="section-title">Bereiche <button class="btn-edit" id="btn-add-area" style="float:right; font-size:10px;">+</button></div>
                <div id="area-list" style="margin-bottom:20px;"></div>

                <div class="section-title">Tisch hinzufügen</div>
                <div class="tool-grid">
                    <select id="add-area-sel" class="input-styled" style="grid-column: span 2; font-size:11px;"></select>
                    <input id="add-num" class="input-styled" placeholder="Nr." style="font-size:11px;">
                    <input id="add-seats" type="number" class="input-styled" value="4" style="font-size:11px;">
                    <select id="add-shape" class="input-styled" style="grid-column: span 2; font-size:11px;">
                        <option value="square">Quadrat</option>
                        <option value="rect-h">Rechteck ↔</option>
                        <option value="rect-v">Rechteck ↕</option>
                        <option value="round">Rund</option>
                    </select>
                </div>
                <button class="btn-primary" id="btn-add-table" style="width:100%; margin-top:10px; font-size:12px;">+ Hinzufügen</button>

                <div class="section-title">Raum-Layout</div>
                <button class="btn-secondary" id="btn-toggle-edit" style="width:100%; margin-bottom:10px;">✏️ Layout-Modus</button>
                <button class="btn-secondary" id="btn-toggle-select" style="width:100%; margin-bottom:10px;">🖱️ Kombinieren</button>
                
                <div id="selection-tools" style="display:none; padding:15px; background:rgba(255,255,255,0.05); border-radius:15px; margin-bottom:20px;">
                    <p style="font-size:11px; margin-bottom:10px;">Wähle mehrere Tische aus, um sie zu einer Tischnummer zu verbinden.</p>
                    <button class="btn-primary" id="btn-combine-selected" style="width:100%; font-size:12px;" disabled>🔗 Tische verbinden</button>
                </div>

                <div id="edit-tools" style="display:none;">
                    <div class="tool-grid">
                        <button class="tool-btn" data-tool="wall"><i class="fas fa-border-all"></i>Wand</button>
                        <button class="tool-btn" data-tool="window"><i class="fas fa-window-maximize"></i>Fenster</button>
                        <button class="tool-btn" data-tool="door"><i class="fas fa-door-open"></i>Tür</button>
                        <button class="tool-btn" data-tool="plant"><i class="fas fa-leaf"></i>Pflanze</button>
                    </div>
                </div>
                
                <button class="btn-premium" id="btn-save-plan" style="width:100%; margin-top:30px;"><i class="fas fa-save"></i> Plan speichern</button>
            </aside>
            <main class="planner-main">
                <header class="planner-header" id="planner-tabs"></header>
                <div class="planner-content" id="planner-content"></div>
            </main>
        </div>
    `;

    container.querySelector('#btn-save-plan').onclick = savePlan;
    container.querySelector('#btn-toggle-edit').onclick = toggleEditMode;
    container.querySelector('#btn-toggle-select').onclick = toggleCombineMode;
    container.querySelector('#btn-add-table').onclick = addNewTable;
    container.querySelector('#btn-add-area').onclick = () => showAreaModal();
    container.querySelector('#btn-combine-selected').onclick = combineSelected;
    
    // Auto-save hint or check on leave
    window.addEventListener('beforeunload', (e) => {
        if (state.isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Hook into main navigation to check for dirty state
    const originalNavItems = document.querySelectorAll('.nav-item, .nav-subitem');
    originalNavItems.forEach(item => {
        const originalOnClick = item.onclick;
        item.onclick = async (e) => {
            if (state.isDirty) {
                const ok = await showConfirm('Ungespeicherte Änderungen', 'Du hast ungespeicherte Änderungen im Tischplaner. Willst du diese wirklich verworfen?');
                if (!ok) return;
            }
            state.isDirty = false;
            if (originalOnClick) originalOnClick.call(item, e);
        };
    });
    
    // Tool buttons
    container.querySelectorAll('.tool-btn').forEach(btn => {
        btn.onclick = () => selectTool(btn.dataset.tool);
    });

    buildAreaTabs();
    buildAreaSideList();
}

function buildAreaTabs() {
    const tabs = document.getElementById('planner-tabs');
    tabs.innerHTML = `<div class="nav-subitem ${state.currentView === 'all' ? 'active' : ''}" onclick="window.switchPlannerView('all')">Alle</div>`;
    state.areas.forEach(a => {
        tabs.innerHTML += `<div class="nav-subitem ${state.currentView === a.id ? 'active' : ''}" onclick="window.switchPlannerView('${a.id}')">${a.icon || ''} ${a.name}</div>`;
    });
    window.switchPlannerView = (v) => {
        state.currentView = v;
        buildAreaTabs();
        renderAll();
    };
}

function buildAreaSideList() {
    const list = document.getElementById('area-list');
    const sel = document.getElementById('add-area-sel');
    list.innerHTML = '';
    sel.innerHTML = '';
    state.areas.forEach(a => {
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span>${a.icon || '🏠'} ${a.name}</span>
                <button class="btn-edit" onclick="window.editArea('${a.id}')"><i class="fas fa-edit"></i></button>
            </div>
        `;
        sel.innerHTML += `<option value="${a.id}">${a.name}</option>`;
    });
    window.editArea = (id) => showAreaModal(id);
}

function renderAll() {
    const content = document.getElementById('planner-content');
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
            </div>
        `;
        
        content.appendChild(wrap);
        renderTables(a.id);
        renderDecors(a.id);
        
        // Canvas Events
        const canvas = wrap.querySelector('.planner-canvas');
        canvas.onmousedown = (e) => onCanvasDown(e, a.id);
        
        if (state.roomEditMode) {
            const res = wrap.querySelector(`#resize-${a.id}`);
            if (res) res.onmousedown = (e) => onResizeDown(e, a.id);
        }
    });
}

function onResizeDown(e, areaId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    ptr = { mode: 'room', areaId, startX: e.clientX, startY: e.clientY };
    document.onmousemove = onGlobalMove;
    document.onmouseup = onGlobalUp;
}

function renderTables(areaId) {
    const canvas = document.getElementById(`canvas-${areaId}`);
    if (!canvas) return;
    
    // Clear existing tables
    canvas.querySelectorAll('.table-el').forEach(el => el.remove());
    canvas.querySelectorAll('.combo-container').forEach(el => el.remove());
    
    const tables = state.tables[areaId] || [];
    tables.forEach(t => {
        if (t.hidden) return;
        const el = document.createElement('div');
        
        // Determine Live Status
        const status = getLiveStatus(t.id, areaId);
        const isSelected = state.selectedTableIds.includes(t.id);
        
        el.className = `table-el t-${status} ${t.shape === 'round' ? 'round' : ''} ${isSelected ? 'selected' : ''}`;
        el.style.left = t.x + 'px';
        el.style.top = t.y + 'px';
        el.style.width = t.w + 'px';
        el.style.height = t.h + 'px';
        
        el.innerHTML = `<div class="t-num">${t.num}</div><div class="t-seats">${t.seats} Pl.</div>${isSelected ? '<div style="position:absolute; top:-10px; right:-10px; background:var(--primary); color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:10px;"><i class="fas fa-check"></i></div>' : ''}`;
        
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
        el.ondblclick = (e) => { e.stopPropagation(); if(!combineMode) showTableEditModal(t, areaId); };
        
        canvas.appendChild(el);
    });

    // Render Combined Containers (Visual groups)
    const combined = state.combined[areaId] || [];
    combined.forEach(c => {
        const memberTables = tables.filter(t => c.tableIds.includes(t.id));
        if (memberTables.length < 2) return;
        
        // Calculate bounding box
        const minX = Math.min(...memberTables.map(t => t.x));
        const minY = Math.min(...memberTables.map(t => t.y));
        const maxX = Math.max(...memberTables.map(t => t.x + t.w));
        const maxY = Math.max(...memberTables.map(t => t.y + t.h));
        
        const pad = 10;
        const el = document.createElement('div');
        el.className = 'combo-container';
        el.style.left = (minX - pad) + 'px';
        el.style.top = (minY - pad) + 'px';
        el.style.width = (maxX - minX + pad*2) + 'px';
        el.style.height = (maxY - minY + pad*2) + 'px';
        
        const status = getLiveStatus('C' + c.id, areaId);
        el.classList.add(`combo-${status}`);
        
        el.innerHTML = `
            <div class="combo-label">${c.num} (${c.seats} Pl.)</div>
            <button class="combo-unlink" onclick="window.unlinkCombo(${c.id}, '${areaId}')"><i class="fas fa-unlink"></i></button>
        `;
        
        canvas.appendChild(el);
    });
}

function renderDecors(areaId) {
    const canvas = document.getElementById(`canvas-${areaId}`);
    if (!canvas) return;
    
    // Clear existing decorations
    canvas.querySelectorAll('.dec').forEach(el => el.remove());
    
    const decs = state.decors[areaId] || [];
    decs.forEach(d => {
        const el = document.createElement('div');
        el.className = 'dec';
        el.style.left = d.x + 'px';
        el.style.top = d.y + 'px';
        el.style.width = d.w + 'px';
        el.style.height = d.h + 'px';
        
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

function getLiveStatus(tableId, areaId) {
    const now = new Date();
    const curTime = now.getHours() * 60 + now.getMinutes();
    const curDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    
    // Check if tableId is blocked directly or via combination
    const isBlocked = (r) => {
        if (r.assigned_tables.includes(tableId)) return true;
        
        // Is it a parent combination whose child is reserved?
        if (tableId.startsWith('C')) {
            const cid = parseInt(tableId.substring(1));
            const combo = (state.combined[areaId] || []).find(c => c.id === cid);
            if (combo && combo.tableIds.some(tid => r.assigned_tables.includes(tid))) return true;
        }
        
        // Is it a child table whose parent combination is reserved?
        const parentCombo = (state.combined[areaId] || []).find(c => c.tableIds.includes(tableId));
        if (parentCombo && r.assigned_tables.includes('C' + parentCombo.id)) return true;
        
        return false;
    };

    const res = state.reservations.find(r => 
        r.date === curDate && 
        r.status !== 'Cancelled' && 
        isBlocked(r) &&
        isTimeInRange(curTime, r.start_time, r.end_time)
    );
    
    if (res) return 'occupied';
    
    // Future reservations today?
    const future = state.reservations.find(r => 
        r.date === curDate && 
        r.status !== 'Cancelled' && 
        isBlocked(r) &&
        parseTimeToMins(r.start_time) > curTime
    );
    
    if (future) return 'reserved';
    
    return 'free';
}

function isTimeInRange(now, start, end) {
    const s = parseTimeToMins(start);
    const e = parseTimeToMins(end);
    return now >= s && now <= e;
}

function parseTimeToMins(str) {
    if (!str) return 0;
    const [h, m] = str.replace(/[^0-9:]/g, '').split(':').map(Number);
    return h * 60 + (m || 0);
}

// Interaction Handlers
function onTableDown(e, t, areaId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    ptr = { mode: 'table', t, areaId, startX: e.clientX, startY: e.clientY, offX: e.clientX - t.x, offY: e.clientY - t.y };
    document.onmousemove = onGlobalMove;
    document.onmouseup = onGlobalUp;
}

function onDecorDown(e, d, areaId) {
    if (e.button !== 0 || !state.roomEditMode) return;
    e.stopPropagation();
    ptr = { mode: 'decor', d, areaId, startX: e.clientX, startY: e.clientY, offX: e.clientX - d.x, offY: e.clientY - d.y };
    document.onmousemove = onGlobalMove;
    document.onmouseup = onGlobalUp;
}

function onCanvasDown(e, areaId) {
    if (!state.roomEditMode || !state.activeTool) return;
    const canvas = document.getElementById(`canvas-${areaId}`);
    const rect = canvas.getBoundingClientRect();
    const x = snap(e.clientX - rect.left);
    const y = snap(e.clientY - rect.top);
    
    ptr = { mode: 'draw', areaId, tool: state.activeTool, startX: x, startY: y };
    document.onmousemove = onGlobalMove;
    document.onmouseup = onGlobalUp;
}

function onGlobalMove(e) {
    if (!ptr.mode) return;
    
    if (ptr.mode === 'table') {
        const { t, areaId } = ptr;
        t.x = snap(e.clientX - ptr.offX);
        t.y = snap(e.clientY - ptr.offY);
        state.isDirty = true;
        renderTables(areaId);
    } else if (ptr.mode === 'decor') {
        const { d, areaId } = ptr;
        d.x = snap(e.clientX - ptr.offX);
        d.y = snap(e.clientY - ptr.offY);
        state.isDirty = true;
        renderDecors(areaId);
    } else if (ptr.mode === 'draw') {
        const { areaId } = ptr;
        const canvas = document.getElementById(`canvas-${areaId}`);
        const rect = canvas.getBoundingClientRect();
        const cx = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const cy = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
        const x = Math.min(ptr.startX, cx), y = Math.min(ptr.startY, cy);
        const w = Math.abs(cx - ptr.startX), h = Math.abs(cy - ptr.startY);
        const prev = document.getElementById(`preview-${areaId}`);
        if (prev) {
            prev.style.display = 'block';
            prev.style.left = x + 'px';
            prev.style.top = y + 'px';
            prev.style.width = w + 'px';
            prev.style.height = h + 'px';
        }
    } else if (ptr.mode === 'room') {
        const { areaId } = ptr;
        const canvas = document.getElementById(`canvas-${areaId}`);
        const rect = canvas.getBoundingClientRect();
        const a = state.areas.find(x => x.id === areaId);
        if (a) {
            a.w = snap(Math.max(300, e.clientX - rect.left));
            a.h = snap(Math.max(200, e.clientY - rect.top));
            
            // Live update canvas size
            canvas.style.width = a.w + 'px';
            canvas.style.height = a.h + 'px';
            canvas.parentElement.style.width = a.w + 'px';
        }
    }
}

function onGlobalUp(e) {
    if (ptr.mode === 'draw') {
        const { areaId, tool } = ptr;
        const prev = document.getElementById(`preview-${areaId}`);
        if (prev) prev.style.display = 'none';
        
        const canvas = document.getElementById(`canvas-${areaId}`);
        const rect = canvas.getBoundingClientRect();
        const cx = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const cy = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
        
        const x = snap(Math.min(ptr.startX, cx));
        const y = snap(Math.min(ptr.startY, cy));
        const w = snap(Math.abs(cx - ptr.startX));
        const h = snap(Math.abs(cy - ptr.startY));
        
        if (w > 10 && h > 4) {
            if (!state.decors[areaId]) state.decors[areaId] = [];
            state.decors[areaId].push({ id: Date.now(), type: tool, x, y, w, h });
            state.isDirty = true;
            renderDecors(areaId);
        }
    }
    
    ptr.mode = null;
    document.onmousemove = null;
    document.onmouseup = null;
    updateStats();
}

function snap(v) {
    return state.snapEnabled ? Math.round(v / SNAP) * SNAP : v;
}

async function savePlan() {
    const data = {
        areas: state.areas,
        tables: state.tables,
        combined: state.combined,
        decors: state.decors
    };
    const res = await apiPost('table-plan', data);
    if (res.success) {
        state.isDirty = false;
        showToast('Planer gespeichert und synchronisiert');
    }
}

function toggleEditMode() {
    state.roomEditMode = !state.roomEditMode;
    document.getElementById('edit-tools').style.display = state.roomEditMode ? 'block' : 'none';
    document.getElementById('btn-toggle-edit').classList.toggle('btn-premium', state.roomEditMode);
    renderAll();
}

function selectTool(tool) {
    state.activeTool = state.activeTool === tool ? null : tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === state.activeTool));
}

function addNewTable() {
    const areaId = document.getElementById('add-area-sel').value;
    const num = document.getElementById('add-num').value.trim();
    const seats = parseInt(document.getElementById('add-seats').value) || 4;
    const shape = document.getElementById('add-shape').value;
    
    if (!num) return showToast('Bitte Nummer eingeben');
    
    if (!state.tables[areaId]) state.tables[areaId] = [];
    const id = 'T' + Date.now();
    
    let w = 60, h = 60;
    if (shape === 'rect-h') { w = 100; h = 60; }
    if (shape === 'rect-v') { w = 60; h = 100; }
    
    state.tables[areaId].push({ id, num, seats, shape, x: 20, y: 20, w, h });
    state.isDirty = true;
    renderTables(areaId);
    updateStats();
    document.getElementById('add-num').value = '';
}

let combineMode = false;

function toggleCombineMode() {
    combineMode = !combineMode;
    state.selectedTableIds = [];
    document.getElementById('selection-tools').style.display = combineMode ? 'block' : 'none';
    document.getElementById('btn-toggle-select').classList.toggle('btn-premium', combineMode);
    
    // Disable edit mode if combine mode is on
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
    
    // Find area from first selected table
    let areaId = null;
    const selectedTables = [];
    Object.keys(state.tables).forEach(aid => {
        state.tables[aid].forEach(t => {
            if (state.selectedTableIds.includes(t.id)) {
                areaId = aid;
                selectedTables.push(t);
            }
        });
    });
    
    if (!areaId) return;
    
    const defaultNum = selectedTables.map(t => t.num).join('+');
    const num = await showPrompt('Tischkombination', 'Bitte neue Tischnummer für diese Kombination eingeben:', defaultNum);
    if (num === null) return; // User cancelled

    const id = Date.now();
    const seats = selectedTables.reduce((sum, t) => sum + t.seats, 0);
    
    if (!state.combined[areaId]) state.combined[areaId] = [];
    state.combined[areaId].push({
        id,
        num: num || defaultNum,
        seats,
        tableIds: [...state.selectedTableIds]
    });
    
    state.isDirty = true;
    state.selectedTableIds = [];
    toggleCombineMode(); // Close selection panel
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
    const sRes = document.getElementById('stat-res');
    const sOcc = document.getElementById('stat-occ');
    if (sFree) sFree.textContent = free;
    if (sRes) sRes.textContent = res;
    if (sOcc) sOcc.textContent = occ;
}

// Modals
async function showAreaModal(id = null) {
    const a = id ? state.areas.find(x => x.id === id) : { id: 'A' + Date.now(), name: '', icon: '🏠', w: 600, h: 450 };
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:400px;">
            <h3>${id ? 'Bereich bearbeiten' : 'Neuer Bereich'}</h3>
            <div class="form-group" style="margin-bottom:15px;"><label>Name</label><input id="area-name" class="input-styled" value="${a.name}"></div>
            <div class="form-group" style="margin-bottom:15px;"><label>Icon (Emoji)</label><input id="area-icon" class="input-styled" value="${a.icon}"></div>
            <div style="display:flex; gap:10px; margin-bottom:20px;">
                <div class="form-group"><label>Breite</label><input id="area-w" type="number" class="input-styled" value="${a.w}"></div>
                <div class="form-group"><label>Höhe</label><input id="area-h" type="number" class="input-styled" value="${a.h}"></div>
            </div>
            <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:10px;">
                ${id ? '<button class="btn-edit" id="btn-del-area" style="color:#ef4444; margin-right:auto; background:rgba(239,68,68,0.1);"><i class="fas fa-trash"></i> Löschen</button>' : ''}
                <button class="btn-secondary" id="area-cancel">Abbrechen</button>
                <button class="btn-primary" id="area-save">Speichern</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#area-cancel').onclick = () => modal.remove();
    modal.querySelector('#area-save').onclick = () => {
        a.name = modal.querySelector('#area-name').value;
        a.icon = modal.querySelector('#area-icon').value;
        a.w = parseInt(modal.querySelector('#area-w').value);
        a.h = parseInt(modal.querySelector('#area-h').value);
        
        if (!id) {
            state.areas.push(a);
            state.tables[a.id] = [];
            state.decors[a.id] = [];
        }
        
        modal.remove();
        buildAreaTabs();
        buildAreaSideList();
        renderAll();
    };
    if (id) {
        modal.querySelector('#btn-del-area').onclick = async () => {
            if (await showConfirm('Bereich wirklich löschen? Alle Tische darin gehen verloren.')) {
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
}

function showTableInfo(t, areaId) {
    const status = getLiveStatus(t.id, areaId);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:400px; padding:30px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;">Tisch ${t.num}</h3>
                <span class="badge badge-${status === 'free' ? 'free' : status === 'reserved' ? 'res' : 'occ'}">${status}</span>
            </div>
            <p style="margin:10px 0 30px; font-size:14px; opacity:0.7;">Kapazität: ${t.seats} Personen</p>
            
            <div style="margin-bottom:20px; border-top:1px solid rgba(255,255,255,0.05); padding-top:20px;">
                <button class="btn-secondary" onclick="window.blockTable('${t.id}', '${areaId}')" style="width:100%;"><i class="fas fa-ban"></i> Tisch sperren</button>
            </div>

            <div class="modal-actions" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <button class="btn-edit" onclick="window.editTableProps('${t.id}', '${areaId}')" style="background:rgba(37,99,235,0.1);"><i class="fas fa-edit"></i> Bearbeiten</button>
                <button class="btn-primary" id="table-close">Schließen</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#table-close').onclick = () => modal.remove();
    
    window.editTableProps = (id, area) => {
        modal.remove();
        showTableEditModal(t, area);
    };

    window.blockTable = async (id, area) => {
        const time = await showPrompt('Tisch sperren', 'Ab wann soll der Tisch gesperrt werden? (Format HH:mm)', '18:00');
        if (!time) return;
        
        const ok = await apiPost('reservations/submit', {
            name: 'GESPERRT',
            date: `${String(new Date().getDate()).padStart(2,'0')}.${String(new Date().getMonth()+1).padStart(2,'0')}.${new Date().getFullYear()}`,
            time: time,
            guests: 0,
            note: 'Manuell gesperrt via Tischplaner',
            status: 'Blocked',
            areaId: area
        });

        if (ok.success) {
            showToast('Tisch wurde für heute gesperrt.');
            modal.remove();
            // Refresh reservations and re-render
            const reservations = await apiGet('reservations');
            state.reservations = reservations || [];
            renderTables(area);
            updateStats();
        }
    };
}

function showTableEditModal(t, areaId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-glass" style="max-width:450px; padding:30px;">
            <h3 style="margin-bottom:25px;">Tisch bearbeiten</h3>
            <div class="form-group" style="margin-bottom:15px;"><label>Nummer / Name</label><input id="edit-num" class="input-styled" value="${t.num}"></div>
            <div class="form-group" style="margin-bottom:15px;"><label>Sitzplätze</label><input id="edit-seats" type="number" class="input-styled" value="${t.seats}"></div>
            <div class="form-group" style="margin-bottom:30px;">
                <label>Form</label>
                <select id="edit-shape" class="input-styled">
                    <option value="square" ${t.shape==='square'?'selected':''}>Quadrat</option>
                    <option value="rect-h" ${t.shape==='rect-h'?'selected':''}>Rechteck ↔</option>
                    <option value="rect-v" ${t.shape==='rect-v'?'selected':''}>Rechteck ↕</option>
                    <option value="round" ${t.shape==='round'?'selected':''}>Rund</option>
                </select>
            </div>
            <div class="modal-actions" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <button class="btn-edit" id="btn-del-table" style="color:#ef4444; background:rgba(239,68,68,0.1);"><i class="fas fa-trash"></i> Löschen</button>
                <div style="display:flex; gap:10px;">
                    <button class="btn-secondary" id="edit-cancel">Abbrechen</button>
                    <button class="btn-primary" id="edit-save">Übernehmen</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.appendChild(modal);
    modal.querySelector('#edit-cancel').onclick = () => modal.remove();
    modal.querySelector('#edit-save').onclick = () => {
        t.num = modal.querySelector('#edit-num').value;
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
}
