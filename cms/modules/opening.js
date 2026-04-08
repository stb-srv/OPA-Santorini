/**
 * Opening Hours Module for Grieche-CMS
 */

import { apiGet, apiPost } from './api.js';
import { showToast } from './utils.js';

export async function renderOpeningHours(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-clock"></i> Öffnungszeiten';
    const home = await apiGet('homepage') || {};
    const oh = home.openingHours || {};
    
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const labels = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };

    container.innerHTML = `
        <div class="glass-panel" style="padding:40px;">
            <div style="margin-bottom:30px;">
                <h3>Reguläre Öffnungszeiten</h3>
                <p style="color:var(--text-muted); font-size:.85rem;">Hier können Sie die täglichen Geschäftszeiten bearbeiten.</p>
            </div>
            
            <div class="form-grid">
                ${days.map(d => {
                    const data = oh[d] || { open: '12:00', close: '22:00', closed: false };
                    return `
                        <div class="form-group" style="padding:15px; background:rgba(255,255,255,0.3); border-radius:12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <label style="margin:0;">${labels[d]}</label>
                                <label class="switch small">
                                    <input type="checkbox" class="oh-closed" data-day="${d}" ${data.closed ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <div style="display:flex; gap:10px; ${data.closed ? 'opacity:0.3; pointer-events:none;' : ''}" id="wrap-${d}">
                                <input type="time" class="input-styled oh-open" data-day="${d}" value="${data.open}">
                                <span style="align-self:center;">-</span>
                                <input type="time" class="input-styled oh-close" data-day="${d}" value="${data.close}">
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <div style="display:flex; justify-content:flex-end; margin-top:30px;">
                <button class="btn-primary" id="save-opening-hours"><i class="fas fa-save"></i> Öffnungszeiten speichern</button>
            </div>
        </div>
    `;

    container.querySelectorAll('.oh-closed').forEach(cb => {
        cb.onchange = (e) => {
            const wrap = container.querySelector(`#wrap-${cb.dataset.day}`);
            wrap.style.opacity = e.target.checked ? '0.3' : '1';
            wrap.style.pointerEvents = e.target.checked ? 'none' : 'auto';
        };
    });

    container.querySelector('#save-opening-hours').onclick = async () => {
        const newOh = {};
        days.forEach(d => {
            newOh[d] = {
                open: container.querySelector(`.oh-open[data-day="${d}"]`).value,
                close: container.querySelector(`.oh-close[data-day="${d}"]`).value,
                closed: container.querySelector(`.oh-closed[data-day="${d}"]`).checked
            };
        });
        
        home.openingHours = newOh;
        const res = await apiPost('homepage', home);
        if (res.success) showToast('Öffnungszeiten gespeichert!');
    };
}
