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
        text: "Hier verwalten Sie das Herzstück Ihres Restaurants. <b>Bilder:</b> Nutzen Sie das Querformat (ca. 800x600px). JPG, PNG oder WEBP sind ideal. <b>Struktur:</b> Erstellen Sie zuerst Kategorien (z.B. Vorspeisen, Grillgerichte). Weisen Sie dann jedem Gericht eine Kategorie zu. Allergene und Zusatzstoffe können Sie global definieren und dann pro Gericht per Checkbox auswählen."
    },
    visuals: {
        title: "Website Design",
        text: "Gestalten Sie den ersten Eindruck! <b>Hero-Bild:</b> Nutzen Sie ein hochauflösendes Landschaftsfoto (ca. 1920px Breite). <b>Willkommen-Bild:</b> Ein quadratisches oder leichtes Hochformat sieht hier am besten aus. Alle Bilder werden automatisch optimiert angezeigt."
    },
    location: {
        title: "Standort & Karte",
        text: "Geben Sie Ihre Adresse genau so ein, wie sie bei Google Maps steht. Für die <b>interaktive Karte</b> nutzen Sie die 'Einbetten'-Funktion von Google Maps (Teilen > Karte einbetten > URL aus src kopieren). Dies ermöglicht Gästen die direkte Navigation via Google oder Apple Maps."
    },
    opening: {
        title: "Öffnungszeiten & Slots",
        text: "Diese Zeiten steuern die Anzeige 'Geöffnet/Geschlossen' und den Reservierungs-Kalender. Das <b>Intervall</b> bestimmt, in welchen Schritten Gäste einen Tisch buchen können (z.B. alle 30 Minuten)."
    },
    pdf_export: {
        title: "PDF Speisekarte",
        text: "Erzeugt eine druckfertige PDF-Version Ihrer aktuellen Speisekarte. Ideal für den Aushang im Restaurant oder als Download für Gäste auf der Website. Das Design nutzt automatisch Ihre Markenfarben."
    },
    menu_backup: {
        title: "Speisekarten-Backup",
        text: "Exportiert Ihre gesamte Speisekarte inklusive aller Kategorien, Allergene und Zusatzstoffe als Datei. Sichern Sie diese Datei regelmäßig auf Ihrem Computer, um Datenverlust vorzubeugen."
    },
    menu_restore: {
        title: "Wiederherstellung (Restore)",
        text: "Hier können Sie eine zuvor gesicherte Backup-Datei hochladen. <b>Achtung:</b> Dies überschreibt Ihre aktuelle Speisekarte vollständig mit dem Stand aus der Datei."
    }
};

export const showHelp = (topic) => {
    const h = HELP_CONTENT[topic];
    if(!h) return;
    const div = document.createElement('div'); 
    div.className = 'modal-overlay';
    div.innerHTML = `
        <div class="modal-glass" style="max-width:500px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:15px;color:var(--primary);">
                <i class="fas fa-question-circle" style="font-size:1.5rem;"></i>
                <h3 style="margin:0;">${h.title}</h3>
            </div>
            <p style="font-size:.9rem;line-height:1.6;opacity:.8;margin-bottom:24px;">${h.text}</p>
            <div style="text-align:right;">
                <button class="btn-primary" id="help-close-btn">Verstanden</button>
            </div>
        </div>`;
    document.body.appendChild(div);
    document.getElementById('help-close-btn').onclick = () => div.remove();
};

export const renderHelpIcon = (topic) => {
    // Re-register window hook for legacy inline onclicks if needed
    window.showHelp = showHelp; 
    return `<i class="fas fa-question-circle help-icon-trigger" onclick="window.showHelp('${topic}')" title="Hilfe anzeigen" style="cursor:pointer;color:var(--primary);opacity:.6;transition:all .2s;font-size:1.1rem;margin-left:8px;"></i>`;
};
