/**
 * OPA-CMS – License Plan Definitions, Token Verification & Helpers
 *
 * Stufe 1: RS256-signierte JWT-Tokens – der Public Key ist hardcoded.
 *          Nur der Lizenzserver (privater Schlüssel) kann gültige Tokens ausstellen.
 * Stufe 2: Domain-Binding – jeder Token enthält die Domain, für die er ausgestellt wurde.
 */

const jwt = require('jsonwebtoken');

// =============================================================================
// RSA-2048 Public Key – muss mit RSA_PUBLIC_KEY in licens-srv_OPA-Santorini/server.jsübereinstimmen!
// Der zugehörige Private Key gehört NUR auf den Lizenzserver (.env RSA_PRIVATE_KEY).
// =============================================================================
const OPA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAutES8Xqif1PpLJU9ClMJ
rGfeCoUVOOni5/WiwGFdTd5ygYyie22fBheBA2fRek6xXDfGtC/QdIg7zbqI/0eQ
V7DCcytIGJSfPRNW4t6cb7oRUVTbo74jia5GUDyJNLJPQDsPVWDvi6rpB+/hv+Uh
rL3UQbHYwoJi/H5R2uwPsd9JaznGoygWhmaWpueXQkxYMRlupUWD1hT+OBSYWBnI
l7NUVsJ8pDOE2u9REwVgBnJEbdA39YnZ2NB4W/5JZPLsM8pkp1QO32THcHixFUvC
N+xMcoOA3fRdAICdI6kI9LccR4hzr7Btf/8Wbk0erF48Xw5NjFj0CZcRIjegiq2m
HQIDAQAB
-----END PUBLIC KEY-----`;

// =============================================================================
// Plan-Definitionen (bleiben als Fallback-Referenz erhalten)
// =============================================================================
const PLAN_DEFINITIONS = {
    FREE: {
        label: 'Free',
        menu_items: 10,
        max_tables: 5,
        modules: {
            menu_edit: true,
            orders_kitchen: false,
            reservations: false,
            custom_design: false,
            analytics: false,
            qr_pay: false
        },
        note: 'Kostenlos zum Testen'
    },
    STARTER: {
        label: 'Starter',
        menu_items: 40,
        max_tables: 10,
        modules: {
            menu_edit: true,
            orders_kitchen: true,
            reservations: true,
            custom_design: false,
            analytics: false,
            qr_pay: false
        },
        note: 'Für kleine Cafés & Imbisse'
    },
    PRO: {
        label: 'Pro',
        menu_items: 100,
        max_tables: 25,
        modules: {
            menu_edit: true,
            orders_kitchen: true,
            reservations: true,
            custom_design: true,
            analytics: false,
            qr_pay: false
        },
        note: 'Für Restaurants'
    },
    PRO_PLUS: {
        label: 'Pro+',
        menu_items: 200,
        max_tables: 50,
        modules: {
            menu_edit: true,
            orders_kitchen: true,
            reservations: true,
            custom_design: true,
            analytics: true,
            qr_pay: false
        },
        note: 'Für große Restaurants'
    },
    ENTERPRISE: {
        label: 'Enterprise',
        menu_items: 500,
        max_tables: 999,
        modules: {
            menu_edit: true,
            orders_kitchen: true,
            reservations: true,
            custom_design: true,
            analytics: true,
            qr_pay: true
        },
        note: 'Für Ketten & Hotels'
    }
};

const getPlan = (type) => PLAN_DEFINITIONS[type] || PLAN_DEFINITIONS['FREE'];
const FREE_RESULT = (extra = {}) => ({
    key: null, status: 'free', customer: 'Testmodus',
    type: 'FREE', label: 'Free',
    expiresAt: null, isTrial: false, isExpired: false, trialDaysLeft: 0,
    modules: PLAN_DEFINITIONS.FREE.modules,
    limits: { max_dishes: PLAN_DEFINITIONS.FREE.menu_items, max_tables: PLAN_DEFINITIONS.FREE.max_tables },
    plan: PLAN_DEFINITIONS.FREE,
    ...extra
});

/**
 * Stufe 1+2: Verifiziert ein signiertes Lizenz-Token (RS256).
 * Gibt das dekodierte Payload zurück oder null bei ungültigem Token.
 */
const verifyLicenseToken = (token, host = null) => {
    if (!token || typeof token !== 'string') return null;
    try {
        const payload = jwt.verify(token, OPA_PUBLIC_KEY, { algorithms: ['RS256'] });

        // Stufe 2: Domain-Binding
        if (payload.domain && host) {
            const normalizeHost = (h) => (h || '').replace(/:\d+$/, '').toLowerCase().trim();
            const tokenDomain  = normalizeHost(payload.domain);
            const currentHost  = normalizeHost(host);
            const isLocal = ['localhost', '127.0.0.1', '::1'].includes(currentHost);
            if (!isLocal && tokenDomain !== currentHost) {
                console.warn(`⚠️  License domain mismatch: token='${tokenDomain}' current='${currentHost}'`);
                return null;
            }
        }
        return payload;
    } catch (e) {
        if (e.name !== 'JsonWebTokenError' && e.name !== 'TokenExpiredError') {
            console.error('❌ License token verification error:', e.message);
        }
        return null;
    }
};

/**
 * Gibt die aktuelle, verifizierte Lizenz zurück.
 * Ohne gültiges signiertes Token → FREE-Limits.
 */
const getCurrentLicense = (DB, host = null) => {
    const settings = DB.getKV('settings', {});
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

    // --- Vollizenz: signiertes JWT pflicht ---
    const token   = lic.licenseToken || null;
    const payload = verifyLicenseToken(token, host);

    if (!payload) {
        if (lic.key) {
            console.warn('⚠️  License key present but token invalid or missing – falling back to FREE.');
        }
        return FREE_RESULT();
    }

    const plan      = getPlan(payload.type);
    const now       = new Date();
    const expiresAt = payload.exp ? new Date(payload.exp * 1000) : null;
    const isExpired = expiresAt ? expiresAt < now : false;

    if (isExpired) {
        console.warn(`⚠️  License token expired at ${expiresAt?.toISOString()}`);
        return FREE_RESULT({ isExpired: true, status: 'expired', key: payload.key });
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
};

module.exports = { PLAN_DEFINITIONS, getPlan, getCurrentLicense, verifyLicenseToken, OPA_PUBLIC_KEY };
