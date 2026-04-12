/**
 * Menu Management Module for Grieche-CMS
 */

import { apiGet, apiPost, apiUpload } from './api.js';
import { showToast, showConfirm, showPrompt, renderHelpIcon } from './utils.js';

// --- Module State ---
let cachedMenuData = null;
let editingDishIndex = -1;
let cmsSearch = '';
let cmsCatFilter = 'All';
let cmsSort = 'name';

// --- Helpers ---
const getCatLabel = (cat) => {
    if (!cat) return 'Unsortiert';
    if (typeof cat === 'object') return cat.label || cat.id || 'Unbekannt';
    return cat;
};

// Global ESC listener (once)
const handleEsc = (e) => {
    if (e.key === 'Escape') {
        const f = document.querySelector('#dish-form');
        const bt = document.querySelector('#toggle-dish-form');
        if (f && f.style.display === 'block') {
            f.style.display = 'none';
            if (bt) bt.style.display = 'inline-flex';
        }
    }
};
document.removeEventListener('keydown', handleEsc);
document.addEventListener('keydown', handleEsc);

// --- Main Components ---
export async function renderMenu(container, titleEl, tab = 'dishes', forceRefresh = false) {
    const currentTab = tab || 'dishes';
    titleEl.innerHTML = `<div style="display:flex;align-items:center;">Speisekarte <i class="fas fa-chevron-right" style="margin:0 10px; font-size:.8rem; opacity:.3;"></i> ${currentTab.charAt(0).toUpperCase() + currentTab.slice(1)} ${renderHelpIcon('menu')}</div>`;
    
    // Fetch data
    if (!cachedMenuData || forceRefresh) {
        const [menu, categories, allergens, additives] = await Promise.all([
            apiGet('menu') || [], apiGet('categories') || [], 
            apiGet('allergens') || {}, apiGet('additives') || {}
        ]);
        cachedMenuData = { menu, categories, allergens, additives };
    }
    const { menu, categories, allergens, additives } = cachedMenuData;

    // Save scroll & focus
    const focusedId = document.activeElement?.id;
    
    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div id="menu-tab-content">
                ${renderCurrentTab(currentTab, menu, categories, allergens, additives)}
            </div>
        </div>
    `;

    attachMenuHandlers(container, menu, categories, allergens, additives, currentTab);

    // Restore focus
    if (focusedId) {
        const el = document.getElementById(focusedId);
        if (el) {
            el.focus();
            if (el.tagName === 'INPUT') {
                 const len = el.value.length;
                 el.setSelectionRange(len, len);
            }
        }
    }
}

function renderCurrentTab(tab, menu, categories, allergens, additives) {
    switch (tab) {
        case 'dishes': return renderDishesTab(menu, categories, allergens, additives);
        case 'categories': return renderCategoriesTab(categories);
        case 'allergens': return renderAllergensTab(allergens);
        case 'additives': return renderAdditivesTab(additives);
        default: return renderDishesTab(menu, categories, allergens, additives);
    }
}

function renderDishesTab(menu, categories, allergens, additives) {
    const filtered = menu.map((m, i) => ({ ...m, _idx: i }))
        .filter(d => {
            const dCatLabel = getCatLabel(d.cat);
            const matchCat = (cmsCatFilter === 'All' || dCatLabel.trim() === cmsCatFilter.trim());
            const matchSearch = ((d.name || '').toLowerCase().includes(cmsSearch.toLowerCase()) || (d.nr || '').toString().includes(cmsSearch));
            return matchCat && matchSearch;
        })
        .sort((a,b) => {
            if (cmsSort === 'price') return parseFloat(a.price) - parseFloat(b.price);
            if (cmsSort === 'nr') return (a.nr || '').toString().localeCompare((b.nr || '').toString(), undefined, {numeric: true});
            return a.name.localeCompare(b.name);
        });

    const cats = [...new Set(menu.map(m => getCatLabel(m.cat)))].sort();
    
    const allergenChecks = Object.entries(allergens).map(([code, name]) => `
        <label class="check-item">
            <input type="checkbox" class="dish-allergen-cb" value="${code}">
            <span><strong>${code}</strong> ${name}</span>
        </label>
    `).join('');

    const additiveChecks = Object.entries(additives).map(([code, name]) => `
        <label class="check-item">
            <input type="checkbox" class="dish-additive-cb" value="${code}">
            <span><strong>${code}</strong> ${name}</span>
        </label>
    `).join('');

    return `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:15px;flex-wrap:wrap;">
            <div style="display:flex;gap:10px;flex:1;min-width:300px;">
                <input class="input-styled" id="cms-dish-search" value="${cmsSearch}" placeholder="Name oder Nummer suchen..." style="flex:1;">
                <select class="input-styled" id="cms-cat-filter" style="width:160px;">
                    <option value="All">Alle Kategorien</option>
                    ${cats.map(c => `<option value="${c}" ${cmsCatFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <select class="input-styled" id="cms-sort" style="width:140px;">
                    <option value="name" ${cmsSort === 'name' ? 'selected' : ''}>Sortierung: Name</option>
                    <option value="price" ${cmsSort === 'price' ? 'selected' : ''}>Sortierung: Preis</option>
                    <option value="nr" ${cmsSort === 'nr' ? 'selected' : ''}>Sortierung: Nummer</option>
                </select>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
                <button class="btn-primary" id="toggle-dish-form" style="background:var(--accent);"><i class="fas fa-plus"></i> Neues Gericht</button>
                <div style="display:flex;gap:4px;align-items:center;padding:0 5px;border-left:1px solid rgba(0,0,0,0.1);margin-left:5px;">
                    <button class="btn-primary" style="background:#4b5563; opacity:.8; padding:10px 15px;" id="btn-export-pdf"><i class="fas fa-file-pdf"></i> PDF</button>
                    <button class="btn-primary" style="background:#4b5563; opacity:.8; padding:10px 15px;" id="btn-export-menu"><i class="fas fa-download"></i> Backup</button>
                    <button class="btn-primary" style="background:#4b5563; opacity:.8; padding:10px 15px;" id="btn-import-menu"><i class="fas fa-upload"></i> Restore</button>
                    ${renderHelpIcon('menu_tools')}
                </div>
            </div>
        </div>

        <div id="dish-form" style="display:none; margin-bottom:40px; padding:30px; background:rgba(255,255,255,0.4); backdrop-filter:blur(20px); border-radius:24px; border:1px solid rgba(255,255,255,0.3); box-shadow: 0 8px 32px rgba(0,0,0,0.05);">
            <h3 id="dish-form-title" style="margin-bottom:20px;">Neues Gericht</h3>
            <div class="form-grid">
                <div class="form-group"><label>Nummer</label><input class="input-styled" id="df-nr" placeholder="z.B. 42"></div>
                <div class="form-group"><label>Name</label><input class="input-styled" id="df-name" placeholder="z.B. Gyros Teller"></div>
                <div class="form-group"><label>Kategorie</label>
                    <select class="input-styled" id="df-cat">
                         ${categories.map(c => `<option value="${getCatLabel(c)}">${getCatLabel(c)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label>Preis (€)</label><input class="input-styled" id="df-price" type="number" step="0.10" placeholder="0.00"></div>
                <div class="form-group" style="grid-column:1/-1;"><label>Beschreibung (optional)</label><textarea class="input-styled" id="df-desc" rows="2" placeholder="Zutaten, Zubereitungsart..."></textarea></div>
            </div>
            <div style="margin-top:20px;">
                <label>Bilder-Upload</label>
                <div id="df-img-preview" class="image-upload-preview">
                    <i class="fas fa-cloud-upload-alt"></i><span>Bild hochladen</span>
                </div>
                <input type="file" id="df-img-file" style="display:none;" accept="image/*">
                <input type="hidden" id="df-img">
            </div>
            
            <div style="margin-top:24px;">
                <label>Allergene & Zusatzstoffe</label>
                <div class="check-grid" style="margin-top:10px;">${allergenChecks} ${additiveChecks}</div>
            </div>

            <div style="display:flex;gap:10px;margin-top:24px;">
                <button class="btn-primary" id="df-save">Speichern</button>
                <button class="btn-primary" style="background:transparent;color:var(--text);border:1px solid rgba(0,0,0,.1);" onclick="window.closeDishForm()">Abbrechen</button>
            </div>
        </div>

        <table class="premium-table">
            <thead>
                <tr>
                    <th>NR</th><th>Bild</th><th>Name</th><th>Kategorie</th><th>Preis</th><th>Aktionen</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(d => `
                    <tr>
                        <td>${d.nr || '—'}</td>
                        <td>${d.image ? `<img src="${d.image}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">` : '—'}</td>
                        <td><strong>${d.name}</strong><br><small style="opacity:.6;">${d.desc || ''}</small></td>
                        <td>${getCatLabel(d.cat)}</td>
                        <td>${parseFloat(d.price).toFixed(2)} €</td>
                        <td>
                            <button class="btn-edit" onclick="window.editDish(${d._idx})"><i class="fas fa-pen"></i></button>
                            <button class="btn-delete" onclick="window.deleteDish(${d._idx})"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderCategoriesTab(categories) {
    return `
        <div style="margin-bottom:24px;"><h3>Kategorien verwalten</h3></div>
        <div class="glass-panel" style="padding:30px; margin-bottom:30px;">
            <div style="display:flex;gap:12px;margin-bottom:24px;">
                <input class="input-styled" id="new-cat-input" placeholder="Name der neuen Kategorie (z.B. Desserts)..." style="flex:1;">
                <button class="btn-primary" id="add-cat-btn" style="background:var(--accent);"><i class="fas fa-plus"></i> Hinzufügen</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
                ${categories.filter(c => c).map((c, i) => {
                    const label = getCatLabel(c);
                    return `
                        <div class="glass-pill" style="padding:10px 20px; display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.8); border:1px solid rgba(0,0,0,0.05); border-radius:100px;">
                            <span style="font-weight:700; color:var(--primary);">${label}</span>
                            <button onclick="window.deleteCategory(${i})" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:5px;"><i class="fas fa-times"></i></button>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderKVTab(title, data, keyName, placeholder) {
    const entries = Object.entries(data);
    return `
        <div style="margin-bottom:24px;"><h3>${title}</h3></div>
        <div class="glass-panel" style="padding:30px;">
            <div style="display:flex;gap:12px;margin-bottom:24px;">
                <input class="input-styled" id="kv-code" placeholder="Kürzel (z.B. A1)" style="width:120px;">
                <input class="input-styled" id="kv-name" placeholder="${placeholder}" style="flex:1;">
                <button class="btn-primary" id="kv-add-btn" style="background:var(--accent);"><i class="fas fa-plus"></i> Speichern</button>
            </div>
            <div class="cms-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">
                ${entries.length === 0 ? '<p style="grid-column:1/-1; opacity:.5;">Keine Einträge vorhanden.</p>' : entries.map(([code, name]) => `
                    <div style="background:rgba(255,255,255,0.6); padding:15px; border-radius:12px; border:1px solid rgba(0,0,0,0.03); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:var(--primary); font-size:1.1rem; margin-right:8px;">${code}</strong>
                            <span style="font-size:.9rem;">${name}</span>
                        </div>
                        <button onclick="window.deleteKV('${keyName}', '${code}')" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fas fa-trash"></i></button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderAllergensTab(allergens) { return renderKVTab('Allergene', allergens, 'allergens', 'Name des Allergens...'); }
function renderAdditivesTab(additives) { return renderKVTab('Zusatzstoffe', additives, 'additives', 'Name des Zusatzstoffes...'); }

function attachMenuHandlers(container, menu, categories, allergens, additives, currentTab) {
    window.editDish = (idx) => {
        editingDishIndex = idx;
        const d = menu[idx];
        const f = container.querySelector('#dish-form');
        const bt = container.querySelector('#toggle-dish-form');
        if (f && bt) {
            f.style.display = 'block';
            bt.style.display = 'none';
            container.querySelector('#dish-form-title').textContent = 'Gericht bearbeiten';
            container.querySelector('#df-nr').value = d.nr || '';
            container.querySelector('#df-name').value = d.name || '';
            container.querySelector('#df-price').value = d.price || '';
            container.querySelector('#df-cat').value = getCatLabel(d.cat);
            container.querySelector('#df-desc').value = d.desc || '';
            container.querySelector('#df-img').value = d.image || '';
            const preview = container.querySelector('#df-img-preview');
            if (d.image) preview.innerHTML = `<img src="${d.image}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
            else preview.innerHTML = `<i class="fas fa-cloud-upload-alt"></i><span>Bild hochladen</span>`;
            container.querySelectorAll('.dish-allergen-cb').forEach(cb => cb.checked = (d.allergens || []).includes(cb.value));
            container.querySelectorAll('.dish-additive-cb').forEach(cb => cb.checked = (d.additives || []).includes(cb.value));
            f.scrollIntoView({ behavior: 'smooth' });
        }
    };

    window.closeDishForm = () => {
        const f = container.querySelector('#dish-form');
        const bt = container.querySelector('#toggle-dish-form');
        if (f) f.style.display = 'none';
        if (bt) bt.style.display = 'inline-flex';
    };

    window.deleteDish = async (idx) => {
        const dish = menu[idx];
        if (await showConfirm('Löschen?', `Möchten Sie das Gericht "${dish.name}" wirklich entfernen?`)) {
            const res = await (await import('./api.js')).apiDelete(`menu/${dish.id}`);
            if (res?.success) {
                menu.splice(idx, 1);
                renderMenu(container, document.getElementById('view-title'), 'dishes', true);
            }
        }
    };

    window.deleteCategory = async (idx) => {
        const cat = categories[idx];
        if (await showConfirm('Löschen?', 'Dies entfernt die Kategorie dauerhaft.')) {
            const res = await (await import('./api.js')).apiDelete(`categories/${cat.id}`);
            if (res?.success) {
                categories.splice(idx, 1);
                renderMenu(container, document.getElementById('view-title'), 'categories', true);
            }
        }
    };

    window.deleteKV = async (key, code) => {
        if (await showConfirm('Löschen?', `Möchten Sie den Eintrag "${code}" wirklich entfernen?`)) {
            const data = key === 'allergens' ? allergens : additives;
            delete data[code];
            await apiPost(key, data);
            renderMenu(container, document.getElementById('view-title'), key, true);
        }
    };

    if (currentTab === 'dishes') {
        const searchInput = container.querySelector('#cms-dish-search');
        if (searchInput) searchInput.oninput = (e) => { cmsSearch = e.target.value; renderMenu(container, document.getElementById('view-title'), 'dishes'); };
        
        const catFilter = container.querySelector('#cms-cat-filter');
        if (catFilter) catFilter.onchange = (e) => { cmsCatFilter = e.target.value; renderMenu(container, document.getElementById('view-title'), 'dishes'); };
        
        const sortSel = container.querySelector('#cms-sort');
        if (sortSel) sortSel.onchange = (e) => { cmsSort = e.target.value; renderMenu(container, document.getElementById('view-title'), 'dishes'); };

        const toggleBtn = container.querySelector('#toggle-dish-form');
        const form = container.querySelector('#dish-form');
        if (toggleBtn) toggleBtn.onclick = () => { 
            editingDishIndex = -1;
            form.style.display = 'block'; 
            toggleBtn.style.display = 'none';
            container.querySelector('#dish-form-title').textContent = 'Neues Gericht';
            container.querySelectorAll('#dish-form .input-styled').forEach(inp => inp.value = '');
            container.querySelector('#df-img-preview').innerHTML = `<i class="fas fa-cloud-upload-alt"></i><span>Bild hochladen</span>`;
            container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        };
        
        const imgPreview = container.querySelector('#df-img-preview');
        const imgFile = container.querySelector('#df-img-file');
        if (imgPreview) imgPreview.onclick = () => imgFile.click();
        if (imgFile) imgFile.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const res = await apiUpload(file);
            if (res.success) {
                container.querySelector('#df-img').value = res.url;
                imgPreview.innerHTML = `<img src="${res.url}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
            }
        };

        container.querySelector('#btn-export-pdf').onclick = () => {
             const { jsPDF } = window.jspdf;
             const doc = new jsPDF();
             const resName = document.getElementById('disp-res-name')?.textContent || 'OPA!';
             doc.setFontSize(22); doc.setTextColor(27, 58, 92);
             doc.text(resName, 14, 22);
             doc.setFontSize(14); doc.setTextColor(200, 169, 110);
             doc.text('SPEISEKARTE', 14, 30);
             const data = [];
             let curCat = '';
             [...menu].sort((a,b) => (getCatLabel(a.cat)).localeCompare(getCatLabel(b.cat))).forEach(d => {
                 const dCat = getCatLabel(d.cat);
                 if (dCat !== curCat) { curCat = dCat; data.push([{ content: curCat.toUpperCase(), colSpan: 3, styles: { fillColor: [27, 58, 92], textColor: 255, fontStyle: 'bold' } }]); }
                 data.push([d.nr || '-', d.name + (d.desc ? '\n' + d.desc : ''), parseFloat(d.price).toFixed(2) + ' €']);
             });
             doc.autoTable({ startY: 40, head: [['Nr.', 'Gericht', 'Preis']], body: data, theme: 'striped', headStyles: { fillColor: [200, 169, 110] }, styles: { font: 'helvetica' } });
             doc.save('speisekarte.pdf');
        };

        container.querySelector('#btn-export-menu').onclick = () => {
             const backup = { menu, categories, allergens, additives };
             const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a'); a.href = url; a.download = `backup_menu.json`;
             a.click();
             URL.revokeObjectURL(url);
        };

        container.querySelector('#btn-import-menu').onclick = () => {
             const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
             inp.onchange = async (e) => {
                 const file = e.target.files[0];
                 const reader = new FileReader();
                 reader.onload = async (ev) => {
                     try {
                         const data = JSON.parse(ev.target.result);
                         if (await showConfirm('Wiederherstellen?', 'Dies überschreibt Ihre aktuelle Speisekarte unwiderruflich.')) {
                             const res = await apiPost('menu/import', data);
                             if (res && res.success) {
                                 cachedMenuData = null;
                                 showToast('Sicherung geladen!');
                                 renderMenu(container, document.getElementById('view-title'), 'dishes', true);
                             } else {
                                 showToast(res?.reason || 'Import fehlgeschlagen.', 'error');
                             }
                         }
                     } catch (err) { showToast('Ungültige Datei', 'error'); }
                 };
                 reader.readAsText(file);
             };
             inp.click();
        };

        container.querySelector('#df-save').onclick = async () => {
            const nr = container.querySelector('#df-nr').value;
            const name = container.querySelector('#df-name').value;
            const price = container.querySelector('#df-price').value;
            const cat = container.querySelector('#df-cat').value;
            if (!name || !price) return showToast('Name und Preis erforderlich', 'error');
            const dish = {
                id: editingDishIndex !== -1 ? menu[editingDishIndex].id : Date.now().toString(),
                nr, name, price, cat,
                desc: container.querySelector('#df-desc').value,
                image: container.querySelector('#df-img').value,
                allergens: Array.from(container.querySelectorAll('.dish-allergen-cb:checked')).map(cb => cb.value),
                additives: Array.from(container.querySelectorAll('.dish-additive-cb:checked')).map(cb => cb.value)
            };
            
            let res;
            if (editingDishIndex !== -1) {
                res = await (await import('./api.js')).apiPut(`menu/${dish.id}`, dish);
            } else {
                res = await apiPost('menu', dish);
            }

            if (res?.success) {
                cachedMenuData = null;
                showToast('Gericht gespeichert!');
                renderMenu(container, document.getElementById('view-title'), 'dishes', true);
            } else {
                showToast(res?.reason || 'Fehler beim Speichern', 'error');
            }
        };
    } else if (currentTab === 'categories') {
        container.querySelector('#add-cat-btn').onclick = async () => {
            const label = container.querySelector('#new-cat-input').value;
            if (!label) return;
            const newCat = { id: label.toLowerCase().replace(/\s/g, '_'), label, icon: 'utensils', active: true };
            const res = await apiPost('categories', newCat);
            if (res?.success) {
                cachedMenuData = null;
                renderMenu(container, document.getElementById('view-title'), 'categories', true);
            }
        };
    } else {
        container.querySelector('#kv-add-btn').onclick = async () => {
            const code = container.querySelector('#kv-code').value;
            const name = container.querySelector('#kv-name').value;
            if (!code || !name) return showToast('Code und Name nötig', 'error');
            const data = currentTab === 'allergens' ? allergens : additives;
            data[code] = name;
            await apiPost(currentTab, data);
            cachedMenuData = null;
            renderMenu(container, document.getElementById('view-title'), currentTab, true);
        };
    }
}
