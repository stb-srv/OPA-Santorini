document.addEventListener('DOMContentLoaded', async () => {
    const API = '/api';
    let homeData = {};
    let menuItems = [];
    const SEARCH_ALIASES = {
        'nudeln':      ['penne', 'pasta', 'spaghetti', 'linguine', 'tagliatelle', 'rigatoni'],
        'pasta':       ['penne', 'spaghetti', 'nudeln', 'linguine'],
        'hähnchen':    ['chicken', 'poulet', 'huhn', 'hühnchen'],
        'chicken':     ['hähnchen', 'huhn', 'hühnchen'],
        'pommes':      ['frites', 'fritten', 'pommes frites'],
        'steak':       ['beef', 'rind', 'rindfleisch', 'entrecote'],
        'lachs':       ['salmon', 'salm'],
        'garnelen':    ['shrimps', 'prawns', 'scampi', 'gambas'],
        'lamm':        ['lammfleisch', 'lamb'],
        'schweinfleisch': ['schwein', 'pork'],
        'veggie':      ['vegetarisch', 'vegan', 'ohne fleisch'],
        'scharf':      ['spicy', 'pikant', 'hot'],
        'suppe':       ['soup', 'brühe', 'eintopf'],
        'salat':       ['salad', 'blattsalat'],
        'dessert':     ['nachspeise', 'nachtisch', 'süßspeise', 'eis'],
        'käse':        ['cheese', 'feta', 'halloumi'],
    };
    let currentView = 'home';

    // --- Plugin Registry ---
    const PLUGIN_HOOKS = { onInit: [], onTabSwitch: [] };
    window.Website = {
        onInit: (cb) => PLUGIN_HOOKS.onInit.push(cb),
        onTabSwitch: (cb) => PLUGIN_HOOKS.onTabSwitch.push(cb),
        injectHTML: (sel, html) => {
            const el = document.querySelector(sel);
            if (el) el.insertAdjacentHTML('beforeend', html);
        },
        get: (r) => get(r)
    };

    // --- Smart Reservations ---
    async function checkLiveAvailability() {
        const guests = window.resGuests || 2;
        const date = window.resDate;
        const areaId = window.resAreaId;
        if (!date || !areaId) return;

        const dayKey = ['So','Mo','Di','Mi','Do','Fr','Sa'][new Date(date).getDay()];
        const oh = homeData.openingHours?.[dayKey];
        if (!oh || oh.closed) {
            document.getElementById('res-time-grid').innerHTML = '<p style="text-align:center; padding:40px; color:#ef4444;">Wir haben an diesem Tag Ruhetag.</p>';
            return;
        }

        const start = oh.open || "17:00";
        const end = oh.close || "22:00";
        const interval = homeData.resInterval || 0.5;
        let times = [];
        let curr = new Date(2000, 0, 1, ...start.split(':').map(Number));
        const endD = new Date(2000, 0, 1, ...end.split(':').map(Number));
        while (curr <= endD) {
            times.push(curr.getHours().toString().padStart(2,'0') + ':' + curr.getMinutes().toString().padStart(2,'0'));
            curr.setMinutes(curr.getMinutes() + (interval * 60));
        }

        try {
            const r = await fetch(`${API}/reservations/availability-grid`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, guests, areaId, times })
            });
            const res = await r.json();
            if (res.success) renderTimeGrid(res.grid);
        } catch (e) { console.error("Grid update failed:", e); }
    }

    // --- API ---
    async function get(r) { try { return await (await fetch(`${API}/${r}`)).json(); } catch { return null; } }

    // --- SCROLL EFFECT ---
    const nav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 50));

    // --- INIT ---
    async function init() {
        // i18n zuerst initialisieren, damit Branding-Texte übersetzt werden können
        if (window.OpaI18n) {
            await OpaI18n.init();
        }

        const hp = await get('homepage');
        if (hp) {
            homeData = hp;
            applyBranding(hp);
            renderNav(hp.tabs, hp.activeModules, hp.pages);
            initConsentEngine(hp.cookieBanner);

            if (hp.activeModules?.reservations === false) {
                const resV = document.getElementById('view-reservations');
                if (resV) {
                    const br = await get('branding');
                    const phoneSuffix = br?.phone ? `<br><br><a href="tel:${br.phone}" class="btn-premium" style="display:inline-block; text-decoration:none; margin-top:10px;"><i class="fas fa-phone-alt"></i> ${br.phone}</a>` : '';
                    resV.innerHTML = `
                        <div class="container" style="max-width:600px; padding:60px 20px; text-align:center;">
                            <div class="glass-panel" style="padding:40px; border-radius:24px;">
                                <div style="width:60px;height:60px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;margin:0 auto 20px;font-size:1.5rem;"><i class="fas fa-info-circle"></i></div>
                                <h2 style="margin-bottom:15px;">Reservierung</h2>
                                <p style="font-size:1.1rem; line-height:1.6; opacity:.8;">${hp.activeModules.resDisabledText || 'Aktuell sind keine Online-Reservierungen möglich. Bitte kontaktieren Sie uns direkt.'}${phoneSuffix}</p>
                            </div>
                        </div>`;
                }
            }

            const br = await get('branding');
            if (br) {
                const restaurantName = br.name || 'OPA! Santorini';
                document.title = restaurantName;

                // Meta Description
                let metaDesc = document.querySelector('meta[name="description"]');
                if (!metaDesc) {
                    metaDesc = document.createElement('meta');
                    metaDesc.name = 'description';
                    document.head.appendChild(metaDesc);
                }
                const descText = hp.welcomeText
                    ? hp.welcomeText.slice(0, 155) + (hp.welcomeText.length > 155 ? '…' : '')
                    : `Willkommen im ${restaurantName}. Speisekarte, Reservierungen und mehr.`;
                metaDesc.content = descText;

                // Open Graph Tags (für Social Sharing / WhatsApp / Facebook)
                const ogTags = {
                    'og:title':       restaurantName,
                    'og:description': descText,
                    'og:type':        'restaurant.restaurant',
                    'og:image':       hp.bgImage || '',
                };
                Object.entries(ogTags).forEach(([prop, content]) => {
                    if (!content) return;
                    let tag = document.querySelector(`meta[property="${prop}"]`);
                    if (!tag) {
                        tag = document.createElement('meta');
                        tag.setAttribute('property', prop);
                        document.head.appendChild(tag);
                    }
                    tag.content = content;
                });
                const footerNameEl = document.getElementById('footer-name');
                if (footerNameEl) footerNameEl.textContent = restaurantName;
                const navLogoEl = document.getElementById('nav-logo');
                if (navLogoEl) navLogoEl.textContent = restaurantName;

                const footerSlogan = document.getElementById('footer-slogan');
                if (footerSlogan && br?.slogan) footerSlogan.textContent = br.slogan;

                if (br.favicon) {
                    let link = document.querySelector("link[rel~='icon']");
                    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
                    link.href = br.favicon;
                }
            }

            if (hp.location) renderLocationArea(hp.location, (await get('branding'))?.name);
            checkVacationStatus(hp.vacation);
            checkHolidayStatus(hp.holiday);
            if (hp.openingHours) renderOpeningHoursTable(hp.openingHours);
        }

        window.toast = (m) => {
            const d = document.createElement('div');
            d.className = 'toast';
            d.textContent = m;
            document.body.appendChild(d);
            setTimeout(() => d.classList.add('active'), 50);
            setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 800); }, 4000);
        };

        showMenuSkeleton(8);

        const m = await get('menu');
        const cats = await get('categories');
        if (cats && Array.isArray(cats)) { window.OPA_CATEGORIES = cats; }

        if (m && Array.isArray(m)) {
            menuItems = m;
            renderCategories();
            applyMenuFilter();
        } else {
            const list = document.getElementById('menu-list');
            if (list) list.innerHTML = '<p style="text-align:center;padding:40px;opacity:.5;">Speisekarte konnte nicht geladen werden.</p>';
        }

        document.getElementById('footer-year').textContent = new Date().getFullYear();

        const resForm = document.getElementById('res-form');
        if (resForm) {
            resForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const rawTime = document.getElementById('res-time')?.value.replace(' Uhr', '') || '';
                const data = {
                    name: document.getElementById('res-name').value,
                    email: document.getElementById('res-email').value,
                    phone: document.getElementById('res-phone').value,
                    date: document.getElementById('res-date')?.value || window.resDate,
                    time: rawTime || window.resTime,
                    guests: document.getElementById('res-guests').value,
                    note: document.getElementById('res-note').value
                };
                try {
                    const r = await fetch(`${API}/reservations/submit`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    const res = await r.json();
                    if (res.success) {
                        toast(OpaI18n.t('reservations.success'));
                        resForm.reset();
                        checkLiveAvailability();
                    } else {
                        toast(res.reason || OpaI18n.t('reservations.error'));
                    }
                } catch (err) { toast(OpaI18n.t('reservations.error')); }
            });
        }

        ['res-date', 'res-time', 'res-guests'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', checkLiveAvailability);
                el.addEventListener('input', checkLiveAvailability);
            }
        });

        // Opening Hours Widget: außerhalb klicken → schließen
        document.addEventListener('click', (e) => {
            const widget = document.getElementById('oh-widget');
            const panel  = document.getElementById('oh-panel');
            const btn    = document.getElementById('oh-toggle-btn');
            if (!widget || !panel) return;
            if (panel.style.display === 'none') return;
            // Wenn Klick außerhalb des Widgets
            if (!widget.contains(e.target)) {
                panel.style.display = 'none';
                if (btn) btn.style.display = 'flex';
            }
        });


        // Beim Laden: Hash aus URL auslesen und Tab wiederherstellen
        const hashOnLoad = window.location.hash?.replace('#', '').trim();
        if (hashOnLoad && hashOnLoad !== 'home') {
            // Kurze Verzögerung damit alle Views korrekt initialisiert sind
            setTimeout(() => window.switchTab(hashOnLoad), 100);
        }

        // Browser Back/Forward (popstate) unterstützen
        window.addEventListener('popstate', () => {
            const hash = window.location.hash?.replace('#', '').trim();
            window.switchTab(hash || 'home');
        });
    }

    // --- BRANDING ---
    function applyBranding(d) {
        window.OPA_DAILY_SPECIALS_ENABLED = d.dailySpecialsEnabled !== false;
        if (d.heroTitle) document.getElementById('hero-title').textContent = d.heroTitle;
        if (d.heroSlogan) document.getElementById('hero-slogan').textContent = d.heroSlogan;
        if (d.bgImage) {
            document.getElementById('hero-bg').style.backgroundImage = `url('${d.bgImage}')`;

            // Hero-Bild Preload für LCP-Performance
            let preload = document.querySelector('link[rel="preload"][as="image"]');
            if (!preload) {
                preload = document.createElement('link');
                preload.rel = 'preload';
                preload.as  = 'image';
                document.head.appendChild(preload);
            }
            preload.href = d.bgImage;
        } else {
            document.getElementById('hero-bg').style.backgroundImage = `url('/admin/assets/santorini_bg.png')`;
        }
        if (d.welcomeTitle) document.getElementById('welcome-title').textContent = d.welcomeTitle;
        if (d.welcomeText) document.getElementById('welcome-text').textContent = d.welcomeText;
        if (d.promotionText && d.promotionEnabled !== false) document.getElementById('promo-text').textContent = d.promotionText;
        const promo = document.getElementById('promo-section');
        if (promo && d.promotionEnabled === false) promo.style.display = 'none';
        const wImg = document.getElementById('welcome-img');
        if (d.welcomeImage && wImg) { wImg.src = d.welcomeImage; wImg.style.display = 'block'; }
        else if (wImg) { wImg.src = d.bgImage || '/admin/assets/greek_bg.png'; }

        // Öffnungszeiten-Widget befüllen
        if (d.openingHours) {
            const days = ['Mo','Di','Mi','Do','Fr','Sa','So'];
            const todayKey = ['So','Mo','Di','Mi','Do','Fr','Sa'][new Date().getDay()];
            const now = new Date();
            const nowMins = now.getHours() * 60 + now.getMinutes();

            const rows = document.getElementById('oh-rows');
            const badge = document.getElementById('oh-status-badge');
            if (rows) {
                rows.innerHTML = days.map(day => {
                    const entry = d.openingHours[day] || { closed: true };
                    const isToday = day === todayKey;
                    
                    const dayLabel = window.OpaI18n ? OpaI18n.t(`opening_hours.days.${day}`) : day;
                    const ruhetag  = window.OpaI18n ? OpaI18n.t('opening_hours.ruhetag') : 'Ruhetag';
                    const uhr      = window.OpaI18n ? OpaI18n.t('opening_hours.uhr') : 'Uhr';
                    const todayLbl = window.OpaI18n ? OpaI18n.t('opening_hours.today') : 'Heute';

                    const timeStr = entry.closed ? ruhetag : `${entry.open} – ${entry.close} ${uhr}`.trim();
                    const todayBadge = isToday ? ` <span style="font-size:.65rem; background:var(--gold,#C8A96E); color:#fff; padding:1px 6px; border-radius:10px; margin-left:4px;">${todayLbl}</span>` : '';

                    return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 18px; ${isToday ? 'background:rgba(27,58,92,0.05); font-weight:700;' : ''}">
                        <span style="font-size:.82rem; ${isToday ? 'color:var(--blue,#1B3A5C);' : 'color:#555;'}">${dayLabel}${todayBadge}</span>
                        <span style="font-size:.8rem; ${entry.closed ? 'color:#aaa;' : 'color:#333;'}">${timeStr}</span>
                    </div>`;
                }).join('');
            }

            // Status-Badge: Offen / Schließt bald / Geschlossen
            if (badge) {
                const todayEntry = d.openingHours[todayKey];
                if (!todayEntry || todayEntry.closed) {
                    badge.textContent = window.OpaI18n ? OpaI18n.t('opening_hours.closed_today') : 'Heute geschlossen';
                    badge.style.opacity = '.7';
                } else {
                    const [oh, om] = todayEntry.open.split(':').map(Number);
                    const [ch, cm] = todayEntry.close.split(':').map(Number);
                    const openMins  = oh * 60 + om;
                    const closeMins = ch * 60 + cm;
                    if (nowMins >= openMins && nowMins < closeMins) {
                        if (closeMins - nowMins <= 60) {
                            badge.textContent = OpaI18n ? OpaI18n.t('opening_hours.closes_soon', { time: todayEntry.close }) : `Schließt ${todayEntry.close} Uhr`;
                            badge.style.background = '#f59e0b';
                        } else {
                            badge.textContent = OpaI18n ? OpaI18n.t('opening_hours.open_until', { time: todayEntry.close }) : `Geöffnet bis ${todayEntry.close}`;
                            badge.style.background = 'var(--primary)';
                        }
                        badge.style.opacity = '1';
                    } else {
                        badge.textContent = nowMins < openMins
                            ? (OpaI18n ? OpaI18n.t('opening_hours.opens_at', { time: todayEntry.open }) : `Öffnet ${todayEntry.open} Uhr`)
                            : (OpaI18n ? OpaI18n.t('opening_hours.closed_today') : 'Heute geschlossen');
                        badge.style.opacity = '.7';
                        badge.style.background = 'var(--primary)';
                    }
                }
            }
        }
    }

    // --- NAVIGATION ---
    function renderNav(tabs, modules = {}, pages = []) {
        const c = document.getElementById('nav-links');
        if (!c) return;
        if (!tabs || tabs.length === 0) {
            tabs = [
                { id: 'home', label: 'Startseite', active: true },
                { id: 'menu', label: 'Speisekarte', active: true },
                { id: 'reservations', label: 'Reservierung', active: true },
                { id: 'location', label: 'Standort', active: true }
            ];
        }
        let active = tabs.filter(t => t.active);
        if (modules.reservations === false) active = active.filter(t => t.id !== 'reservations');
        if (pages && Array.isArray(pages)) {
            pages.forEach(p => {
                if (p.active !== false) active.push({ id: `custom-${p.id}`, label: p.title, active: true });
            });
        }
        
        const TAB_I18N = { home: 'nav.home', menu: 'nav.menu', reservations: 'nav.reservations', location: 'nav.location' };

        c.innerHTML = active.map(t => {
            const i18nKey = TAB_I18N[t.id] || '';
            const i18nAttr = i18nKey ? `data-i18n="${i18nKey}"` : '';
            return `<a data-tab="${t.id}" onclick="window.switchTab('${t.id}')" ${i18nAttr}>${t.label}</a>`;
        }).join('');

        const drawer = document.getElementById('nav-mobile-drawer');
        if (drawer) {
            drawer.innerHTML = active.map(t => {
                const i18nKey = TAB_I18N[t.id] || '';
                const i18nAttr = i18nKey ? `data-i18n="${i18nKey}"` : '';
                return `<a data-tab="${t.id}" onclick="window.switchTab('${t.id}'); window.closeMobileNav();" ${i18nAttr}>${t.label}</a>`;
            }).join('');
        }
    }

    // --- MENU ---
    let activeCat = 'all';
    let searchQuery = '';
    const favSet = new Set();

    // Kachel-Klick-Modus: wird aus homeData.cartClickMode gelesen
    // Mögliche Werte: 'button' (nur +), 'tile' (nur Kachel), 'both' (beides)
    // FIX: Default auf 'tile' – kein + Button mehr vorhanden
    window.OPA_CART_CLICK_MODE = 'tile';

    function showMenuSkeleton(count = 6) {
        // Kategorie-Skeleton
        const catEl = document.getElementById('categories');
        if (catEl) {
            catEl.innerHTML = Array(5).fill(0).map(() =>
                `<button class="cat-btn cat-btn--skeleton skeleton"></button>`
            ).join('');
        }

        // Karten-Skeleton
        const list = document.getElementById('menu-list');
        if (!list) return;
        list.innerHTML = Array(count).fill(0).map(() => `
            <div class="dish-card dish-card--skeleton">
                <div class="dish-card-img"></div>
                <div class="dish-card-body">
                    <span class="skel-line skel-title skeleton"></span>
                    <span class="skel-line skel-desc skeleton"></span>
                    <span class="skel-line skel-desc2 skeleton"></span>
                    <span class="skel-line skel-price skeleton"></span>
                </div>
            </div>
        `).join('');
    }

    function renderCategories() {
        const c = document.getElementById('categories');
        if (!c) return;
        const dbCats = window.OPA_CATEGORIES || [];

        // "Alle"-Button immer zuerst
        const allBtn = `<button class="cat-btn active" onclick="window.filterMenu('Alle', this)" data-i18n="menu.all_categories">
            <i class="fas fa-th-large"></i> ${window.OpaI18n ? OpaI18n.t('menu.all_categories') : 'Alle'}
        </button>`;

        // Nur Kategorien anzeigen die aktiv sind UND mindestens ein aktives+verfügbares Gericht haben
        const usedCats = new Set(
            menuItems
                .filter(i => i.active !== false && i.available !== false)
                .map(i => i.cat)
        );

        const catBtns = dbCats
            .filter(cat => cat.active !== false && usedCats.has(cat.label))
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map(cat => {
                const iconHtml = cat.icon ? `<i class="${cat.icon}"></i> ` : '';
                const { label: catLabel } = getCategoryTranslation(cat);
                return `<button class="cat-btn" onclick="window.filterMenu('${cat.label}', this)">
                    ${iconHtml}${catLabel}
                </button>`;
            }).join('');

        let specialBtn = '';
        if (window.OPA_DAILY_SPECIALS_ENABLED) {
            const hasSpecials = menuItems.some(i => i.is_daily_special && i.active !== false && i.available !== false);
            if (hasSpecials) {
                const label = window.OpaI18n ? OpaI18n.t('menu.daily_specials').replace('⭐ ','') : 'Tagesspecials';
                specialBtn = `<button class="cat-btn cat-btn--special" onclick="window.filterMenu('__special__', this)" data-i18n="menu.daily_specials">
                    ⭐ ${label}
                </button>`;
            }
        }

        c.innerHTML = allBtn + specialBtn + catBtns;

        const searchInput = document.getElementById('menu-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.toLowerCase().trim();
                applyMenuFilter();
            });
        }
    }

    window.filterMenu = (cat, btn) => {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCat = cat === 'Alle' ? 'all' : cat;
        applyMenuFilter();
    };

    window.toggleFav = (id, btn) => {
        if (favSet.has(id)) {
            favSet.delete(id);
            btn.classList.remove('active');
            btn.textContent = '🤍';
        } else {
            favSet.add(id);
            btn.classList.add('active');
            btn.textContent = '❤️';
        }
        // Favoriten-Tab in Kategorien aktualisieren
        updateFavCatBtn();
    };

    function updateFavCatBtn() {
        const catBar = document.getElementById('categories');
        if (!catBar) return;
        let favBtn = catBar.querySelector('.cat-btn--fav');
        if (favSet.size > 0 && !favBtn) {
            favBtn = document.createElement('button');
            favBtn.className = 'cat-btn cat-btn--fav';
            favBtn.setAttribute('data-i18n', 'menu.favorites');
            const label = window.OpaI18n ? OpaI18n.t('menu.favorites').replace('❤️ ','') : 'Favoriten';
            favBtn.innerHTML = `❤️ ${label} (${favSet.size})`;
            favBtn.onclick = function() { window.filterMenu('__fav__', this); };
            catBar.appendChild(favBtn);
        } else if (favBtn) {
            if (favSet.size === 0) favBtn.remove();
            else {
                const label = window.OpaI18n ? OpaI18n.t('menu.favorites').replace('❤️ ','') : 'Favoriten';
                favBtn.innerHTML = `❤️ ${label} (${favSet.size})`;
            }
        }
    }

    function applyMenuFilter() {
        // Nur aktive UND verfügbare Gerichte anzeigen
        let items = menuItems.filter(i => i.active !== false && i.available !== false);
        if (activeCat === '__special__') {
            items = items.filter(i => i.is_daily_special);
        } else if (activeCat !== 'all' && activeCat !== '__fav__') {
            items = items.filter(i => i.cat === activeCat);
        }
        if (searchQuery) {
            // Erweiterte Suchbegriffe durch Aliase
            const searchTerms = [searchQuery];
            Object.entries(SEARCH_ALIASES).forEach(([alias, targets]) => {
                if (alias.includes(searchQuery) || searchQuery.includes(alias)) {
                    searchTerms.push(...targets);
                }
                targets.forEach(t => {
                    if (t.includes(searchQuery) || searchQuery.includes(t)) {
                        searchTerms.push(alias, ...targets);
                    }
                });
            });
            const uniqueTerms = [...new Set(searchTerms)];

            items = items.filter(i => {
                const name = i.name.toLowerCase();
                const desc = (i.desc || '').toLowerCase();
                const aliases = (i.aliases || []).map(a => a.toLowerCase()); // aus DB
                return uniqueTerms.some(term =>
                    name.includes(term) || desc.includes(term) ||
                    aliases.some(a => a.includes(term) || term.includes(a))
                );
            });
        }
        if (activeCat === '__fav__') {
            items = items.filter(i => favSet.has(String(i.id || i.name)));
        }
        renderMenu(items);
    }

    function getItemTranslation(item) {
        const lang = window._opaCurrentLang || 'de';
        if (lang === 'de') return { name: item.name, desc: item.desc };
        const tr = item.translations?.[lang];
        return {
            name: tr?.name || item.name,
            desc: tr?.desc || item.desc
        };
    }

    function getCategoryTranslation(cat) {
        const lang = window._opaCurrentLang || 'de';
        if (lang === 'de' || !cat.translations) return { label: cat.label };
        const tr = cat.translations[lang];
        if (!tr) return { label: cat.label };
        // Unterstützt sowohl einfaches String-Format als auch Objekt-Format
        return {
            label: typeof tr === 'string' ? tr : (tr.label || cat.label)
        };
    }

    function renderMenu(items) {
        const list = document.getElementById('menu-list');
        const empty = document.getElementById('menu-empty');
        if (!list) return;

        if (items.length === 0) {
            list.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';

        // Kachel-Klick-Modus aus homeData laden (Fallback: 'tile')
        const clickMode = homeData.cartClickMode || 'tile';
        window.OPA_CART_CLICK_MODE = clickMode;

        // tile / both: Kachel bekommt cursor:pointer + data-cart-tile Marker
        const tileClickable = (clickMode === 'tile' || clickMode === 'both');

        list.innerHTML = items.map(item => {
            const id    = String(item.id || item._id || item.name);
            const { name: itemName, desc: itemDesc } = getItemTranslation(item);
            const price = parseFloat(item.price).toFixed(2);
            const allergenBadges = (item.allergens || []).length
                ? `<span class="dish-badges">${item.allergens.map(a => `<span class="badge">${a}</span>`).join('')}</span>` : '';
            const numberBadge = item.number
                ? `<span class="dish-number">${item.number}. </span>` : '';
            return `
            <div class="dish-card${tileClickable ? ' dish-card--clickable' : ''}"
                 data-menu-item="${id}"
                 data-item-name="${item.name.replace(/"/g, '&quot;')}"
                 data-item-price="${price}"
                 ${tileClickable ? 'data-cart-tile="1"' : ''}>
                <div class="dish-card-img">
                    ${(item.is_daily_special && window.OPA_DAILY_SPECIALS_ENABLED) ? `<span class="daily-special-badge" data-i18n="menu.today_badge">⭐ ${window.OpaI18n ? OpaI18n.t('menu.today_badge') : 'Heute'}</span>` : ''}
                    ${item.image
                        ? `<img src="${item.image}" alt="${itemName}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <span style="display:none"><i class="fas fa-utensils"></i> ${item.cat}</span>`
                        : `<span><i class="fas fa-utensils"></i> ${item.cat}</span>`
                    }
                </div>
                <div class="dish-card-body">
                    <span class="cat-tag">${item.cat}</span>
                    <h3 data-item-name>${numberBadge}${itemName}</h3>
                    ${itemDesc ? `<p class="dish-desc">${itemDesc}</p>` : ''}
                    <div class="dish-card-footer">
                        <span class="dish-price">${price} €</span>
                        ${allergenBadges}
                        ${tileClickable ? `<span class="dish-card-add-hint" data-i18n="menu.add_to_cart">${OpaI18n ? OpaI18n.t('menu.add_to_cart') : '+ Hinzufügen'}</span>` : ''}
                    </div>
                </div>
                <button class="fav-btn ${favSet.has(id) ? 'active' : ''}" 
                         data-fav-id="${id}"
                         onclick="event.stopPropagation(); window.toggleFav('${id}', this)"
                         aria-label="Zu Favoriten hinzufügen">
                    ${favSet.has(id) ? '❤️' : '🤍'}
                </button>
            </div>`;
        }).join('');

        // FIX: injectAddButtons() nach renderMenu() aufrufen damit der
        // korrekte Modus sofort greift und nicht auf den MutationObserver
        // gewartet werden muss (Race Condition).
        if (window.OpaCart) {
            // cart.js ist bereits geladen → direkt injizieren
            if (typeof window._opaInjectAddButtons === 'function') {
                window._opaInjectAddButtons();
            }
        }
    }

    // --- COOKIE CONSENT ENGINE ---
    function initConsentEngine(cfg) {
        if (!cfg?.enabled) {
            const banner  = document.getElementById('cookie-banner');
            const trigger = document.getElementById('cookie-settings-trigger');
            if (banner)  banner.style.display  = 'none';
            if (trigger) trigger.style.display = 'none';
        }
    }

    // --- VIEW SWITCHING ---
    window.switchTab = (id) => {
        window.closeMobileNav();
        // Warenkorb-Drawer schließen falls offen
        if (window.OpaCart) window.OpaCart.close();

        ['view-home', 'view-menu', 'view-reservations', 'view-legal', 'view-location', 'view-custom'].forEach(v => {
            const el = document.getElementById(v);
            if (el) el.style.display = 'none';
        });
        const hero = document.getElementById('hero-section');
        if (hero) hero.style.display = (id === 'home') ? 'flex' : 'none';
        const promo = document.getElementById('promo-section');
        if (promo) promo.style.display = (id === 'home') ? 'block' : 'none';

        let targetId = `view-${id}`;
        if (id.startsWith('custom-')) { targetId = 'view-custom'; renderCustomPage(id); }

        const target = document.getElementById(targetId);
        if (target) {
            target.style.display = 'block';
            if (id === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
            else setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }

        if (id === 'legal') window.setLegalView('impressum');
        currentView = id;

        document.querySelectorAll('#nav-links a').forEach(a => {
            a.classList.toggle('active', a.dataset.tab === id);
        });

        // URL-Hash aktualisieren (für F5-Reload)
        const newHash = id === 'home' ? '' : '#' + id;
        if (window.location.hash !== newHash) {
            history.replaceState(null, '', newHash || window.location.pathname);
        }

        window.scrollTo({ top: id === 'home' ? 0 : document.getElementById('main-nav').offsetHeight, behavior: 'smooth' });
    };

    function renderCustomPage(id) {
        const rawId = id.replace('custom-', '');
        const p = homeData.pages?.find(pg => pg.id === rawId || pg.id === id);
        const c = document.getElementById('custom-page-container');
        if (!p || !c) return;

        // Header (Bild + Titel)
        const hasImg = p.image && p.image.trim() !== '';
        let headerHtml = hasImg ? `
            <div style="height:320px; position:relative; overflow:hidden;">
                <img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">
                <div style="position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 60%);"></div>
                <div style="position:absolute; bottom:30px; left:40px; right:40px; color:#fff;">
                    <span class="badge" style="background:var(--primary); margin-bottom:12px;">INFO</span>
                    <h2 style="font-size:2.5rem; color:#fff; margin:0; line-height:1.2;">${p.headline || p.title}</h2>
                </div>
            </div>` : `
            <div style="padding:60px 40px; text-align:center; border-bottom:1px solid rgba(0,0,0,.05);">
                <span class="badge" style="background:var(--primary); margin-bottom:15px; display:inline-block;">INFORMATION</span>
                <h2 style="font-size:2.8rem; margin:0; line-height:1.1;">${p.headline || p.title}</h2>
            </div>`;

        // Content: JSON Blocks oder plain text
        let contentHtml = '';
        try {
            const parsed = JSON.parse(p.content || '');
            if (parsed.version === 1 && Array.isArray(parsed.blocks)) {
                contentHtml = parsed.blocks.map(renderBlock).join('');
            } else { throw new Error('legacy'); }
        } catch {
            // Rückwärtskompatibilität: plain text
            contentHtml = `<p style="font-size:1.15rem; line-height:1.8; opacity:.9;">${p.content || ''}</p>`;
        }

        c.innerHTML = `
            <div class="glass-panel" style="padding:0; border-radius:32px; overflow:hidden; border:1px solid rgba(255,255,255,.2);">
                ${headerHtml}
                <div style="padding:50px 40px; max-width:850px; margin:0 auto; text-align:left;">
                    ${contentHtml}
                </div>
            </div>`;

        // Slider initialisieren
        initPageSliders(c);
    }

    function renderBlock(block) {
        switch (block.type) {
            case 'text':
                return `
                    <div style="margin-bottom:36px;">
                        ${block.heading ? `<h3 style="font-size:1.6rem; margin-bottom:12px; color:var(--primary); line-height:1.2;">${block.heading}</h3>` : ''}
                        ${block.text ? `<p style="font-size:1.1rem; line-height:1.8; opacity:.9; white-space:pre-wrap;">${block.text}</p>` : ''}
                    </div>`;
            case 'image':
                return `
                    <div style="margin-bottom:36px; ${block.align === 'center' ? 'text-align:center;' : ''}">
                        <img src="${block.url}" alt="${block.caption || ''}"
                             style="max-width:100%; border-radius:16px; ${block.align === 'center' ? 'display:inline-block;' : 'width:100%; height:auto; object-fit:cover;'}"
                             loading="lazy">
                        ${block.caption ? `<p style="font-size:.85rem; opacity:.6; margin-top:8px; font-style:italic;">${block.caption}</p>` : ''}
                    </div>`;
            case 'slider':
                if (!block.images || block.images.length === 0) return '';
                const sliderId = 'slider-' + Math.random().toString(36).slice(2, 8);
                return `
                    <div class="opa-page-slider" id="${sliderId}"
                         data-autoplay="${block.autoplay ? '1' : '0'}"
                         data-interval="${block.interval || 3}"
                         style="margin-bottom:36px; position:relative; overflow:hidden; border-radius:20px; background:#000;">
                        <div class="opa-slider-track" style="display:flex; transition:transform .4s ease-out;">
                            ${block.images.map(img => `
                                <div class="opa-slide" style="min-width:100%; position:relative;">
                                    <img src="${img.url}" alt="${img.caption || ''}"
                                         style="width:100%; max-height:480px; object-fit:cover; display:block;"
                                         loading="lazy">
                                    ${img.caption ? `<div style="position:absolute; bottom:0; left:0; right:0; padding:16px 20px; background:linear-gradient(transparent, rgba(0,0,0,.7)); color:#fff; font-size:.9rem;">${img.caption}</div>` : ''}
                                </div>`).join('')}
                        </div>
                        ${block.images.length > 1 ? `
                            <button class="opa-slide-btn opa-slide-prev" onclick="window.opaSlide('${sliderId}',-1)"
                                style="position:absolute; left:12px; top:50%; transform:translateY(-50%); background:rgba(0,0,0,.4); color:#fff; border:none; border-radius:50%; width:40px; height:40px; font-size:1.2rem; cursor:pointer; z-index:2; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); transition:background .2s;">\u2039</button>
                            <button class="opa-slide-btn opa-slide-next" onclick="window.opaSlide('${sliderId}',1)"
                                style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:rgba(0,0,0,.4); color:#fff; border:none; border-radius:50%; width:40px; height:40px; font-size:1.2rem; cursor:pointer; z-index:2; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); transition:background .2s;">\u203a</button>
                            <div class="opa-slide-dots" style="position:absolute; bottom:12px; left:50%; transform:translateX(-50%); display:flex; gap:8px; z-index:2;">
                                ${block.images.map((_, i) => `
                                    <span onclick="window.opaSlideGo('${sliderId}',${i})"
                                          style="width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,${i === 0 ? '1' : '.4'}); cursor:pointer; transition:all .2s;"
                                          data-dot="${i}"></span>`).join('')}
                            </div>` : ''}
                    </div>`;
            case 'infobox':
                const colors = {
                    blue:   { bg: 'rgba(59,130,246,.08)',  border: '#3b82f6', icon: '#3b82f6' },
                    green:  { bg: 'rgba(16,185,129,.08)', border: '#10b981', icon: '#10b981' },
                    orange: { bg: 'rgba(245,158,11,.08)', border: '#f59e0b', icon: '#d97706' },
                    red:    { bg: 'rgba(239,68,68,.08)',  border: '#ef4444', icon: '#ef4444' }
                };
                const col = colors[block.color] || colors.blue;
                return `
                    <div style="margin-bottom:28px; padding:20px 24px; border-radius:18px; border-left:5px solid ${col.border}; background:${col.bg}; display:flex; gap:16px; align-items:flex-start;">
                        <i class="${block.icon || 'fas fa-info-circle'}" style="color:${col.icon}; font-size:1.25rem; margin-top:2px; flex-shrink:0;"></i>
                        <p style="margin:0; font-size:1.05rem; line-height:1.7; opacity:.9;">${block.text || ''}</p>
                    </div>`;
            case 'divider':
                return `<hr style="margin:40px 0; border:none; border-top:1px solid rgba(255,255,255,.12);">`;
            default: return '';
        }
    }

    function initPageSliders(container) {
        container.querySelectorAll('.opa-page-slider').forEach(slider => {
            slider._opaIdx = 0;
            const autoplay = slider.dataset.autoplay === '1';
            const interval = parseInt(slider.dataset.interval || '3') * 1000;
            if (autoplay) slider._opaTimer = setInterval(() => window.opaSlide(slider.id, 1), interval);
        });
    }

    window.opaSlide = (id, delta) => {
        const slider = document.getElementById(id);
        if (!slider) return;
        const slides = slider.querySelectorAll('.opa-slide');
        const nextIdx = ((slider._opaIdx || 0) + delta + slides.length) % slides.length;
        window.opaSlideGo(id, nextIdx);
    };

    window.opaSlideGo = (id, idx) => {
        const slider = document.getElementById(id);
        if (!slider) return;
        const track = slider.querySelector('.opa-slider-track');
        if (track) track.style.transform = `translateX(-${idx * 100}%)`;
        slider._opaIdx = idx;
        slider.querySelectorAll('[data-dot]').forEach(dot => {
            dot.style.background = parseInt(dot.dataset.dot) === idx ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,.4)';
            dot.style.transform = parseInt(dot.dataset.dot) === idx ? 'scale(1.3)' : 'scale(1)';
        });
        if (slider._opaTimer) {
            clearInterval(slider._opaTimer);
            const interval = parseInt(slider.dataset.interval || '3') * 1000;
            if (slider.dataset.autoplay === '1') slider._opaTimer = setInterval(() => window.opaSlide(id, 1), interval);
        }
    };

    function renderLocationArea(loc, restaurantName = "Restaurant") {
        const c = document.getElementById('location-container');
        if (!c || !loc) return;
        const q = loc.address || restaurantName;
        const encAddr = encodeURIComponent(q);
        const isApple = /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
        const mapUrl = isApple ? `http://maps.apple.com/?q=${encAddr}` : `https://www.google.com/maps/search/?api=1&query=${encAddr}`;
        c.innerHTML = `
            <div class="glass-panel" style="padding:40px; border-radius:32px;">
                <div style="display:flex; flex-wrap:wrap; gap:40px; align-items:center;">
                    <div style="flex:1; min-width:300px;">
                        <span class="badge" style="margin-bottom:15px; background:var(--primary);" data-i18n="location.title">Unser Standort</span>
                        <h2 style="margin-bottom:15px; font-size:2rem;" data-i18n="location.title">So finden Sie uns</h2>
                        <p style="font-size:1.1rem; line-height:1.6; opacity:.8; margin-bottom:30px;">
                            ${loc.address ? loc.address.replace(/\n/g, '<br>') : `Wir freuen uns auf Ihren Besuch im ${restaurantName}.`}
                        </p>
                        <div style="display:flex; flex-wrap:wrap; gap:12px;">
                            <a href="${mapUrl}" target="_blank" class="btn small" style="background:#4285F4; border:none; display:flex; align-items:center; gap:8px;" data-i18n="location.google_maps">
                                <i class="fab fa-google"></i> Google Maps
                            </a>
                            ${isApple ? `
                            <a href="http://maps.apple.com/?q=${encAddr}" target="_blank" class="btn small outline" style="display:flex; align-items:center; gap:8px;" data-i18n="location.apple_maps">
                                <i class="fab fa-apple"></i> Apple Maps
                            </a>` : ''}
                        </div>
                    </div>
                    ${loc.embedUrl ? `
                    <div style="flex:1; min-width:300px; height:350px; border-radius:24px; overflow:hidden; border:1px solid rgba(255,255,255,.2); box-shadow:var(--shadow);">
                        <iframe src="${loc.embedUrl}" width="100%" height="100%" style="border:0;" allowfullscreen="" loading="lazy"></iframe>
                    </div>` : ''}
                </div>
            </div>`;
    }

    window.setLegalView = (type) => {
        const titleEl   = document.getElementById('legal-title');
        const contentEl = document.getElementById('legal-content');

        // Inhalt setzen — auch wenn homeData.legal fehlt, Buttons trotzdem umschalten
        if (homeData.legal) {
            if (titleEl)   titleEl.textContent   = type === 'impressum' ? 'Impressum' : 'Datenschutzerklärung';
            if (contentEl) contentEl.textContent = type === 'impressum' ? homeData.legal.impressum : homeData.legal.privacy;
        }

        // Alle Buttons im Legal-View finden und aktiv/inaktiv setzen
        const legalBtns = document.querySelectorAll('#view-legal button.btn');
        legalBtns.forEach(btn => {
            const isImpressum = btn.getAttribute('onclick')?.includes('impressum');
            const isPrivacy   = btn.getAttribute('onclick')?.includes('privacy');
            if (type === 'impressum') {
                if (isImpressum) btn.classList.remove('outline');
                if (isPrivacy)   btn.classList.add('outline');
            } else {
                if (isPrivacy)   btn.classList.remove('outline');
                if (isImpressum) btn.classList.add('outline');
            }
        });
    };


    // --- RESERVATION STEPPER ---
    window.resGuests = 2;
    window.resDate = null;
    window.resAreaId = null;
    let currentCalMonth = new Date().getMonth();
    let currentCalYear  = new Date().getFullYear();

    window.adjustGuests = (delta) => {
        const input = document.getElementById('res-guests');
        let val = parseInt(input.value) + delta;
        if (val < 1) val = 1;
        if (val > 20) val = 20;
        input.value = val;
        window.resGuests = val;
        if (window.resDate) checkLiveAvailability();
    };

    window.navCalendar = (delta) => {
        currentCalMonth += delta;
        if (currentCalMonth < 0)  { currentCalMonth = 11; currentCalYear--; }
        if (currentCalMonth > 11) { currentCalMonth = 0;  currentCalYear++; }
        renderResCalendar();
    };

    // Zeitslots vor/zurück blättern
    let timeOffset = 0; // Anzahl der übersprungenen Slots
    const TIME_PAGE_SIZE = 6; // Wie viele Slots pro "Seite"

    window.navTime = (delta) => {
        const allSlots = document.querySelectorAll('#res-time-grid .time-slot');
        if (allSlots.length === 0) return;

        timeOffset = Math.max(0, Math.min(
            timeOffset + delta * TIME_PAGE_SIZE,
            allSlots.length - 1
        ));

        allSlots.forEach((slot, i) => {
            slot.style.display = (i >= timeOffset && i < timeOffset + TIME_PAGE_SIZE * 3)
                ? '' : 'none';
        });

        // Scroll zu den sichtbaren Slots
        const firstVisible = document.querySelector('#res-time-grid .time-slot:not([style*="none"])');
        if (firstVisible) firstVisible.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    function renderResCalendar() {
        const grid  = document.getElementById('res-calendar-grid');
        const label = document.getElementById('calendar-month-year');
        if (!grid || !label) return;
        const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
        label.textContent = `${months[currentCalMonth]} ${currentCalYear}`;
        const first  = new Date(currentCalYear, currentCalMonth, 1).getDay();
        const daysIn = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
        const start  = (first === 0) ? 6 : first - 1;
        let html = ['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => `<div class="cal-modern-head">${d}</div>`).join('');
        for (let i = 0; i < start; i++) html += '<div class="cal-modern-day empty"></div>';
        const today = new Date(); today.setHours(0,0,0,0);
        for (let i = 1; i <= daysIn; i++) {
            const d    = new Date(currentCalYear, currentCalMonth, i);
            const dStr = `${currentCalYear}-${String(currentCalMonth+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const isPast  = d < today;
            const isToday = d.getTime() === today.getTime();
            const isSel   = window.resDate === dStr;
            html += `<div class="cal-modern-day ${isPast?'past':''} ${isToday?'today':''} ${isSel?'selected':''}" 
                          onclick="${isPast ? '' : `window.selectResDate('${dStr}')`}">${i}</div>`;
        }
        grid.innerHTML = html;
    }

    window.selectResDate = (dStr) => {
        window.resDate = dStr;
        renderResCalendar();
        const step3 = document.getElementById('res-step-3');
        step3.style.opacity = '1';
        step3.style.pointerEvents = 'all';
        if (!window.resAreaId) {
            const firstArea = document.querySelector('.area-tab');
            if (firstArea) window.selectArea(firstArea.dataset.id);
        } else { checkLiveAvailability(); }
    };

    window.selectArea = (id) => {
        window.resAreaId = id;
        document.querySelectorAll('.area-tab').forEach(t => t.classList.toggle('active', t.dataset.id === id));
        checkLiveAvailability();
    };

    function renderTimeGrid(grid) {
        timeOffset = 0;
        const container = document.getElementById('res-time-grid');
        if (!container) return;
        const sortedTimes = Object.keys(grid).sort();
        container.innerHTML = sortedTimes.map(t => {
            const { available } = grid[t];
            return `<div class="time-slot ${available ? '' : 'disabled'}" onclick="${available ? `window.openResContact('${t}')` : ''}">${t}</div>`;
        }).join('');
    }

    window.openResContact = (time) => {
        window.resTime = time;
        const overlay = document.getElementById('res-contact-overlay');
        const summary = document.getElementById('res-summary-text');
        const [y, m, d] = window.resDate.split('-');
        summary.innerHTML = `<i class="fas fa-calendar-day"></i> ${d}.${m}.${y} um ${time} Uhr &bull; <i class="fas fa-users"></i> ${window.resGuests} Personen`;
        overlay.style.display = 'flex';
    };

    window.closeResModal = () => { document.getElementById('res-contact-overlay').style.display = 'none'; };

    const oldInit = init;
    init = async () => {
        await oldInit();
        const areas = await get('areas');
        if (areas) {
            const list = document.getElementById('res-area-list');
            if (list) {
                list.innerHTML = areas.map(a => `<div class="area-tab" data-id="${a.id}" onclick="window.selectArea('${a.id}')">${a.name} <i class="fas fa-chevron-right"></i></div>`).join('');
                if (areas.length > 0) window.resAreaId = areas[0].id;
            }
        }
        renderResCalendar();
    };

    const resForm2 = document.getElementById('res-form');
    if (resForm2) {
        resForm2.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('res-submit');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sende...';
            const payload = {
                name:   document.getElementById('res-name').value,
                email:  document.getElementById('res-email').value,
                phone:  document.getElementById('res-phone').value,
                date:   window.resDate,
                time:   window.resTime,
                guests: window.resGuests,
                areaId: window.resAreaId,
                note:   document.getElementById('res-note').value
            };
            try {
                const r = await fetch(`${API}/reservations/submit`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const res = await r.json();
                if (res.success) {
                    toast(OpaI18n.t('reservations.success'));
                    window.closeResModal();
                    window.switchTab('home');
                    resForm2.reset();
                } else { toast('Fehler: ' + (res.reason || 'Unbekannt')); }
            } catch (e) { toast(OpaI18n.t('reservations.error')); }
            btn.disabled = false;
            btn.innerHTML = 'Kostenfrei reservieren <i class="fas fa-check"></i>';
        };
    }

    function checkVacationStatus(v) {
        if (!v) return;
        const now = new Date();
        const start = v.start ? new Date(v.start) : null;
        const end   = v.end   ? new Date(v.end)   : null;
        const manual = v.enabled === true;
        let isActive = false;
        if (isActive) {
            let seen = false;
            try { seen = sessionStorage.getItem('opa_vacation_seen'); } catch(e) {}
            if (!seen) {
                const modal = document.getElementById('vacation-modal');
                if (modal) {
                    modal.innerHTML = `
                        <div class="vacation-glass">
                            <div class="vac-icon">🏖️</div>
                            <h2>${v.title || 'Betriebsferien'}</h2>
                            <p>${v.text || 'Wir machen Urlaub!'}</p>
                            <button class="btn" onclick="window.closeVacation()">Verstanden</button>
                        </div>`;
                    modal.classList.add('active');
                }
            }
        }
    }

    window.closeVacation = () => {
        const modal = document.getElementById('vacation-modal');
        if (modal) {
            modal.classList.remove('active');
            try { sessionStorage.setItem('opa_vacation_seen', '1'); } catch(e) {}
        }
    };

    function checkHolidayStatus(v) {
        if (!v || !v.enabled) return;
        const now = new Date();
        const start = v.start ? new Date(v.start) : null;
        const end   = v.end   ? new Date(v.end)   : null;
        let seen = false;
        try { seen = sessionStorage.getItem('opa_holiday_seen'); } catch(e) {}
        if (start && end && now >= start && now <= end && !seen) {
            const modal = document.getElementById('holiday-modal');
            if (modal) {
                document.getElementById('holiday-title').textContent = v.title || 'Feiertags-Info';
                document.getElementById('holiday-text').textContent  = v.text  || 'Gern sind wir für Sie da!';
                modal.classList.add('active');
            }
        }
    }

    window.closeHoliday = () => {
        const modal = document.getElementById('holiday-modal');
        if (modal) {
            modal.classList.remove('active');
            try { sessionStorage.setItem('opa_holiday_seen', '1'); } catch(e) {}
        }
    };

    function renderOpeningHoursTable(oh) {
        const container = document.getElementById('res-opening-list');
        if (!container) return;
        const days = ['Mo','Di','Mi','Do','Fr','Sa','So'];
        const todayIdx = (new Date().getDay() + 6) % 7;
        container.innerHTML = days.map((day, idx) => {
            const data = oh[day] || { closed: true };
            const isToday = idx === todayIdx;
            const timeStr = data.closed ? 'Geschlossen' : `${data.open} - ${data.close} Uhr`;
            return `<div class="res-opening-row ${isToday ? 'today' : ''}"><span>${day}</span><span>${timeStr}</span></div>`;
        }).join('');
    }

    window.toggleMobileNav = () => {
        const drawer  = document.getElementById('nav-mobile-drawer');
        const overlay = document.getElementById('nav-mobile-overlay');
        const btn     = document.getElementById('nav-hamburger');
        const isOpen  = drawer.classList.contains('active');
        drawer.classList.toggle('active', !isOpen);
        overlay.classList.toggle('active', !isOpen);
        btn.classList.toggle('open', !isOpen);
    };

    window.closeMobileNav = () => {
        const drawer  = document.getElementById('nav-mobile-drawer');
        const overlay = document.getElementById('nav-mobile-overlay');
        const btn     = document.getElementById('nav-hamburger');
        if (drawer)  drawer.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        if (btn)     btn.classList.remove('open');
    };

    // Hook für i18n — wird nach Sprachwechsel aufgerufen
    window.OpaRender = () => {
        applyBranding(homeData); // Enthält Öffnungszeiten
        renderCategories();
        applyMenuFilter();
    };

    init();
});
