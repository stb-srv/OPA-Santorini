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

    function safeLsGet(key, fallback = 'de') {
        try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
    }
    function safeLsSet(key, val) {
        try { localStorage.setItem(key, val); } catch { /* sandboxed iframe safety */ }
    }

    // Basis-URL automatisch ermitteln (relativ zur i18n.js Datei)
    function getBase() {
        const scripts = document.querySelectorAll('script[src*="i18n.js"]');
        if (scripts.length > 0) {
            const src = scripts[scripts.length - 1].src;
            return src.substring(0, src.lastIndexOf('/') + 1);
        }
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

    function setDropdownOpen(open) {
        const dd = document.getElementById('lang-dropdown');
        const backdrop = document.getElementById('lang-backdrop');
        if (!dd) return;
        if (open) {
            dd.classList.add('open');
            if (window.innerWidth <= 768) {
                if (backdrop) backdrop.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        } else {
            dd.classList.remove('open');
            if (backdrop) backdrop.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    function t(key, vars = {}) {
        let str = key.split('.').reduce((o, k) => o?.[k], translations) ?? key;
        Object.entries(vars).forEach(([k, v]) => {
            str = str.replace(`{${k}}`, v);
        });
        return str;
    }

    async function setLang(code) {
        await load(code);
        document.documentElement.dir  = LANGUAGES[code]?.dir || 'ltr';
        document.documentElement.lang = code;
        window._opaCurrentLang = code;
        
        safeLsSet('opa_lang', code);
        applyTranslations();
        
        if (window.OpaRender) window.OpaRender();
        updateLangBtn(code);
        
        const menu = document.getElementById('lang-dropdown-menu');
        if (menu) {
            menu.innerHTML = renderDropdown();
            attachLangOptionListeners();
        }
        setDropdownOpen(false);
    }

    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const val = t(el.dataset.i18n);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = val;
            } else {
                // Icons erhalten
                const icon = el.querySelector('i');
                if (icon) {
                    el.childNodes.forEach(node => {
                        if (node.nodeType === 3) node.textContent = val;
                    });
                } else {
                    el.textContent = val;
                }
            }
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
        const handle = '<div class="lang-sheet-handle"></div>';
        const options = Object.values(LANGUAGES).map(l => `
            <button class="lang-option ${l.code === currentLang ? 'active' : ''}"
                    data-lang="${l.code}"
                    type="button">
                <span class="lang-flag">${l.flag}</span>
                <span class="lang-label">${l.label}</span>
                ${l.code === currentLang ? '<i class="fas fa-check" style="margin-left:auto;color:var(--gold,#C8A96E);"></i>' : ''}
            </button>`).join('');
        return handle + options;
    }

    function attachLangOptionListeners() {
        const menu = document.getElementById('lang-dropdown-menu');
        if (!menu) return;
        menu.querySelectorAll('.lang-option[data-lang]').forEach(btn => {
            // Remove any existing listeners by replacing the node
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);
            
            let touchHandled = false;
            
            clone.addEventListener('touchend', (e) => {
                e.preventDefault();        // prevent ghost click
                e.stopPropagation();       // don't bubble to document
                touchHandled = true;
                const code = clone.dataset.lang;
                OpaI18n.setLang(code);     // setLang handles closing
            }, { passive: false });
            
            clone.addEventListener('click', (e) => {
                e.stopPropagation();
                if (touchHandled) { touchHandled = false; return; } // already handled
                const code = clone.dataset.lang;
                OpaI18n.setLang(code);
            });
        });
    }

    async function init() {
        const saved = safeLsGet('opa_lang', null);
        const browserLang = navigator.language?.slice(0, 2) || 'de';
        const startLang   = (saved && LANGUAGES[saved]) ? saved
                          : (LANGUAGES[browserLang] ? browserLang : 'de');
        try {
            await load(startLang);
        } catch(e) {
            console.warn('[OpaI18n] Ladefehler:', e);
        }
        
        applyTranslations();
        updateLangBtn(startLang);
        window._opaCurrentLang = startLang;

        const langMenu = document.getElementById('lang-dropdown-menu');
        if (langMenu) {
            langMenu.innerHTML = renderDropdown();
            attachLangOptionListeners();
        }

        document.addEventListener('click', (e) => {
            const dd  = document.getElementById('lang-dropdown');
            const menu = document.getElementById('lang-dropdown-menu');
            if (!dd || !dd.classList.contains('open')) return;
            // Don't close if clicking the button itself or inside the menu
            if (dd.contains(e.target) || (menu && menu.contains(e.target))) return;
            setDropdownOpen(false);
        });

        // Create backdrop for mobile bottom sheet
        let backdrop = document.getElementById('lang-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'lang-backdrop';
            backdrop.className = 'lang-backdrop';
            backdrop.addEventListener('click', () => {
                setDropdownOpen(false);
            });
            document.body.appendChild(backdrop);
        }
    }

    return { init, t, setLang, applyTranslations, renderDropdown, setDropdownOpen, attachLangOptionListeners, getLanguages: () => LANGUAGES, getCurrent: () => currentLang };
})();
