/**
 * OPA-CMS – Schichtplan Modul
 * Einfache Wochenansicht zum Eintragen von Mitarbeiterschichten.
 */
import { apiGet } from './api.js';

const DAYS = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const COLORS = ['#1b3a5c','#2d6a4f','#92400e','#7c3aed','#9f1239','#0e7490','#374151'];

export async function renderShiftPlanner(container, titleEl) {
    titleEl.innerHTML = '<i class="fas fa-calendar-week"></i> Schichtplan';
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;color:var(--primary);"></i></div>';

    let shifts = [];
    let employees = [];
    try {
        shifts    = await apiGet('shifts/week')    || [];
        employees = await apiGet('shifts/employees') || [];
    } catch(e) {}

    // ISO-Wochentage
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

    const weekDates = DAYS.map((_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
    });

    container.innerHTML = `
    <div class="glass-panel" style="padding:24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h3 style="font-size:1rem; font-weight:800; color:var(--text); margin:0;">
                KW ${getWeekNumber(monday)} –
                ${monday.toLocaleDateString('de-DE',{day:'2-digit',month:'short'})} bis
                ${weekDates[6].toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}
            </h3>
            <div style="display:flex; gap:8px;">
                <button id="btn-share-shift"
                        style="padding:8px 16px; background:var(--primary); color:#fff;
                               border:none; border-radius:8px; font-size:.82rem;
                               font-weight:700; cursor:pointer;">
                    <i class="fas fa-share-alt"></i> Link teilen
                </button>
                <button id="btn-add-employee"
                        style="padding:8px 16px; background:#f3f4f6; color:var(--text);
                               border:1.5px solid var(--border); border-radius:8px;
                               font-size:.82rem; font-weight:700; cursor:pointer;">
                    <i class="fas fa-user-plus"></i> Mitarbeiter
                </button>
            </div>
        </div>

        <!-- Schichtplan Grid -->
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; min-width:700px;">
                <thead>
                    <tr>
                        <th style="padding:10px; text-align:left; font-size:.8rem;
                                   color:var(--text-muted); border-bottom:2px solid var(--border);
                                   width:140px;">Mitarbeiter</th>
                        ${DAYS.map((day, i) => `
                            <th style="padding:10px 6px; text-align:center; font-size:.78rem;
                                       color:var(--text-muted);
                                       border-bottom:2px solid var(--border);
                                       background:${isToday(weekDates[i]) ? '#f0f4ff' : 'transparent'};
                                       border-radius:4px;">
                                <div style="font-weight:800; color:${isToday(weekDates[i])?'#1b3a5c':''}">${day.slice(0,2)}</div>
                                <div style="font-size:.72rem;">${weekDates[i].getDate()}.${weekDates[i].getMonth()+1}.</div>
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody id="shift-tbody">
                    ${employees.length === 0 ? `
                        <tr><td colspan="8" style="padding:40px; text-align:center; color:var(--text-muted); font-size:.9rem;">
                            Noch keine Mitarbeiter. Klicken Sie auf "+ Mitarbeiter".
                        </td></tr>
                    ` : employees.map((emp, ei) => `
                        <tr>
                            <td style="padding:10px 6px; font-weight:700; font-size:.85rem;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <div style="width:28px; height:28px; border-radius:50%; flex-shrink:0;
                                                background:${COLORS[ei % COLORS.length]};
                                                color:#fff; display:flex; align-items:center;
                                                justify-content:center; font-size:.7rem; font-weight:800;">
                                        ${emp.name.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}
                                    </div>
                                    ${emp.name}
                                </div>
                            </td>
                            ${weekDates.map((date, di) => {
                                const dateStr = date.toISOString().slice(0,10);
                                const shift = shifts.find(s => s.employee_id === emp.id && s.date === dateStr);
                                return `
                                <td style="padding:4px; text-align:center;">
                                    <div onclick="editShift('${emp.id}','${dateStr}')"
                                         style="min-height:48px; border-radius:8px; cursor:pointer;
                                                border:1.5px dashed ${shift?'transparent':'var(--border)'};
                                                background:${shift ? COLORS[ei % COLORS.length] + '22' : 'transparent'};
                                                display:flex; align-items:center; justify-content:center;
                                                font-size:.72rem; font-weight:700; padding:4px;
                                                color:${shift ? COLORS[ei % COLORS.length] : 'var(--text-muted)'};
                                                transition:all .15s;">
                                        ${shift ? `${shift.start_time}–${shift.end_time}` : '+'}
                                    </div>
                                </td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>`;

    // Share-Link
    document.getElementById('btn-share-shift')?.addEventListener('click', () => {
        const url = `${location.origin}/shifts/view?week=${monday.toISOString().slice(0,10)}`;
        navigator.clipboard.writeText(url).then(() => {
            if (window.__opaShowToast) window.__opaShowToast('Link kopiert!', 'success');
        });
    });

    window.editShift = (empId, date) => {
        const shift = shifts.find(s => s.employee_id == empId && s.date === date);
        const start = prompt('Schicht-Beginn (z.B. 09:00):', shift?.start_time || '09:00');
        if (!start) return;
        const end = prompt('Schicht-Ende (z.B. 17:00):', shift?.end_time || '17:00');
        if (!end) return;
        import('./api.js').then(({ apiPost }) => {
            apiPost('shifts', { employee_id: empId, date, start_time: start, end_time: end })
                .then(() => renderShiftPlanner(container, titleEl))
                .catch(() => {});
        });
    };
}

function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const year = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - year) / 86400000) + 1) / 7);
}

function isToday(date) {
    const t = new Date();
    return date.getDate() === t.getDate() &&
           date.getMonth() === t.getMonth() &&
           date.getFullYear() === t.getFullYear();
}
