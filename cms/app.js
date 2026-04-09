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

async function init() {
    if (!checkAuth()) {
        loginContainer.style.display = 'flex';
        adminDashboard.style.display = 'none';
        document.getElementById('password-change-container').style.display = 'none';
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
                document.getElementById('password-change-container').style.display = 'flex';
                return;
            }
        } catch (e) {}
    }

    document.getElementById('password-change-container').style.display = 'none';
    loginContainer.style.display = 'none';
    adminDashboard.style.display = 'flex';

    switchView('stats');

    const branding = await apiGet('branding');
    if (branding) {
        document.getElementById('disp-res-name').textContent    = branding.name   || 'OPA! CMS';
        document.getElementById('disp-res-slogan').textContent  = branding.slogan || 'Restaurant Management';
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
        const res = await login(loginForm.username.value, loginForm.password.value);
        if (res.success) {
            init();
        } else {
            showToast(res.reason, 'error');
        }
    };
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
