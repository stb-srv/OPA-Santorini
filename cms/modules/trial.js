/**
 * OPA-CMS – Trial Self-Registration & Onboarding
 * Zeigt beim ersten Start (kein Lizenz-Key) ein Registrierungsformular.
 * Meldet die Instanz am Lizenz-Server an und speichert den erhaltenen Key.
 */

const LICENSE_SERVER = window.OPA_LICENSE_SERVER || 'https://license.opa-santorini.de';

export async function initTrialOnboarding(container, onKeyReceived) {
    container.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center;
                background:linear-gradient(135deg,#1b3a5c 0%,#2d6a4f 100%); padding:24px;">
        <div style="background:#fff; border-radius:24px; padding:48px 40px; max-width:480px;
                    width:100%; box-shadow:0 24px 64px rgba(0,0,0,.25); text-align:center;">

            <div style="font-size:3rem; margin-bottom:16px;">🍽️</div>
            <h1 style="font-size:1.6rem; font-weight:900; color:#1b3a5c; margin-bottom:8px;">
                Willkommen bei OPA! Santorini
            </h1>
            <p style="color:#6b7280; font-size:.9rem; margin-bottom:32px; line-height:1.6;">
                Starten Sie jetzt Ihren <strong>kostenlosen 30-Tage Trial</strong> –
                keine Kreditkarte erforderlich.
            </p>

            <form id="trial-form" style="text-align:left; display:flex; flex-direction:column; gap:16px;">
                <div>
                    <label style="font-size:.8rem; font-weight:700; color:#374151; display:block; margin-bottom:6px;">
                        Restaurant-Name *
                    </label>
                    <input id="trial-name" type="text" placeholder="z.B. Ristorante Bella Italia"
                           required style="width:100%; padding:11px 14px; border:1.5px solid #e5e7eb;
                           border-radius:10px; font-size:.95rem; box-sizing:border-box;
                           transition:border .2s;" />
                </div>
                <div>
                    <label style="font-size:.8rem; font-weight:700; color:#374151; display:block; margin-bottom:6px;">
                        Ihre E-Mail (für Benachrichtigungen)
                    </label>
                    <input id="trial-email" type="email" placeholder="inhaber@restaurant.de"
                           style="width:100%; padding:11px 14px; border:1.5px solid #e5e7eb;
                           border-radius:10px; font-size:.95rem; box-sizing:border-box;" />
                </div>
                <div>
                    <label style="font-size:.8rem; font-weight:700; color:#374151; display:block; margin-bottom:6px;">
                        Domain dieser Installation
                    </label>
                    <input id="trial-domain" type="text" value="${window.location.hostname}" readonly
                           style="width:100%; padding:11px 14px; border:1.5px solid #e5e7eb;
                           border-radius:10px; font-size:.95rem; background:#f9fafb;
                           color:#6b7280; box-sizing:border-box;" />
                </div>

                <button type="submit" id="trial-btn"
                        style="width:100%; padding:14px; background:#1b3a5c; color:#fff;
                               border:none; border-radius:12px; font-size:1rem; font-weight:800;
                               cursor:pointer; margin-top:8px; transition:background .2s;">
                    🚀 30 Tage kostenlos starten
                </button>

                <p style="text-align:center; font-size:.78rem; color:#9ca3af; margin:0;">
                    Mit der Registrierung akzeptieren Sie unsere Nutzungsbedingungen.
                </p>
            </form>

            <div style="margin-top:24px; padding-top:20px; border-top:1px solid #f3f4f6;">
                <p style="font-size:.82rem; color:#6b7280; margin-bottom:10px;">
                    Haben Sie bereits einen Lizenz-Key?
                </p>
                <input id="trial-existing-key" type="text" placeholder="OPA-XXXX-XXXX-XXXX"
                       style="width:100%; padding:10px 14px; border:1.5px solid #e5e7eb;
                       border-radius:10px; font-size:.88rem; box-sizing:border-box; text-align:center;
                       letter-spacing:1px; font-family:monospace;" />
                <button id="trial-use-key" type="button"
                        style="width:100%; margin-top:8px; padding:10px; background:#f3f4f6;
                               color:#374151; border:none; border-radius:10px; font-size:.88rem;
                               font-weight:700; cursor:pointer;">
                    Key aktivieren
                </button>
            </div>

            <div id="trial-feedback" style="display:none; margin-top:20px; padding:14px 18px;
                 border-radius:12px; font-size:.88rem; font-weight:600;"></div>
        </div>
    </div>`;

    const form        = container.querySelector('#trial-form');
    const btn         = container.querySelector('#trial-btn');
    const feedback    = container.querySelector('#trial-feedback');
    const useKeyBtn   = container.querySelector('#trial-use-key');
    const existingKey = container.querySelector('#trial-existing-key');

    const showFeedback = (msg, type = 'error') => {
        feedback.style.display = 'block';
        feedback.style.background = type === 'error' ? '#fef2f2' : '#f0fdf4';
        feedback.style.color      = type === 'error' ? '#dc2626'  : '#16a34a';
        feedback.style.border     = `1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`;
        feedback.textContent = msg;
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Wird registriert...';

        try {
            const res = await fetch(`${LICENSE_SERVER}/api/v1/trial/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain:          window.location.hostname,
                    contact_email:   container.querySelector('#trial-email').value.trim(),
                    restaurant_name: container.querySelector('#trial-name').value.trim(),
                    instance_id:     navigator.userAgent.slice(0, 80)
                })
            });
            const data = await res.json();

            if (data.success && data.license_key) {
                showFeedback(`✅ Trial aktiviert! Ihr Key: ${data.license_key}`, 'success');
                setTimeout(() => onKeyReceived(data.license_key), 1500);
            } else {
                showFeedback(data.message || 'Registrierung fehlgeschlagen.');
                btn.disabled = false;
                btn.innerHTML = '🚀 30 Tage kostenlos starten';
            }
        } catch (err) {
            showFeedback('Verbindung zum Lizenz-Server fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung.');
            btn.disabled = false;
            btn.innerHTML = '🚀 30 Tage kostenlos starten';
        }
    };

    useKeyBtn.onclick = () => {
        const key = existingKey.value.trim();
        if (!key) return showFeedback('Bitte einen Key eingeben.');
        onKeyReceived(key);
    };
}

/**
 * Zeigt ein Trial-Ablauf-Banner im CMS-Header an.
 * @param {number} daysLeft - Verbleibende Tage
 */
export function showTrialBanner(daysLeft) {
    const existing = document.getElementById('trial-banner');
    if (existing) existing.remove();

    if (daysLeft > 14) return; // Kein Banner nötig

    const isUrgent  = daysLeft <= 3;
    const banner = document.createElement('div');
    banner.id = 'trial-banner';
    banner.style.cssText = `
        position:fixed; top:0; left:0; right:0; z-index:9999;
        background:${isUrgent ? '#dc2626' : '#d97706'};
        color:#fff; padding:10px 20px;
        display:flex; align-items:center; justify-content:center; gap:16px;
        font-size:.88rem; font-weight:700; box-shadow:0 2px 8px rgba(0,0,0,.2);
    `;
    banner.innerHTML = `
        <span>${isUrgent ? '🚨' : '⏰'} 
        Ihr Trial läuft in <strong>${daysLeft} Tag${daysLeft !== 1 ? 'en' : ''}</strong> ab.</span>
        <button onclick="window.dispatchEvent(new CustomEvent('open-license'))"
                style="background:rgba(255,255,255,.2); border:1px solid rgba(255,255,255,.4);
                       color:#fff; padding:5px 14px; border-radius:20px; cursor:pointer;
                       font-size:.82rem; font-weight:700;">
            Jetzt upgraden →
        </button>
        <button class="trial-banner-close"
                style="background:none; border:none; color:rgba(255,255,255,.7);
                       cursor:pointer; font-size:1rem; padding:0 4px;">✕</button>
    `;

    document.body.prepend(banner);

    // Fix #8: Banner-Close setzt marginTop zurück
    const closeBtn = banner.querySelector('.trial-banner-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            banner.remove();
            const header = document.querySelector('.cms-header, #cms-header');
            if (header) header.style.marginTop = '';
        });
    }

    // Damit der Banner nicht über den Header-Inhalt fällt
    const header = document.querySelector('.cms-header, #cms-header');
    if (header) header.style.marginTop = banner.offsetHeight + 'px';
}

/**
 * Zeigt ein Upgrade-Modal mit Plan-Übersicht.
 * Wird durch window Event 'open-license' getriggert.
 */
export function initUpgradeModal() {
    window.addEventListener('open-license', () => {
        const existing = document.getElementById('upgrade-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'upgrade-modal-overlay';
        overlay.style.cssText = `
            position:fixed; inset:0; z-index:10000;
            background:rgba(0,0,0,.6); backdrop-filter:blur(4px);
            display:flex; align-items:center; justify-content:center; padding:24px;
        `;

        overlay.innerHTML = `
        <div style="background:#fff; border-radius:24px; padding:40px; max-width:680px;
                    width:100%; box-shadow:0 32px 80px rgba(0,0,0,.3); position:relative;">
            <button id="upgrade-modal-close"
                    style="position:absolute; top:16px; right:20px; background:none;
                           border:none; font-size:1.4rem; cursor:pointer; color:#9ca3af;">✕</button>
            <h2 style="font-size:1.4rem; font-weight:900; color:#1b3a5c; margin-bottom:6px;">
                Upgrade Ihren Plan
            </h2>
            <p style="color:#6b7280; font-size:.9rem; margin-bottom:28px;">
                Wählen Sie den passenden Plan für Ihr Restaurant.
            </p>

            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:16px;">
                ${[
                    { name:'STARTER', label:'Starter', price:'29€/Mo', features:['60 Gerichte','10 Tische','Küchensystem'] },
                    { name:'PRO', label:'Pro', price:'59€/Mo', features:['150 Gerichte','25 Tische','Online-Reservierung','Branding'] },
                    { name:'PRO_PLUS', label:'Pro+', price:'89€/Mo', features:['300 Gerichte','50 Tische','Analytics','QR-Pay'] },
                    { name:'ENTERPRISE', label:'Enterprise', price:'Auf Anfrage', features:['Unbegrenzt','API-Zugang','Dedizierter Support'] },
                ].map(p => `
                    <div style="border:2px solid ${p.name==='PRO'?'#1b3a5c':'#e5e7eb'};
                                border-radius:16px; padding:20px; text-align:center;
                                background:${p.name==='PRO'?'#f0f4ff':'#fff'};">
                        ${p.name==='PRO'?'<div style="background:#1b3a5c;color:#fff;font-size:.7rem;font-weight:800;padding:3px 10px;border-radius:20px;display:inline-block;margin-bottom:8px;">EMPFOHLEN</div>':''}
                        <div style="font-size:1rem; font-weight:800; color:#1b3a5c;">${p.label}</div>
                        <div style="font-size:1.3rem; font-weight:900; margin:8px 0; color:#374151;">${p.price}</div>
                        <ul style="list-style:none; padding:0; margin:12px 0; font-size:.8rem; color:#6b7280; text-align:left;">
                            ${p.features.map(f=>`<li style="margin:4px 0;">✓ ${f}</li>`).join('')}
                        </ul>
                        <a href="mailto:sales@opa-santorini.de?subject=Upgrade auf ${p.label}&body=Mein Trial-Key: "
                           style="display:block; margin-top:12px; padding:9px;
                                  background:${p.name==='PRO'?'#1b3a5c':'#f3f4f6'};
                                  color:${p.name==='PRO'?'#fff':'#374151'};
                                  border-radius:10px; font-size:.82rem; font-weight:700;
                                  text-decoration:none;">
                            Jetzt wählen
                        </a>
                    </div>
                `).join('')}
            </div>
        </div>`;

        document.body.appendChild(overlay);
        document.getElementById('upgrade-modal-close').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    });
}

/**
 * Soft-Lock Screen bei abgelaufenem Trial.
 * Übernimmt den gesamten Body und erlaubt nur noch Lesezugriff.
 */
export function showTrialExpiredLock(licenseKey) {
    const existing = document.getElementById('trial-expired-lock');
    if (existing) return;

    const lock = document.createElement('div');
    lock.id = 'trial-expired-lock';
    lock.style.cssText = `
        position:fixed; inset:0; z-index:10001;
        background:rgba(17,24,39,.92); backdrop-filter:blur(8px);
        display:flex; align-items:center; justify-content:center; padding:24px;
    `;

    lock.innerHTML = `
    <div style="background:#fff; border-radius:24px; padding:48px 40px; max-width:480px;
                width:100%; text-align:center; box-shadow:0 32px 80px rgba(0,0,0,.4);">
        <div style="font-size:3rem; margin-bottom:16px;">🔒</div>
        <h2 style="font-size:1.5rem; font-weight:900; color:#dc2626; margin-bottom:8px;">
            Trial abgelaufen
        </h2>
        <p style="color:#6b7280; font-size:.9rem; line-height:1.6; margin-bottom:28px;">
            Ihr 30-Tage Trial ist abgelaufen. Ihre Daten sind sicher gespeichert.<br>
            Upgraden Sie jetzt um weiterzumachen.
        </p>
        <button onclick="window.dispatchEvent(new CustomEvent('open-license'))"
                style="width:100%; padding:14px; background:#1b3a5c; color:#fff;
                       border:none; border-radius:12px; font-size:1rem; font-weight:800;
                       cursor:pointer; margin-bottom:12px;">
            🚀 Jetzt upgraden
        </button>
        <p style="font-size:.78rem; color:#9ca3af;">
            Ihr Trial-Key: <code style="font-family:monospace;">${licenseKey || '–'}</code>
        </p>
        <button onclick="document.getElementById('trial-expired-lock').style.display='none'"
                style="margin-top:16px; background:none; border:none; color:#9ca3af;
                       font-size:.8rem; cursor:pointer; text-decoration:underline;">
            Nur ansehen (kein Speichern möglich)
        </button>
    </div>`;

    document.body.appendChild(lock);
}
