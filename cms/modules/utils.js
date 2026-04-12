/**
 * Utility Module for Grieche-CMS
 * Contains common UI helpers like Toasts, Prompts, etc.
 */

export const showToast = (message, type = 'success') => {
    const d = document.createElement('div');
    d.textContent = message;
    d.style.cssText = `
        position: fixed;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#16a34a' : '#dc2626'};
        color: #fff;
        padding: 14px 36px;
        border-radius: 12px;
        z-index: 10000;
        font-weight: 700;
        font-size: .9rem;
        box-shadow: 0 10px 30px rgba(0,0,0,.2);
        animation: toast-in 0.3s ease-out;
    `;
    document.body.appendChild(d);
    setTimeout(() => {
        d.style.opacity = '0';
        d.style.transition = 'opacity 0.5s';
        setTimeout(() => d.remove(), 500);
    }, 3000);
};

export const showConfirm = (title, text) => {
    return new Promise((resolve) => {
        const div = document.createElement('div'); 
        div.className = 'modal-overlay';
        div.innerHTML = `
            <div class="modal-glass">
                <h3 style="margin-bottom:10px;">${title}</h3>
                <p style="margin-bottom:24px;opacity:.7;line-height:1.6;font-size:14px;">${text}</p>
                <div style="display:flex;justify-content:flex-end;gap:12px;">
                    <button class="btn-primary" style="background:transparent;color:var(--text);border:1px solid rgba(0,0,0,.1);" id="mc-cancel">Abbrechen</button>
                    <button class="btn-primary" id="mc-ok">Fortfahren</button>
                </div>
            </div>`;
        document.body.appendChild(div);
        document.getElementById('mc-cancel').onclick = () => { div.remove(); resolve(false); };
        document.getElementById('mc-ok').onclick = () => { div.remove(); resolve(true); };
    });
};

export const showPrompt = (title, text) => {
    return new Promise((resolve) => {
        const div = document.createElement('div'); 
        div.className = 'modal-overlay';
        div.innerHTML = `
            <div class="modal-glass">
                <h3 style="margin-bottom:10px;">${title}</h3>
                <p style="margin-bottom:16px;opacity:.7;font-size:14px;">${text}</p>
                <input type="text" class="input-styled" id="mp-input" style="margin-bottom:24px;width:100%;" autofocus>
                <div style="display:flex;justify-content:flex-end;gap:12px;">
                    <button class="btn-primary" style="background:transparent;color:var(--text);border:1px solid rgba(0,0,0,.1);" id="mp-cancel">Abbrechen</button>
                    <button class="btn-primary" id="mp-ok">OK</button>
                </div>
            </div>`;
        document.body.appendChild(div);
        const inp = document.getElementById('mp-input');
        document.getElementById('mp-cancel').onclick = () => { div.remove(); resolve(null); };
        document.getElementById('mp-ok').onclick = () => { const v = inp.value; div.remove(); resolve(v); };
        inp.onkeydown = (e) => { if(e.key === 'Enter') document.getElementById('mp-ok').click(); };
    });
};

const HELP_CONTENT = {
    menu: {
        title: "Speisekarte & Gerichte",
        text: "Hier verwalten Sie das Herzst\u00fcck Ihres Restaurants. <b>Bilder:</b> Nutzen Sie das Querformat (ca. 800x600px). JPG, PNG oder WEBP sind ideal. <b>Struktur:</b> Erstellen Sie zuerst Kategorien (z.B. Vorspeisen, Grillgerichte). Weisen Sie dann jedem Gericht eine Kategorie zu. Allergene und Zusatzstoffe k\u00f6nnen Sie global definieren und dann pro Gericht per Checkbox ausw\u00e4hlen."
    },
    visuals: {
        title: "Website Design",
        text: "Gestalten Sie den ersten Eindruck! <b>Hero-Bild:</b> Nutzen Sie ein hochaufl\u00f6sendes Landschaftsfoto (ca. 1920px Breite). <b>Willkommen-Bild:</b> Ein quadratisches oder leichtes Hochformat sieht hier am besten aus. Alle Bilder werden automatisch optimiert angezeigt."
    },
    location: {
        title: "Standort & Karte",
        text: "Geben Sie Ihre Adresse genau so ein, wie sie bei Google Maps steht. F\u00fcr die <b>interaktive Karte</b> nutzen Sie die 'Einbetten'-Funktion von Google Maps (Teilen > Karte einbetten > URL aus src kopieren). Dies erm\u00f6glicht G\u00e4sten die direkte Navigation via Google oder Apple Maps."
    },
    opening: {
        title: "\u00d6ffnungszeiten & Slots",
        text: "Diese Zeiten steuern die Anzeige 'Ge\u00f6ffnet/Geschlossen' und den Reservierungs-Kalender. Das <b>Intervall</b> bestimmt, in welchen Schritten G\u00e4ste einen Tisch buchen k\u00f6nnen (z.B. alle 30 Minuten)."
    },
    // pdf_export, menu_backup und menu_restore wurden zu 'menu_tools' zusammengefasst
    menu_tools: {
        title: "PDF, Backup & Wiederherstellung",
        sections: [
            {
                icon: "fa-file-pdf",
                title: "PDF Speisekarte",
                text: "Erzeugt eine druckfertige PDF-Version Ihrer aktuellen Speisekarte. Ideal f\u00fcr den Aushang im Restaurant oder als Download f\u00fcr G\u00e4ste. Das Design nutzt automatisch Ihre Markenfarben."
            },
            {
                icon: "fa-download",
                title: "Backup erstellen",
                text: "Exportiert Ihre gesamte Speisekarte inklusive aller Kategorien, Allergene und Zusatzstoffe als JSON-Datei. Sichern Sie diese Datei regelm\u00e4\u00dfig auf Ihrem Computer, um Datenverlust vorzubeugen."
            },
            {
                icon: "fa-upload",
                title: "Wiederherstellen (Restore)",
                text: "L\u00e4dt eine zuvor gesicherte Backup-Datei hoch. <b>Achtung:</b> Dies \u00fcberschreibt Ihre aktuelle Speisekarte vollst\u00e4ndig mit dem Stand aus der Datei. Nicht r\u00fcckg\u00e4ngig machbar."
            }
        ]
    },
    // Legacy-Keys f\u00fcr R\u00fcckw\u00e4rtskompatibilit\u00e4t (falls noch irgendwo verwendet)
    pdf_export:   { redirect: 'menu_tools' },
    menu_backup:  { redirect: 'menu_tools' },
    menu_restore: { redirect: 'menu_tools' }
};

export const showHelp = (topic) => {
    const h = HELP_CONTENT[topic];
    if (!h) return;

    // Legacy-Redirect
    const target = h.redirect ? HELP_CONTENT[h.redirect] : h;
    if (!target) return;

    const div = document.createElement('div');
    div.className = 'modal-overlay';

    // Multi-Section Layout (neu: menu_tools)
    if (target.sections) {
        const sectionsHtml = target.sections.map(s => `
            <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
                <div style="width:36px;height:36px;border-radius:10px;background:var(--accent, #C8A96E);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas ${s.icon}" style="color:#fff;font-size:.95rem;"></i>
                </div>
                <div>
                    <div style="font-weight:700;margin-bottom:4px;font-size:.95rem;">${s.title}</div>
                    <div style="font-size:.88rem;line-height:1.6;opacity:.75;">${s.text}</div>
                </div>
            </div>
        `).join('');

        div.innerHTML = `
            <div class="modal-glass" style="max-width:520px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;color:var(--primary);">
                    <i class="fas fa-question-circle" style="font-size:1.5rem;"></i>
                    <h3 style="margin:0;">${target.title}</h3>
                </div>
                <div style="margin-bottom:20px;">${sectionsHtml}</div>
                <div style="text-align:right;">
                    <button class="btn-primary" id="help-close-btn">Verstanden</button>
                </div>
            </div>`;
    } else {
        // Standard single-section
        div.innerHTML = `
            <div class="modal-glass" style="max-width:500px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:15px;color:var(--primary);">
                    <i class="fas fa-question-circle" style="font-size:1.5rem;"></i>
                    <h3 style="margin:0;">${target.title}</h3>
                </div>
                <p style="font-size:.9rem;line-height:1.6;opacity:.8;margin-bottom:24px;">${target.text}</p>
                <div style="text-align:right;">
                    <button class="btn-primary" id="help-close-btn">Verstanden</button>
                </div>
            </div>`;
    }

    document.body.appendChild(div);
    document.getElementById('help-close-btn').onclick = () => div.remove();
};

export const renderHelpIcon = (topic) => {
    window.showHelp = showHelp;
    return `<i class="fas fa-question-circle help-icon-trigger" onclick="window.showHelp('${topic}')" title="Hilfe anzeigen" style="cursor:pointer;color:var(--primary);opacity:.6;transition:all .2s;font-size:1.1rem;margin-left:8px;"></i>`;
};
