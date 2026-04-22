/**
 * Küchen-Monitor – Erweiterter Order-Flow
 * 
 * Status-Flow:
 *   dine_in:          pending → preparing → ready
 *   pickup/delivery:  pending → confirmed → preparing → ready → completed
 *
 * Neue Felder auf Order-Karte:
 *   - Kundenname, Telefon, E-Mail (bei pickup/delivery)
 *   - Bestellzeitpunkt (formatiert)
 *   - Voraussichtliche Zeit (estimatedTime, editierbar)
 *   - Abholadresse (bei delivery)
 *   - Mehrere Aktions-Buttons je nach Status
 */

import { apiGet, apiPost, apiPut } from './api.js';
import { showToast } from './utils.js';

let orders = [];
let socket = null;
let filterStatus = 'active'; // 'active' | 'all' | 'completed'

export async function renderOrders(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-fire"></i> Küchen-Monitor';
    orders = await apiGet('orders') || [];
    initSocket(container);
    renderAll(container);
}

function renderAll(container) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:32px; min-height:80vh;">
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px;">
                <div>
                    <h3 style="margin-bottom:4px;">Küchen-Monitor</h3>
                    <p style="color:var(--text-muted); font-size:.82rem;">
                        Eingehende Bestellungen – Abholung &amp; Lieferung müssen zuerst bestätigt werden.
                    </p>
                </div>
                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                    <!-- Filter -->
                    <div style="display:flex; gap:6px;">
                        <button class="km-filter-btn ${filterStatus==='active'?'active':''}" data-filter="active">Aktiv</button>
                        <button class="km-filter-btn ${filterStatus==='all'?'active':''}" data-filter="all">Alle</button>
                        <button class="km-filter-btn ${filterStatus==='completed'?'active':''}" data-filter="completed">Abgeschlossen</button>
                    </div>
                    <!-- Socket Status -->
                    <div id="socket-status" style="display:flex; align-items:center; gap:6px;">
                        <div class="status-dot ${socket?.connected?'green':'gray'}"></div>
                        <span style="font-size:.72rem; font-weight:700; text-transform:uppercase;">
                            ${socket?.connected ? 'Live' : 'Verbinde...'}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Pending-Anfragen Banner (nur pickup/delivery) -->
            <div id="km-pending-banner"></div>

            <!-- Bestellkarten Grid -->
            <div id="kitchen-grid" class="kitchen-grid"></div>
            <div id="km-empty" style="display:none; padding:80px; text-align:center; opacity:.45;">
                <h3>Keine Bestellungen</h3>
                <p>Neue Bestellungen erscheinen hier in Echtzeit.</p>
            </div>
        </div>
    `;

    // Filter-Buttons
    container.querySelectorAll('.km-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filterStatus = btn.dataset.filter;
            container.querySelectorAll('.km-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filterStatus));
            refreshGrid(container);
        });
    });

    refreshGrid(container);
    attachGlobalHandlers(container);
}

function getFilteredOrders() {
    if (filterStatus === 'active')    return orders.filter(o => !['ready','completed','cancelled'].includes(o.status));
    if (filterStatus === 'completed') return orders.filter(o => ['ready','completed','cancelled'].includes(o.status));
    return orders;
}

function refreshGrid(container) {
    const filtered = getFilteredOrders();
    const grid = container.querySelector('#kitchen-grid');
    const empty = container.querySelector('#km-empty');
    if (!grid) return;
    grid.innerHTML = filtered.map(o => renderCard(o)).join('');
    empty.style.display = filtered.length === 0 ? 'block' : 'none';
    updatePendingBanner(container);
}

function updatePendingBanner(container) {
    const banner = container.querySelector('#km-pending-banner');
    if (!banner) return;
    const pendingExternal = orders.filter(o => o.status === 'pending' && (o.type === 'pickup' || o.type === 'delivery'));
    if (pendingExternal.length === 0) { banner.innerHTML = ''; return; }
    banner.innerHTML = `
        <div style="background:rgba(239,68,68,.1); border:2px solid rgba(239,68,68,.4); border-radius:12px;
                    padding:14px 20px; margin-bottom:20px; display:flex; align-items:center; gap:12px; animation:pulse 2s infinite;">
            <span style="font-size:1.3rem;">🔔</span>
            <strong style="color:#dc2626;">${pendingExternal.length} neue Anfrage${pendingExternal.length>1?'n':''} warten auf Bestätigung!</strong>
        </div>
    `;
}

function renderCard(o) {
    const isExternal = o.type === 'pickup' || o.type === 'delivery';
    
    const typeInfo = {
        dine_in:  { label: 'Tisch ' + (o.tableNumber || o.table || '?'), color: '#3b82f6', icon: 'fa-utensils', bg: '#3b82f622' },
        pickup:   { label: 'Abholung',  color: '#f59e0b', icon: 'fa-shopping-bag', bg: '#f59e0b22' },
        delivery: { label: 'Lieferung', color: '#10b981', icon: 'fa-motorcycle',   bg: '#10b98122' }
    }[o.type] || { label: o.type || '?', color: '#6b7280', icon: 'fa-question', bg: '#6b728022' };

    const statusInfo = {
        pending:   { label: 'Ausstehend',    color: '#f59e0b', icon: 'fa-clock' },
        confirmed: { label: 'Bestätigt',     color: '#3b82f6', icon: 'fa-thumbs-up' },
        preparing: { label: 'In Zubereitung',color: '#8b5cf6', icon: 'fa-fire' },
        ready:     { label: 'Fertig',         color: '#22c55e', icon: 'fa-check-circle' },
        completed: { label: 'Abgeschlossen', color: '#6b7280', icon: 'fa-check-double' },
        cancelled: { label: 'Abgelehnt',     color: '#ef4444', icon: 'fa-times-circle' }
    }[o.status] || { label: o.status, color: '#6b7280', icon: 'fa-question' };

    const isCompleted = ['ready','completed','cancelled'].includes(o.status);
    const orderTime   = new Date(o.timestamp || o.createdAt);
    const timeStr     = orderTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const dateStr     = orderTime.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const isToday     = orderTime.toDateString() === new Date().toDateString();

    // Minuten seit Bestellung berechnen
    const minAgo = Math.floor((Date.now() - orderTime.getTime()) / 60000);
    const ageStr  = minAgo < 1 ? 'Gerade eben' : minAgo < 60 ? `vor ${minAgo} Min.` : `${Math.floor(minAgo/60)}h ${minAgo%60}m`;

    return `
    <div class="order-card ${isCompleted ? 'completed' : ''} ${o.status === 'pending' && isExternal ? 'order-card--urgent' : ''}" 
         data-id="${o.id}" style="position:relative; overflow:hidden;">
        
        <!-- Status-Indikator oben links -->
        <div style="position:absolute; top:0; left:0; right:0; height:3px; background:${statusInfo.color};"></div>
        
        <!-- Header: Typ + Status + Zeit -->
        <div class="order-header" style="padding-bottom:10px; border-bottom:1px solid rgba(0,0,0,.07);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <!-- Bestellart Badge -->
                    <div style="display:inline-flex; align-items:center; gap:5px;
                                background:${typeInfo.bg}; color:${typeInfo.color};
                                border:1px solid ${typeInfo.color}44;
                                padding:4px 10px; border-radius:20px;
                                font-size:.72rem; font-weight:800;">
                        <i class="fas ${typeInfo.icon}" style="font-size:.65rem;"></i>
                        ${typeInfo.label}
                    </div>
                    <!-- Status Badge -->
                    <div style="display:inline-flex; align-items:center; gap:5px;
                                background:${statusInfo.color}15; color:${statusInfo.color};
                                padding:4px 10px; border-radius:20px;
                                font-size:.72rem; font-weight:700;">
                        <i class="fas ${statusInfo.icon}" style="font-size:.62rem;"></i>
                        ${statusInfo.label}
                    </div>
                </div>
                <!-- Zeit -->
                <div style="text-align:right; flex-shrink:0;">
                    <div style="font-weight:800; font-size:.88rem; color:var(--text);">${timeStr}</div>
                    <div style="font-size:.7rem; color:var(--text-muted);">${isToday ? ageStr : dateStr}</div>
                </div>
            </div>
        </div>

        <!-- Kundendaten (nur bei pickup/delivery) -->
        ${isExternal ? `
        <div style="padding:10px 0; border-bottom:1px solid rgba(0,0,0,.07); font-size:.8rem;">
            <div style="font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; 
                        color:var(--text-muted); margin-bottom:6px;">Kunde</div>
            <div style="display:flex; flex-direction:column; gap:3px;">
                ${o.customerName  ? `<div>👤 <strong>${escHtml(o.customerName)}</strong></div>` : ''}
                ${o.customerPhone ? `<div>📞 <a href="tel:${escHtml(o.customerPhone)}" style="color:var(--primary); text-decoration:none;">${escHtml(o.customerPhone)}</a></div>` : ''}
                ${o.customerEmail ? `<div>✉️ <span style="color:var(--text-muted);">${escHtml(o.customerEmail)}</span></div>` : ''}
                ${o.type === 'delivery' && o.deliveryAddress ? `<div>📍 ${escHtml(o.deliveryAddress)}</div>` : ''}
                ${o.type === 'pickup' && o.pickupTime ? `<div>⏰ Abholen um: <strong>${escHtml(o.pickupTime)}</strong></div>` : ''}
            </div>
        </div>` : ''}

        <!-- Bestellte Artikel -->
        <div class="order-items" style="padding:10px 0;">
            <div style="font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; 
                        color:var(--text-muted); margin-bottom:8px;">Bestellung</div>
            ${o.items.map(i => `
                <div class="order-item">
                    <span class="count">${i.quantity}×</span>
                    <span class="name">${escHtml(i.name)}</span>
                    ${i.variant  ? `<span style="font-size:.72rem; color:var(--text-muted); margin-left:4px;">(${escHtml(i.variant)})</span>` : ''}
                    ${i.extras && Array.isArray(i.extras) && i.extras.length > 0 
                        ? `<br><small style="color:#6b7280; margin-left:16px;"><i class="fas fa-plus-circle" style="margin-right:3px; opacity:.6;"></i>${i.extras.map(escHtml).join(', ')}</small>` : ''}
                    ${i.note ? `<div style="margin-top:3px; margin-left:16px; font-size:.75rem; font-weight:700; color:var(--primary);">📝 ${escHtml(i.note)}</div>` : ''}
                </div>
            `).join('')}

            ${o.guestNote ? `
            <div style="margin-top:10px; padding:10px 12px; background:#fef9c3; border-radius:8px;
                        font-size:.78rem; color:#854d0e; border-left:4px solid #facc15;">
                <i class="fas fa-sticky-note" style="margin-right:5px; opacity:.7;"></i>
                <strong>Hinweis:</strong> ${escHtml(o.guestNote)}
            </div>` : ''}
        </div>

        <!-- Gesamtbetrag -->
        ${o.total ? `
        <div style="padding:6px 0; font-size:.82rem; font-weight:700; border-top:1px solid rgba(0,0,0,.07);">
            Gesamt: <span style="color:var(--primary);">${parseFloat(o.total).toFixed(2)} €</span>
        </div>` : ''}

        <!-- Geschätzte Zeit (editierbar bei confirmed/preparing) -->
        ${['confirmed','preparing'].includes(o.status) && isExternal ? `
        <div style="padding:8px 0; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <label style="font-size:.75rem; font-weight:700; color:var(--text-muted);">⏱️ Voraussichtlich:</label>
            <input type="text" class="km-eta-input" data-id="${o.id}" 
                   value="${escHtml(o.estimatedTime || '')}" 
                   placeholder="z.B. 30 Min. / 18:45 Uhr"
                   style="flex:1; min-width:120px; padding:5px 10px; border-radius:8px;
                          border:1px solid rgba(0,0,0,.2); font-size:.78rem; background:var(--bg,#fff);">
            <button class="btn-small km-eta-save" data-id="${o.id}" style="flex-shrink:0;">Speichern</button>
        </div>` : ''}
        ${o.estimatedTime && !['confirmed','preparing'].includes(o.status) ? `
        <div style="font-size:.78rem; color:var(--text-muted); padding:4px 0;">
            ⏱️ ${escHtml(o.estimatedTime)}
        </div>` : ''}

        <!-- Aktions-Footer -->
        <div class="order-footer" style="padding-top:10px; border-top:1px solid rgba(0,0,0,.07);">
            ${renderActions(o)}
        </div>
    </div>`;
}

function renderActions(o) {
    const isExternal = o.type === 'pickup' || o.type === 'delivery';

    if (o.status === 'cancelled') return '<span style="color:#ef4444; font-size:.8rem; font-weight:700;"><i class="fas fa-times-circle"></i> Abgelehnt</span>';
    if (o.status === 'completed') return '<span style="color:#6b7280; font-size:.8rem; font-weight:700;"><i class="fas fa-check-double"></i> Abgeschlossen</span>';

    const btns = [];

    if (isExternal && o.status === 'pending') {
        btns.push(`<button class="btn-primary small km-action" data-id="${o.id}" data-status="confirmed" 
                           style="background:#22c55e; border-color:#22c55e;">
                       ✅ Bestätigen
                   </button>`);
        btns.push(`<button class="btn-danger small km-action" data-id="${o.id}" data-status="cancelled">
                       ❌ Ablehnen
                   </button>`);
    }

    if (o.status === 'confirmed' || (!isExternal && o.status === 'pending')) {
        btns.push(`<button class="btn-primary small km-action" data-id="${o.id}" data-status="preparing">
                       🍳 In Zubereitung
                   </button>`);
    }

    if (o.status === 'preparing') {
        btns.push(`<button class="btn-primary small km-action" data-id="${o.id}" data-status="ready">
                       ✅ Fertig
                   </button>`);
    }

    if (o.status === 'ready' && isExternal) {
        btns.push(`<button class="btn-primary small km-action" data-id="${o.id}" data-status="completed"
                           style="background:#6b7280; border-color:#6b7280;">
                       📦 Übergeben / Abgeschlossen
                   </button>`);
    }

    if (o.status === 'ready' && !isExternal) {
        return '<span style="color:#22c55e; font-weight:800;"><i class="fas fa-check-circle"></i> Fertig für Tisch</span>';
    }

    return btns.join('');
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function attachGlobalHandlers(container) {
    // Status-Aktionen
    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('.km-action');
        if (!btn) return;
        const id     = btn.dataset.id;
        const status = btn.dataset.status;
        btn.disabled = true;
        try {
            const eta = container.querySelector(`.km-eta-input[data-id="${id}"]`)?.value || undefined;
            await apiPut(`orders/${id}/status`, { status, estimatedTime: eta });
            const idx = orders.findIndex(o => o.id === id);
            if (idx > -1) { orders[idx].status = status; if (eta) orders[idx].estimatedTime = eta; }
            refreshGrid(container);
            showToast(`Status: ${status}`);
        } catch(e) {
            showToast('Fehler beim Speichern.', 'error');
            btn.disabled = false;
        }
    });

    // ETA speichern
    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('.km-eta-save');
        if (!btn) return;
        const id  = btn.dataset.id;
        const eta = container.querySelector(`.km-eta-input[data-id="${id}"]`)?.value;
        try {
            const o   = orders.find(x => x.id === id);
            await apiPut(`orders/${id}/status`, { status: o.status, estimatedTime: eta });
            const idx = orders.findIndex(x => x.id === id);
            if (idx > -1) orders[idx].estimatedTime = eta;
            showToast('Zeit gespeichert.');
        } catch { showToast('Fehler.', 'error'); }
    });
}

function initSocket(container) {
    if (socket) return;
    if (!window.io) return;
    socket = window.io();

    socket.on('connect', () => updateSocketBadge(true, container));
    socket.on('disconnect', () => updateSocketBadge(false, container));

    socket.on('new_order', (order) => {
        orders.unshift(order);
        refreshGrid(container);
        const isExternal = order.type === 'pickup' || order.type === 'delivery';
        const msg = isExternal
            ? `📦 Neue Anfrage: ${order.type === 'pickup' ? 'Abholung' : 'Lieferung'} von ${order.customerName || 'Gast'}`
            : `🍽️ Neue Tischbestellung – Tisch ${order.tableNumber || '?'}`;
        showToast(msg);
        playOrderSound();
    });

    socket.on('order-updated', (update) => {
        const idx = orders.findIndex(o => o.id === update.id);
        if (idx > -1) { Object.assign(orders[idx], update); refreshGrid(container); }
    });

    socket.on('reconnect', async () => {
        updateSocketBadge(true, container);
        const fresh = await apiGet('orders');
        if (fresh) { orders = fresh; refreshGrid(container); }
    });
}

function updateSocketBadge(connected, container) {
    const badge = container?.querySelector('#socket-status') || document.getElementById('socket-status');
    if (!badge) return;
    badge.querySelector('.status-dot').className = `status-dot ${connected ? 'green' : 'gray'}`;
    badge.querySelector('span').textContent = connected ? 'Live' : 'Unterbrochen';
}

function playOrderSound() {
    try { new Audio('/admin/assets/sounds/order-notification.mp3').play().catch(() => {}); } catch {}
}
