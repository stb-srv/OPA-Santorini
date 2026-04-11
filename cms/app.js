/**
 * Main Entry Point for Grieche-CMS (Modular Version)
 */

import { checkAuth, login, logout } from './modules/auth.js';
import { apiGet } from './modules/api.js';
import { showToast } from './modules/utils.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderMenu } from './modules/menu.js';
import { renderReservations, renderArchive } from './modules/reservations.js';
import { renderTableManager } from './modules/tables.js';
import { renderDesigner } from './modules/designer.js';
import { renderSettings } from './modules/settings.js';
import { renderOpeningHours } from './modules/opening.js';
import { renderOrders } from './modules/orders.js';

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
        const warnMs = expiresInMs - (5 * 60 * 1000); // 5 Minuten vorher warnen
        if (warnMs > 0) {
            tokenExpiryTimer = setTimeout(() => {
                showToast('Ihre Sitzung läuft in 5 Minuten ab. Bitte speichern Sie Ihre Arbeit.', 'warning');
            }, warnMs);
        }
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

    // Check if password change is required via token payload
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

    scheduleTokenExpiryWarning();
    switchView('stats');

    const branding = await apiGet('branding');
    if (branding) {
        document.getElementById('disp-res-name').textContent    = branding.name   || 'OPA! Santorini';
        document.getElementById('disp-res-slogan').textContent  = branding.slogan || 'Restaurant Management';
        if (branding.name) document.title = branding.name + ' CMS';
        
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
    // Küchen-Monitor im Restaurant-Submenü ein-/ausblenden
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
            await renderTableManager(contentView, viewTitle);
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
    const linkBack = document.getElementById('link-back-login');
    const forgotContainer = document.getElementById('forgot-password-container');
    const forgotForm = document.getElementById('forgot-password-form');

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
            const btn = document.getElementById('btn-forgot-submit');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sende...'; }
            
            try {
                const res = await fetch('/api/admin/forgot-password', {
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
            const res = await fetch('/api/admin/change-password', {
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

// Gruppen-Header: Toggle + optional navigieren
document.querySelectorAll('.nav-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
        e.preventDefault();
        const group = header.closest('.nav-group');
        if (group) group.classList.toggle('open');
        const view = header.dataset.view;
        const tab  = header.dataset.tab || null;
        if (view) switchView(view, tab);
    });
});

// Sub-Items
document.querySelectorAll('.nav-subitem').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const view = item.dataset.view;
        const tab  = item.dataset.tab || null;
        if (view) switchView(view, tab);
    });
});

// Direkt-Links (Dashboard)
document.querySelectorAll('.nav-item:not(.nav-group-header)').forEach(item => {
    item.addEventListener('click', (e) => {
        const view = item.dataset.view;
        if (view) { e.preventDefault(); switchView(view); }
    });
});

window.switchTab = switchView;
init();
