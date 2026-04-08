/**
 * Auth Module for OPA-CMS
 */

import { apiPost, getAuthToken, handleAuthFailure } from './api.js';
import { showToast } from './utils.js';

export async function login(user, pass) {
    const res = await apiPost('admin/login', { user, pass });
    if (!res) return { success: false, reason: 'Server nicht erreichbar. Bitte Verbindung prüfen.' };
    if (res.success && res.token) {
        sessionStorage.setItem('opa_admin_token', res.token);
        sessionStorage.setItem('opa_admin_user', JSON.stringify(res.user));
        return { success: true };
    }
    return { success: false, reason: res.reason || 'Benutzername oder Passwort falsch.' };
}

export function logout() {
    sessionStorage.removeItem('opa_admin_token');
    sessionStorage.removeItem('opa_admin_user');
    location.reload();
}

export function getCurrentUser() {
    try {
        return JSON.parse(sessionStorage.getItem('opa_admin_user'));
    } catch { return null; }
}

export function checkAuth() {
    return !!getAuthToken();
}
