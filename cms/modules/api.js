/**
 * API Module for OPA-CMS
 */

const API_URL = '/api';

export const getAuthToken = () => sessionStorage.getItem('opa_admin_token');

export const handleAuthFailure = () => { 
    if (!getAuthToken()) return null; 
    sessionStorage.removeItem('opa_admin_token'); 
    location.reload(); 
    return null; 
};

function checkTokenExpiry() {
    const token = getAuthToken();
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresIn = payload.exp * 1000 - Date.now();
        // Wenn Token in weniger als 30 Minuten abläuft → refresh
        if (expiresIn < 30 * 60 * 1000 && expiresIn > 0) {
            fetch(`${API_URL}/admin/refresh`, {
                method: 'POST',
                headers: { 'x-admin-token': token }
            })
            .then(r => r.json())
            .then(data => { if (data.token) sessionStorage.setItem('opa_admin_token', data.token); })
            .catch(() => {});
        }
    } catch (_) {}
}

export async function apiGet(route) {
    try {
        const r = await fetch(`${API_URL}/${route}`, { 
            headers: { 'x-admin-token': getAuthToken() } 
        });
        if (r.status === 401) return handleAuthFailure();
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            console.error(`API GET error (${route}) [${r.status}]:`, err.reason || r.statusText);
            return null;
        }
        const res = await r.json();
        if (res) checkTokenExpiry();
        return res;
    } catch (e) { 
        console.error(`API GET error (${route}):`, e);
        return null; 
    }
}

export async function apiPost(route, data) {
    try {
        const r = await fetch(`${API_URL}/${route}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'x-admin-token': getAuthToken() 
            },
            body: JSON.stringify(data)
        });
        if (r.status === 401 && route !== 'admin/login') return handleAuthFailure();
        const res = await r.json().catch(() => ({ success: false, reason: 'Ungültige Server-Antwort.' }));
        if (r.status === 403) { 
            import('./utils.js').then(m => m.showToast(res.reason || 'Zugriff verweigert.', 'error'));
            return { success: false, reason: res.reason }; 
        }
        // fix: forward reason for 400/500 responses so callers get proper error messages
        if (!r.ok && !res.reason) res.reason = `Serverfehler (${r.status})`;
        if (r.ok) checkTokenExpiry();
        return res;
    } catch (e) { 
        console.error(`API POST error (${route}):`, e);
        return { success: false, reason: 'Verbindungsfehler.' }; 
    }
}

export async function apiUpload(file) {
    try {
        const fd = new FormData();
        fd.append('image', file);
        const r = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'x-admin-token': getAuthToken() },
            body: fd
        });
        if (r.status === 401) return handleAuthFailure();
        // Parse JSON regardless of status so we get the reason field
        const res = await r.json().catch(() => ({ 
            success: false, 
            reason: `HTTP ${r.status}` 
        }));
        if (res) checkTokenExpiry();
        return res;
    } catch (e) { 
        console.error('API Upload error:', e);
        return { success: false, reason: e.message || 'Verbindungsfehler.' }; 
    }
}

export async function apiPut(route, data) {
    try {
        const r = await fetch(`${API_URL}/${route}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json', 
                'x-admin-token': getAuthToken() 
            },
            body: JSON.stringify(data)
        });
        if (r.status === 401) return handleAuthFailure();
        const res = await r.json().catch(() => ({ success: false, reason: 'Ungültige Server-Antwort.' }));
        if (r.status === 403) { 
            import('./utils.js').then(m => m.showToast(res.reason || 'Zugriff verweigert.', 'error'));
            return { success: false, reason: res.reason }; 
        }
        // fix: forward reason for 400/500 responses
        if (!r.ok && !res.reason) res.reason = `Serverfehler (${r.status})`;
        if (r.ok) checkTokenExpiry();
        return res;
    } catch (e) { 
        console.error(`API PUT error (${route}):`, e);
        return { success: false, reason: 'Verbindungsfehler.' }; 
    }
}

export async function apiDelete(route) {
    try {
        const r = await fetch(`${API_URL}/${route}`, {
            method: 'DELETE',
            headers: { 'x-admin-token': getAuthToken() }
        });
        if (r.status === 401) return handleAuthFailure();
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return { success: false, reason: err.reason || `Serverfehler (${r.status})` };
        }
        const res = await r.json();
        if (res) checkTokenExpiry();
        return res;
    } catch (e) { 
        console.error(`API DELETE error (${route}):`, e);
        return { success: false, reason: 'Verbindungsfehler.' }; 
    }
}
