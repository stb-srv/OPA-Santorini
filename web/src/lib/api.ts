/**
 * API-Client für Meraki CMS (Port von cms/modules/api.js → TypeScript).
 * - Auth via Header `x-admin-token`
 * - Prefix `/api` (im Dev von Vite an :5000 geproxyt)
 * - 401 → Auto-Logout, 403 → Toast, Token-Refresh wenn < 30 Min Restlaufzeit
 */
import { toast } from 'sonner';

const API_URL = '/api';

export const TOKEN_KEY = 'meraki_admin_token';
export const USER_KEY = 'meraki_admin_user';

export const getAuthToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);

export function handleAuthFailure(): null {
    if (!getAuthToken()) return null;
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
    return null;
}

function checkTokenExpiry(): void {
    const token = getAuthToken();
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresIn = payload.exp * 1000 - Date.now();
        // < 30 Minuten Restlaufzeit → Token erneuern
        if (expiresIn < 30 * 60 * 1000 && expiresIn > 0) {
            fetch(`${API_URL}/admin/refresh`, {
                method: 'POST',
                headers: { 'x-admin-token': token },
            })
                .then((r) => r.json())
                .then((data) => {
                    if (data.token) sessionStorage.setItem(TOKEN_KEY, data.token);
                })
                .catch(() => {});
        }
    } catch {
        /* ignore */
    }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = getAuthToken();
    return token ? { 'x-admin-token': token, ...extra } : { ...extra };
}

export interface ApiResult {
    success?: boolean;
    reason?: string;
    [key: string]: unknown;
}

export async function apiGet<T = unknown>(route: string): Promise<T | null> {
    try {
        const r = await fetch(`${API_URL}/${route}`, { headers: authHeaders() });
        if (r.status === 401) return handleAuthFailure() as null;
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            console.error(`API GET (${route}) [${r.status}]:`, err.reason || r.statusText);
            return null;
        }
        const res = (await r.json()) as T;
        if (res) checkTokenExpiry();
        return res;
    } catch (e) {
        console.error(`API GET (${route}):`, e);
        return null;
    }
}

export async function apiPost<T extends ApiResult = ApiResult>(
    route: string,
    data: unknown
): Promise<T> {
    try {
        const r = await fetch(`${API_URL}/${route}`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data),
        });
        if (r.status === 401 && route !== 'admin/login') return handleAuthFailure() as unknown as T;
        const res = (await r
            .json()
            .catch(() => ({ success: false, reason: 'Ungültige Server-Antwort.' }))) as T;
        if (r.status === 403) {
            toast.error(res.reason || 'Zugriff verweigert.');
            return { success: false, reason: res.reason } as T;
        }
        if (!r.ok && !res.reason) res.reason = `Serverfehler (${r.status})`;
        if (r.ok) checkTokenExpiry();
        return res;
    } catch (e) {
        console.error(`API POST (${route}):`, e);
        return { success: false, reason: 'Verbindungsfehler.' } as T;
    }
}

export async function apiPut<T extends ApiResult = ApiResult>(
    route: string,
    data: unknown
): Promise<T> {
    try {
        const r = await fetch(`${API_URL}/${route}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data),
        });
        if (r.status === 401) return handleAuthFailure() as unknown as T;
        const res = (await r
            .json()
            .catch(() => ({ success: false, reason: 'Ungültige Server-Antwort.' }))) as T;
        if (r.status === 403) {
            toast.error(res.reason || 'Zugriff verweigert.');
            return { success: false, reason: res.reason } as T;
        }
        if (!r.ok && !res.reason) res.reason = `Serverfehler (${r.status})`;
        if (r.ok) checkTokenExpiry();
        return res;
    } catch (e) {
        console.error(`API PUT (${route}):`, e);
        return { success: false, reason: 'Verbindungsfehler.' } as T;
    }
}

export async function apiDelete<T extends ApiResult = ApiResult>(route: string): Promise<T> {
    try {
        const r = await fetch(`${API_URL}/${route}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        if (r.status === 401) return handleAuthFailure() as unknown as T;
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return { success: false, reason: err.reason || `Serverfehler (${r.status})` } as T;
        }
        const res = (await r.json()) as T;
        if (res) checkTokenExpiry();
        return res;
    } catch (e) {
        console.error(`API DELETE (${route}):`, e);
        return { success: false, reason: 'Verbindungsfehler.' } as T;
    }
}

/**
 * Lädt eine Datei-Download-Route per Header-Auth statt Token-Query-Param
 * (verhindert JWT-Leak über Access-Logs/Browser-History/Referer) und
 * stößt den Browser-Download über einen temporären Object-URL-Link an.
 */
export async function apiDownload(route: string, filenameFallback: string): Promise<void> {
    try {
        const r = await fetch(`${API_URL}/${route}`, { headers: authHeaders() });
        if (r.status === 401) return void handleAuthFailure();
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            toast.error(err.reason || `Download fehlgeschlagen (${r.status}).`);
            return;
        }
        const disposition = r.headers.get('Content-Disposition') || '';
        const match = /filename="?([^"]+)"?/.exec(disposition);
        const filename = match?.[1] || filenameFallback;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        checkTokenExpiry();
    } catch (e) {
        console.error(`API Download (${route}):`, e);
        toast.error('Verbindungsfehler beim Download.');
    }
}

export async function apiUpload<T extends ApiResult = ApiResult>(file: File): Promise<T> {
    try {
        const fd = new FormData();
        fd.append('image', file);
        const r = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: authHeaders(),
            body: fd,
        });
        if (r.status === 401 || r.status === 403) return handleAuthFailure() as unknown as T;
        const res = (await r.json().catch(() => ({
            success: false,
            reason: `HTTP ${r.status}`,
        }))) as T;
        if (res) checkTokenExpiry();
        return res;
    } catch (e) {
        console.error('API Upload:', e);
        return { success: false, reason: 'Verbindungsfehler.' } as T;
    }
}
