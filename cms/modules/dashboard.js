/**
 * Dashboard Module for OPA-CMS
 */

import { apiGet, apiPost } from './api.js';
import { showToast } from './utils.js';

const DEFAULT_WIDGETS = [
    { id: 'branding',       size: 'span-6' },
    { id: 'dishes',         size: 'span-3' },
    { id: 'categories',     size: 'span-3' },
    { id: 'reservations',   size: 'span-4' },
    { id: 'status',         size: 'span-4' },
    { id: 'vacation',       size: 'span-4' },
    { id: 'menu_breakdown', size: 'span-6' },
    { id: 'price_stats',    size: 'span-3' },
    { id: 'avg_price',      size: 'span-3' },
    { id: 'website',        size: 'span-12' }
];

const WIDGET_META = {
    branding:       { label: 'Restaurant Info',           icon: 'fa-store' },
    dishes:         { label: 'Gerichte-Zähler',           icon: 'fa-utensils' },
    reservations:   { label: 'Reservierungen',            icon: 'fa-calendar-check' },
    status:         { label: 'Heutige Zeiten',            icon: 'fa-clock' },
    vacation:       { label: 'Urlaubs-Status',            icon: 'fa-umbrella-beach' },
    website:        { label: 'Website Status',            icon: 'fa-magic' },
    categories:     { label: 'Kategorien',                icon: 'fa-tags' },
    menu_breakdown: { label: 'Speisen nach Kategorie',    icon: 'fa-chart-bar' },
    price_stats:    { label: 'Preisspanne',               icon: 'fa-euro-sign' },
    avg_price:      { label: 'Durchschnittspreis',        icon: 'fa-calculator' },
};

const WIDGET_TEMPLATES = {
    branding: (d) => `
        <div class="stat-widget accent full-height">
            <i class="fas fa-store"></i>
            <div>
                <h3 style="color:#fff;">${d.branding?.name || 'Restaurant'}</h3>
                <p style="color:rgba(255,255,255,.8);">Lizenz: ${d.l.type || 'PRO'} &bull; ${d.l.status || 'aktiv'}</p>
            </div>
        </div>`,

    dishes: (d) => `
        <div class="stat-widget clickable full-height" onclick="window.switchTab('menu', 'dishes')">
            <div class="widget-header"><h3>Gerichte</h3><i class="fas fa-utensils"></i></div>
            <div class="value">${d.menu?.length || 0}</div>
            <p>auf der Speisekarte</p>
        </div>`,

    reservations: (d) => `
        <div class="stat-widget clickable full-height" onclick="window.switchTab('reservations')">
            <div class="widget-header"><h3>Reservierungen</h3><i class="fas fa-calendar-check"></i></div>
            <div class="value">${d.reservations?.length || 0}</div>
            <p>insgesamt empfangen</p>
        </div>`,

    status: (d) => `
        <div class="stat-widget clickable full-height" onclick="window.switchTab('opening')">
            <div class="widget-header"><h3>Status</h3><i class="fas fa-clock"></i></div>
            <div class="value" style="font-size:1.4rem;margin:10px 0;">${d.ohText}</div>
            <p>Öffnungszeiten heute</p>
        </div>`,

    vacation: (d) => {
        const h = d.home || {};
        const st = getVacationStatus(h.vacation || {});
        return `<div class="stat-widget clickable full-height" onclick="window.switchTab('home-editor', 'vacation')">
            <div class="widget-header"><h3>Urlaub</h3><i class="fas ${st.icon}"></i></div>
            <div class="value" style="font-size:1.3rem; margin:10px 0; color:${st.color};">${st.label}</div>
            <p>${st.subText}</p>
        </div>`;
    },

    website: (d) => `
        <div class="stat-widget clickable full-height" onclick="window.switchTab('home-editor')">
            <div class="widget-header"><h3>Website</h3><i class="fas fa-magic"></i></div>
            <div class="value" style="font-size:1.4rem;margin:10px 0;">${d.home?.promotionEnabled ? 'Aktion Aktiv' : 'Kein Banner'}</div>
            <p>${d.home?.promotionText || 'Tagesempfehlung'}</p>
        </div>`,

    categories: (d) => `
        <div class="stat-widget clickable full-height" onclick="window.switchTab('menu', 'dishes')">
            <div class="widget-header"><h3>Menü-Vielfalt</h3><i class="fas fa-tags"></i></div>
            <div class="value">${d.catStats.length}</div>
            <p>Speise-Kategorien</p>
        </div>`,

    // --- Neue Widgets ---

    menu_breakdown: (d) => {
        const total = d.menu?.length || 0;
        if (total === 0) return `<div class="stat-widget full-height" style="display:flex;align-items:center;justify-content:center;opacity:.5;"><p>Keine Gerichte vorhanden</p></div>`;

        const COLORS = ['#1b3a5c','#c8a96e','#2e86ab','#e07b39','#27ae60','#8e44ad','#e74c3c','#16a085','#d35400','#2980b9'];

        const rows = d.catStats.map((cs, i) => {
            const pct = total > 0 ? Math.round((cs.count / total) * 100) : 0;
            const color = COLORS[i % COLORS.length];
            return `
                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
                        <span style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55%;">${cs.label}</span>
                        <span style="font-size:.78rem;opacity:.65;white-space:nowrap;">${cs.count} Gerichte &bull; ${pct}%</span>
                    </div>
                    <div style="height:7px;border-radius:99px;background:rgba(0,0,0,0.07);overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width .5s cubic-bezier(.4,0,.2,1);"></div>
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="stat-widget full-height" style="overflow:auto;">
                <div class="widget-header" style="margin-bottom:14px;">
                    <h3>Speisen nach Kategorie</h3>
                    <i class="fas fa-chart-bar"></i>
                </div>
                <div style="font-size:.75rem;opacity:.5;margin-bottom:12px;">${total} Gerichte gesamt</div>
                ${rows}
            </div>`;
    },

    price_stats: (d) => {
        const prices = (d.menu || []).map(m => parseFloat(m.price)).filter(p => !isNaN(p));
        const min = prices.length ? Math.min(...prices).toFixed(2) : '—';
        const max = prices.length ? Math.max(...prices).toFixed(2) : '—';
        return `
            <div class="stat-widget clickable full-height" onclick="window.switchTab('menu', 'dishes')">
                <div class="widget-header"><h3>Preisspanne</h3><i class="fas fa-euro-sign"></i></div>
                <div style="margin:10px 0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <span style="font-size:.72rem;opacity:.55;width:32px;">MIN</span>
                        <span style="font-size:1.3rem;font-weight:800;color:#27ae60;">${min}&thinsp;&euro;</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:.72rem;opacity:.55;width:32px;">MAX</span>
                        <span style="font-size:1.3rem;font-weight:800;color:#e07b39;">${max}&thinsp;&euro;</span>
                    </div>
                </div>
                <p>${prices.length} Preise ausgewertet</p>
            </div>`;
    },

    avg_price: (d) => {
        const prices = (d.menu || []).map(m => parseFloat(m.price)).filter(p => !isNaN(p));
        const avg = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : '—';
        return `
            <div class="stat-widget clickable full-height" onclick="window.switchTab('menu', 'dishes')">
                <div class="widget-header"><h3>Durchschnittspreis</h3><i class="fas fa-calculator"></i></div>
                <div class="value">${avg}&thinsp;&euro;</div>
                <p>Ø über alle Gerichte</p>
            </div>`;
    },
};

function getVacationStatus(vac) {
    if (!vac) return { label: 'Inaktiv', color: 'var(--text-muted)', icon: 'fa-umbrella-beach', subText: 'Kein Urlaub geplant' };
    const now = new Date();
    const start = vac.start ? new Date(vac.start) : null;
    const end   = vac.end   ? new Date(vac.end)   : null;
    if (vac.enabled === true) return { label: 'Aktiv (Manuell)', color: 'var(--primary)', icon: 'fa-exclamation-circle', subText: 'Sofort-Modus ist AN', type: 'active' };
    if (start && end) {
        if (now >= start && now <= end) return { label: 'Aktuell aktiv',  color: 'var(--primary)', icon: 'fa-umbrella-beach', subText: `Bis ${end.toLocaleDateString('de-DE')}`,   type: 'active'  };
        if (now < start)               return { label: 'In Kürze',       color: '#f59e0b',         icon: 'fa-calendar-alt',  subText: `Ab ${start.toLocaleDateString('de-DE')}`, type: 'planned' };
    }
    return { label: 'Inaktiv', color: 'var(--text-muted)', icon: 'fa-plane-departure', subText: 'Kein Zeitplan aktiv', type: 'off' };
}

let isSortMode = false;
let localDashboardConfig = null;
let isResizing = false;
let resizingWidgetId = null;
let startX = 0, startY = 0;
let startWidth = 0, startHeight = 0;
let lastSwapTime = 0;
let isPointerDragging = false;
let draggedWidgetId = null;
let draggedGroupIds = [];
let dragProxyEl = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

export async function renderDashboard(container, titleEl, toolbarEl) {
    toolbarEl.style.display = 'flex';
    titleEl.innerHTML = '<i class="fas fa-th-large"></i> Dashboard';

    window.toggleSortMode      = toggleSortMode;
    window.customizeDashboard  = customizeDashboard;
    window.addDashboardSection = addDashboardSection;
    window.removeDashboardSection = removeDashboardSection;
    window.updateSectionText   = updateSectionText;
    window.dispatchDragStart   = handlePointerDown;
    window.dispatchResizeStart = handleResizeStart;

    const [menu, orders, reservations, home, branding, settings] = await Promise.all([
        apiGet('menu'), apiGet('orders').catch(() => []), apiGet('reservations'),
        apiGet('homepage'), apiGet('branding'), apiGet('settings')
    ]);

    const config = isSortMode ? localDashboardConfig : (settings?.dashboardConfig || DEFAULT_WIDGETS);
    const day    = ['So','Mo','Di','Mi','Do','Fr','Sa'][new Date().getDay()];
    const oh     = home?.openingHours || {};
    const ohToday = oh[day] || { closed: true };

    const safeMenu = Array.isArray(menu) ? menu : [];
    const catMap   = {};
    safeMenu.forEach(m => {
        const label = m.cat && typeof m.cat === 'object' ? (m.cat.label || m.cat.id || 'Unsortiert') : (m.cat || 'Unsortiert');
        catMap[label] = (catMap[label] || 0) + 1;
    });
    const catStats = Object.entries(catMap)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    const d = {
        menu: safeMenu,
        reservations,
        home,
        branding,
        l: settings?.license || {},
        catStats,
        ohText: ohToday.closed ? 'Heute geschlossen' : `${ohToday.open} - ${ohToday.close}`
    };

    const activeWidgets = config.filter(w => w.active !== false);

    toolbarEl.innerHTML = `
        <button class="btn-primary" onclick="window.customizeDashboard()" ${isSortMode ? 'disabled style="opacity:.5;pointer-events:none;"' : ''}>
            <i class="fas fa-cog"></i> Sichtbarkeit
        </button>
        ${isSortMode ? `<button class="btn-primary" onclick="window.addDashboardSection()" style="background:var(--primary-light); color:var(--primary);"><i class="fas fa-plus"></i> Zeile hinzufügen</button>` : ''}
        <button class="btn-primary ${isSortMode ? 'active' : ''}" onclick="window.toggleSortMode()" style="${isSortMode ? 'background:#16a34a; border-color:#16a34a;' : ''}">
            <i class="fas ${isSortMode ? 'fa-save' : 'fa-arrows-alt'}"></i>
            ${isSortMode ? 'Anordnung Speichern' : 'Anordnung ändern'}
        </button>
    `;

    container.innerHTML = `
        <style>
            .stats-grid.sort-mode .stat-widget,
            .stats-grid.sort-mode .dashboard-section-header {
                animation: none !important;
                transform: none !important;
            }
            .stats-grid.sort-mode [data-id]:hover .stat-widget {
                box-shadow: 0 0 0 2px var(--primary, #1b3a5c), 0 4px 24px rgba(0,0,0,0.10);
            }
            .stats-grid.sort-mode [data-id] {
                outline: 1.5px dashed rgba(0,0,0,0.13);
                outline-offset: 3px;
                border-radius: 16px;
                cursor: grab;
            }
            .stats-grid.sort-mode [data-id]:active { cursor: grabbing; }

            /* Sichtbarkeits-Modal */
            #visibility-modal-overlay {
                position: fixed; inset: 0; z-index: 9999;
                background: rgba(0,0,0,0.45);
                display: flex; align-items: center; justify-content: center;
                animation: fadeIn .15s ease;
            }
            @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
            #visibility-modal {
                background: var(--bg-card, #fff);
                border-radius: 16px;
                padding: 28px 28px 20px;
                width: min(480px, 92vw);
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 8px 48px rgba(0,0,0,0.18);
            }
            #visibility-modal h2 {
                font-size: 1.1rem;
                font-weight: 700;
                margin-bottom: 18px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .vis-widget-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid rgba(0,0,0,0.06);
            }
            .vis-widget-row:last-of-type { border-bottom: none; }
            .vis-widget-label {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: .9rem;
                font-weight: 500;
            }
            .vis-widget-label i { width: 18px; opacity: .55; }
            /* Toggle-Switch */
            .vis-toggle {
                position: relative;
                width: 42px; height: 24px;
                flex-shrink: 0;
            }
            .vis-toggle input { opacity: 0; width: 0; height: 0; }
            .vis-toggle-track {
                position: absolute; inset: 0;
                background: #ccc;
                border-radius: 99px;
                cursor: pointer;
                transition: background .2s;
            }
            .vis-toggle input:checked + .vis-toggle-track { background: var(--primary, #1b3a5c); }
            .vis-toggle-track::after {
                content: '';
                position: absolute;
                left: 3px; top: 3px;
                width: 18px; height: 18px;
                background: #fff;
                border-radius: 50%;
                transition: transform .2s;
                box-shadow: 0 1px 4px rgba(0,0,0,.2);
            }
            .vis-toggle input:checked + .vis-toggle-track::after { transform: translateX(18px); }
            .vis-modal-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
                padding-top: 16px;
                border-top: 1px solid rgba(0,0,0,0.07);
            }
        </style>
        <div class="stats-grid ${isSortMode ? 'sort-mode' : ''}">
            ${activeWidgets.map(w => {
                if (w.type === 'header') {
                    return `
                        <div class="dashboard-section-header ${isSortMode ? 'is-draggable' : ''}"
                             data-id="${w.id}"
                             onpointerdown="window.dispatchDragStart(event, '${w.id}')"
                             style="${isSortMode ? 'cursor:grab;' : ''}">
                            <div style="flex:1;">
                                ${isSortMode ? `
                                    <input type="text" class="section-edit-input" style="font-size:1.5rem;font-weight:800;padding:0;background:none;border:none;width:100%;outline:none;" value="${w.title}" oninput="window.updateSectionText('${w.id}', 'title', this.value)" onpointerdown="event.stopPropagation()">
                                    <input type="text" class="section-edit-input" style="font-size:0.9rem;opacity:0.6;padding:0;margin-top:5px;background:none;border:none;width:100%;outline:none;" value="${w.description}" oninput="window.updateSectionText('${w.id}', 'description', this.value)" onpointerdown="event.stopPropagation()">
                                ` : `
                                    <h3>${w.title}</h3>
                                    <p>${w.description}</p>
                                `}
                            </div>
                            ${isSortMode ? `<button class="btn-delete-section" onclick="window.removeDashboardSection('${w.id}')" onpointerdown="event.stopPropagation()"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    `;
                }

                const template = WIDGET_TEMPLATES[w.id];
                const widgetHtml = template
                    ? template(d)
                    : `<div class="stat-widget full-height" style="opacity:.5;display:flex;align-items:center;justify-content:center;"><i class="fas fa-plug" style="margin-right:10px;"></i>${w.id}</div>`;

                return `
                    <div class="${w.size || 'span-4'} ${w.vSize || 'span-h-1'} ${isSortMode ? 'is-draggable' : ''} ${isResizing && resizingWidgetId === w.id ? 'resizing' : ''}"
                         style="position:relative;"
                         data-id="${w.id}"
                         onmouseenter="this.classList.add('widget-hover')"
                         onmouseleave="this.classList.remove('widget-hover')"
                         onpointerdown="window.dispatchDragStart(event, '${w.id}')">
                        ${isSortMode ? `<div class="resize-handle" onmousedown="window.dispatchResizeStart(event, '${w.id}')"></div>` : ''}
                        ${widgetHtml}
                    </div>
                `;
            }).join('')}
        </div>
        ${activeWidgets.length === 0 ? '<div style="padding:100px;text-align:center;opacity:.5;"><h3>Keine Widgets aktiv</h3></div>' : ''}
    `;

    // --- Drag & Drop ---
    function handlePointerDown(e, id) {
        if (!isSortMode || isResizing || e.button !== 0) return;
        if (e.target.closest('button, input, textarea')) return;
        isPointerDragging = true;
        draggedWidgetId   = id;
        draggedGroupIds   = [];
        const sourceEl    = document.querySelector(`[data-id="${id}"]`);
        if (!sourceEl) return;
        const sourceIdx = localDashboardConfig.findIndex(w => w.id === id);
        if (sourceIdx !== -1 && localDashboardConfig[sourceIdx].type === 'header') {
            draggedGroupIds.push(id);
            for (let i = sourceIdx + 1; i < localDashboardConfig.length; i++) {
                if (localDashboardConfig[i].type === 'header') break;
                draggedGroupIds.push(localDashboardConfig[i].id);
            }
        }
        const rect    = sourceEl.getBoundingClientRect();
        dragOffsetX   = e.clientX - rect.left;
        dragOffsetY   = e.clientY - rect.top;
        dragProxyEl   = sourceEl.cloneNode(true);
        dragProxyEl.classList.add('drag-proxy');
        dragProxyEl.style.cssText += `width:${rect.width}px;height:${rect.height}px;left:${rect.left}px;top:${rect.top}px;`;
        document.body.appendChild(dragProxyEl);
        sourceEl.classList.add('drag-source-hidden');
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        e.preventDefault();
    }

    function handlePointerMove(e) {
        if (!isPointerDragging || !dragProxyEl) return;
        dragProxyEl.style.left = (e.clientX - dragOffsetX) + 'px';
        dragProxyEl.style.top  = (e.clientY - dragOffsetY) + 'px';
        dragProxyEl.style.display = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        dragProxyEl.style.display = 'flex';
        const widgetEl = target ? target.closest('[data-id]') : null;
        if (widgetEl && widgetEl.dataset.id !== draggedWidgetId) handleSwapLogic(widgetEl.dataset.id);
    }

    function handleSwapLogic(targetId) {
        const now = Date.now();
        if (now - lastSwapTime < 350) return;
        const sourceIdx = localDashboardConfig.findIndex(w => w.id === draggedWidgetId);
        const targetIdx = localDashboardConfig.findIndex(w => w.id === targetId);
        if (sourceIdx === -1 || targetIdx === -1) return;
        lastSwapTime = now;
        const grid     = document.querySelector('.stats-grid');
        const targetEl = document.querySelector(`[data-id="${targetId}"]`);
        if (draggedGroupIds.length > 1) {
            const group = localDashboardConfig.splice(sourceIdx, draggedGroupIds.length);
            const newTargetIdx = localDashboardConfig.findIndex(w => w.id === targetId);
            localDashboardConfig.splice(newTargetIdx, 0, ...group);
            const nodes = draggedGroupIds.map(gid => document.querySelector(`[data-id="${gid}"]`)).filter(Boolean);
            nodes.forEach(node => grid.insertBefore(node, sourceIdx < targetIdx ? targetEl.nextElementSibling : targetEl));
        } else {
            const [moved] = localDashboardConfig.splice(sourceIdx, 1);
            localDashboardConfig.splice(targetIdx, 0, moved);
            const sourceEl = document.querySelector(`[data-id="${draggedWidgetId}"]`);
            grid.insertBefore(sourceEl, sourceIdx < targetIdx ? targetEl.nextElementSibling : targetEl);
        }
    }

    function handlePointerUp() {
        if (dragProxyEl) dragProxyEl.remove();
        const sourceEl = document.querySelector(`[data-id="${draggedWidgetId}"]`);
        if (sourceEl) sourceEl.classList.remove('drag-source-hidden');
        isPointerDragging = false;
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        renderDashboard(container, titleEl, toolbarEl);
    }

    // --- Resize ---
    function handleResizeStart(e, id) {
        e.preventDefault(); e.stopPropagation();
        isResizing = true; resizingWidgetId = id;
        startX = e.pageX; startY = e.pageY;
        const el = document.querySelector(`[data-id="${id}"]`);
        startWidth = el.offsetWidth; startHeight = el.offsetHeight;
        document.addEventListener('mousemove', handleResizing);
        document.addEventListener('mouseup', handleResizeEnd);
    }

    function handleResizing(e) {
        if (!isResizing) return;
        const currentWidth  = startWidth  + (e.pageX - startX);
        const currentHeight = startHeight + (e.pageY - startY);
        const gridWidth = document.querySelector('.stats-grid').offsetWidth;
        const cols   = (currentWidth / gridWidth) * 12;
        const newSize  = cols > 9 ? 'span-12' : cols > 5 ? 'span-6' : cols > 3.5 ? 'span-4' : 'span-3';
        const rows     = Math.round(currentHeight / 150);
        const newVSize = rows >= 3 ? 'span-h-3' : rows >= 2 ? 'span-h-2' : 'span-h-1';
        const widget = localDashboardConfig.find(w => w.id === resizingWidgetId);
        if (widget && (widget.size !== newSize || widget.vSize !== newVSize)) {
            widget.size = newSize; widget.vSize = newVSize;
            renderDashboard(container, titleEl, toolbarEl);
        }
    }

    function handleResizeEnd() {
        isResizing = false; resizingWidgetId = null;
        document.removeEventListener('mousemove', handleResizing);
        document.removeEventListener('mouseup', handleResizeEnd);
    }
}

async function toggleSortMode() {
    if (!isSortMode) {
        const settings = await apiGet('settings') || {};
        localDashboardConfig = JSON.parse(JSON.stringify(settings.dashboardConfig || DEFAULT_WIDGETS));
        isSortMode = true;
    } else {
        const res = await apiPost('settings', { dashboardConfig: localDashboardConfig });
        if (res.success) {
            isSortMode = false;
            localDashboardConfig = null;
            showToast('Anordnung gespeichert!');
        }
    }
    document.querySelector('.nav-item.active').click();
}

async function customizeDashboard() {
    // Aktuelle Konfiguration laden (aus Settings oder Default)
    const settings = await apiGet('settings') || {};
    const config = JSON.parse(JSON.stringify(settings.dashboardConfig || DEFAULT_WIDGETS));

    // Alle bekannten Widget-IDs (nur echte Widgets, keine Header)
    const knownIds = Object.keys(WIDGET_META);

    // Sicherstellen dass alle Widgets in der Config vorhanden sind
    knownIds.forEach(id => {
        if (!config.find(w => w.id === id)) {
            config.push({ id, size: 'span-4', active: false });
        }
    });

    // Modal bauen
    const overlay = document.createElement('div');
    overlay.id = 'visibility-modal-overlay';
    overlay.innerHTML = `
        <div id="visibility-modal">
            <h2><i class="fas fa-eye"></i> Widget-Sichtbarkeit</h2>
            ${knownIds.map(id => {
                const meta = WIDGET_META[id];
                const entry = config.find(w => w.id === id) || { active: true };
                const isActive = entry.active !== false;
                return `
                    <div class="vis-widget-row">
                        <div class="vis-widget-label">
                            <i class="fas ${meta.icon}"></i>
                            <span>${meta.label}</span>
                        </div>
                        <label class="vis-toggle">
                            <input type="checkbox" data-widget-id="${id}" ${isActive ? 'checked' : ''}>
                            <div class="vis-toggle-track"></div>
                        </label>
                    </div>`;
            }).join('')}
            <div class="vis-modal-footer">
                <button class="btn-secondary" id="vis-modal-cancel">Abbrechen</button>
                <button class="btn-primary" id="vis-modal-save"><i class="fas fa-save"></i> Speichern</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Schließen bei Klick auf Overlay-Hintergrund
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.getElementById('vis-modal-cancel').onclick = () => overlay.remove();

    document.getElementById('vis-modal-save').onclick = async () => {
        const checkboxes = overlay.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const entry = config.find(w => w.id === cb.dataset.widgetId);
            if (entry) entry.active = cb.checked;
        });
        const res = await apiPost('settings', { dashboardConfig: config });
        overlay.remove();
        if (res.success) {
            showToast('Sichtbarkeit gespeichert!');
            // Dashboard neu rendern
            const contentView    = document.getElementById('content-view');
            const viewTitle      = document.getElementById('view-title');
            const dashToolbar    = document.getElementById('dashboard-toolbar');
            await renderDashboard(contentView, viewTitle, dashToolbar);
        } else {
            showToast('Fehler beim Speichern', 'error');
        }
    };
}

function addDashboardSection() {
    localDashboardConfig.push({ id: 'header-' + Date.now(), type: 'header', title: 'Neue Sektion', description: '', size: 'span-12' });
}
function removeDashboardSection(id) {
    localDashboardConfig = localDashboardConfig.filter(w => w.id !== id);
}
function updateSectionText(id, field, value) {
    const h = localDashboardConfig.find(w => w.id === id);
    if (h) h[field] = value;
}
