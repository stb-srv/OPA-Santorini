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

// DOM Elements
const loginContainer = document.getElementById('login-container');
const adminDashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('btn-logout');
const contentView = document.getElementById('content-view');
const viewTitle = document.getElementById('view-title');
const dashboardToolbar = document.getElementById('dashboard-toolbar');
const navItems = document.querySelectorAll('.nav-item');
const navSubItems = document.querySelectorAll('.nav-subitem');

let currentView = 'stats';

async function init() {
    if (!checkAuth()) {
        loginContainer.style.display = 'flex';
        adminDashboard.style.display = 'none';
        return;
    }

    loginContainer.style.display = 'none';
    adminDashboard.style.display = 'flex';

    // Initial View
    switchView('stats');

    // Sidebar Branding Update
    const branding = await apiGet('branding');
    if (branding) {
        document.getElementById('disp-res-name').textContent = branding.name || 'OPA! CMS';
        document.getElementById('disp-res-slogan').textContent = branding.slogan || 'Restaurant Management';
    }

    // Sidebar Visibility Check
    const settings = await apiGet('settings') || {};
    updateSidebarVisibility(settings);
}

export function updateSidebarVisibility(settings) {
    const ordersItem = document.getElementById('nav-orders');
    if (ordersItem) {
        const showOrders = settings.activeModules?.orders !== false;
        ordersItem.style.display = showOrders ? 'flex' : 'none';
    }
}

async function switchView(view, tab = null) {
    currentView = view;
    console.log(`Switching to view: ${view}, tab: ${tab}`);
    
    // Update Sidebar UI
    navItems.forEach(item => item.classList.remove('active'));
    document.querySelectorAll(`[data-view="${view}"]`).forEach(item => {
        if (!item.classList.contains('nav-subitem')) item.classList.add('active');
    });

    // Reset Toolbar
    dashboardToolbar.style.display = 'none';

    // Render Logic
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

// Event Listeners
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

if (logoutBtn) {
    logoutBtn.onclick = () => logout();
}

navItems.forEach(item => {
    item.onclick = (e) => {
        const view = item.dataset.view;
        const group = item.closest('.nav-group');
        
        // If it's a group header, toggle the group
        if (group && !item.classList.contains('nav-subitem')) {
            // Keep open logic: Multiple groups can be open
            group.classList.toggle('open');
            
            // Only switch view if it's not JUST a toggle (some items are both)
            if (view) switchView(view);
        } else {
            // Standard link
            if (view) {
                e.preventDefault();
                switchView(view);
            }
        }
    };
});

navSubItems.forEach(item => {
    item.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Highlight active subitem
        navSubItems.forEach(si => si.classList.remove('active'));
        item.classList.add('active');
        
        switchView(item.dataset.view, item.dataset.tab);
    };
});

// Global Helpers (Keeping for sidebar/legacy compatibility)
window.switchTab = switchView;

// Initialize
init();
