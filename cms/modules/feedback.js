/**
 * OPA-CMS – Gäste-Feedback Modul
 * Zeigt eingegangene Bewertungen als Feed im Dashboard.
 */
import { apiGet } from './api.js';
import { showToast } from './utils.js';

export async function renderFeedbackWidget(container) {
    let reviews = [];
    try {
        reviews = await apiGet('feedback') || [];
    } catch(e) { return; }

    if (reviews.length === 0) return;

    const avg = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);

    const widget = document.createElement('div');
    widget.style.cssText = `background:#fff; border-radius:16px; padding:24px 28px;
        box-shadow:0 4px 24px rgba(0,0,0,.08); margin-bottom:28px;
        border:1.5px solid #e5e7eb;`;

    widget.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <h3 style="font-size:1rem; font-weight:800; color:#1b3a5c; margin:0;">
                ⭐ Gäste-Bewertungen
            </h3>
            <div style="background:#fef9c3; color:#92400e; padding:4px 14px;
                        border-radius:20px; font-size:.85rem; font-weight:800;">
                ⭐ ${avg} / 5.0
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px; max-height:280px; overflow-y:auto;">
            ${reviews.slice(0, 10).map(r => `
                <div style="padding:12px 14px; background:#f9fafb; border-radius:10px;
                            border:1px solid #e5e7eb;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="font-weight:700; font-size:.88rem; color:#374151;">
                            ${r.guest_name || 'Anonymer Gast'}
                        </span>
                        <span style="color:#facc15; font-size:.88rem;">
                            ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
                        </span>
                    </div>
                    ${r.comment ? `<p style="font-size:.82rem; color:#6b7280; margin:0;">${r.comment}</p>` : ''}
                    <div style="font-size:.72rem; color:#9ca3af; margin-top:4px;">
                        ${new Date(r.created_at).toLocaleDateString('de-DE')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    container.appendChild(widget);
}
