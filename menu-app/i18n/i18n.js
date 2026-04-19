window.OpaI18n = (function () {

    const LANGUAGES = {
        de: { code: 'de', label: 'Deutsch',      flag: '🇩🇪', dir: 'ltr' },
        en: { code: 'en', label: 'English',       flag: '🇬🇧', dir: 'ltr' },
        es: { code: 'es', label: 'Español',       flag: '🇪🇸', dir: 'ltr' },
        el: { code: 'el', label: 'Ελληνικά',      flag: '🇬🇷', dir: 'ltr' },
        da: { code: 'da', label: 'Dansk',         flag: '🇩🇰', dir: 'ltr' },
        pl: { code: 'pl', label: 'Polski',        flag: '🇵🇱', dir: 'ltr' },
        pt: { code: 'pt', label: 'Português',     flag: '🇵🇹', dir: 'ltr' },
        it: { code: 'it', label: 'Italiano',      flag: '🇮🇹', dir: 'ltr' },
        nl: { code: 'nl', label: 'Nederlands',    flag: '🇳🇱', dir: 'ltr' },
        fr: { code: 'fr', label: 'Français',      flag: '🇫🇷', dir: 'ltr' },
        tr: { code: 'tr', label: 'Türkçe',        flag: '🇹🇷', dir: 'ltr' },
        ru: { code: 'ru', label: 'Русский',       flag: '🇷🇺', dir: 'ltr' },
        uk: { code: 'uk', label: 'Українська',    flag: '🇺🇦', dir: 'ltr' },
        ar: { code: 'ar', label: 'العربية',       flag: '🇸🇦', dir: 'rtl' },
    };

    let currentLang = 'de';
    let translations = {};

    // Basis-URL automatisch ermitteln (relativ zur i18n.js Datei)
    function getBase() {
        const scripts = document.querySelectorAll('script[src*="i18n.js"]');
        if (scripts.length > 0) {
            const src = scripts[scripts.length - 1].src;
            return src.substring(0, src.lastIndexOf('/') + 1);
        }
        // Fallback: relativ zum aktuellen Dokument + i18n/
        return 'i18n/';
    }

    async function load(code) {
        if (!LANGUAGES[code]) code = 'de';
        const base = getBase();
        try {
            const r = await fetch(`${base}${code}.json`);
            if (!r.ok) throw new Error('not found');
            translations = await r.json();
        } catch {
            if (code !== 'de') {
                try {
                    const r = await fetch(`${base}de.json`);
                    if (r.ok) translations = await r.json();
                } catch { /* silent */ }
                code = 'de';
            }
        }
        currentLang = code;
    }

    function t(key, vars = {}) {
        let str = key.split('.').reduce((o, k) => o?.[k], translations) ?? key;
        Object.entries(vars).forEach(([k, v]) => {
            str = str.replace(`{${k}}`, v);
        });
        return str;
    }

    async function setLanguage(code) {
        await load(code);
        document.documentElement.dir  = LANGUAGES[code]?.dir || 'ltr';
        document.documentElement.lang = code;
        window._opaCurrentLang = code;
        try { localStorage.setItem('opa_lang', code); } catch { /* Safari privat */ }
        applyDOM();
        if (window.OpaRender) window.OpaRender();
        updateLangBtn(code);
        const menu = document.getElementById('lang-dropdown-menu');
        if (menu) menu.innerHTML = renderDropdown();
    }

    function applyDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const val = t(el.dataset.i18n);
            if (el.tagName === 'INPUT') el.placeholder = val;
            else el.textContent = val;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
    }

    function updateLangBtn(code) {
        const btn  = document.getElementById('lang-switcher-btn');
        const lang = LANGUAGES[code];
        if (btn && lang) {
            btn.innerHTML = `${lang.flag} <span>${code.toUpperCase()}</span> <i class="fas fa-chevron-down" style="font-size:.6rem;opacity:.6;"></i>`;
        }
    }

    function renderDropdown() {
        return Object.values(LANGUAGES).map(l => `
            <button class="lang-option ${l.code === currentLang ? 'active' : ''}"
                    onclick="OpaI18n.setLanguage('${l.code}'); document.getElementById('lang-dropdown').classList.remove('open');">
                <span class="lang-flag">${l.flag}</span>
                <span class="lang-label">${l.label}</span>
                ${l.code === currentLang ? '<i class="fas fa-check" style="margin-left:auto;color:var(--gold,#C8A96E);"></i>' : ''}
            </button>`).join('');
    }

    async function init() {
        const saved       = (() => { try { return localStorage.getItem('opa_lang'); } catch { return null; } })();
        const browserLang = navigator.language?.slice(0, 2) || 'de';
        const startLang   = (saved && LANGUAGES[saved]) ? saved
                          : (LANGUAGES[browserLang] ? browserLang : 'de');
        try {
            await load(startLang);
        } catch(e) {
            console.warn('[OpaI18n] Ladefehler:', e);
        }
        applyDOM();
        updateLangBtn(startLang);
        window._opaCurrentLang = startLang;

        // Dropdown sofort befüllen
        const langMenu = document.getElementById('lang-dropdown-menu');
        if (langMenu) langMenu.innerHTML = renderDropdown();

        // Klick außerhalb → Dropdown schließen
        document.addEventListener('click', (e) => {
            const dd  = document.getElementById('lang-dropdown');
            const btn = document.getElementById('lang-switcher-btn');
            if (dd && !dd.contains(e.target) && !btn?.contains(e.target))
                dd.classList.remove('open');
        });
    }

    return { init, t, setLanguage, renderDropdown, getLanguages: () => LANGUAGES, getCurrent: () => currentLang };
})();
