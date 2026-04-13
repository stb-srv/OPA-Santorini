/**
 * OPA-CMS – Bestellungen-Einstellungen Modul
 *
 * Rendert den Tab "Bestellungen" in den CMS-Einstellungen.
 * Nur sichtbar wenn Lizenz das Modul 'online_orders' hat (PRO_PLUS+).
 * Speichert settings.orderConfig via POST /api/settings.
 */

export async function initOrderSettings(container, api, license) {
    const hasModule = license && license.modules && license.modules.online_orders;

    if (!hasModule) {
        container.innerHTML = `
        <div class="order-settings-locked">
            <div class="locked-icon">🔒</div>
            <h3>Online-Bestellungen</h3>
            <p>Die Übermittlung von Bestellungen ist ab dem <strong>Pro+</strong>-Plan verfügbar.</p>
            <p class="locked-note">
                Der <strong>Warenkorb</strong> (Planungsansicht für Gäste) ist bei allen Plänen
                aktiv – Gäste können ihren Besuch bereits vorab planen.
            </p>
            <a href="#" class="btn btn-upgrade" onclick="window.dispatchEvent(new CustomEvent('open-license'))">Plan upgraden</a>
        </div>`;
        return;
    }

    // Aktuelle Konfiguration laden
    let orderConfig = {};
    try {
        const res  = await api.get('/settings');
        orderConfig = (res.data && res.data.orderConfig) || {};
    } catch (e) {
        console.warn('orderConfig konnte nicht geladen werden', e.message);
    }

    const val = (key, def = false) => orderConfig[key] === true ? true : (orderConfig[key] === false ? false : def);

    container.innerHTML = `
    <div class="order-settings">
        <div class="settings-section-header">
            <h3>Bestellsystem</h3>
            <p>Steuert ob Gäste Bestellungen digital übermitteln können.
               Der Warenkorb (Planungsansicht) bleibt unabhängig davon immer aktiv.</p>
        </div>

        <div class="settings-card">
            <!-- Globaler Schalter -->
            <div class="settings-row settings-row--prominent">
                <div class="settings-row-label">
                    <span class="settings-row-icon">🛒</span>
                    <div>
                        <strong>Bestellsystem aktiv</strong>
                        <small>Globaler Schalter – deaktiviert alle Bestellmodi gleichzeitig</small>
                    </div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="os-ordersEnabled" ${val('ordersEnabled') ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <div class="settings-divider"></div>

            <!-- Bestellmodi -->
            <div class="settings-modes" id="os-modes">
                <p class="settings-modes-label">Aktive Bestellmodi</p>

                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-row-icon">🍽️</span>
                        <div>
                            <strong>Am Tisch</strong>
                            <small>Gast bestellt während des Besuchs per Tischnummer</small>
                        </div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" id="os-dineInEnabled" ${val('dineInEnabled', true) ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-row-icon">🚗</span>
                        <div>
                            <strong>Abholung</strong>
                            <small>Gast bestellt vorab und holt selbst ab</small>
                        </div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" id="os-pickupEnabled" ${val('pickupEnabled', true) ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-row-icon">🚚</span>
                        <div>
                            <strong>Lieferung</strong>
                            <small>Gast erhält die Bestellung an die angegebene Adresse</small>
                        </div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" id="os-deliveryEnabled" ${val('deliveryEnabled') ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <div class="settings-info-box">
            <span>ℹ️</span>
            <span>Wenn du das Bestellsystem deaktivierst, können Gäste den Warenkorb weiterhin
            zur Planung nutzen – der Checkout-Button wird jedoch ausgeblendet.</span>
        </div>

        <button class="btn btn-primary" id="os-save">💾 Einstellungen speichern</button>
        <span class="os-save-feedback" id="os-feedback"></span>
    </div>`;

    // Globaler Toggle deaktiviert Modi-Sektion visuell
    const globalToggle = container.querySelector('#os-ordersEnabled');
    const modesSection = container.querySelector('#os-modes');
    const updateModesState = () => {
        modesSection.style.opacity   = globalToggle.checked ? '1' : '0.4';
        modesSection.style.pointerEvents = globalToggle.checked ? '' : 'none';
    };
    globalToggle.addEventListener('change', updateModesState);
    updateModesState();

    // Speichern
    container.querySelector('#os-save').addEventListener('click', async () => {
        const feedback = container.querySelector('#os-feedback');
        const newConfig = {
            ordersEnabled:   container.querySelector('#os-ordersEnabled').checked,
            dineInEnabled:   container.querySelector('#os-dineInEnabled').checked,
            pickupEnabled:   container.querySelector('#os-pickupEnabled').checked,
            deliveryEnabled: container.querySelector('#os-deliveryEnabled').checked
        };
        try {
            await api.post('/settings', { orderConfig: newConfig });
            feedback.textContent = '✅ Gespeichert';
            feedback.className   = 'os-save-feedback os-save-success';
        } catch (e) {
            feedback.textContent = '❌ Fehler: ' + (e.message || 'Unbekannt');
            feedback.className   = 'os-save-feedback os-save-error';
        }
        setTimeout(() => { feedback.textContent = ''; feedback.className = 'os-save-feedback'; }, 3000);
    });
}
