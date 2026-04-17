/**
 * Menu Management Module for OPA-CMS
 * QoL Phase 1:
 *  - Verfügbarkeits-Toggle direkt in der Gerichtsliste
 *  - "Zuletzt bearbeitet" Anzeige pro Gericht
 *  - Kategorien einklappen/ausklappen
 */

import { apiGet, apiPost, apiUpload } from './api.js';
import { showToast, showConfirm, showPrompt, renderHelpIcon } from './utils.js';

// --- Module State ---
let cachedMenuData = null;
let editingDishIndex = -1;
let cmsSearch = '';
let cmsCatFilter = 'All';
let cmsSort = 'name';
let cmsPage = 1;
let cmsPageSize = 25;
let collapsedCats = new Set(); // Eingeklappte Kategorien

// --- Helpers ---
const getCatLabel = (cat) => {
    if (!cat) return 'Unsortiert';
    if (typeof cat === 'object') return cat.label || cat.id || 'Unbekannt';
    return cat;
};

const formatRelativeTime = (isoString) => {
    if (!isoString) return null;
    const diff = Date.now() - new Date(isoString).getTime();
    const min  = Math.floor(diff / 60000);
    const h    = Math.floor(diff / 3600000);
    const d    = Math.floor(diff / 86400000);
    if (min < 1)  return 'Gerade eben';
    if (min < 60) return `Vor ${min} Min.`;
    if (h < 24)   return `Vor ${h} Std.`;
    if (d < 7)    return `Vor ${d} Tag${d > 1 ? 'en' : ''}`;
    return new Date(isoString).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
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
    
    if (!cachedMenuData || forceRefresh) {
        const [menu, categories, allergens, additives] = await Promise.all([
            apiGet('menu'),
            apiGet('categories'),
            apiGet('allergens'),
            apiGet('additives')
        ]);
        cachedMenuData = {
            menu:       Array.isArray(menu)       ? menu       : [],
            categories: Array.isArray(categories) ? categories : [],
            allergens:  (allergens  && typeof allergens  === 'object' && !Array.isArray(allergens))  ? allergens  : {},
            additives:  (additives  && typeof additives  === 'object' && !Array.isArray(additives))  ? additives  : {},
        };
    }
    const { menu, categories, allergens, additives } = cachedMenuData;

    const focusedId = document.activeElement?.id;
    
    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div id="menu-tab-content">
                ${renderCurrentTab(currentTab, menu, categories, allergens, additives)}
            </div>
        </div>
    `;

    attachMenuHandlers(container, menu, categories, allergens, additives, currentTab);

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

function renderPagination(totalItems, currentPage, pageSize) {
    if (pageSize === 0) return '';
    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) return '';

    const start = (currentPage - 1) * pageSize + 1;
    const end   = Math.min(currentPage * pageSize, totalItems);

    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (currentPage > 3) pages.push('...');
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    const btnBase    = `display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 6px;border-radius:7px;border:none;cursor:pointer;font-size:.82rem;font-weight:500;transition:background .15s;`;
    const btnNormal  = `${btnBase}background:rgba(0,0,0,0.05);color:var(--text);`;
    const btnActive  = `${btnBase}background:var(--accent,#1b3a5c);color:#fff;`;
    const btnDisable = `${btnBase}background:transparent;color:rgba(0,0,0,0.2);cursor:default;`;

    const pageButtons = pages.map(p => {
        if (p === '...') return `<span style="${btnBase}background:transparent;color:rgba(0,0,0,0.3);cursor:default;">…</span>`;
        return `<button style="${p === currentPage ? btnActive : btnNormal}" ${p === currentPage ? 'disabled' : `onclick="window.cmsGoToPage(${p})"`}>${p}</button>`;
    }).join('');

    return `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;flex-wrap:wrap;gap:10px;">
            <span style="font-size:.82rem;opacity:.55;">${start}–${end} von ${totalItems} Einträgen</span>
            <div style="display:flex;gap:4px;align-items:center;">
                <button style="${currentPage <= 1 ? btnDisable : btnNormal}" ${currentPage <= 1 ? 'disabled' : `onclick="window.cmsGoToPage(${currentPage - 1})"`}>
                    <i class="fas fa-chevron-left" style="font-size:.7rem;"></i>
                </button>
                ${pageButtons}
                <button style="${currentPage >= totalPages ? btnDisable : btnNormal}" ${currentPage >= totalPages ? 'disabled' : `onclick="window.cmsGoToPage(${currentPage + 1})"`}>
                    <i class="fas fa-chevron-right" style="font-size:.7rem;"></i>
                </button>
            </div>
        </div>
    `;
}

function renderDishRow(d, useGroupedView) {
    return `
        <tr data-id="${d.id}">
            ${useGroupedView ? `
                <td class="drag-handle" style="cursor:grab;padding:0 8px;opacity:.3;text-align:center;">
                    <i class="fas fa-grip-vertical"></i>
                </td>
            ` : ''}
            <td style="font-weight:600;color:var(--primary);font-size:.85rem;">${d.number || '&mdash;'}</td>
            <td>
                ${d.image
                    ? `<img src="${d.image}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;display:block;">`
                    : `<div style="width:36px;height:36px;border-radius:6px;background:rgba(0,0,0,0.06);display:flex;align-items:center;justify-content:center;"><i class="fas fa-utensils" style="font-size:.7rem;opacity:.35;"></i></div>`
                }
            </td>
            <td>
                <span style="font-weight:600;">${d.name}</span>
                ${d.desc ? `<br><span style="font-size:.78rem;opacity:.55;line-height:1.3;">${d.desc}</span>` : ''}
            </td>
            <td>
                <span style="font-size:.8rem;background:rgba(0,0,0,0.05);padding:3px 10px;border-radius:20px;white-space:nowrap;">${getCatLabel(d.cat)}</span>
            </td>
            <td style="font-weight:600;font-size:.9rem;">${parseFloat(d.price).toFixed(2)}&nbsp;&euro;</td>
            <td>
                <div style="display:flex;gap:5px;">
                    <button title="Bearbeiten" onclick="window.editDish(${d._idx})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;cursor:pointer;background:rgba(59,130,246,0.12);color:#2563eb;transition:background .15s;" onmouseover="this.style.background='rgba(59,130,246,0.22)'" onmouseout="this.style.background='rgba(59,130,246,0.12)'">
                        <i class="fas fa-pen" style="font-size:.72rem;"></i>
                    </button>
                    <button title="L&ouml;schen" onclick="window.deleteDish(${d._idx})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;cursor:pointer;background:rgba(239,68,68,0.12);color:#dc2626;transition:background .15s;" onmouseover="this.style.background='rgba(239,68,68,0.22)'" onmouseout="this.style.background='rgba(239,68,68,0.12)'">
                        <i class="fas fa-trash" style="font-size:.72rem;"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function renderDishesTab(menu, categories, allergens, additives) {
    const safeMenu       = Array.isArray(menu)       ? menu       : [];
    const safeCategories = Array.isArray(categories) ? categories : [];
    const safeAllergens  = (allergens && typeof allergens === 'object') ? allergens : {};
    const safeAdditives  = (additives && typeof additives === 'object') ? additives : {};

    const filtered = safeMenu.map((m, i) => ({ ...m, _idx: i }))
        .filter(d => {
            const dCatLabel = getCatLabel(d.cat);
            const matchCat    = (cmsCatFilter === 'All' || dCatLabel.trim() === cmsCatFilter.trim());
            const matchSearch = ((d.name || '').toLowerCase().includes(cmsSearch.toLowerCase()) || (d.number || '').toString().includes(cmsSearch));
            return matchCat && matchSearch;
        })
        .sort((a,b) => {
            if (cmsSort === 'price') return parseFloat(a.price) - parseFloat(b.price);
            if (cmsSort === 'nr')    return (a.number || '').toString().localeCompare((b.number || '').toString(), undefined, {numeric: true});
            return a.name.localeCompare(b.name);
        });

    const totalItems = filtered.length;
    const pageSize   = cmsPageSize;
    const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;
    const safePage   = Math.max(1, Math.min(cmsPage, totalPages));
    if (safePage !== cmsPage) cmsPage = safePage;

    const paginated = pageSize > 0
        ? filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
        : filtered;

    const catFromDishes = [...new Set(safeMenu.map(m => getCatLabel(m.cat)).filter(Boolean))].sort();
    const catFromDB     = safeCategories.map(c => getCatLabel(c)).filter(Boolean);
    const cats          = [...new Set([...catFromDB, ...catFromDishes])].sort();

    const allergenChecks = Object.entries(safeAllergens).map(([code, name]) => `
        <label class="check-item">
            <input type="checkbox" class="dish-allergen-cb" value="${code}">
            <span><strong>${code}</strong> ${name}</span>
        </label>
    `).join('');

    const additiveChecks = Object.entries(safeAdditives).map(([code, name]) => `
        <label class="check-item">
            <input type="checkbox" class="dish-additive-cb" value="${code}">
            <span><strong>${code}</strong> ${name}</span>
        </label>
    `).join('');

    const catOptions = safeCategories.length > 0
        ? safeCategories.map(c => `<option value="${getCatLabel(c)}">${getCatLabel(c)}</option>`).join('')
        : cats.map(c => `<option value="${c}">${c}</option>`).join('');

    const useGroupedView = (cmsSort === 'name' && cmsSearch === '' && cmsCatFilter === 'All');

    let tableRowsHtml = '';
    if (useGroupedView) {
        let currentCat = '';
        paginated.forEach(d => {
            const cat = getCatLabel(d.cat);
            if (cat !== currentCat) {
                currentCat = cat;
                tableRowsHtml += `
                    <tr class="cat-header-row">
                        <td colspan="7" style="background:rgba(0,0,0,0.03); font-weight:700; padding:12px 20px; color:var(--primary); font-size:.85rem; border-bottom:1px solid rgba(0,0,0,0.05);">
                            <i class="fas fa-folder-open" style="margin-right:8px; opacity:.5;"></i> ${currentCat.toUpperCase()}
                        </td>
                    </tr>
                `;
            }
            tableRowsHtml += renderDishRow(d, true);
        });
    } else {
        tableRowsHtml = paginated.map(d => renderDishRow(d, false)).join('');
    }

    return `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:15px;flex-wrap:wrap;">
            <div style="display:flex;gap:10px;flex:1;min-width:300px;flex-wrap:wrap;">
                <input class="input-styled" id="cms-dish-search" value="${cmsSearch}" placeholder="Name oder Nummer suchen..." style="flex:1;min-width:160px;">
                <select class="input-styled" id="cms-cat-filter" style="width:160px;">
                    <option value="All">Alle Kategorien</option>
                    ${cats.map(c => `<option value="${c}" ${cmsCatFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <select class="input-styled" id="cms-sort" style="width:140px;">
                    <option value="name"  ${cmsSort === 'name'  ? 'selected' : ''}>Sortierung: Name</option>
                    <option value="price" ${cmsSort === 'price' ? 'selected' : ''}>Sortierung: Preis</option>
                    <option value="nr"    ${cmsSort === 'nr'    ? 'selected' : ''}>Sortierung: Nummer</option>
                </select>
                <select class="input-styled" id="cms-page-size" style="width:120px;" title="Einträge pro Seite">
                    <option value="10"  ${cmsPageSize === 10  ? 'selected' : ''}>10 pro Seite</option>
                    <option value="25"  ${cmsPageSize === 25  ? 'selected' : ''}>25 pro Seite</option>
                    <option value="50"  ${cmsPageSize === 50  ? 'selected' : ''}>50 pro Seite</option>
                    <option value="100" ${cmsPageSize === 100 ? 'selected' : ''}>100 pro Seite</option>
                    <option value="0"   ${cmsPageSize === 0   ? 'selected' : ''}>Alle anzeigen</option>
                </select>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
                ${unavailableCount > 0 ? `<span style="font-size:.78rem;background:rgba(239,68,68,0.1);color:#dc2626;padding:5px 12px;border-radius:20px;"><i class="fas fa-times-circle" style="margin-right:5px;"></i>${unavailableCount} nicht verfügbar</span>` : ''}
                <button class="btn-primary" id="toggle-dish-form" style="background:var(--accent);"><i class="fas fa-plus"></i> Neues Gericht</button>
                <div style="display:flex;gap:4px;align-items:center;padding:0 5px;border-left:1px solid rgba(0,0,0,0.1);margin-left:5px;">
                    <button class="btn-primary" style="background:#4b5563; opacity:.8; padding:10px 15px;" id="btn-export-pdf"><i class="fas fa-file-pdf"></i> PDF</button>
                    <button class="btn-primary" style="background:#4b5563; opacity:.8; padding:10px 15px;" id="btn-export-menu"><i class="fas fa-download"></i> Backup</button>
                    <button class="btn-primary" style="background:#4b5563; opacity:.8; padding:10px 15px;" id="btn-import-menu"><i class="fas fa-upload"></i> Restore</button>
                    ${renderHelpIcon('menu_tools')}
                </div>
            </div>
        </div>

        ${useGroupedView ? `<div style="margin-bottom:12px; font-size:.72rem; opacity:.4; display:flex; align-items:center; gap:6px; padding-left:4px;"><i class="fas fa-grip-vertical"></i> Zeilen ziehen zum manuellen Sortieren</div>` : ''}

        <div id="dish-form" style="display:none; margin-bottom:40px; padding:30px; background:rgba(255,255,255,0.4); backdrop-filter:blur(20px); border-radius:24px; border:1px solid rgba(255,255,255,0.3); box-shadow: 0 8px 32px rgba(0,0,0,0.05);">
            <h3 id="dish-form-title" style="margin-bottom:20px;">Neues Gericht</h3>
            <div class="form-grid">
                <div class="form-group"><label>Nummer</label><input class="input-styled" id="df-nr" placeholder="z.B. 42"></div>
                <div class="form-group"><label>Name</label><input class="input-styled" id="df-name" placeholder="z.B. Gyros Teller"></div>
                <div class="form-group"><label>Kategorie</label>
                    <select class="input-styled" id="df-cat">
                        ${catOptions || '<option value="">Keine Kategorien vorhanden</option>'}
                    </select>
                </div>
                <div class="form-group"><label>Preis (&euro;)</label><input class="input-styled" id="df-price" type="number" step="0.10" placeholder="0.00"></div>
                <div class="form-group" style="grid-column:1/-1;"><label>Beschreibung (optional)</label><textarea class="input-styled" id="df-desc" rows="2" placeholder="Zutaten, Zubereitungsart..."></textarea></div>
            </div>
            <div style="margin-top:20px;">
                <label>Bilder-Upload</label>
                <div id="df-img-preview" class="image-upload-preview" style="width:120px;height:120px;cursor:pointer;border-radius:12px;border:2px dashed rgba(0,0,0,0.15);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;overflow:hidden;background:rgba(255,255,255,0.5);font-size:.75rem;color:#888;transition:border-color .2s;">
                    <i class="fas fa-cloud-upload-alt" style="font-size:1.4rem;opacity:.4;"></i><span>Bild hochladen</span>
                </div>
                <input type="file" id="df-img-file" style="display:none;" accept="image/*">
                <input type="hidden" id="df-img">
            </div>
            <div style="margin-top:24px;">
                <label>Allergene &amp; Zusatzstoffe</label>
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
                    ${useGroupedView ? '<th style="width:30px;"></th>' : ''}
                    <th style="width:52px;">NR</th>
                    <th style="width:52px;">Bild</th>
                    <th>Name</th>
                    <th>Kategorie</th>
                    <th style="width:90px;">Preis</th>
                    <th style="width:36px;" title="Verfügbarkeit"><i class="fas fa-check-circle" style="opacity:.5;"></i></th>
                    <th style="width:110px;">Aktionen</th>
                </tr>
            </thead>
            <tbody>
                ${tableRowsHtml}
                ${paginated.length === 0 ? `<tr><td colspan="${useGroupedView ? 7 : 6}" style="text-align:center;opacity:.5;padding:40px;">Keine Gerichte vorhanden.</td></tr>` : ''}
            </tbody>
        </table>
        ${renderPagination(totalItems, safePage, pageSize)}
    `;
}

function renderDishRow(d) {
    const available   = d.available !== false;
    const rowOpacity  = available ? '1' : '0.45';
    const updatedStr  = formatRelativeTime(d.updated_at || d.updatedAt || null);
    return `
        <tr style="opacity:${rowOpacity};transition:opacity .2s;">
            <td style="font-weight:600;color:var(--primary);font-size:.85rem;">${d.number || '&mdash;'}</td>
            <td>
                ${d.image
                    ? `<img src="${d.image}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;display:block;">`
                    : `<div style="width:36px;height:36px;border-radius:6px;background:rgba(0,0,0,0.06);display:flex;align-items:center;justify-content:center;"><i class="fas fa-utensils" style="font-size:.7rem;opacity:.35;"></i></div>`
                }
            </td>
            <td>
                <span style="font-weight:600;">${d.name}</span>
                ${d.desc ? `<br><span style="font-size:.78rem;opacity:.55;line-height:1.3;">${d.desc}</span>` : ''}
                ${updatedStr ? `<br><span style="font-size:.7rem;opacity:.35;" title="Zuletzt bearbeitet"><i class="fas fa-clock" style="margin-right:3px;"></i>${updatedStr}</span>` : ''}
            </td>
            <td>
                <span style="font-size:.8rem;background:rgba(0,0,0,0.05);padding:3px 10px;border-radius:20px;white-space:nowrap;">${getCatLabel(d.cat)}</span>
            </td>
            <td style="font-weight:600;font-size:.9rem;">${parseFloat(d.price).toFixed(2)}&nbsp;&euro;</td>
            <td>${renderAvailabilityToggle(d)}</td>
            <td>
                <div style="display:flex;gap:5px;">
                    <button title="Bearbeiten" onclick="window.editDish(${d._idx})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;cursor:pointer;background:rgba(59,130,246,0.12);color:#2563eb;transition:background .15s;" onmouseover="this.style.background='rgba(59,130,246,0.22)'" onmouseout="this.style.background='rgba(59,130,246,0.12)'">
                        <i class="fas fa-pen" style="font-size:.72rem;"></i>
                    </button>
                    <button title="L&ouml;schen" onclick="window.deleteDish(${d._idx})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;border:none;cursor:pointer;background:rgba(239,68,68,0.12);color:#dc2626;transition:background .15s;" onmouseover="this.style.background='rgba(239,68,68,0.22)'" onmouseout="this.style.background='rgba(239,68,68,0.12)'">
                        <i class="fas fa-trash" style="font-size:.72rem;"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function renderCategoriesTab(categories) {
    const safeCats = Array.isArray(categories) ? categories : [];
    return `
        <div style="margin-bottom:24px;"><h3>Kategorien verwalten</h3></div>
        <div class="glass-panel" style="padding:30px; margin-bottom:30px;">
            <div style="display:flex;gap:12px;margin-bottom:24px;">
                <input class="input-styled" id="new-cat-input" placeholder="Name der neuen Kategorie (z.B. Desserts)..." style="flex:1;">
                <button class="btn-primary" id="add-cat-btn" style="background:var(--accent);"><i class="fas fa-plus"></i> Hinzuf&uuml;gen</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
                ${safeCats.length === 0
                    ? '<p style="opacity:.5;">Noch keine Kategorien vorhanden. Oben eine neue hinzuf&uuml;gen.</p>'
                    : safeCats.filter(c => c).map((c, i) => {
                        const label = getCatLabel(c);
                        return `
                            <div class="glass-pill" style="padding:10px 20px; display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.8); border:1px solid rgba(0,0,0,0.05); border-radius:100px;">
                                <span style="font-weight:700; color:var(--primary);">${label}</span>
                                <button onclick="window.deleteCategory(${i})" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:none;cursor:pointer;background:rgba(239,68,68,0.12);color:#dc2626;" title="L&ouml;schen"><i class="fas fa-times" style="font-size:.65rem;"></i></button>
                            </div>
                        `;
                    }).join('')
                }
            </div>
        </div>
    `;
}

function renderKVTab(title, data, keyName, placeholder) {
    const safeData = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    const entries = Object.entries(safeData);
    return `
        <div style="margin-bottom:24px;"><h3>${title}</h3></div>
        <div class="glass-panel" style="padding:30px;">
            <div style="display:flex;gap:12px;margin-bottom:24px;">
                <input class="input-styled" id="kv-code" placeholder="K&uuml;rzel (z.B. A1)" style="width:120px;">
                <input class="input-styled" id="kv-name" placeholder="${placeholder}" style="flex:1;">
                <button class="btn-primary" id="kv-add-btn" style="background:var(--accent);"><i class="fas fa-plus"></i> Speichern</button>
            </div>
            <div class="cms-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">
                ${entries.length === 0 ? '<p style="grid-column:1/-1; opacity:.5;">Keine Eintr&auml;ge vorhanden.</p>' : entries.map(([code, name]) => `
                    <div style="background:rgba(255,255,255,0.6); padding:12px 16px; border-radius:12px; border:1px solid rgba(0,0,0,0.03); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:var(--primary); font-size:1rem; margin-right:8px;">${code}</strong>
                            <span style="font-size:.9rem;">${name}</span>
                        </div>
                        <button onclick="window.deleteKV('${keyName}', '${code}')" title="L&ouml;schen" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:none;cursor:pointer;background:rgba(239,68,68,0.12);color:#dc2626;"><i class="fas fa-trash" style="font-size:.7rem;"></i></button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderAllergensTab(allergens) { return renderKVTab('Allergene', allergens, 'allergens', 'Name des Allergens...'); }
function renderAdditivesTab(additives) { return renderKVTab('Zusatzstoffe', additives, 'additives', 'Name des Zusatzstoffes...'); }

async function initSortable(container, currentTab) {
    if (currentTab !== 'dishes') return;
    const useGroupedView = (cmsSort === 'name' && cmsSearch === '' && cmsCatFilter === 'All');
    if (!useGroupedView) return;

    const tbody = container.querySelector('.premium-table tbody');
    if (!tbody) return;

    if (!window.Sortable) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    new window.Sortable(tbody, {
        animation: 150,
        handle: '.drag-handle',
        filter: '.cat-header-row',
        onEnd: async () => {
            const ids = Array.from(tbody.querySelectorAll('tr[data-id]')).map(tr => tr.dataset.id);
            const res = await apiPost('menu/reorder', { ids });
            if (res?.success) {
                // Lokalen Cache aktualisieren
                const newMenu = ids.map(id => cachedMenuData.menu.find(m => String(m.id) === String(id))).filter(Boolean);
                cachedMenuData.menu.forEach(m => { if (!ids.includes(String(m.id))) newMenu.push(m); });
                cachedMenuData.menu = newMenu;
                renderMenu(container, document.getElementById('view-title'), 'dishes');
                showToast('Sortierung gespeichert! \u2705');
            } else {
                showToast(res?.reason || 'Fehler beim Sortieren', 'error');
            }
        }
    });
}

function attachMenuHandlers(container, menu, categories, allergens, additives, currentTab) {
    const safeMenu       = Array.isArray(menu)       ? menu       : [];
    const safeCategories = Array.isArray(categories) ? categories : [];
    const safeAllergens  = (allergens && typeof allergens === 'object') ? allergens : {};
    const safeAdditives  = (additives && typeof additives === 'object') ? additives : {};

    // Sortable initialisieren
    initSortable(container, currentTab);

    window.cmsGoToPage = (page) => {
        cmsPage = page;
        renderMenu(container, document.getElementById('view-title'), 'dishes');
    };

    // ── Kategorie einklappen/ausklappen ──────────────────────────────────────
    window.toggleCatCollapse = (catId, catLabel) => {
        if (collapsedCats.has(catLabel)) {
            collapsedCats.delete(catLabel);
        } else {
            collapsedCats.add(catLabel);
        }
        renderMenu(container, document.getElementById('view-title'), 'dishes');
    };

    // ── Verfügbarkeits-Toggle ────────────────────────────────────────────────
    window.toggleDishAvailability = async (dishId, newAvailable) => {
        const dish = safeMenu.find(d => d.id == dishId);
        if (!dish) return;
        const updated = { ...dish, available: newAvailable, updated_at: new Date().toISOString() };
        const { apiPut } = await import('./api.js');
        const res = await apiPut(`menu/${dishId}`, updated);
        if (res?.success) {
            // Optimistisches Update im Cache – kein Full-Reload
            dish.available = newAvailable;
            dish.updated_at = updated.updated_at;
            renderMenu(container, document.getElementById('view-title'), 'dishes');
            showToast(newAvailable ? '✅ Gericht ist jetzt verfügbar' : '⏸ Gericht als nicht verfügbar markiert');
        } else {
            showToast('Fehler beim Aktualisieren', 'error');
        }
    };

    window.editDish = (idx) => {
        editingDishIndex = idx;
        const d = safeMenu[idx];
        if (!d) return;
        const f  = container.querySelector('#dish-form');
        const bt = container.querySelector('#toggle-dish-form');
        if (f && bt) {
            f.style.display  = 'block';
            bt.style.display = 'none';
            container.querySelector('#dish-form-title').textContent = 'Gericht bearbeiten';
            container.querySelector('#df-nr').value    = d.number || '';
            container.querySelector('#df-name').value  = d.name   || '';
            container.querySelector('#df-price').value = d.price  || '';
            const catSelect = container.querySelector('#df-cat');
            if (catSelect) {
                const catVal = getCatLabel(d.cat);
                catSelect.value = catVal;
                if (catSelect.value !== catVal) {
                    const opt = document.createElement('option');
                    opt.value = catVal;
                    opt.textContent = catVal;
                    catSelect.appendChild(opt);
                    catSelect.value = catVal;
                }
            }
            container.querySelector('#df-desc').value = d.desc  || '';
            container.querySelector('#df-img').value  = d.image || '';
            const preview = container.querySelector('#df-img-preview');
            if (d.image) preview.innerHTML = `<img src="${d.image}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
            else preview.innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.4rem;opacity:.4;"></i><span>Bild hochladen</span>`;
            container.querySelectorAll('.dish-allergen-cb').forEach(cb => cb.checked = (d.allergens || []).includes(cb.value));
            container.querySelectorAll('.dish-additive-cb').forEach(cb => cb.checked = (d.additives || []).includes(cb.value));
            f.scrollIntoView({ behavior: 'smooth' });
        }
    };

    window.closeDishForm = () => {
        const f  = container.querySelector('#dish-form');
        const bt = container.querySelector('#toggle-dish-form');
        if (f)  f.style.display  = 'none';
        if (bt) bt.style.display = 'inline-flex';
    };

    window.deleteDish = async (idx) => {
        const dish = safeMenu[idx];
        if (!dish) return;
        if (await showConfirm('L\u00f6schen?', `M\u00f6chten Sie das Gericht "${dish.name}" wirklich entfernen?`)) {
            const res = await (await import('./api.js')).apiDelete(`menu/${dish.id}`);
            if (res?.success) {
                cachedMenuData = null;
                renderMenu(container, document.getElementById('view-title'), 'dishes', true);
            }
        }
    };

    window.deleteCategory = async (idx) => {
        const cat = safeCategories[idx];
        if (!cat) return;
        if (await showConfirm('L\u00f6schen?', 'Dies entfernt die Kategorie dauerhaft.')) {
            const catId = typeof cat === 'object' ? cat.id : cat;
            const res = await (await import('./api.js')).apiDelete(`categories/${catId}`);
            if (res?.success) {
                cachedMenuData = null;
                renderMenu(container, document.getElementById('view-title'), 'categories', true);
            }
        }
    };

    window.deleteKV = async (key, code) => {
        if (await showConfirm('L\u00f6schen?', `M\u00f6chten Sie den Eintrag "${code}" wirklich entfernen?`)) {
            const data = key === 'allergens' ? { ...safeAllergens } : { ...safeAdditives };
            delete data[code];
            await apiPost(key, data);
            cachedMenuData = null;
            renderMenu(container, document.getElementById('view-title'), key, true);
        }
    };

    if (currentTab === 'dishes') {
        const searchInput = container.querySelector('#cms-dish-search');
        if (searchInput) searchInput.oninput = (e) => { cmsSearch = e.target.value; cmsPage = 1; renderMenu(container, document.getElementById('view-title'), 'dishes'); };

        const catFilter = container.querySelector('#cms-cat-filter');
        if (catFilter) catFilter.onchange = (e) => { cmsCatFilter = e.target.value; cmsPage = 1; renderMenu(container, document.getElementById('view-title'), 'dishes'); };

        const sortSel = container.querySelector('#cms-sort');
        if (sortSel) sortSel.onchange = (e) => { cmsSort = e.target.value; cmsPage = 1; renderMenu(container, document.getElementById('view-title'), 'dishes'); };

        const pageSizeSel = container.querySelector('#cms-page-size');
        if (pageSizeSel) pageSizeSel.onchange = (e) => { cmsPageSize = parseInt(e.target.value, 10); cmsPage = 1; renderMenu(container, document.getElementById('view-title'), 'dishes'); };

        const toggleBtn = container.querySelector('#toggle-dish-form');
        const form = container.querySelector('#dish-form');
        if (toggleBtn) toggleBtn.onclick = () => {
            editingDishIndex = -1;
            form.style.display = 'block';
            toggleBtn.style.display = 'none';
            container.querySelector('#dish-form-title').textContent = 'Neues Gericht';
            container.querySelectorAll('#dish-form .input-styled').forEach(inp => inp.value = '');
            container.querySelector('#df-img-preview').innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.4rem;opacity:.4;"></i><span>Bild hochladen</span>`;
            container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        };

        const imgPreview = container.querySelector('#df-img-preview');
        const imgFile    = container.querySelector('#df-img-file');
        if (imgPreview) imgPreview.onclick = () => imgFile.click();
        if (imgFile) imgFile.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const res = await apiUpload(file);
            if (res.success) {
                container.querySelector('#df-img').value = res.url;
                imgPreview.innerHTML = `<img src="${res.url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
            }
        };

        const pdfBtn = container.querySelector('#btn-export-pdf');
        if (pdfBtn) pdfBtn.onclick = async () => {
            const { jsPDF } = window.jspdf;
            if (!jsPDF) return showToast('jsPDF nicht geladen', 'error');

            const branding = await apiGet('branding').catch(() => ({}));
            const resName  = branding?.name || document.getElementById('disp-res-name')?.textContent || 'Speisekarte';
            const today    = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });

            const doc = new jsPDF({ unit: 'mm', format: 'a4' });
            const PW  = doc.internal.pageSize.getWidth();

            // Header
            doc.setFillColor(27, 58, 92);
            doc.rect(0, 0, PW, 28, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(20); doc.setFont('helvetica', 'bold');
            doc.text(resName.toUpperCase(), 14, 13);
            doc.setFontSize(9); doc.setFont('helvetica', 'normal');
            doc.setTextColor(200, 169, 110);
            doc.text('SPEISEKARTE', 14, 21);
            doc.setTextColor(255,255,255);
            doc.text(`Stand: ${today}`, PW - 14, 21, { align: 'right' });

            const availableMenu = [...safeMenu]
                .filter(d => d.available !== false)
                .sort((a, b) => getCatLabel(a.cat).localeCompare(getCatLabel(b.cat)));

            const body = [];
            let curCat = '';
            availableMenu.forEach(d => {
                const cat = getCatLabel(d.cat);
                if (cat !== curCat) {
                    curCat = cat;
                    body.push([{
                        content: cat.toUpperCase(),
                        colSpan: 3,
                        styles: { fillColor: [200,169,110], textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 }
                    }]);
                }
                const codes = [
                    ...(d.allergens || []),
                    ...(d.additives || [])
                ].join(', ');
                body.push([
                    { content: d.number || '\u2013', styles: { halign: 'center', fontSize: 8 } },
                    { content: d.name + (d.desc ? `\n${d.desc}` : '') + (codes ? `\n(${codes})` : ''), styles: { fontSize: 8 } },
                    { content: `${parseFloat(d.price).toFixed(2)} \u20ac`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } }
                ]);
            });

            doc.autoTable({
                startY: 34,
                head: [['Nr.', 'Gericht', 'Preis']],
                body,
                theme: 'striped',
                headStyles: { fillColor: [27, 58, 92], textColor: 255, fontStyle: 'bold', fontSize: 8 },
                columnStyles: { 0: { cellWidth: 14 }, 2: { cellWidth: 22 } },
                styles: { font: 'helvetica', cellPadding: 3, overflow: 'linebreak' },
                margin: { left: 14, right: 14 },
                didDrawPage: (data) => {
                    const pageH = doc.internal.pageSize.getHeight();
                    doc.setFontSize(7); doc.setTextColor(150);
                    doc.text(`Seite ${data.pageNumber}`, 14, pageH - 8);
                    doc.text('Powered by OPA! Restaurant System', PW - 14, pageH - 8, { align: 'right' });
                }
            });

            doc.save(`speisekarte_${today.replace(/\./g,'-')}.pdf`);
        };

        const exportBtn = container.querySelector('#btn-export-menu');
        if (exportBtn) exportBtn.onclick = () => {
            const backup = { menu: safeMenu, categories: safeCategories, allergens: safeAllergens, additives: safeAdditives };
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'backup_menu.json';
            a.click();
            URL.revokeObjectURL(url);
        };

        const importBtn = container.querySelector('#btn-import-menu');
        if (importBtn) importBtn.onclick = () => {
            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
            inp.onchange = async (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        if (await showConfirm('Wiederherstellen?', 'Dies \u00fcberschreibt Ihre aktuelle Speisekarte unwiderruflich.')) {
                            const res = await apiPost('menu/import', data);
                            if (res && res.success) {
                                cachedMenuData = null;
                                showToast('Sicherung geladen!');
                                renderMenu(container, document.getElementById('view-title'), 'dishes', true);
                            } else {
                                showToast(res?.reason || 'Import fehlgeschlagen.', 'error');
                            }
                        }
                    } catch (err) { showToast('Ung\u00fcltige Datei', 'error'); }
                };
                reader.readAsText(file);
            };
            inp.click();
        };

        const saveBtn = container.querySelector('#df-save');
        if (saveBtn) saveBtn.onclick = async () => {
            const number = (container.querySelector('#df-nr').value || '').trim();
            const name   = (container.querySelector('#df-name').value || '').trim();
            const price  = container.querySelector('#df-price').value;
            const cat    = container.querySelector('#df-cat').value;
            if (!name || !price) return showToast('Name und Preis erforderlich', 'error');
            const dish = {
                id:        editingDishIndex !== -1 ? safeMenu[editingDishIndex].id : Date.now().toString(),
                number,
                name,
                price:     parseFloat(price),
                cat,
                desc:      (container.querySelector('#df-desc').value || '').trim(),
                image:     container.querySelector('#df-img').value || null,
                allergens: Array.from(container.querySelectorAll('.dish-allergen-cb:checked')).map(cb => cb.value),
                additives: Array.from(container.querySelectorAll('.dish-additive-cb:checked')).map(cb => cb.value),
                available: editingDishIndex !== -1 ? (safeMenu[editingDishIndex].available !== false) : true,
                updated_at: new Date().toISOString()
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
        const addCatBtn = container.querySelector('#add-cat-btn');
        if (addCatBtn) addCatBtn.onclick = async () => {
            const label = (container.querySelector('#new-cat-input').value || '').trim();
            if (!label) return showToast('Bitte einen Namen eingeben', 'error');
            const newCat = {
                id:         label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_'),
                label,
                icon:       'utensils',
                active:     true,
                sort_order: safeCategories.length
            };
            const res = await apiPost('categories', newCat);
            if (res?.success) {
                cachedMenuData = null;
                container.querySelector('#new-cat-input').value = '';
                renderMenu(container, document.getElementById('view-title'), 'categories', true);
            } else {
                showToast(res?.reason || 'Fehler beim Anlegen', 'error');
            }
        };
    } else {
        const kvAddBtn = container.querySelector('#kv-add-btn');
        if (kvAddBtn) kvAddBtn.onclick = async () => {
            const code = (container.querySelector('#kv-code').value || '').trim();
            const name = (container.querySelector('#kv-name').value || '').trim();
            if (!code || !name) return showToast('Code und Name n\u00f6tig', 'error');
            const data = currentTab === 'allergens' ? { ...safeAllergens } : { ...safeAdditives };
            data[code] = name;
            const res = await apiPost(currentTab, data);
            if (res?.success) {
                cachedMenuData = null;
                container.querySelector('#kv-code').value = '';
                container.querySelector('#kv-name').value = '';
                renderMenu(container, document.getElementById('view-title'), currentTab, true);
            } else {
                showToast(res?.reason || 'Fehler beim Speichern', 'error');
            }
        };
    }
}
