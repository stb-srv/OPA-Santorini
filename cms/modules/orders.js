/**
 * Kitchen Monitor Module for Grieche-CMS
 * Handles real-time digital orders.
 */

import { apiGet, apiPost, apiPut } from './api.js';
import { showToast } from './utils.js';

let orders = [];
let socket = null;

export async function renderOrders(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-shopping-cart"></i> Küchen-Monitor';
    
    // Load existing orders
    orders = await apiGet('orders') || [];

    // Initialize Socket (if not already)
    initSocket();

    container.innerHTML = `
        <div class="glass-panel" style="padding:40px; min-height:80vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                <div>
                    <h3 style="margin-bottom:4px;">Aktive Bestellungen</h3>
                    <p style="color:var(--text-muted); font-size:.85rem;">Echtzeit-Anzeige eingehender Bestellungen über die Gästeseite.</p>
                </div>
                <div id="socket-status" style="display:flex; align-items:center; gap:8px;">
                    <div class="status-dot ${socket?.connected ? 'green' : 'gray'}"></div>
                    <span style="font-size:.75rem; font-weight:700; text-transform:uppercase;">${socket?.connected ? 'Live verbunden' : 'Verbinde...'}</span>
                </div>
            </div>

            <div id="kitchen-grid" class="kitchen-grid">
                ${renderOrderCards()}
            </div>
            
            ${orders.length === 0 ? '<div id="no-orders" style="padding:100px; text-align:center; opacity:.5;"><h3>Momentan keine Bestellungen</h3><p>Neue Bestellungen erscheinen hier automatisch in Echtzeit.</p></div>' : ''}
        </div>
    `;

    attachOrderHandlers(container);
}

function renderOrderCards() {
    return orders.map(o => {
        const typeLabel = {
            dine_in:  { label: 'Tisch ' + (o.tableNumber || o.table || '?'), color: '#3b82f6', icon: 'fa-utensils' },
            pickup:   { label: 'Abholung' + (o.pickupTime ? ' ' + o.pickupTime : ''), color: '#f59e0b', icon: 'fa-shopping-bag' },
            delivery: { label: 'Lieferung', color: '#10b981', icon: 'fa-motorcycle' }
        }[o.type] || { label: o.type || '?', color: '#6b7280', icon: 'fa-question' };

        return `
        <div class="order-card ${o.status === 'ready' ? 'completed' : ''}" data-id="${o.id}">
            <div class="order-header">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <strong>${typeLabel.label}</strong>
                        <div style="
                            display:inline-flex; align-items:center; gap:5px;
                            background:${typeLabel.color}22; color:${typeLabel.color};
                            border:1px solid ${typeLabel.color}44;
                            padding:2px 8px; border-radius:20px;
                            font-size:.68rem; font-weight:700; margin-top:4px; margin-left:8px;
                        ">
                            <i class="fas ${typeLabel.icon}" style="font-size:.65rem;"></i>
                            ${o.type || 'Unbekannt'}
                        </div>
                    </div>
                    <div class="order-time">${new Date(o.createdAt || o.timestamp).toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
            </div>
            <div class="order-items">
                ${o.items.map(i => `
                    <div class="order-item">
                        <span class="count">${i.count}x</span>
                        <span class="name">${i.name}</span>
                        ${i.note ? `<br><small class="item-note">${i.note}</small>` : ''}
                    </div>
                `).join('')}
                
                ${o.guestNote ? `
                    <div style="margin-top:12px; padding:10px; background:#fef9c3; border-radius:8px; font-size:.78rem; color:#854d0e; border-left:4px solid #facc15;">
                        <i class="fas fa-sticky-note" style="margin-right:5px; opacity:.7;"></i><strong>Notiz vom Gast:</strong><br>${o.guestNote}
                    </div>` : ''}
            </div>
            <div class="order-footer">
                ${o.status !== 'ready' 
                    ? `<button class="btn-primary small" onclick="window.completeOrder('${o.id}')">Erledigt <i class="fas fa-check"></i></button>`
                    : '<span style="color:var(--primary); font-weight:800;"><i class="fas fa-check-circle"></i> Fertig</span>'}
            </div>
        </div>`;
    }).join('');
}

function initSocket() {
    if (socket) return;
    
    // Load socket.io from CDN in index.html to avoid import issues or use /socket.io/socket.io.js
    if (window.io) {
        socket = window.io();
        socket.on('connect', () => { 
            const badge = document.getElementById('socket-status');
            if (badge) {
                badge.querySelector('.status-dot').className = 'status-dot green';
                badge.querySelector('span').textContent = 'Live verbunden';
            }
        });
        socket.on('new_order', (order) => {
            orders.unshift(order);
            const grid = document.getElementById('kitchen-grid');
            if (grid) {
                grid.innerHTML = renderOrderCards();
                document.getElementById('no-orders')?.remove();
                showToast(`Neue Bestellung von Tisch ${order.table}!`);
                playOrderSound();
            }
        });

        socket.on('disconnect', () => {
            const badge = document.getElementById('socket-status');
            if (badge) {
                badge.querySelector('.status-dot').className = 'status-dot gray';
                badge.querySelector('span').textContent = 'Verbindung unterbrochen...';
            }
        });

        socket.on('reconnect', async () => {
            const badge = document.getElementById('socket-status');
            if (badge) {
                badge.querySelector('.status-dot').className = 'status-dot green';
                badge.querySelector('span').textContent = 'Live verbunden';
            }
            // Verpasste Bestellungen nachladen
            const fresh = await apiGet('orders');
            if (fresh) {
                orders = fresh;
                const grid = document.getElementById('kitchen-grid');
                if (grid) grid.innerHTML = renderOrderCards();
            }
        });
    }
}

function playOrderSound() {
    const audio = new Audio('/cms/assets/sounds/order-notification.mp3');
    audio.play().catch(() => {}); // Autoplay might be blocked
}

function attachOrderHandlers(container) {
    window.completeOrder = async (id) => {
        const idx = orders.findIndex(o => o.id === id);
        if (idx < 0) return;
        try {
            await apiPut(`orders/${id}/status`, { status: 'ready' });
            orders[idx].status = 'ready';
            container.querySelector('#kitchen-grid').innerHTML = renderOrderCards();
        } catch (e) {
            showToast('Fehler beim Speichern des Status.', 'error');
        }
    };
}
