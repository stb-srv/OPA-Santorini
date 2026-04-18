/**
 * OPA-CMS – Gast-Warenkorb
 *
 * Komplett clientseitig (localStorage). Kein Login nötig.
 * Funktioniert unabhängig vom gewählten Lizenzplan.
 *
 * Kachel-Klick-Modus: window.OPA_CART_CLICK_MODE (gesetzt von app.js)
 *   'button' – nur der + Button fügt hinzu
 *   'tile'   – Klick auf die ganze Kachel fügt hinzu (Standard)
 *   'both'   – Kachel UND + Button fügen hinzu
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'opa_cart';
    let cartItems    = [];
    let cartConfig   = {
        ordersEnabled: false, deliveryEnabled: false, pickupEnabled: false,
        dineInEnabled: false, isOpenNow: true, closedReason: null, minPickupTime: null
    };
    let configLoaded = false;

    function loadCart() {
        try { cartItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
        catch (_) { cartItems = []; }
    }

    function saveCart() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems)); }
        catch (_) { }
    }

    function addItem(item) {
        const existing = cartItems.find(i => i.id === item.id);
        if (existing) { existing.quantity += 1; }
        else { cartItems.push({ ...item, quantity: 1 }); }
        saveCart(); render(); animateBadge();
    }

    function removeItem(id) {
        const idx = cartItems.findIndex(i => i.id === id);
        if (idx > -1) {
            cartItems[idx].quantity -= 1;
            if (cartItems[idx].quantity <= 0) cartItems.splice(idx, 1);
        }
        saveCart(); render();
    }

    function clearCart() { cartItems = []; saveCart(); render(); }
    function totalCount() { return cartItems.reduce((s, i) => s + i.quantity, 0); }
    function totalPrice() { return cartItems.reduce((s, i) => s + (parseFloat(i.price) || 0) * i.quantity, 0); }
    function fmt(n) { return n.toFixed(2).replace('.', ',') + ' €'; }

    async function loadConfig() {
        try {
            const res = await fetch('/api/cart/config');
            if (res.ok) cartConfig = await res.json();
        } catch (_) { }
        configLoaded = true;
        render();
    }

    // =========================================================================
    // DOM aufbauen
    // =========================================================================
    function buildCartDOM() {
        if (document.getElementById('opa-cart-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'opa-cart-btn';
        btn.className = 'opa-cart-fab';
        btn.setAttribute('aria-label', 'Warenkorb öffnen');
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            <span class="opa-cart-badge" id="opa-cart-badge">0</span>`;
        btn.addEventListener('click', openDrawer);
        document.body.appendChild(btn);

        const backdrop = document.createElement('div');
        backdrop.id = 'opa-cart-backdrop';
        backdrop.className = 'opa-cart-backdrop';
        backdrop.addEventListener('click', closeDrawer);
        document.body.appendChild(backdrop);

        const drawer = document.createElement('aside');
        drawer.id = 'opa-cart-drawer';
        drawer.className = 'opa-cart-drawer';
        drawer.setAttribute('aria-label', 'Warenkorb');
        drawer.innerHTML = `
            <div class="opa-cart-header">
                <h2>🛒 Warenkorb</h2>
                <button class="opa-cart-close" id="opa-cart-close" aria-label="Schließen">&times;</button>
            </div>
            <div class="opa-cart-body" id="opa-cart-body"></div>
            <div class="opa-cart-footer" id="opa-cart-footer"></div>`;
        document.body.appendChild(drawer);

        document.getElementById('opa-cart-close').addEventListener('click', closeDrawer);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
    }

    function openDrawer() {
        document.getElementById('opa-cart-drawer')?.classList.add('is-open');
        document.getElementById('opa-cart-backdrop')?.classList.add('is-visible');
        document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
        document.getElementById('opa-cart-drawer')?.classList.remove('is-open');
        document.getElementById('opa-cart-backdrop')?.classList.remove('is-visible');
        document.body.style.overflow = '';
    }

    // =========================================================================
    // Render
    // =========================================================================
    function render() {
        const badge  = document.getElementById('opa-cart-badge');
        const body   = document.getElementById('opa-cart-body');
        const footer = document.getElementById('opa-cart-footer');
        if (!badge) return;

        const count = totalCount();
        const price = totalPrice();
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.toggle('has-items', count > 0);
        if (!body) return;

        if (cartItems.length === 0) {
            const mode = window.OPA_CART_CLICK_MODE || 'tile';
            const hint = mode === 'tile' ? 'Tippe auf ein Gericht um es hinzuzufügen.'
                       : mode === 'both' ? 'Tippe auf ein Gericht oder den + Button.'
                       : 'Tippe auf <strong>+</strong> bei einem Gericht um es hinzuzufügen.';
            body.innerHTML = `
                <div class="opa-cart-empty">
                    <div class="opa-cart-empty-icon">🛒</div>
                    <p>Dein Warenkorb ist leer.</p>
                    <small>${hint}</small>
                </div>`;
            footer.innerHTML = '';
            return;
        }

        body.innerHTML = cartItems.map(item => `
            <div class="opa-cart-item" data-id="${escHtml(String(item.id))}">
                <div class="opa-cart-item-info">
                    <span class="opa-cart-item-name">${escHtml(item.name)}</span>
                    <span class="opa-cart-item-price">${fmt(parseFloat(item.price) * item.quantity)}</span>
                </div>
                <div class="opa-cart-item-controls">
                    <button class="opa-cart-qty-btn" data-action="remove" data-id="${escHtml(String(item.id))}" aria-label="Weniger">&#8722;</button>
                    <span class="opa-cart-qty">${item.quantity}</span>
                    <button class="opa-cart-qty-btn" data-action="add" data-id="${escHtml(String(item.id))}" aria-label="Mehr">&#43;</button>
                </div>
            </div>`).join('');

        body.querySelectorAll('.opa-cart-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id     = btn.dataset.id;
                const action = btn.dataset.action;
                const item   = cartItems.find(i => String(i.id) === id);
                if (!item) return;
                if (action === 'add')    addItem({ id: item.id, name: item.name, price: item.price });
                if (action === 'remove') removeItem(id);
            });
        });

        const isClosed    = configLoaded && !cartConfig.isOpenNow;
        const ordersReady = configLoaded && cartConfig.ordersEnabled && !isClosed &&
                            (cartConfig.dineInEnabled || cartConfig.pickupEnabled || cartConfig.deliveryEnabled);

        footer.innerHTML = `
            <div class="opa-cart-total">
                <span>Gesamt</span>
                <strong>${fmt(price)}</strong>
            </div>
            <div class="opa-cart-actions">
                ${ordersReady ? `<button class="opa-cart-btn-checkout" id="opa-checkout-btn">📬 Bestellen</button>` : ''}
                <button class="opa-cart-btn-clear" id="opa-clear-btn">Warenkorb leeren</button>
            </div>
            ${!configLoaded ? '<p class="opa-cart-hint">Lade Verfügbarkeit…</p>' : ''}
            ${isClosed ? `<p class="opa-cart-hint opa-cart-hint--closed">🕑 ${escHtml(cartConfig.closedReason || 'Derzeit keine Bestellungen möglich.')}</p>` : ''}
            ${configLoaded && !isClosed && !cartConfig.ordersEnabled ? '<p class="opa-cart-hint">ℹ️ Zeige dem Personal diesen Warenkorb oder bestelle direkt.</p>' : ''}`;

        document.getElementById('opa-clear-btn')?.addEventListener('click', () => {
            // Custom inline Confirm direkt im Footer
            const footer = document.getElementById('opa-cart-footer');
            const existingConfirm = footer.querySelector('.opa-clear-confirm');
            if (existingConfirm) return;

            const confirmEl = document.createElement('div');
            confirmEl.className = 'opa-clear-confirm';
            confirmEl.innerHTML = `
                <span style="font-size:.85rem; opacity:.7;">Warenkorb wirklich leeren?</span>
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button class="opa-cart-btn-checkout" id="opa-confirm-yes" 
                            style="flex:1; background:#ef4444;">Ja, leeren</button>
                    <button class="opa-cart-btn-clear" id="opa-confirm-no" 
                            style="flex:1;">Abbrechen</button>
                </div>`;
            footer.appendChild(confirmEl);

            document.getElementById('opa-confirm-yes').onclick = () => { clearCart(); };
            document.getElementById('opa-confirm-no').onclick  = () => { confirmEl.remove(); };
        });
        document.getElementById('opa-checkout-btn')?.addEventListener('click', openCheckout);
    }

    // =========================================================================
    // Checkout Modal
    // =========================================================================
    function openCheckout() {
        if (document.getElementById('opa-checkout-modal')) {
            document.getElementById('opa-checkout-modal').classList.add('is-open');
            return;
        }

        const modes = [];
        if (cartConfig.dineInEnabled)   modes.push({ key: 'dine_in',  label: '🍽️ Am Tisch', icon: '🍽️' });
        if (cartConfig.pickupEnabled)   modes.push({ key: 'pickup',   label: '🚗 Abholung', icon: '🚗' });
        if (cartConfig.deliveryEnabled) modes.push({ key: 'delivery', label: '🚚 Lieferung', icon: '🚚' });

        const modal = document.createElement('div');
        modal.id = 'opa-checkout-modal';
        modal.className = 'opa-checkout-modal is-open';
        modal.innerHTML = `
            <div class="opa-checkout-inner">
                <div class="opa-checkout-head">
                    <h2>Bestellung aufgeben</h2>
                    <button class="opa-cart-close" id="opa-checkout-close" aria-label="Schließen">&times;</button>
                </div>
                <div class="opa-checkout-modes" id="opa-checkout-modes">
                    ${modes.map(m => `
                        <button class="opa-mode-tile" data-mode="${m.key}">
                            <span class="opa-mode-icon">${m.icon}</span>
                            <span>${m.label.replace(/^.+?\s/, '')}</span>
                        </button>`).join('')}
                </div>
                <div id="opa-checkout-form"></div>
                <div class="opa-checkout-summary">
                    <span>Gesamt:</span>
                    <strong>${fmt(totalPrice())}</strong>
                </div>
                <button class="opa-cart-btn-checkout" id="opa-checkout-submit" disabled>Übermitteln</button>
                <div id="opa-checkout-msg"></div>
            </div>`;

        document.body.appendChild(modal);
        document.getElementById('opa-checkout-close').addEventListener('click', () => modal.classList.remove('is-open'));

        let selectedMode = null;
        modal.querySelectorAll('.opa-mode-tile').forEach(tile => {
            tile.addEventListener('click', () => {
                modal.querySelectorAll('.opa-mode-tile').forEach(t => t.classList.remove('active'));
                tile.classList.add('active');
                selectedMode = tile.dataset.mode;
                renderCheckoutForm(selectedMode);
                document.getElementById('opa-checkout-submit').disabled = false;
            });
        });
        document.getElementById('opa-checkout-submit').addEventListener('click', () => submitOrder(selectedMode));
    }

    function renderCheckoutForm(mode) {
        const form = document.getElementById('opa-checkout-form');
        if (!form) return;
        // Früheste Abholzeit aus Server-Config (verhindert Vergangenheitswahl im Browser)
        const minTime = cartConfig.minPickupTime || '';

        if (mode === 'dine_in') {
            form.innerHTML = `
                <label class="opa-form-label">Tischnummer *
                    <input class="opa-form-input" type="text" id="co-table" placeholder="z.B. 5" autocomplete="off" required>
                </label>
                <label class="opa-form-label">Telefonnummer * <small style="font-weight:normal;color:#888">(für Rückfragen)</small>
                    <input class="opa-form-input" type="tel" id="co-phone" placeholder="+49 …" autocomplete="tel" required>
                </label>
                <label class="opa-form-label">Anmerkung (optional)
                    <textarea class="opa-form-input" id="co-note" rows="2" placeholder="Sonderwunsch, Allergie…" autocomplete="off"></textarea>
                </label>`;
        } else if (mode === 'pickup') {
            form.innerHTML = `
                <label class="opa-form-label">Name *
                    <input class="opa-form-input" type="text" id="co-name" placeholder="Dein Name" autocomplete="name" required>
                </label>
                <label class="opa-form-label">Telefonnummer * <small style="font-weight:normal;color:#888">(für Rückfragen)</small>
                    <input class="opa-form-input" type="tel" id="co-phone" placeholder="+49 …" autocomplete="tel" required>
                </label>
                <label class="opa-form-label">Gewünschte Abholzeit *
                    <input class="opa-form-input" type="time" id="co-time" min="${escHtml(minTime)}" autocomplete="off" required>
                </label>
                <label class="opa-form-label">Anmerkung (optional)
                    <textarea class="opa-form-input" id="co-note" rows="2" placeholder="Sonderwunsch, Allergie…" autocomplete="off"></textarea>
                </label>`;
        } else if (mode === 'delivery') {
            form.innerHTML = `
                <label class="opa-form-label">Name *
                    <input class="opa-form-input" type="text" id="co-name" placeholder="Dein Name" autocomplete="name" required>
                </label>
                <label class="opa-form-label">Lieferadresse *
                    <input class="opa-form-input" type="text" id="co-address" placeholder="Straße, Hausnummer, PLZ" autocomplete="street-address" required>
                </label>
                <label class="opa-form-label">Telefonnummer * <small style="font-weight:normal;color:#888">(für Rückfragen)</small>
                    <input class="opa-form-input" type="tel" id="co-phone" placeholder="+49 …" autocomplete="tel" required>
                </label>
                <label class="opa-form-label">Anmerkung (optional)
                    <textarea class="opa-form-input" id="co-note" rows="2" placeholder="Klingelname, Etage…" autocomplete="off"></textarea>
                </label>`;
        }
    }

    async function submitOrder(mode) {
        const msg       = document.getElementById('opa-checkout-msg');
        const submitBtn = document.getElementById('opa-checkout-submit');
        if (!mode) { showMsg(msg, 'error', 'Bitte wähle einen Bestellmodus.'); return; }

        const payload = {
            type:  mode,
            items: cartItems.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }))
        };

        if (mode === 'dine_in') {
            const table = document.getElementById('co-table')?.value.trim();
            const phone = document.getElementById('co-phone')?.value.trim();
            if (!table) { showMsg(msg, 'error', 'Bitte Tischnummer eingeben.'); return; }
            if (!phone) { showMsg(msg, 'error', 'Bitte Telefonnummer für Rückfragen angeben.'); return; }
            payload.tableNumber = table;
            payload.phone       = phone;
            payload.guestNote   = document.getElementById('co-note')?.value.trim() || null;
        } else if (mode === 'pickup') {
            const name  = document.getElementById('co-name')?.value.trim();
            const phone = document.getElementById('co-phone')?.value.trim();
            const time  = document.getElementById('co-time')?.value;
            if (!name)  { showMsg(msg, 'error', 'Bitte Name angeben.'); return; }
            if (!phone) { showMsg(msg, 'error', 'Bitte Telefonnummer für Rückfragen angeben.'); return; }
            if (!time)  { showMsg(msg, 'error', 'Bitte Abholzeit angeben.'); return; }
            // Client-seitiger Vorab-Check (zusätzlich zur Servervalidierung)
            if (cartConfig.minPickupTime && time < cartConfig.minPickupTime) {
                showMsg(msg, 'error', `Abholzeit zu früh. Früheste mögliche Zeit: ${cartConfig.minPickupTime} Uhr.`);
                return;
            }
            payload.phone      = phone;
            payload.pickupTime = time;
            payload.guestNote  = (name ? `Name: ${name}\n` : '') + (document.getElementById('co-note')?.value.trim() || '');
        } else if (mode === 'delivery') {
            const name    = document.getElementById('co-name')?.value.trim();
            const address = document.getElementById('co-address')?.value.trim();
            const phone   = document.getElementById('co-phone')?.value.trim();
            if (!name || !address || !phone) { showMsg(msg, 'error', 'Bitte Name, Adresse und Telefon ausfüllen.'); return; }
            payload.delivery = { name, address, phone, note: document.getElementById('co-note')?.value.trim() || '' };
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Wird gesendet…';

        try {
            const res  = await fetch('/api/cart/order', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showMsg(msg, 'success', `✅ Bestellung übermittelt! (Nr. ${data.orderId})`);
                clearCart();
                closeDrawer();
                setTimeout(() => document.getElementById('opa-checkout-modal')?.classList.remove('is-open'), 2500);
            } else {
                showMsg(msg, 'error', '❌ ' + (data.reason || 'Fehler beim Senden.'));
                submitBtn.disabled = false;
                submitBtn.textContent = 'Übermitteln';
            }
        } catch (e) {
            showMsg(msg, 'error', '❌ Netzwerkfehler. Bitte erneut versuchen.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Übermitteln';
        }
    }

    function showMsg(el, type, text) {
        el.textContent = text;
        el.className   = 'opa-checkout-msg opa-checkout-msg--' + type;
    }

    // =========================================================================
    // Add-Buttons + Kachel-Klick injizieren
    // =========================================================================
    function injectAddButtons() {
        const mode    = window.OPA_CART_CLICK_MODE || 'tile';
        const showBtn  = (mode === 'button' || mode === 'both');
        const showTile = (mode === 'tile'   || mode === 'both');

        document.querySelectorAll('[data-menu-item]').forEach(card => {
            const id    = card.dataset.menuItem;
            const name  = card.dataset.itemName || card.querySelector('[data-item-name]')?.textContent || 'Artikel';
            const price = card.dataset.itemPrice || '0';

            if (showBtn && !card.querySelector('.opa-add-to-cart')) {
                const btn = document.createElement('button');
                btn.className = 'opa-add-to-cart';
                btn.setAttribute('aria-label', `${name} in den Warenkorb`);
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
                btn.addEventListener('click', (e) => { e.stopPropagation(); addItem({ id, name, price }); });
                card.appendChild(btn);
            }

            if (showTile && !card.dataset.cartTileAttached) {
                card.dataset.cartTileAttached = '1';
                card.style.cursor = 'pointer';
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.opa-add-to-cart')) return;
                    addItem({ id, name, price });
                    card.classList.add('opa-tile-added');
                    setTimeout(() => card.classList.remove('opa-tile-added'), 600);
                });
            }
        });
    }

    window._opaInjectAddButtons = injectAddButtons;
    const observer = new MutationObserver(() => injectAddButtons());

    function animateBadge() {
        const badge = document.getElementById('opa-cart-badge');
        if (!badge) return;
        badge.classList.remove('bounce');
        void badge.offsetWidth;
        badge.classList.add('bounce');
    }

    function escHtml(str) {
        return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function init() {
        loadCart(); buildCartDOM(); render(); loadConfig(); injectAddButtons();
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }

    window.OpaCart = { addItem, removeItem, clearCart, totalCount, totalPrice, open: openDrawer, close: closeDrawer };
}());
