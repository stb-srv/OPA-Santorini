import { apiGet, getAuthToken } from './api.js';
import { showToast, showConfirm } from './utils.js';

export async function renderBackup(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-database"></i> Backup & Restore';

    // Aktuelle Instanz-Info laden
    let info = { counts: {}, dbType: '?' };
    try { 
        const res = await apiGet('backup/info');
        if (res && res.success) info = res;
    } catch (_) {}

    container.innerHTML = `
        <div class="glass-panel" style="padding:40px; max-width:800px; margin:0 auto;">

            <!-- Header -->
            <div style="margin-bottom:40px;">
                <h3 style="margin-bottom:6px;">Globales Backup & Restore</h3>
                <p style="color:var(--text-muted); font-size:.85rem;">
                    Exportiere alle Daten dieser Instanz als JSON-Datei oder 
                    spiele ein bestehendes Backup auf dieser Instanz ein.
                </p>
            </div>

            <!-- Instanz-Status -->
            <div style="background:rgba(255,255,255,0.15); border-radius:16px; 
                        padding:20px; margin-bottom:30px; border:1px solid rgba(0,0,0,0.06);">
                <div style="font-size:.7rem; font-weight:800; text-transform:uppercase; 
                            opacity:.5; margin-bottom:12px;">Aktuelle Instanz</div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px,1fr)); gap:12px;">
                    ${Object.entries(info.counts || {}).map(([k, v]) => `
                        <div style="text-align:center; padding:14px; background:rgba(255,255,255,0.2); 
                                    border-radius:12px;">
                            <div style="font-size:1.6rem; font-weight:900; color:var(--primary);">${v}</div>
                            <div style="font-size:.72rem; opacity:.6; margin-top:2px;">${{
                                menu: 'Gerichte', categories: 'Kategorien',
                                reservations: 'Reservierungen', tables: 'Tische',
                                orders: 'Bestellungen', users: 'Benutzer'
                            }[k] || k}</div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:12px; font-size:.75rem; opacity:.4;">
                    Datenbank-Typ: ${info.dbType?.toUpperCase() || 'SQLITE'}
                </div>
            </div>

            <!-- Export -->
            <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); 
                        border-radius:16px; padding:24px; margin-bottom:20px;">
                <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
                    <div style="width:44px; height:44px; border-radius:12px; background:#10b981; 
                                display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <i class="fas fa-download" style="color:#fff; font-size:1.1rem;"></i>
                    </div>
                    <div>
                        <div style="font-weight:800; font-size:1rem;">Backup erstellen</div>
                        <div style="font-size:.8rem; opacity:.6; margin-top:2px;">
                            Exportiert alle Daten als JSON-Datei (ohne Benutzer-Passwörter).
                        </div>
                    </div>
                </div>
                <button class="btn-premium" id="btn-export" style="background:#10b981; width:100%; border-color:#10b981;">
                    <i class="fas fa-download"></i> Backup jetzt herunterladen
                </button>
            </div>

            <!-- Import -->
            <div style="background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); 
                        border-radius:16px; padding:24px;">
                <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
                    <div style="width:44px; height:44px; border-radius:12px; background:#ef4444; 
                                display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <i class="fas fa-upload" style="color:#fff; font-size:1.1rem;"></i>
                    </div>
                    <div>
                        <div style="font-weight:800; font-size:1rem;">Backup einspielen</div>
                        <div style="font-size:.8rem; opacity:.6; margin-top:2px;">
                            ⚠️ Überschreibt alle bestehenden Daten dieser Instanz unwiderruflich.
                        </div>
                    </div>
                </div>
                <div style="margin-bottom:14px;">
                    <input type="file" id="backup-file-input" accept=".json" style="display:none;">
                    <div id="backup-drop-zone" style="
                        border:2px dashed rgba(239,68,68,0.3); border-radius:12px; padding:30px;
                        text-align:center; cursor:pointer; transition:all .2s;
                        background:rgba(255,255,255,0.05);
                    ">
                        <i class="fas fa-file-upload" style="font-size:2rem; opacity:.3; margin-bottom:10px; display:block;"></i>
                        <div style="font-size:.85rem; opacity:.6;">JSON-Backup hier ablegen oder klicken zum Auswählen</div>
                        <div id="selected-file-name" style="margin-top:8px; font-size:.8rem; 
                             color:var(--primary); font-weight:700; display:none;"></div>
                    </div>
                </div>
                <button class="btn-premium" id="btn-import" disabled 
                        style="background:#ef4444; width:100%; opacity:.5; cursor:not-allowed; border-color:#ef4444;">
                    <i class="fas fa-upload"></i> Backup jetzt einspielen
                </button>
            </div>

            <!-- Cloud-Backup (Hetzner) -->
            <div class="glass-panel" style="padding:24px; margin-top:20px; border:1px solid rgba(0,0,0,0.06); background:rgba(255,255,255,0.1);">
                <h3 style="font-size:1rem; font-weight:800; color:var(--text); margin-bottom:6px;">
                    <i class="fas fa-cloud-upload-alt" style="color:var(--primary);"></i>
                    Cloud-Backup (Hetzner Object Storage)
                </h3>
                <p style="font-size:.85rem; color:var(--text-muted); margin-bottom:18px;">
                    Automatisches tägliches Backup in S3-kompatiblen Speicher.
                </p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                    <div>
                        <label style="font-size:.78rem; font-weight:700; display:block; margin-bottom:4px;">
                            S3 Endpoint
                        </label>
                        <input id="s3-endpoint" type="text" placeholder="fsn1.your-objectstorage.com"
                               style="width:100%; padding:9px 12px; border:1.5px solid var(--border);
                                      border-radius:8px; font-size:.85rem; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:.78rem; font-weight:700; display:block; margin-bottom:4px;">
                            Bucket-Name
                        </label>
                        <input id="s3-bucket" type="text" placeholder="opa-backups"
                               style="width:100%; padding:9px 12px; border:1.5px solid var(--border);
                                      border-radius:8px; font-size:.85rem; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:.78rem; font-weight:700; display:block; margin-bottom:4px;">
                            Access Key
                        </label>
                        <input id="s3-access-key" type="text" placeholder="Hetzner Access Key"
                               style="width:100%; padding:9px 12px; border:1.5px solid var(--border);
                                      border-radius:8px; font-size:.85rem; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:.78rem; font-weight:700; display:block; margin-bottom:4px;">
                            Secret Key
                        </label>
                        <input id="s3-secret-key" type="password" placeholder="••••••••"
                               style="width:100%; padding:9px 12px; border:1.5px solid var(--border);
                                      border-radius:8px; font-size:.85rem; box-sizing:border-box;">
                    </div>
                </div>
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px;">
                    <label style="font-size:.82rem; font-weight:700;">Auto-Backup täglich:</label>
                    <input id="s3-auto" type="checkbox" style="width:16px; height:16px; cursor:pointer;">
                    <input id="s3-time" type="time" value="03:00"
                           style="padding:6px 10px; border:1.5px solid var(--border);
                                  border-radius:8px; font-size:.85rem;">
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="btn-s3-save"
                            style="padding:10px 20px; background:var(--primary); color:#fff;
                                   border:none; border-radius:10px; font-size:.88rem;
                                   font-weight:700; cursor:pointer;">
                        <i class="fas fa-save"></i> Einstellungen speichern
                    </button>
                    <button id="btn-s3-now"
                            style="padding:10px 20px; background:#f3f4f6; color:var(--text);
                                   border:1.5px solid var(--border); border-radius:10px;
                                   font-size:.88rem; font-weight:700; cursor:pointer;">
                        <i class="fas fa-cloud-upload-alt"></i> Jetzt sichern
                    </button>
                </div>
                <div id="s3-feedback" style="display:none; margin-top:12px; padding:10px 14px;
                     border-radius:8px; font-size:.85rem;"></div>
            </div>

            <!-- Log -->
            <div id="backup-log" style="display:none; margin-top:20px; padding:16px; 
                 background:rgba(0,0,0,0.4); color:#fff; border-radius:12px; font-family:monospace; 
                 font-size:.78rem; line-height:1.8; white-space:pre-wrap;"></div>
        </div>
    `;

    const logEl   = container.querySelector('#backup-log');
    const btnImp  = container.querySelector('#btn-import');
    const dropZone = container.querySelector('#backup-drop-zone');
    const fileInput = container.querySelector('#backup-file-input');
    let selectedFile = null;

    // Log helper
    const log = (msg, color = 'inherit') => {
        logEl.style.display = 'block';
        logEl.innerHTML += `<span style="color:${color};">${msg}</span>\n`;
    };

    // Export
    container.querySelector('#btn-export').onclick = () => {
        const token = getAuthToken();
        const a = document.createElement('a');
        // Auth via Header geht nicht bei <a href>, daher fetch + blob
        fetch('/api/backup/export', { headers: { 'x-admin-token': token } })
            .then(r => r.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const date = new Date().toISOString().split('T')[0];
                a.href = url;
                a.download = `opa-backup-${date}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Backup erfolgreich heruntergeladen!');
            })
            .catch(() => showToast('Backup fehlgeschlagen.', 'error'));
    };

    // File Drop & Select
    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = '#ef4444'; };
    dropZone.ondragleave = () => { dropZone.style.borderColor = 'rgba(239,68,68,0.3)'; };
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(239,68,68,0.3)';
        const file = e.dataTransfer.files[0];
        if (file) setFile(file);
    };
    fileInput.onchange = () => { if (fileInput.files[0]) setFile(fileInput.files[0]); };

    const setFile = (file) => {
        selectedFile = file;
        container.querySelector('#selected-file-name').textContent = `📄 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
        container.querySelector('#selected-file-name').style.display = 'block';
        btnImp.disabled = false;
        btnImp.style.opacity = '1';
        btnImp.style.cursor = 'pointer';
    };

    // Import
    btnImp.onclick = async () => {
        if (!selectedFile) return;
        const ok = await showConfirm(
            '⚠️ Backup einspielen',
            'Dies überschreibt ALLE bestehenden Daten dieser Instanz unwiderruflich. Bist du sicher?'
        );
        if (!ok) return;

        logEl.innerHTML = '';
        log('🔄 Starte Restore...', '#818cf8');

        try {
            const text = await selectedFile.text();
            const data = JSON.parse(text);
            log(`📋 Backup vom ${data._meta?.createdAt?.slice(0,10) || '?'} (Version ${data._meta?.version || '?'})`);

            const token = getAuthToken();
            const res = await fetch('/api/backup/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': token
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success) {
                const r = result.results?.restored || {};
                log('✅ Restore abgeschlossen!', '#10b981');
                if (r.kv)           log(`   KV-Store:       ${r.kv} Einträge`);
                if (r.categories)   log(`   Kategorien:     ${r.categories}`);
                if (r.menu)         log(`   Speisekarte:    ${r.menu} Gerichte`);
                if (r.tables)       log(`   Tische:         ${r.tables}`);
                if (r.reservations) log(`   Reservierungen: ${r.reservations}`);
                if (r.orders)       log(`   Bestellungen:   ${r.orders}`);
                if (r.users)        log(`   Benutzer:       ${r.users} (neu)`);

                if (result.results?.errors?.length > 0) {
                    log('\n⚠️ Warnungen:', '#f59e0b');
                    result.results.errors.forEach(e => log('   ' + e, '#f59e0b'));
                }

                showToast('Backup erfolgreich eingespielt!');
            } else {
                log('❌ Fehler: ' + result.reason, '#ef4444');
                showToast('Restore fehlgeschlagen.', 'error');
            }
        } catch (e) {
            log('❌ ' + e.message, '#ef4444');
            showToast('Restore fehlgeschlagen.', 'error');
        }
    };

    // Cloud-Backup Events
    document.getElementById('btn-s3-save')?.addEventListener('click', async () => {
        const config = {
            s3_endpoint:   document.getElementById('s3-endpoint').value.trim(),
            s3_bucket:     document.getElementById('s3-bucket').value.trim(),
            s3_access_key: document.getElementById('s3-access-key').value.trim(),
            s3_secret_key: document.getElementById('s3-secret-key').value.trim(),
            s3_auto:       document.getElementById('s3-auto').checked,
            s3_time:       document.getElementById('s3-time').value
        };
        try {
            const { apiPost } = await import('./api.js');
            await apiPost('settings/backup-cloud', config);
            const fb = document.getElementById('s3-feedback');
            fb.style.display='block'; fb.style.background='#f0fdf4';
            fb.style.color='#16a34a'; fb.style.border='1px solid #bbf7d0';
            fb.textContent='✅ Einstellungen gespeichert.';
        } catch(e) { console.error(e); }
    });

    document.getElementById('btn-s3-now')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-s3-now');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sichern...';
        try {
            const { apiPost } = await import('./api.js');
            const res = await apiPost('backup/cloud', {});
            const fb = document.getElementById('s3-feedback');
            fb.style.display='block';
            if (res?.success) {
                fb.style.background='#f0fdf4'; fb.style.color='#16a34a';
                fb.style.border='1px solid #bbf7d0';
                fb.textContent=`✅ Backup erfolgreich: ${res.filename || 'backup.sql.gz'}`;
            } else {
                fb.style.background='#fef2f2'; fb.style.color='#dc2626';
                fb.style.border='1px solid #fecaca';
                fb.textContent=`❌ ${res?.message || 'Backup fehlgeschlagen.'}`;
            }
        } catch(e) {
            const fb = document.getElementById('s3-feedback');
            fb.style.display='block'; fb.style.background='#fef2f2';
            fb.style.color='#dc2626'; fb.textContent='❌ Verbindungsfehler.';
        }
        btn.disabled=false;
        btn.innerHTML='<i class="fas fa-cloud-upload-alt"></i> Jetzt sichern';
    });
}
