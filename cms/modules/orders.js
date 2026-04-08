/**
 * Kitchen Monitor Module for Grieche-CMS
 * Handles real-time digital orders.
 */

import { apiGet, apiPost } from './api.js';
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
    return orders.map(o => `
        <div class="order-card ${o.status === 'ready' ? 'completed' : ''}" data-id="${o.id}">
            <div class="order-header">
                <div><strong>Tisch ${o.table || 'N/A'}</strong></div>
                <div class="order-time">${new Date(o.timestamp).toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
            <div class="order-items">
                ${o.items.map(i => `
                    <div class="order-item">
                        <span class="count">${i.count}x</span>
                        <span class="name">${i.name}</span>
                        ${i.note ? `<br><small class="item-note">${i.note}</small>` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="order-footer">
                ${o.status !== 'ready' 
                    ? `<button class="btn-primary small" onclick="window.completeOrder('${o.id}')">Erledigt <i class="fas fa-check"></i></button>`
                    : '<span style="color:var(--primary); font-weight:800;"><i class="fas fa-check-circle"></i> Fertig</span>'}
            </div>
        </div>
    `).join('');
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
        socket.on('new-order', (order) => {
            orders.unshift(order);
            const grid = document.getElementById('kitchen-grid');
            if (grid) {
                grid.innerHTML = renderOrderCards();
                document.getElementById('no-orders')?.remove();
                showToast(`Neue Bestellung von Tisch ${order.table}!`);
                playOrderSound();
            }
        });
    }
}

function playOrderSound() {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => {}); // Autoplay might be blocked
}

function attachOrderHandlers(container) {
    window.completeOrder = async (id) => {
        // Logic to mark as done...
        const idx = orders.findIndex(o => o.id === id);
        if (idx >= 0) {
            orders[idx].status = 'ready';
            container.querySelector('#kitchen-grid').innerHTML = renderOrderCards();
        }
    };
}
