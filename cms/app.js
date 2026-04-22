/**
 * Main Entry Point for OPA-CMS (Modular Version)
 */

import { checkAuth, login, logout } from './modules/auth.js';
import { apiGet } from './modules/api.js';
import { showToast } from './modules/utils.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderMenu } from './modules/menu.js';
import { renderReservations, renderArchive } from './modules/reservations.js';
import { renderTableManager } from './modules/tables.js';
import { renderTablePlanner } from './modules/table-planner.js';
import { renderDesigner } from './modules/designer.js';
import { renderSettings } from './modules/settings.js';
import { renderOpeningHours } from './modules/opening.js';
import { renderOrders } from './modules/orders.js';
import { initOrderSettings } from './modules/order-settings.js';
import { renderBackup } from './modules/backup.js';

const loginContainer    = document.getElementById('login-container');
const adminDashboard    = document.getElementById('admin-dashboard');
const loginForm         = document.getElementById('login-form');
const logoutBtn         = document.getElementById('btn-logout');
const contentView       = document.getElementById('content-view');
const viewTitle         = document.getElementById('view-title');
const dashboardToolbar  = document.getElementById('dashboard-toolbar');

let currentView = 'stats';
let tokenExpiryTimer = null;

function scheduleTokenExpiryWarning() {
    if (tokenExpiryTimer) clearTimeout(tokenExpiryTimer);
    const token = sessionStorage.getItem('opa_admin_token');
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (!payload.exp) return;
        const expiresInMs = (payload.exp * 1000) - Date.now();
        const warnMs = expiresInMs - (5 * 60 * 1000);
        if (warnMs > 0) {
            tokenExpiryTimer = setTimeout(() => {
                showToast('Ihre Sitzung läuft in 5 Minuten ab. Bitte speichern Sie Ihre Arbeit.', 'warning');
            }, warnMs);
        }
    } catch (e) {}
}

/**
 * Erzeugt ein Inline-SVG Avatar mit den Initialen des Nutzers.
 * Kein externer Request nötig – funktioniert immer.
 */
function buildInitialsAvatar(name) {
    const parts = name.trim().split(/\s+/);
    const initials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
    const colors = ['#2b6cb0','#276749','#744210','#702459','#553c9a','#2c7a7b','#9b2c2c'];
    const bg = colors[name.charCodeAt(0) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">`
        + `<circle cx="18" cy="18" r="18" fill="${bg}"/>`
        + `<text x="18" y="23" text-anchor="middle" font-size="14" font-family="sans-serif" fill="#fff" font-weight="600">${initials}</text>`
        + `</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Liest den Benutzernamen aus dem JWT-Token und zeigt ihn im Header an */
function applyUserFromToken() {
    const token = sessionStorage.getItem('opa_admin_token');
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const name = payload.name || payload.user || payload.sub || 'Admin';
        const nameEl   = document.getElementById('disp-user-name');
        const avatarEl = document.getElementById('disp-user-avatar');
        if (nameEl)   nameEl.textContent = name;
        if (avatarEl) avatarEl.src = buildInitialsAvatar(name);
    } catch (e) {}
}

async function init() {
    if (!checkAuth()) {
        loginContainer.style.display = 'flex';
        adminDashboard.style.display = 'none';
        const pwdContainer = document.getElementById('password-change-container');
        if (pwdContainer) pwdContainer.style.display = 'none';
        return;
    }

    const token = sessionStorage.getItem('opa_admin_token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.requirePasswordChange) {
                loginContainer.style.display = 'none';
                adminDashboard.style.display = 'none';
                const pwdContainer = document.getElementById('password-change-container');
                if (pwdContainer) pwdContainer.style.display = 'flex';
                return;
            }
        } catch (e) {}
    }

    const pwdContainer = document.getElementById('password-change-container');
    if (pwdContainer) pwdContainer.style.display = 'none';
    loginContainer.style.display = 'none';
    adminDashboard.style.display = 'flex';

    applyUserFromToken();
    scheduleTokenExpiryWarning();
    switchView('stats');

    const branding = await apiGet('branding');
    if (branding) {
        document.getElementById('disp-res-name').textContent    = branding.name   || 'OPA! Santorini';
        document.getElementById('disp-res-slogan').textContent  = branding.slogan || 'Restaurant Management';
        if (branding.name) document.title = branding.name + ' CMS';

        // Haupt-Logo im CMS-Header setzen (falls vorhanden)
        const cmsLogoEl = document.getElementById('cms-header-logo');
        if (cmsLogoEl && branding.logo) {
            cmsLogoEl.src = branding.logo;
            cmsLogoEl.style.display = 'block';
        }

        if (branding.favicon) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = branding.favicon;
        }
    }

    const settings = await apiGet('settings') || {};
    updateSidebarVisibility(settings);
}

export function updateSidebarVisibility(settings) {
    const ordersItem = document.getElementById('nav-orders');
    if (ordersItem) {
        ordersItem.style.display = settings.activeModules?.orders !== false ? 'flex' : 'none';
    }
}

function setActiveNavItem(view, tab) {
    document.querySelectorAll('.nav-item, .nav-subitem').forEach(el => el.classList.remove('active'));

    let matched = false;
    document.querySelectorAll('.nav-subitem').forEach(el => {
        if (el.dataset.view === view && (!tab || el.dataset.tab === tab)) {
            el.classList.add('active');
            matched = true;
        }
    });

    if (!matched) {
        document.querySelectorAll('.nav-item').forEach(el => {
            if (el.dataset.view === view) el.classList.add('active');
        });
    }
}

async function switchView(view, tab = null) {
    currentView = view;
    setActiveNavItem(view, tab);
    dashboardToolbar.style.display = 'none';

    // Breadcrumb aktualisieren
    const breadcrumbMap = {
        stats:          ['Dashboard'],
        menu:           ['Einstellungen', 'Speisekarte'],
        reservations:   ['Reservierungen'],
        archive:        ['Reservierungen', 'Archiv'],
        orders:         ['Bestellungen'],
        'order-settings': ['Einstellungen', 'Bestelleinstellungen'],
        opening:        ['Einstellungen', 'Restaurant', 'Öffnungszeiten'],
        tables:         ['Einstellungen', 'Tischverwaltung'],
        qrcodes:        ['Einstellungen', 'QR-Codes'],
        backup:         ['Einstellungen', 'Backup & Restore'],
        'table-planner': ['Reservierungen', 'Tischplaner'],
        'plugins-manager': ['System', 'Erweiterungen'],
        settings:       ['Einstellungen', tab ? {
            license: 'Lizenz & Module',
            restaurant: 'Grundeinstellungen',
            smtp: 'E-Mail / SMTP',
            ai: 'KI-Bildgenerierung',
            users: 'Nutzerverwaltung',
            location: 'Standort & Karte',
            closures: 'Urlaub & Betriebssperre',
            reservations: 'Reservierungseinstellungen',
            'order-emails': 'E-Mail Templates',
        }[tab] || tab : 'Einstellungen'],
    };
    const trail = breadcrumbMap[view];
    const trailEl = document.getElementById('breadcrumb-trail');
    if (trailEl && trail) {
        trailEl.innerHTML = trail.filter(Boolean).map((crumb, i) =>
            i < trail.length - 1
                ? `<i class="fas fa-chevron-right" style="font-size:.6rem; opacity:.4; margin:0 6px;"></i><span class="breadcrumb-crumb">${crumb}</span>`
                : `<i class="fas fa-chevron-right" style="font-size:.6rem; opacity:.4; margin:0 6px;"></i><span class="breadcrumb-crumb breadcrumb-crumb--active">${crumb}</span>`
        ).join('');
    }

    switch (view) {
        case 'stats':
            await renderDashboard(contentView, viewTitle, dashboardToolbar);
            break;
        case 'home-editor':
            await renderDesigner(contentView, viewTitle, tab);
            break;
        case 'menu':
            await renderMenu(contentView, viewTitle, tab || 'dishes');
            break;
        case 'reservations':
            await renderReservations(contentView, viewTitle);
            break;
        case 'archive':
            await renderArchive(contentView, viewTitle);
            break;
        case 'tables':
            if (tab === 'qrcodes') {
                if (window.AdminQR) window.AdminQR.render(contentView, viewTitle);
                else contentView.innerHTML = '<p>QR-Modul wird geladen...</p>';
            } else {
                await renderTableManager(contentView, viewTitle);
            }
            break;
        case 'table-planner':
            await renderTablePlanner(contentView, viewTitle);
            break;
        case 'settings':
            await renderSettings(contentView, viewTitle);
            break;
        case 'opening':
            await renderOpeningHours(contentView, viewTitle);
            break;
        case 'orders':
            await renderOrders(contentView, viewTitle);
            break;
        case 'order-settings':
            viewTitle.innerHTML = '<i class="fas fa-shopping-bag"></i> Bestellungen';
            contentView.innerHTML = '<div id="order-settings-root"></div>';
            await initOrderSettings(
                document.getElementById('order-settings-root'),
                { get: (path) => apiGet(path), post: (path, body) => import('./modules/api.js').then(m => m.apiPost(path, body)) },
                await apiGet('license/info')
            );
            break;
        case 'backup':
            await renderBackup(contentView, viewTitle);
            break;
        case 'qrcodes':
            if (window.AdminQR) {
                window.AdminQR.render(contentView, viewTitle);
            } else {
                contentView.innerHTML = '<p>QR-Modul wird geladen...</p>';
            }
            break;
        case 'plugins-manager':
            contentView.innerHTML = `
                <div class="glass-panel" style="padding:60px; text-align:center; opacity:.6;">
                    <i class="fas fa-puzzle-piece" style="font-size:3rem; margin-bottom:20px; display:block;"></i>
                    <h3>Erweiterungen</h3>
                    <p style="margin-top:8px; font-size:.9rem;">Plugin-Verwaltung wird in Kürze verfügbar sein.</p>
                </div>`;
            viewTitle.innerHTML = '<i class="fas fa-puzzle-piece"></i> Erweiterungen';
            break;
        default:
            contentView.innerHTML = `<div style="padding:100px; text-align:center; opacity:.5;"><h3>Ansicht "${view}" wird noch entwickelt.</h3></div>`;
    }
}

// Login
if (loginForm) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = loginForm.querySelector('button[type="submit"]');
        const origText = btn ? btn.innerHTML : null;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Anmelden...'; }

        const res = await login(loginForm.username.value, loginForm.password.value);

        if (btn) { btn.disabled = false; btn.innerHTML = origText; }

        if (res.success) {
            init();
        } else {
            showToast(res.reason || 'Benutzername oder Passwort falsch.', 'error');
        }
    };

    const linkForgot = document.getElementById('link-forgot-pass');
    const linkBack   = document.getElementById('link-back-login');
    const forgotContainer = document.getElementById('forgot-password-container');
    const forgotForm      = document.getElementById('forgot-password-form');

    if (linkForgot) {
        linkForgot.onclick = (e) => {
            e.preventDefault();
            document.getElementById('login-container').style.display = 'none';
            if (forgotContainer) forgotContainer.style.display = 'flex';
        };
    }

    if (linkBack) {
        linkBack.onclick = (e) => {
            e.preventDefault();
            if (forgotContainer) forgotContainer.style.display = 'none';
            document.getElementById('login-container').style.display = 'flex';
        };
    }

    if (forgotForm) {
        forgotForm.onsubmit = async (e) => {
            e.preventDefault();
            const user = document.getElementById('forgot-username').value;
            const btn  = document.getElementById('btn-forgot-submit');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sende...'; }

            try {
                const res  = await fetch('/api/admin/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message, 'success');
                    setTimeout(() => {
                        if (forgotContainer) forgotContainer.style.display = 'none';
                        document.getElementById('login-container').style.display = 'flex';
                        if (btn) { btn.disabled = false; btn.innerHTML = 'Neues Passwort anfordern'; }
                    }, 2000);
                } else {
                    showToast(data.reason || 'Fehler beim Senden', 'error');
                    if (btn) { btn.disabled = false; btn.innerHTML = 'Neues Passwort anfordern'; }
                }
            } catch (err) {
                showToast('Verbindungsfehler', 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = 'Neues Passwort anfordern'; }
            }
        };
    }
}

const pwdChangeForm = document.getElementById('password-change-form');
if (pwdChangeForm) {
    pwdChangeForm.onsubmit = async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('new-password').value;
        if (newPassword.length < 6) return showToast('Passwort muss mind. 6 Zeichen haben.', 'error');

        try {
            const token = sessionStorage.getItem('opa_admin_token');
            const res   = await fetch('/api/admin/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
                body: JSON.stringify({ newPassword })
            });
            const data = await res.json();
            if (data.success && data.token) {
                sessionStorage.setItem('opa_admin_token', data.token);
                showToast('Passwort erfolgreich geändert! Willkommen im Dashboard.', 'success');
                scheduleTokenExpiryWarning();
                init();
            } else {
                showToast(data.reason || 'Fehler beim Passwort ändern', 'error');
            }
        } catch (err) {
            showToast('Verbindungsfehler', 'error');
        }
    };
}

if (logoutBtn) logoutBtn.onclick = () => logout();

// ── Accordion: nur eine Gruppe gleichzeitig offen ──
document.querySelectorAll('.nav-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
        e.preventDefault();
        const group = header.closest('.nav-group');
        const isOpen = group.classList.contains('open');
        // Alle schließen
        document.querySelectorAll('.nav-group').forEach(g => g.classList.remove('open'));
        // Diese öffnen wenn sie vorher zu war
        if (!isOpen) group.classList.add('open');
        const view = header.dataset.view;
        const tab  = header.dataset.tab || null;
        if (view) switchView(view, tab);
    });
});

// ── Sub-Items ──
document.querySelectorAll('.nav-subitem:not(.nav-subitem--group-label)').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const view = item.dataset.view;
        const tab  = item.dataset.tab || null;
        if (view) switchView(view, tab);
        // Mobile: Sidebar schließen nach Klick
        document.getElementById('cms-sidebar')?.classList.remove('mobile-open');
        document.getElementById('sidebar-overlay')?.classList.remove('visible');
    });
});

// ── Direkt-Links ──
document.querySelectorAll('.nav-item:not(.nav-group-header)').forEach(item => {
    item.addEventListener('click', (e) => {
        const view = item.dataset.view;
        const tab  = item.dataset.tab || null;
        if (view) { e.preventDefault(); switchView(view, tab); }
        document.getElementById('cms-sidebar')?.classList.remove('mobile-open');
        document.getElementById('sidebar-overlay')?.classList.remove('visible');
    });
});

// ── Einstellungen-Gruppe beim Start offen halten wenn aktive View drin ist ──
function ensureActiveGroupOpen() {
    document.querySelectorAll('.nav-subitem.active, .nav-item.active').forEach(el => {
        const group = el.closest('.nav-group');
        if (group) group.classList.add('open');
    });
}

// ── Sidebar-Suche ──
const navSearch = document.getElementById('nav-search');
if (navSearch) {
    navSearch.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.nav-subitem:not(.nav-subitem--group-label), .nav-item').forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = (!q || text.includes(q)) ? '' : 'none';
        });
        // Alle Gruppen bei Suche öffnen
        if (q) document.querySelectorAll('.nav-group').forEach(g => g.classList.add('open'));
        else   ensureActiveGroupOpen();
    });
}

// ── Mobile Hamburger ──
const sidebarToggle  = document.getElementById('sidebar-toggle');
const sidebarClose   = document.getElementById('sidebar-close');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar        = document.getElementById('cms-sidebar');

sidebarToggle?.addEventListener('click', () => {
    sidebar?.classList.add('mobile-open');
    sidebarOverlay?.classList.add('visible');
});
sidebarClose?.addEventListener('click', () => {
    sidebar?.classList.remove('mobile-open');
    sidebarOverlay?.classList.remove('visible');
});
sidebarOverlay?.addEventListener('click', () => {
    sidebar?.classList.remove('mobile-open');
    sidebarOverlay?.classList.remove('visible');
});

// ── Bestellungs-Badge live aktualisieren ──
async function updateOrderBadge() {
    try {
        const orders = await apiGet('orders');
        const pending = (orders || []).filter(o =>
            o.status === 'pending' || o.status === 'new'
        ).length;
        const badge = document.getElementById('nav-orders-badge');
        if (badge) {
            badge.textContent = pending;
            badge.style.display = pending > 0 ? 'inline-flex' : 'none';
        }
    } catch(e) {}
}

// Badge beim Start und alle 30s aktualisieren
updateOrderBadge();
setInterval(updateOrderBadge, 30000);

// Auch nach switchView Badge updaten wenn orders-View verlassen
const _origSwitchView = switchView;
window.switchTab = (view, tab) => {
    _origSwitchView(view, tab);
    if (view !== 'orders') setTimeout(updateOrderBadge, 500);
    ensureActiveGroupOpen();
};

window.switchTab = (v,t) => window.switchTab(v,t); // Fix for potential recursion if reassigned poorly
init();
