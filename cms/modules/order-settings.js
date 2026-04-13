/**
 * OPA-CMS – Online-Bestellungen Einstellungen
 * Verwendet native CMS-Klassen: glass-panel, switch/slider, btn-primary
 */

export async function initOrderSettings(container, api, license) {
    const hasModule = license && license.modules && license.modules.online_orders;

    // ── LOCKED STATE ────────────────────────────────────────────────
    if (!hasModule) {
        container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;
                    padding:80px 40px; text-align:center;">
            <div style="font-size:3.5rem; margin-bottom:20px;">🔒</div>
            <h2 style="font-size:1.4rem; font-weight:800; margin-bottom:12px; color:var(--primary);">Online-Bestellungen</h2>
            <p style="max-width:400px; color:var(--text-muted); line-height:1.7; margin-bottom:8px;">
                Die Übermittlung von Bestellungen ist ab dem <strong>Pro+</strong>-Plan verfügbar.
            </p>
            <p style="max-width:400px; color:var(--text-muted); font-size:.85rem; line-height:1.6;
                      background:rgba(200,169,110,.08); border:1px solid rgba(200,169,110,.2);
                      border-radius:12px; padding:14px 20px; margin-bottom:28px;">
                <strong>Warenkorb (Planungsansicht)</strong> ist bei allen Plänen aktiv –
                Gäste können ihren Besuch bereits vorab planen.
            </p>
            <button class="btn-premium" onclick="window.dispatchEvent(new CustomEvent('open-license'))">
                <i class="fas fa-arrow-up"></i> Plan upgraden
            </button>
        </div>`;
        return;
    }

    // ── LOAD CONFIG ─────────────────────────────────────────────────
    let orderConfig = {};
    try {
        const res = await api.get('settings');
        orderConfig = (res && res.orderConfig) || {};
    } catch (e) {
        console.warn('orderConfig konnte nicht geladen werden', e.message);
    }

    const checked = (key, def = false) =>
        orderConfig[key] === true ? 'checked' : (orderConfig[key] === false ? '' : (def ? 'checked' : ''));

    // ── RENDER ──────────────────────────────────────────────────────
    container.innerHTML = `
    <div style="max-width:720px;">

        <!-- Header -->
        <div style="margin-bottom:28px;">
            <h2 style="font-size:1.3rem; font-weight:800; color:var(--primary); margin-bottom:6px;">
                <i class="fas fa-shopping-bag" style="margin-right:10px; color:var(--accent);"></i>
                Online-Bestellungen
            </h2>
            <p style="font-size:.85rem; color:var(--text-muted); line-height:1.6;">
                Steuere ob Gäste Bestellungen digital übermitteln können.
                Der Warenkorb (Planungsansicht) bleibt unabhängig davon immer aktiv.
            </p>
        </div>

        <!-- Globaler Schalter -->
        <div class="glass-panel" style="padding:24px 28px; margin-bottom:16px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:20px;">
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="width:44px; height:44px; border-radius:12px;
                                background:rgba(200,169,110,.12); display:flex;
                                align-items:center; justify-content:center; font-size:1.4rem;">
                        🛒
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:.95rem;">Bestellsystem aktiv</div>
                        <div style="font-size:.78rem; color:var(--text-muted); margin-top:2px;">
                            Globaler Schalter – deaktiviert alle Bestellmodi gleichzeitig
                        </div>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="os-ordersEnabled" ${checked('ordersEnabled')}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Bestellmodi -->
        <div class="glass-panel" style="padding:24px 28px; margin-bottom:16px;" id="os-modes">
            <div style="font-size:.7rem; font-weight:700; text-transform:uppercase;
                        letter-spacing:1.5px; color:var(--text-muted); margin-bottom:16px;">
                Aktive Bestellmodi
            </div>

            <!-- Dine-in -->
            <div style="display:flex; align-items:center; justify-content:space-between;
                        padding:16px 0; border-bottom:1px solid rgba(0,0,0,.05);">
                <div style="display:flex; align-items:center; gap:14px;">
                    <div style="width:38px; height:38px; border-radius:10px;
                                background:rgba(27,58,92,.07); display:flex;
                                align-items:center; justify-content:center; font-size:1.1rem;">
                        🍽️
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:.88rem;">Am Tisch</div>
                        <div style="font-size:.75rem; color:var(--text-muted); margin-top:1px;">
                            Gast bestellt während des Besuchs per Tischnummer
                        </div>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="os-dineInEnabled" ${checked('dineInEnabled', true)}>
                    <span class="slider"></span>
                </label>
            </div>

            <!-- Abholung -->
            <div style="display:flex; align-items:center; justify-content:space-between;
                        padding:16px 0; border-bottom:1px solid rgba(0,0,0,.05);">
                <div style="display:flex; align-items:center; gap:14px;">
                    <div style="width:38px; height:38px; border-radius:10px;
                                background:rgba(27,58,92,.07); display:flex;
                                align-items:center; justify-content:center; font-size:1.1rem;">
                        🚗
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:.88rem;">Abholung</div>
                        <div style="font-size:.75rem; color:var(--text-muted); margin-top:1px;">
                            Gast bestellt vorab und holt selbst ab
                        </div>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="os-pickupEnabled" ${checked('pickupEnabled', true)}>
                    <span class="slider"></span>
                </label>
            </div>

            <!-- Lieferung -->
            <div style="display:flex; align-items:center; justify-content:space-between;
                        padding:16px 0;">
                <div style="display:flex; align-items:center; gap:14px;">
                    <div style="width:38px; height:38px; border-radius:10px;
                                background:rgba(27,58,92,.07); display:flex;
                                align-items:center; justify-content:center; font-size:1.1rem;">
                        🚚
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:.88rem;">Lieferung</div>
                        <div style="font-size:.75rem; color:var(--text-muted); margin-top:1px;">
                            Gast erhält die Bestellung an die angegebene Adresse
                        </div>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="os-deliveryEnabled" ${checked('deliveryEnabled')}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Info Box -->
        <div style="display:flex; align-items:flex-start; gap:12px;
                    background:rgba(200,169,110,.08); border:1px solid rgba(200,169,110,.2);
                    border-radius:12px; padding:14px 18px; margin-bottom:24px;
                    font-size:.82rem; color:var(--text-muted); line-height:1.6;">
            <i class="fas fa-info-circle" style="color:var(--accent); margin-top:2px; flex-shrink:0;"></i>
            <span>Wenn das Bestellsystem deaktiviert ist, können Gäste den Warenkorb weiterhin
            zur Planung nutzen – der Checkout-Button wird jedoch ausgeblendet.</span>
        </div>

        <!-- Save -->
        <div style="display:flex; align-items:center; gap:16px;">
            <button class="btn-primary" id="os-save">
                <i class="fas fa-save"></i> Einstellungen speichern
            </button>
            <span id="os-feedback" style="font-size:.82rem; font-weight:600;"></span>
        </div>

    </div>`;

    // ── LOGIC ────────────────────────────────────────────────────────
    const globalToggle = container.querySelector('#os-ordersEnabled');
    const modesSection = container.querySelector('#os-modes');

    const updateModesState = () => {
        modesSection.style.opacity      = globalToggle.checked ? '1'   : '0.45';
        modesSection.style.pointerEvents = globalToggle.checked ? ''    : 'none';
    };
    globalToggle.addEventListener('change', updateModesState);
    updateModesState();

    container.querySelector('#os-save').addEventListener('click', async () => {
        const feedback  = container.querySelector('#os-feedback');
        const newConfig = {
            ordersEnabled:   container.querySelector('#os-ordersEnabled').checked,
            dineInEnabled:   container.querySelector('#os-dineInEnabled').checked,
            pickupEnabled:   container.querySelector('#os-pickupEnabled').checked,
            deliveryEnabled: container.querySelector('#os-deliveryEnabled').checked,
        };
        try {
            const current = await api.get('settings') || {};
            await api.post('settings', { ...current, orderConfig: newConfig });
            feedback.textContent = '✅ Gespeichert';
            feedback.style.color = '#22c55e';
        } catch (e) {
            feedback.textContent = '❌ ' + (e.message || 'Fehler beim Speichern');
            feedback.style.color = '#ef4444';
        }
        setTimeout(() => { feedback.textContent = ''; }, 3000);
    });
}
