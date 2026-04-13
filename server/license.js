/**
 * OPA-CMS – License Plan Definitions, Token Verification & Helpers
 */

const jwt = require('jsonwebtoken');

const OPA_PUBLIC_KEY_FALLBACK = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAutES8Xqif1PpLJU9ClMJ
rGfeCoUVOOni5/WiwGFdTd5ygYyie22fBheBA2fRek6xXDfGtC/QdIg7zbqI/0eQ
V7DCcytIGJSfPRNW4t6cb7oRUVTbo74jia5GUDyJNLJPQDsPVWDvi6rpB+/hv+Uh
rL3UQbHYwoJi/H5R2uwPsd9JaznGoygWhmaWpueXQkxYMRlupUWD1hT+OBSYWBnI
l7NUVsJ8pDOE2u9REwVgBnJEbdA39YnZ2NB4W/5JZPLsM8pkp1QO32THcHixFUvC
N+xMcoOA3fRdAICdI6kI9LccR4hzr7Btf/8Wbk0erF48Xw5NjFj0CZcRIjegiq2m
HQIDAQAB
-----END PUBLIC KEY-----`;

const OPA_PUBLIC_KEY = (process.env.LICENSE_PUBLIC_KEY || '').trim() || OPA_PUBLIC_KEY_FALLBACK;

if (process.env.LICENSE_PUBLIC_KEY) {
    console.log('\u2705  RSA Public Key aus LICENSE_PUBLIC_KEY Env-Variable geladen.');
} else {
    console.warn('\u26a0\ufe0f   RSA Public Key: Fallback-Key aktiv. F\u00fcr Produktion LICENSE_PUBLIC_KEY in .env setzen.');
}

const PLAN_DEFINITIONS = {
    FREE: {
        label: 'Free', menu_items: 30, max_tables: 5,
        modules: { menu_edit: true, orders_kitchen: false, reservations: false, custom_design: false, analytics: false, qr_pay: false },
        note: 'Kostenlos zum Testen'
    },
    STARTER: {
        label: 'Starter', menu_items: 60, max_tables: 10,
        modules: { menu_edit: true, orders_kitchen: true, reservations: true, custom_design: false, analytics: false, qr_pay: false },
        note: 'F\u00fcr kleine Caf\u00e9s & Imbi\u00dfe'
    },
    PRO: {
        label: 'Pro', menu_items: 150, max_tables: 25,
        modules: { menu_edit: true, orders_kitchen: true, reservations: true, custom_design: true, analytics: false, qr_pay: false },
        note: 'F\u00fcr Restaurants'
    },
    PRO_PLUS: {
        label: 'Pro+', menu_items: 300, max_tables: 50,
        modules: { menu_edit: true, orders_kitchen: true, reservations: true, custom_design: true, analytics: true, qr_pay: false },
        note: 'F\u00fcr gro\u00dfe Restaurants'
    },
    ENTERPRISE: {
        label: 'Enterprise', menu_items: 999, max_tables: 999,
        modules: { menu_edit: true, orders_kitchen: true, reservations: true, custom_design: true, analytics: true, qr_pay: true },
        note: 'F\u00fcr Ketten & Hotels'
    }
};

const getPlan = (type) => {
    if (!type) return PLAN_DEFINITIONS['FREE'];
    const normalizedType = type.toUpperCase()
        .replace(/\+/g, '_PLUS')
        .replace(/\s+/g, '_');
    return PLAN_DEFINITIONS[normalizedType] || PLAN_DEFINITIONS['FREE'];
};

const FREE_RESULT = (extra = {}) => ({
    key: null, status: 'free', customer: 'Testmodus',
    type: 'FREE', label: 'Free',
    expiresAt: null, isTrial: false, isExpired: false, trialDaysLeft: 0,
    modules: PLAN_DEFINITIONS.FREE.modules,
    limits: { max_dishes: PLAN_DEFINITIONS.FREE.menu_items, max_tables: PLAN_DEFINITIONS.FREE.max_tables },
    plan: PLAN_DEFINITIONS.FREE,
    ...extra
});

const verifyLicenseToken = (token, host = null) => {
    if (!token || typeof token !== 'string') return null;
    try {
        const payload = jwt.verify(token, OPA_PUBLIC_KEY, { algorithms: ['RS256'] });
        if (payload.domain && host) {
            const normalizeHost = (h) => (h || '').replace(/:\d+$/, '').toLowerCase().trim();
            const tokenDomain  = normalizeHost(payload.domain);
            const currentHost  = normalizeHost(host);
            const isLocal = ['localhost', '127.0.0.1', '::1'].includes(currentHost);
            if (!isLocal && tokenDomain !== currentHost) {
                console.warn(`\u26a0\ufe0f  License domain mismatch: token='${tokenDomain}' current='${currentHost}'`);
                return null;
            }
        }
        return payload;
    } catch (e) {
        if (e.name !== 'JsonWebTokenError' && e.name !== 'TokenExpiredError') {
            console.error('\u274c License token verification error:', e.message);
        }
        return null;
    }
};

/**
 * Offline-Fallback: Liest den letzten bekannten Plan aus der DB.
 * Wird genutzt wenn der Lizenzserver nicht erreichbar ist (degraded: 'unreachable').
 * Gibt null zurück wenn kein Snapshot vorhanden.
 */
const getLastKnownLicense = (lic) => {
    if (!lic || !lic.key) return null;
    // Snapshot vom letzten erfolgreichen Check vorhanden?
    const type = lic.lastKnownType || lic.type || null;
    if (!type || type === 'FREE') return null;

    const plan = getPlan(type);
    const modules = lic.lastKnownModules || plan.modules;
    const limits  = lic.lastKnownLimits  || { max_dishes: plan.menu_items, max_tables: plan.max_tables };

    console.warn(`\u26a0\ufe0f  [Offline-Fallback] Lizenzserver nicht erreichbar – nutze letzten bekannten Plan: ${type} (seit ${lic.lastKnownAt || 'unbekannt'})`);

    return {
        key:      lic.key,
        status:   'active_offline',
        customer: lic.customer || 'Unbekannt',
        type,
        label:    plan.label + ' (Offline)',
        expiresAt: lic.expiresAt || null,
        modules,
        limits,
        isTrial: false, isExpired: false, trialDaysLeft: 0, plan,
        domain:  lic.domain || null,
        offline: true
    };
};

/**
 * Gibt die aktuelle, verifizierte Lizenz zurück.
 * Fallback-Kette bei ungültigem Token:
 *  1. Verifiziertes JWT (Normalfall)
 *  2. Offline-Fallback: letzter bekannter Plan aus DB-Snapshot
 *  3. JWT dekodieren ohne Signaturprüfung (Domain-Mismatch / abgelaufen)
 *  4. FREE (kein Lizenz-Key vorhanden)
 */
const getCurrentLicense = async (DB, host = null) => {
    const settings = await DB.getKV('settings', {});
    const lic      = settings.license || {};

    // --- Trial-Lizenz ---
    if (lic.isTrial) {
        const plan      = getPlan(lic.type);
        const now       = new Date();
        const expiresAt = lic.expiresAt ? new Date(lic.expiresAt) : null;
        const isExpired = expiresAt ? expiresAt < now : false;
        const trialDaysLeft = !isExpired && expiresAt
            ? Math.max(0, Math.ceil((expiresAt - now) / 86400000))
            : 0;

        if (isExpired) return FREE_RESULT({ isTrial: true, isExpired: true, status: 'expired', key: lic.key });

        return {
            key: lic.key, status: lic.status || 'trial',
            customer: lic.customer || 'Trial', type: lic.type || 'FREE',
            label: plan.label, expiresAt: lic.expiresAt,
            modules: plan.modules,
            limits: { max_dishes: plan.menu_items, max_tables: plan.max_tables },
            isTrial: true, isExpired: false, trialDaysLeft, plan
        };
    }

    // --- Vollizenz: signiertes JWT prüfen ---
    const token   = lic.licenseToken || null;
    const payload = verifyLicenseToken(token, host);

    if (payload) {
        // Normalfall: Token ist gültig und verifiziert
        const plan      = getPlan(payload.type);
        const now       = new Date();
        const expiresAt = payload.exp ? new Date(payload.exp * 1000) : null;
        const isExpired = expiresAt ? expiresAt < now : false;

        if (isExpired) {
            console.warn(`\u26a0\ufe0f  License token expired at ${expiresAt?.toISOString()}`);
            // Auch bei abgelaufenem Token: Fallback auf letzten bekannten Plan
            const offline = getLastKnownLicense(lic);
            if (offline) return offline;
            return FREE_RESULT({ isExpired: true, status: 'expired', key: payload.license_key || lic.key });
        }

        return {
            key:      payload.license_key || lic.key,
            status:   'active',
            customer: payload.customer_name || lic.customer || 'Unbekannt',
            type:     payload.type     || 'FREE',
            label:    plan.label,
            expiresAt: expiresAt?.toISOString() || null,
            modules:  payload.allowed_modules || plan.modules,
            limits: {
                max_dishes: payload.limits?.max_dishes ?? plan.menu_items,
                max_tables: payload.limits?.max_tables ?? plan.max_tables
            },
            isTrial: false, isExpired: false, trialDaysLeft: 0, plan,
            domain:  payload.domain || null
        };
    }

    // --- Kein gültiges Token: Fallback-Kette ---
    if (lic.key) {
        // Fallback 1: Offline-Fallback mit letztem bekannten Plan
        const offline = getLastKnownLicense(lic);
        if (offline) return offline;

        // Fallback 2: Token dekodieren ohne Signaturprüfung
        if (token) {
            try {
                const decoded = jwt.decode(token);
                if (decoded && decoded.type && decoded.type !== 'FREE') {
                    const plan = getPlan(decoded.type);
                    const now  = new Date();
                    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : null;
                    // Nur nutzen wenn nicht länger als 7 Tage abgelaufen (Toleranz)
                    const tooOld = expiresAt ? (now - expiresAt) > (7 * 24 * 60 * 60 * 1000) : false;
                    if (!tooOld) {
                        console.warn(`\u26a0\ufe0f  [Decode-Fallback] Token nicht verifizierbar – nutze dekodiertes Token (Plan: ${decoded.type})`);
                        return {
                            key:      decoded.license_key || lic.key,
                            status:   'active_unverified',
                            customer: decoded.customer_name || lic.customer || 'Unbekannt',
                            type:     decoded.type,
                            label:    plan.label + ' (nicht verifiziert)',
                            expiresAt: expiresAt?.toISOString() || null,
                            modules:  decoded.allowed_modules || plan.modules,
                            limits: {
                                max_dishes: decoded.limits?.max_dishes ?? plan.menu_items,
                                max_tables: decoded.limits?.max_tables ?? plan.max_tables
                            },
                            isTrial: false, isExpired: false, trialDaysLeft: 0, plan,
                            domain: decoded.domain || null,
                            offline: true
                        };
                    }
                }
            } catch (_) { /* ignore */ }
        }

        console.warn('\u26a0\ufe0f  License key present but no valid fallback available – falling back to FREE.');
    }

    return FREE_RESULT();
};

module.exports = { PLAN_DEFINITIONS, getPlan, getCurrentLicense, verifyLicenseToken, OPA_PUBLIC_KEY };
