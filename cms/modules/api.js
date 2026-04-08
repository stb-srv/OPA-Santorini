/**
 * API Module for Grieche-CMS
 */

const API_URL = '/api';

export const getAuthToken = () => sessionStorage.getItem('opa_admin_token');

export const handleAuthFailure = () => { 
    if (!getAuthToken()) return null; 
    sessionStorage.removeItem('opa_admin_token'); 
    location.reload(); 
    return null; 
};

export async function apiGet(route) {
    try {
        const r = await fetch(`${API_URL}/${route}`, { 
            headers: { 'X-Admin-Token': getAuthToken() } 
        });
        if (r.status === 401) return handleAuthFailure();
        return await r.json();
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
                'X-Admin-Token': getAuthToken() 
            },
            body: JSON.stringify(data)
        });
        if (r.status === 401) return handleAuthFailure();
        const res = await r.json();
        // Global error handling for 403 (License/Permission)
        if (r.status === 403) { 
            import('./utils.js').then(m => m.showToast(res.reason, 'error'));
            return { success: false }; 
        }
        return res;
    } catch (e) { 
        console.error(`API POST error (${route}):`, e);
        return { success: false }; 
    }
}

export async function apiUpload(file) {
    try {
        const fd = new FormData();
        fd.append('image', file);
        const r = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'X-Admin-Token': getAuthToken() },
            body: fd
        });
        if (r.status === 401) return handleAuthFailure();
        return await r.json();
    } catch (e) { 
        console.error('API Upload error:', e);
        return { success: false }; 
    }
}

export async function apiPut(route, data) {
    try {
        const r = await fetch(`${API_URL}/${route}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json', 
                'X-Admin-Token': getAuthToken() 
            },
            body: JSON.stringify(data)
        });
        if (r.status === 401) return handleAuthFailure();
        const res = await r.json();
        if (r.status === 403) { 
            import('./utils.js').then(m => m.showToast(res.reason, 'error'));
            return { success: false }; 
        }
        return res;
    } catch (e) { 
        console.error(`API PUT error (${route}):`, e);
        return { success: false }; 
    }
}

export async function apiDelete(route) {
    try {
        const r = await fetch(`${API_URL}/${route}`, {
            method: 'DELETE',
            headers: { 'X-Admin-Token': getAuthToken() }
        });
        if (r.status === 401) return handleAuthFailure();
        return await r.json();
    } catch (e) { 
        console.error(`API DELETE error (${route}):`, e);
        return { success: false }; 
    }
}
