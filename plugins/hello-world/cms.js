/**
 * OPA! Extra Plugin - CMS Side
 */
(function() {
    console.log("🌟 Plugin 'Opa! Extra' geladen!");

    // Register a new tab in the sidebar
    CMS.registerTab('opa-extra', 'Opa! Extra', 'fa-star', (container) => {
        container.innerHTML = `
            <div class="glass-panel" style="padding:40px; border-radius:32px; text-align:center; margin-bottom:30px;">
                <div style="font-size:4rem; color:var(--primary); margin-bottom:20px; filter: drop-shadow(0 10px 15px rgba(37,99,235,0.2));"><i class="fas fa-magic"></i></div>
                <h1 style="margin-bottom:15px; font-size:2.4rem; font-weight:800; letter-spacing:-1px;">Willkommen bei Opa! Extra</h1>
                <p style="opacity:.6; margin-bottom:35px; max-width:600px; margin-inline:auto; line-height:1.7; font-size:1.05rem;">
                    Dies ist ein Beispiel-Plugin, das zeigt wie einfach du das CMS erweitern kannst. 
                    Deine Erweiterung nutzt automatisch das gesamte Design-System inklusive aller Animationen.
                </p>
                <div style="display:flex; justify-content:center; gap:15px;">
                    <button class="btn-primary pulse-primary" style="padding: 14px 32px;" onclick="window.CMS.showToast('Style Test erfolgreich!', 'success')">
                        <i class="fas fa-check-circle" style="margin-right:8px;"></i> Premium Test Button
                    </button>
                    <button class="btn-secondary" style="padding: 14px 32px;" onclick="window.location.reload()">
                        <i class="fas fa-sync-alt" style="margin-right:8px;"></i> System Reload
                    </button>
                </div>
            </div>

            <div class="glass-panel" style="padding:40px; border-radius:32px; text-align:left;">
                <h2 style="margin-bottom:30px; display:flex; align-items:center; gap:14px; font-weight:800; font-size:1.8rem;">
                    <i class="fas fa-terminal" style="color:var(--primary); background:rgba(37,99,235,0.1); width:45px; height:45px; display:flex; align-items:center; justify-content:center; border-radius:12px;"></i> 
                    Plugin Manager Guide
                </h2>
                
                <div style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:30px; display:grid;">
                    <div style="background:rgba(255,255,255,0.4); border:1px solid rgba(0,0,0,0.05); padding:25px; border-radius:24px;">
                        <h4 style="margin-bottom:15px; color:var(--text); font-weight:700; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-palette" style="color:var(--primary);"></i> Design System
                        </h4>
                        <p style="font-size:0.88rem; line-height:1.6; opacity:0.7; margin-bottom:18px;">
                            Nutze die globalen CSS-Klassen für den echten OPA-Look:
                        </p>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <div style="font-size:0.8rem; background:#fff; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,0.03);">
                                <code style="color:var(--primary); font-weight:700;">.btn-primary</code> - Der Standard-Button
                            </div>
                            <div style="font-size:0.8rem; background:#fff; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,0.03);">
                                <code style="color:var(--primary); font-weight:700;">.glass-panel</code> - Der verschwommene Hintergrund
                            </div>
                            <div style="font-size:0.8rem; background:#fff; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,0.03);">
                                <code style="color:var(--primary); font-weight:700;">.pulse-primary</code> - Dezente Animation
                            </div>
                        </div>
                    </div>

                    <div style="background:rgba(255,255,255,0.4); border:1px solid rgba(0,0,0,0.05); padding:25px; border-radius:24px;">
                        <h4 style="margin-bottom:15px; color:var(--text); font-weight:700; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-code-branch" style="color:var(--primary);"></i> Core API
                        </h4>
                        <p style="font-size:0.88rem; line-height:1.6; opacity:0.7; margin-bottom:18px;">
                            Verwende das globale <code style="font-weight:700;">CMS</code>-Objekt:
                        </p>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <div style="font-size:0.8rem; background:#fff; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,0.03);">
                                <code style="color:var(--blue);">CMS.registerTab(id, label, icon, fn)</code>
                            </div>
                            <div style="font-size:0.8rem; background:#fff; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,0.03);">
                                <code style="color:var(--blue);">CMS.showToast(message, type)</code>
                            </div>
                            <div style="font-size:0.8rem; background:#fff; padding:10px; border-radius:10px; border:1px solid rgba(0,0,0,0.03);">
                                <code style="color:var(--blue);">CMS.apiGet(route)</code>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top:35px; padding:25px; border:1px solid rgba(37,99,235,0.1); background:rgba(37,99,235,0.05); border-radius:24px; position:relative; overflow:hidden;">
                    <i class="fas fa-lightbulb" style="position:absolute; right:20px; top:20px; font-size:3rem; opacity:0.05;"></i>
                    <strong style="display:flex; align-items:center; gap:8px; margin-bottom:8px; color:var(--primary);"><i class="fas fa-info-circle"></i> Best Practices</strong>
                    <p style="font-size:0.92rem; opacity:0.8; margin:0; line-height:1.6; max-width:90%;">
                        Halte dich an das Rastersystem mit <code style="font-weight:700;">.form-grid</code> und verwende Icons von FontAwesome 5 Free, um die Konsistenz des Management-Tools zu wahren.
                    </p>
                </div>
            </div>
        `;
    });

    // Add a widget to the dashboard (Placeholder for future hook in renderDashboard)
    CMS.addDashboardWidget('extra-info', (container) => {
        container.innerHTML = `<div class="glass-panel" style="padding:20px;">Extra Plugin Widget</div>`;
    });
})();
