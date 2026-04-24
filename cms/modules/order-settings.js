/**
 * OPA-CMS – Online-Bestellungen Einstellungen
 */

const escHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function initOrderSettings(container, api, license) {
    const hasModule = license && license.modules && license.modules.online_orders;

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

    let settings = {};
    try {
        settings = await api.get('settings') || {};
    } catch (e) {
        console.warn('settings konnte nicht geladen werden', e.message);
    }
    const orderConfig = settings.orderConfig || {};

    const checked = (key, def = false) =>
        orderConfig[key] === true ? 'checked' : (orderConfig[key] === false ? '' : (def ? 'checked' : ''));
    const intVal  = (key, def) =>
        (orderConfig[key] !== undefined && !isNaN(parseInt(orderConfig[key], 10)))
            ? parseInt(orderConfig[key], 10) : def;

    const ordersActive = orderConfig.ordersEnabled === true;

    container.innerHTML = `
    <div style="max-width:760px;">

        <!-- Header Banner -->
        <div style="background:rgba(37,99,235,.05); border:1px solid rgba(37,99,235,.15); border-radius:14px; padding:24px 28px; margin-bottom:28px; display:flex; align-items:center; gap:24px; flex-wrap:wrap;">
            <div style="width:56px; height:56px; background:var(--primary); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.5rem; flex-shrink:0; box-shadow:0 4px 12px rgba(27,58,92,0.15);">
                <i class="fas fa-shopping-cart"></i>
            </div>
            <div style="flex:1; min-width:260px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
                    <h2 style="margin:0; font-size:1.35rem; font-weight:800; color:var(--primary);">Online-Bestellungen</h2>
                    <span id="os-status-badge" style="background:${ordersActive ? '#10b98122' : '#6b728022'}; color:${ordersActive ? '#10b981' : '#6b7280'}; border:1px solid ${ordersActive ? '#10b98144' : '#6b728044'}; border-radius:20px; padding:2px 12px; font-size:.78rem; font-weight:700;">
                        ${ordersActive ? 'Aktiv' : 'Deaktiviert'}
                    </span>
                </div>
                <p style="margin:0; font-size:.88rem; color:var(--text-muted); line-height:1.5;">
                    Steuere wie Gäste Bestellungen zur Abholung, Lieferung oder am Tisch digital übermitteln können.
                </p>
            </div>
        </div>

        <!-- Globaler Schalter -->
        <div class="glass-panel" style="padding:24px 28px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:20px;">
                    <div style="width:48px; height:48px; border-radius:14px;
                                background:rgba(200,169,110,.12); display:flex;
                                align-items:center; justify-content:center; font-size:1.5rem; flex-shrink:0;">🛒</div>
                    <div>
                        <div style="font-weight:800; font-size:1rem; color:var(--text);">Bestellsystem aktiv</div>
                        <div style="font-size:.82rem; color:var(--text-muted); margin-top:2px;">
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
        <div class="glass-panel" style="padding:24px 28px; margin-bottom:20px;" id="os-modes">
            <div style="font-size:.7rem; font-weight:700; text-transform:uppercase;
                        letter-spacing:1.5px; color:var(--text-muted); margin-bottom:20px;">Aktive Bestellmodi</div>

            <!-- Dine-In -->
            <div style="display:flex; align-items:center; justify-content:space-between;
                        padding:16px 0; border-bottom:1px solid rgba(0,0,0,.05); flex-wrap:wrap; gap:16px;">
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="width:40px; height:40px; border-radius:10px; background:rgba(34,197,94,.1);
                                display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:#22c55e; flex-shrink:0;">🍽️</div>
                    <div>
                        <div style="font-weight:700; font-size:.9rem;">Am Tisch</div>
                        <div style="font-size:.78rem; color:var(--text-muted); margin-top:1px;">Gast bestellt während des Besuchs per Tischnummer</div>
                    </div>
                </div>
                <label class="switch"><input type="checkbox" id="os-dineInEnabled" ${checked('dineInEnabled', true)}><span class="slider"></span></label>
            </div>

            <!-- Pickup -->
            <div style="display:flex; align-items:center; justify-content:space-between;
                        padding:16px 0; border-bottom:1px solid rgba(0,0,0,.05); flex-wrap:wrap; gap:16px;">
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="width:40px; height:40px; border-radius:10px; background:rgba(59,130,246,.1);
                                display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:#3b82f6; flex-shrink:0;">🚗</div>
                    <div>
                        <div style="font-weight:700; font-size:.9rem;">Abholung</div>
                        <div style="font-size:.78rem; color:var(--text-muted); margin-top:1px;">Gast bestellt vorab und holt selbst ab</div>
                    </div>
                </div>
                <label class="switch"><input type="checkbox" id="os-pickupEnabled" ${checked('pickupEnabled', true)}><span class="slider"></span></label>
            </div>

            <!-- Delivery -->
            <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 0; flex-wrap:wrap; gap:16px;">
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="width:40px; height:40px; border-radius:10px; background:rgba(168,85,247,.1);
                                display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:#a855f7; flex-shrink:0;">🚚</div>
                    <div>
                        <div style="font-weight:700; font-size:.9rem;">Lieferung</div>
                        <div style="font-size:.78rem; color:var(--text-muted); margin-top:1px;">Gast erhält die Bestellung an die angegebene Adresse</div>
                    </div>
                </div>
                <label class="switch"><input type="checkbox" id="os-deliveryEnabled" ${checked('deliveryEnabled')}><span class="slider"></span></label>
            </div>
        </div>

        <!-- Zeitfenster -->
        <div class="glass-panel" style="padding:24px 28px; margin-bottom:20px;">
            <div style="font-size:.7rem; font-weight:700; text-transform:uppercase;
                        letter-spacing:1.5px; color:var(--text-muted); margin-bottom:20px;">
                <i class="fas fa-clock" style="margin-right:6px;"></i> Zeitfenster
            </div>

            <!-- Bestellstopp -->
            <div style="display:flex; align-items:center; justify-content:space-between;
                        gap:20px; padding:12px 0; border-bottom:1px solid rgba(0,0,0,.05); flex-wrap:wrap;">
                <div style="flex:1; min-width:200px;">
                    <div style="font-weight:700; font-size:.88rem;">⏱️ Bestellstopp vor Ladenschluss</div>
                    <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">
                        Keine neuen Bestellungen mehr X Minuten vor Schließzeit.
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    <input type="number" id="os-cutoffMinutes"
                           value="${intVal('orderCutoffMinutes', 30)}"
                           min="0" max="120" step="5"
                           style="width:70px; padding:8px 10px; border-radius:8px;
                                  border:1px solid rgba(0,0,0,.15); background:var(--bg,#fff);
                                  font-size:.9rem; font-weight:700; text-align:center; color:var(--text,#1b3a5c);">
                    <span style="font-size:.82rem; color:var(--text-muted);">Min.</span>
                </div>
            </div>

            <!-- Mindest-Vorlaufzeit -->
            <div style="display:flex; align-items:center; justify-content:space-between;
                        gap:20px; padding:12px 0; flex-wrap:wrap;">
                <div style="flex:1; min-width:200px;">
                    <div style="font-weight:700; font-size:.88rem;">🚗 Mindest-Vorlaufzeit Abholung</div>
                    <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">
                        Abholzeit muss mindestens X Minuten in der Zukunft liegen.
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    <input type="number" id="os-leadMinutes"
                           value="${intVal('pickupLeadMinutes', 5)}"
                           min="0" max="60" step="5"
                           style="width:70px; padding:8px 10px; border-radius:8px;
                                  border:1px solid rgba(0,0,0,.15); background:var(--bg,#fff);
                                  font-size:.9rem; font-weight:700; text-align:center; color:var(--text,#1b3a5c);">
                    <span style="font-size:.82rem; color:var(--text-muted);">Min.</span>
                </div>
            </div>
        </div>

        <!-- Zeitauswahl-Modus (Slot-System) -->
        <div class="glass-panel" style="padding:24px 28px; margin-bottom:20px;">
            <div style="font-size:.7rem; font-weight:700; text-transform:uppercase;
                        letter-spacing:1.5px; color:var(--text-muted); margin-bottom:20px;">
                <i class="fas fa-bolt" style="margin-right:6px;"></i> Zeitauswahl für Gäste
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; gap:20px; padding:4px 0; flex-wrap:wrap;">
                <div style="flex:1; min-width:200px;">
                    <div style="font-weight:700; font-size:.88rem;">📅 Auswahl-Modus</div>
                    <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">Bestimme wie Gäste die Uhrzeit wählen können.</div>
                </div>
                <select id="os-timeSlotMode" class="input-styled" style="width:200px;">
                    <option value="slots" ${orderConfig.timeSlotMode === 'slots' ? 'selected' : ''}>Zeitslots (empfohlen)</option>
                    <option value="free" ${orderConfig.timeSlotMode === 'free' ? 'selected' : ''}>Freie Eingabe (alt)</option>
                </select>
            </div>

            <div id="os-slot-settings" style="${orderConfig.timeSlotMode === 'free' ? 'display:none;' : 'display:block;'} background:rgba(0,0,0,.02); border-radius:12px; padding:20px; margin-top:20px; border:1px solid rgba(0,0,0,.04);">
                
                <div style="display:flex; align-items:center; justify-content:space-between; gap:20px; padding:12px 0; border-bottom:1px solid rgba(0,0,0,.05); flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:700; font-size:.88rem;">⏱️ Vorlaufzeit (Slots)</div>
                        <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">Erster verfügbarer Slot ab "jetzt + X Min"</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <input type="number" id="os-timeSlotLead" value="${intVal('timeSlotLead', 20)}" style="width:70px; padding:8px 10px; border-radius:8px; border:1px solid rgba(0,0,0,.15); text-align:center; font-weight:700;">
                        <span style="font-size:.82rem; color:var(--text-muted);">Min.</span>
                    </div>
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:20px; padding:12px 0; border-bottom:1px solid rgba(0,0,0,.05); flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:700; font-size:.88rem;">📏 Slot-Abstand</div>
                        <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">Intervall zwischen den Uhrzeiten</div>
                    </div>
                    <select id="os-timeSlotStep" class="input-styled" style="width:110px;">
                        <option value="10" ${intVal('timeSlotStep', 15) === 10 ? 'selected' : ''}>10 Min</option>
                        <option value="15" ${intVal('timeSlotStep', 15) === 15 ? 'selected' : ''}>15 Min</option>
                        <option value="20" ${intVal('timeSlotStep', 15) === 20 ? 'selected' : ''}>20 Min</option>
                        <option value="30" ${intVal('timeSlotStep', 15) === 30 ? 'selected' : ''}>30 Min</option>
                    </select>
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:20px; padding:12px 0; border-bottom:1px solid rgba(0,0,0,.05); flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:700; font-size:.88rem;">🌅 Öffnet um / 🌌 Letzte Bestellung</div>
                        <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">Zeitbereich für die Slot-Generierung</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="time" id="os-openTime" value="${orderConfig.openTime || '11:00'}" class="input-styled" style="width:105px;">
                        <span style="color:var(--text-muted);">–</span>
                        <input type="time" id="os-closeTime" value="${orderConfig.closeTime || '22:00'}" class="input-styled" style="width:105px;">
                    </div>
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:20px; padding:12px 0; border-bottom:1px solid rgba(0,0,0,.05); flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:700; font-size:.88rem;">⚡ "Sofort"-Option aktiv</div>
                        <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">Ermöglicht Bestellung ohne fixen Zeitslot</div>
                    </div>
                    <label class="switch"><input type="checkbox" id="os-sofortEnabled" ${checked('sofortEnabled', true)}><span class="slider"></span></label>
                </div>

                <div style="padding:16px 0 4px;">
                    <label class="form-label">📝 Sofort-Label Text</label>
                    <input type="text" id="os-sofortLabel" value="${escHtml(orderConfig.sofortLabel || 'So schnell wie möglich (ca. {min} Min.)')}" class="form-input" placeholder="Platzhalter {min} möglich">
                    <p class="field-hint" style="margin-top:6px;"><i class="fas fa-info-circle"></i> Platzhalter <span style="color:var(--primary); font-weight:700;">{min}</span> wird automatisch durch die Vorlaufzeit ersetzt.</p>
                </div>
            </div>
        </div>

        <!-- Info-Box -->
        <div style="display:flex; align-items:flex-start; gap:16px;
                    background:rgba(200,169,110,.08); border:1px solid rgba(200,169,110,.25);
                    border-radius:14px; padding:16px 20px; margin-bottom:28px;
                    font-size:.84rem; color:var(--text-muted); line-height:1.6;">
            <i class="fas fa-info-circle" style="color:var(--accent); margin-top:3px; flex-shrink:0; font-size:1.1rem;"></i>
            <span>
                An Ruhetagen sowie außerhalb der Öffnungszeiten sind <strong>alle</strong> Bestellmodi
                automatisch gesperrt. Der Bestellstopp gilt zusätzlich:
                z.B. Schließzeit 22:00 + 30 Min. Stopp → keine Bestellungen mehr ab 21:30.
            </span>
        </div>

        <!-- E-Mail Templates -->
        <div class="glass-panel" style="padding:28px; margin-bottom:28px;">
            <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px;">
                <div style="width:42px; height:42px; background:rgba(37,99,235,.1); border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--primary); font-size:1.1rem; flex-shrink:0;">
                    <i class="fas fa-envelope-open-text"></i>
                </div>
                <div>
                    <h3 style="margin:0; font-size:1.15rem; font-weight:800;">✉️ Bestell-Bestätigungen</h3>
                    <p style="margin:2px 0 0; font-size:.82rem; color:var(--text-muted);">Passe den Inhalt der E-Mails an, die Kunden nach der Bestellung erhalten.</p>
                </div>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; padding:12px; background:rgba(0,0,0,0.02); border-radius:10px; border:1px solid rgba(0,0,0,0.04);">
                <span style="font-size:0.75rem; color:var(--text-muted); width:100%; margin-bottom:4px; font-weight:700;">VERFÜGBARE PLATZHALTER:</span>
                ${['customerName', 'restaurantName', 'estimatedTime', 'total', 'statusUrl'].map(p => `
                    <span class="placeholder-chip" style="cursor:pointer; background:rgba(0,0,0,0.05); padding:3px 10px; border-radius:14px; font-size:.72rem; border:1px solid rgba(0,0,0,.1); font-family:monospace; color:var(--primary);" onclick="insertOrderPlaceholder(this, '{{${p}}}')">{{${p}}}</span>
                `).join('')}
            </div>

            <div style="display:flex; flex-direction:column; gap:20px;">
                ${['tpl_order_confirmed', 'tpl_order_cancelled', 'tpl_order_ready'].map(key => {
                    const labels = {
                        tpl_order_confirmed: { icon: '✅', title: 'Bestätigung (Annahme)' },
                        tpl_order_cancelled: { icon: '❌', title: 'Ablehnung (Storno)' },
                        tpl_order_ready:     { icon: '🎉', title: 'Bestellung Bereit' },
                    };
                    const l = labels[key];
                    const val = (settings.emailTemplates || {})[key] || {};
                    return `
                    <div class="template-box" style="background:rgba(255,255,255,0.4); border:1px solid rgba(0,0,0,0.08); border-radius:12px; padding:20px;">
                        <h4 style="margin:0 0 16px; font-size:.95rem; color:var(--primary); font-weight:800; display:flex; align-items:center; gap:10px;">
                            <span style="font-size:1.2rem;">${l.icon}</span> ${l.title}
                        </h4>
                        <div style="margin-bottom:14px;">
                            <label class="form-label" style="font-size:.82rem; margin-bottom:6px;">E-Mail Betreff</label>
                            <input class="form-input et-subject" type="text" id="et-${key}-subject"
                                value="${escHtml(val.subject || '')}"
                                placeholder="Standard-Betreff wird verwendet wenn leer">
                        </div>
                        <div>
                            <label class="form-label" style="font-size:.82rem; margin-bottom:6px;">Inhalt (HTML erlaubt)</label>
                            <textarea class="form-input et-body" id="et-${key}-body" rows="4"
                                placeholder="Standard-Template wird verwendet wenn leer"
                                style="font-family:inherit; font-size:.85rem; min-height:100px; resize:vertical;">${escHtml(val.body || '')}</textarea>
                        </div>
                        <div style="display:flex; justify-content:flex-end; margin-top:12px;">
                            <button class="btn-secondary" onclick="previewOrderEmail('${key}')" style="padding:6px 14px; font-size:.78rem;">
                                <i class="fas fa-eye"></i> Vorschau
                            </button>
                        </div>
                    </div>`;
                }).join('')}
            </div>

            <div style="margin-top:24px; display:flex; justify-content:flex-end;">
                <button class="btn-primary" id="save-order-email-tpl" style="padding:10px 20px;">
                    <i class="fas fa-save"></i> Templates speichern
                </button>
            </div>
        </div>

        <!-- Footer Actions -->
        <div style="display:flex; align-items:center; gap:20px; background:var(--bg); padding:20px 0; border-top:1px solid rgba(0,0,0,0.05); position:sticky; bottom:0; z-index:10;">
            <button class="btn-primary" id="os-save" style="padding:12px 28px; font-size:.95rem; box-shadow:0 4px 12px rgba(27,58,92,0.2);">
                <i class="fas fa-save" style="margin-right:8px;"></i> Einstellungen speichern
            </button>
            <span id="os-feedback" style="font-size:.88rem; font-weight:700; transition:all .3s;"></span>
        </div>

    </div>`;

    const globalToggle = container.querySelector('#os-ordersEnabled');
    const modesSection = container.querySelector('#os-modes');
    const statusBadge  = container.querySelector('#os-status-badge');

    const updateModesState = () => {
        const active = globalToggle.checked;
        modesSection.style.opacity       = active ? '1'   : '0.45';
        modesSection.style.pointerEvents = active ? ''    : 'none';
        
        if (statusBadge) {
            statusBadge.textContent = active ? 'Aktiv' : 'Deaktiviert';
            statusBadge.style.background = active ? '#10b98122' : '#6b728022';
            statusBadge.style.color = active ? '#10b981' : '#6b7280';
            statusBadge.style.borderColor = active ? '#10b98144' : '#6b728044';
        }
    };
    globalToggle.addEventListener('change', updateModesState);
    updateModesState();

    const timeSlotModeSelect = container.querySelector('#os-timeSlotMode');
    const slotSettingsBox = container.querySelector('#os-slot-settings');
    timeSlotModeSelect.addEventListener('change', () => {
        slotSettingsBox.style.display = timeSlotModeSelect.value === 'slots' ? 'block' : 'none';
    });

    container.querySelector('#os-save').addEventListener('click', async () => {
        const feedback   = container.querySelector('#os-feedback');
        const cutoffRaw  = parseInt(container.querySelector('#os-cutoffMinutes').value, 10);
        const leadRaw    = parseInt(container.querySelector('#os-leadMinutes').value, 10);
        const newConfig  = {
            ordersEnabled:       container.querySelector('#os-ordersEnabled').checked,
            dineInEnabled:       container.querySelector('#os-dineInEnabled').checked,
            pickupEnabled:       container.querySelector('#os-pickupEnabled').checked,
            deliveryEnabled:     container.querySelector('#os-deliveryEnabled').checked,
            orderCutoffMinutes:  isNaN(cutoffRaw) ? 30 : Math.max(0, Math.min(120, cutoffRaw)),
            pickupLeadMinutes:   isNaN(leadRaw)   ?  5 : Math.max(0, Math.min(60,  leadRaw)),

            // New Slot Fields
            timeSlotMode:    container.querySelector('#os-timeSlotMode').value,
            timeSlotLead:    parseInt(container.querySelector('#os-timeSlotLead').value, 10) || 0,
            timeSlotStep:    parseInt(container.querySelector('#os-timeSlotStep').value, 10) || 15,
            openTime:       container.querySelector('#os-openTime').value,
            closeTime:      container.querySelector('#os-closeTime').value,
            sofortEnabled:   container.querySelector('#os-sofortEnabled').checked,
            sofortLabel:    container.querySelector('#os-sofortLabel').value
        };
        try {
            await api.post('settings', { orderConfig: newConfig });
            feedback.textContent = '✅ Gespeichert';
            feedback.style.color = '#22c55e';
        } catch (e) {
            feedback.textContent = '❌ ' + (e.message || 'Fehler beim Speichern');
            feedback.style.color = '#ef4444';
        }
        setTimeout(() => { feedback.textContent = ''; }, 3000);
    });

    // Email Template Logic
    container.querySelector('#save-order-email-tpl').addEventListener('click', async () => {
        const templates = settings.emailTemplates || {};
        for (const key of ['tpl_order_confirmed', 'tpl_order_cancelled', 'tpl_order_ready']) {
            templates[key] = {
                subject: container.querySelector(`#et-${key}-subject`)?.value.trim() || '',
                body:    container.querySelector(`#et-${key}-body`)?.value.trim() || '',
            };
        }
        settings.emailTemplates = templates;
        try {
            await api.post('settings', { emailTemplates: templates });
            if (window.showToast) showToast('✅ E-Mail Templates gespeichert.');
            else alert('✅ E-Mail Templates gespeichert.');
        } catch (e) {
            alert('❌ Fehler: ' + e.message);
        }
    });

    window.insertOrderPlaceholder = (chip, text) => {
        const box = chip.closest('.glass-panel');
        // Find the focused or first available input/textarea in templates
        const target = box.querySelector('.et-body:focus, .et-subject:focus') || box.querySelector('.et-body');
        if (!target) return;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const val = target.value;
        target.value = val.substring(0, start) + text + val.substring(end);
        target.selectionStart = target.selectionEnd = start + text.length;
        target.focus();
    };

    window.previewOrderEmail = (key) => {
        const body = container.querySelector(`#et-${key}-body`)?.value || '(Standard-Template)';
        const win = window.open('', '_blank');
        win.document.write(`<html><body style="font-family:sans-serif;padding:20px;">${body}</body></html>`);
        win.document.close();
    };
}
