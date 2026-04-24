/**
 * OPA-CMS – Installations-Assistent
 * Führt neue Instanzen durch: Trial-Registrierung → Admin-Account → Grundeinstellungen
 * Wird gezeigt wenn KEIN opa_license_key UND KEIN Admin-Account existiert.
 */

const LICENSE_SERVER = window.OPA_LICENSE_SERVER || 'https://license.opa-santorini.de';

export async function shouldShowWizard() {
    const key = localStorage.getItem('opa_license_key');
    if (key) return false;
    try {
        const res = await fetch('/api/admin/login', { method: 'HEAD' });
        // Wenn 404 → noch kein Admin → Wizard zeigen
        return false; // Nur bei fehlendem License-Key triggern
    } catch { return true; }
}

export async function showSetupWizard(container, onComplete) {
    let step = 1;
    let trialKey = null;

    const render = () => {
        container.innerHTML = `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center;
                    background:linear-gradient(135deg,#1b3a5c 0%,#2d6a4f 100%); padding:24px;">
            <div style="background:#fff; border-radius:24px; padding:48px 40px; max-width:520px;
                        width:100%; box-shadow:0 24px 64px rgba(0,0,0,.25);">

                <!-- Progress Steps -->
                <div style="display:flex; align-items:center; justify-content:center;
                            gap:8px; margin-bottom:32px;">
                    ${[1,2,3].map(s => `
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:32px; height:32px; border-radius:50%;
                                        background:${s <= step ? '#1b3a5c' : '#e5e7eb'};
                                        color:${s <= step ? '#fff' : '#9ca3af'};
                                        display:flex; align-items:center; justify-content:center;
                                        font-size:.8rem; font-weight:800;">${s < step ? '✓' : s}</div>
                            ${s < 3 ? `<div style="width:40px; height:2px;
                                background:${s < step ? '#1b3a5c' : '#e5e7eb'};"></div>` : ''}
                        </div>
                    `).join('')}
                </div>

                <div id="wizard-step-content">${renderStep()}</div>
            </div>
        </div>`;
        attachStepListeners();
    };

    const renderStep = () => {
        if (step === 1) return `
            <h2 style="font-size:1.4rem; font-weight:900; color:#1b3a5c; margin-bottom:8px; text-align:center;">
                🍽️ Willkommen bei OPA! Santorini
            </h2>
            <p style="color:#6b7280; text-align:center; font-size:.9rem; margin-bottom:28px;">
                Schritt 1 von 3: Starten Sie Ihren kostenlosen 30-Tage Trial.
            </p>
            <div style="display:flex; flex-direction:column; gap:14px;">
                <input id="wiz-name" type="text" placeholder="Restaurant-Name *" required
                       style="padding:12px 14px; border:1.5px solid #e5e7eb; border-radius:10px; font-size:.95rem;">
                <input id="wiz-email" type="email" placeholder="Ihre E-Mail (optional)"
                       style="padding:12px 14px; border:1.5px solid #e5e7eb; border-radius:10px; font-size:.95rem;">
                <button id="wiz-step1-btn"
                        style="padding:14px; background:#1b3a5c; color:#fff; border:none;
                               border-radius:12px; font-size:1rem; font-weight:800; cursor:pointer;">
                    Trial starten →
                </button>
            </div>
            <div id="wiz-feedback" style="display:none; margin-top:14px; padding:12px;
                 border-radius:10px; font-size:.85rem;"></div>`;

        if (step === 2) return `
            <h2 style="font-size:1.4rem; font-weight:900; color:#1b3a5c; margin-bottom:8px; text-align:center;">
                ✅ Trial aktiviert!
            </h2>
            <p style="color:#6b7280; text-align:center; font-size:.9rem; margin-bottom:8px;">
                Schritt 2 von 3: Admin-Passwort setzen.
            </p>
            <div style="background:#f0fdf4; border-radius:10px; padding:14px; margin-bottom:20px;
                        text-align:center; border:1px solid #bbf7d0;">
                <p style="margin:0; font-size:.8rem; color:#166534;">Ihr Trial-Key:</p>
                <code style="font-size:1rem; font-weight:800; color:#1b3a5c; letter-spacing:1px;">
                    ${trialKey}
                </code>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
                <input id="wiz-user" type="text" placeholder="Benutzername *" value="admin"
                       style="padding:12px 14px; border:1.5px solid #e5e7eb; border-radius:10px; font-size:.95rem;">
                <input id="wiz-pass" type="password" placeholder="Passwort (min. 12 Zeichen) *"
                       minlength="12"
                       style="padding:12px 14px; border:1.5px solid #e5e7eb; border-radius:10px; font-size:.95rem;">
                <button id="wiz-step2-btn"
                        style="padding:14px; background:#1b3a5c; color:#fff; border:none;
                               border-radius:12px; font-size:1rem; font-weight:800; cursor:pointer;">
                    Account erstellen →
                </button>
            </div>
            <div id="wiz-feedback" style="display:none; margin-top:14px; padding:12px;
                 border-radius:10px; font-size:.85rem;"></div>`;

        if (step === 3) return `
            <h2 style="font-size:1.4rem; font-weight:900; color:#1b3a5c; margin-bottom:8px; text-align:center;">
                🎉 Alles bereit!
            </h2>
            <p style="color:#6b7280; text-align:center; font-size:.9rem; margin-bottom:28px;">
                Ihr OPA! Santorini CMS ist einsatzbereit.
            </p>
            <ul style="list-style:none; padding:0; margin:0 0 28px; display:flex; flex-direction:column; gap:10px;">
                <li style="display:flex; gap:10px; align-items:center;">
                    <span style="color:#16a34a; font-size:1.1rem;">✓</span>
                    <span style="font-size:.9rem; color:#374151;">Trial-Lizenz aktiviert (30 Tage)</span>
                </li>
                <li style="display:flex; gap:10px; align-items:center;">
                    <span style="color:#16a34a; font-size:1.1rem;">✓</span>
                    <span style="font-size:.9rem; color:#374151;">Admin-Account erstellt</span>
                </li>
                <li style="display:flex; gap:10px; align-items:center;">
                    <span style="color:#16a34a; font-size:1.1rem;">✓</span>
                    <span style="font-size:.9rem; color:#374151;">CMS einsatzbereit</span>
                </li>
            </ul>
            <button id="wiz-finish-btn"
                    style="width:100%; padding:14px; background:#16a34a; color:#fff; border:none;
                           border-radius:12px; font-size:1rem; font-weight:800; cursor:pointer;">
                🚀 Zum Dashboard
            </button>`;
    };

    const showFeedback = (msg, type = 'error') => {
        const el = document.getElementById('wiz-feedback');
        if (!el) return;
        el.style.display = 'block';
        el.style.background = type === 'error' ? '#fef2f2' : '#f0fdf4';
        el.style.color      = type === 'error' ? '#dc2626' : '#16a34a';
        el.style.border     = `1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`;
        el.textContent = msg;
    };

    const attachStepListeners = () => {
        if (step === 1) {
            document.getElementById('wiz-step1-btn')?.addEventListener('click', async () => {
                const name  = document.getElementById('wiz-name').value.trim();
                const email = document.getElementById('wiz-email').value.trim();
                if (!name) return showFeedback('Bitte Restaurant-Name eingeben.');
                const btn = document.getElementById('wiz-step1-btn');
                btn.disabled = true; btn.textContent = 'Wird registriert…';
                try {
                    const res  = await fetch(`${LICENSE_SERVER}/api/v1/trial/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ domain: window.location.hostname, restaurant_name: name, contact_email: email, instance_id: navigator.userAgent.slice(0, 80) })
                    });
                    const data = await res.json();
                    if (data.success) {
                        trialKey = data.license_key;
                        localStorage.setItem('opa_license_key', trialKey);
                        step = 2; render();
                    } else {
                        showFeedback(data.message || 'Fehler bei der Registrierung.');
                        btn.disabled = false; btn.textContent = 'Trial starten →';
                    }
                } catch { showFeedback('Verbindung fehlgeschlagen.'); btn.disabled = false; btn.textContent = 'Trial starten →'; }
            });
        }

        if (step === 2) {
            document.getElementById('wiz-step2-btn')?.addEventListener('click', async () => {
                const username = document.getElementById('wiz-user').value.trim();
                const password = document.getElementById('wiz-pass').value;
                if (!username || password.length < 12) return showFeedback('Benutzername & Passwort (min. 12 Zeichen) erforderlich.');
                const btn = document.getElementById('wiz-step2-btn');
                btn.disabled = true; btn.textContent = 'Erstelle Account…';
                try {
                    const res  = await fetch('/api/v1/setup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-setup-token': window.OPA_SETUP_TOKEN || '' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await res.json();
                    if (data.success) { step = 3; render(); }
                    else { showFeedback(data.message || 'Fehler beim Erstellen.'); btn.disabled = false; btn.textContent = 'Account erstellen →'; }
                } catch { showFeedback('Verbindung fehlgeschlagen.'); btn.disabled = false; btn.textContent = 'Account erstellen →'; }
            });
        }

        if (step === 3) {
            document.getElementById('wiz-finish-btn')?.addEventListener('click', () => {
                onComplete();
            });
        }
    };

    render();
}
