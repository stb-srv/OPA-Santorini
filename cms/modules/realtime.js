/**
 * OPA-CMS – Realtime-Bridge via Socket.io
 * Empfängt Server-Events und dispatcht sie als CustomEvents im Browser.
 */

let socket = null;
const listeners = new Map();

export function initRealtime() {
    if (socket) return;
    if (typeof io === 'undefined') {
        console.warn('Socket.io nicht geladen – Realtime deaktiviert.');
        return;
    }

    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
        console.log('🔴 Realtime verbunden:', socket.id);
        document.dispatchEvent(new CustomEvent('realtime:connected'));
    });

    socket.on('disconnect', () => {
        document.dispatchEvent(new CustomEvent('realtime:disconnected'));
    });

    // Reservierungen
    socket.on('reservation:new', data => {
        document.dispatchEvent(new CustomEvent('realtime:reservation:new', { detail: data }));
        showRealtimeToast(`📅 Neue Reservierung: ${data.name || '–'} (${data.guests} Gäste)`, 'info');
    });
    socket.on('reservation:updated', data => {
        document.dispatchEvent(new CustomEvent('realtime:reservation:updated', { detail: data }));
    });
    socket.on('reservation:cancelled', data => {
        document.dispatchEvent(new CustomEvent('realtime:reservation:cancelled', { detail: data }));
        showRealtimeToast(`❌ Reservierung storniert: ${data.name || '–'}`, 'warning');
    });

    // Bestellungen
    socket.on('order:new', data => {
        document.dispatchEvent(new CustomEvent('realtime:order:new', { detail: data }));
        showRealtimeToast(`🛎️ Neue Bestellung: Tisch ${data.table || '–'}`, 'success');
    });

    // Tischstatus
    socket.on('table:status', data => {
        document.dispatchEvent(new CustomEvent('realtime:table:status', { detail: data }));
        updateTableStatusBadge(data);
    });
}

function showRealtimeToast(msg, type = 'info') {
    // Nutzt das bestehende showToast aus utils.js falls verfügbar
    if (window.__opaShowToast) {
        window.__opaShowToast(msg, type);
        return;
    }
    const t = document.createElement('div');
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        background:${type==='success'?'#16a34a':type==='warning'?'#d97706':'#1b3a5c'};
        color:#fff; padding:12px 20px; border-radius:12px;
        font-size:.88rem; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.2);
        animation:slideIn .3s ease; max-width:320px;
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

function updateTableStatusBadge(data) {
    const el = document.querySelector(`[data-table-id="${data.table_id}"] .table-status-dot`);
    if (!el) return;
    el.style.background = data.occupied ? '#ef4444' : '#16a34a';
    el.title = data.occupied ? 'Besetzt' : 'Frei';
}

export function onRealtime(event, callback) {
    document.addEventListener(`realtime:${event}`, e => callback(e.detail));
}

export function emitRealtime(event, data) {
    if (socket?.connected) socket.emit(event, data);
}
