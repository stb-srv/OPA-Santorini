document.addEventListener('DOMContentLoaded', async () => {
    const API = '/api';
    let homeData = {};
    let menuItems = [];
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
                const footerNameEl = document.getElementById('footer-name');
                if (footerNameEl) footerNameEl.textContent = restaurantName;
                const navLogoEl = document.getElementById('nav-logo');
                if (navLogoEl) navLogoEl.textContent = restaurantName;
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

        const m = await get('menu');
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
                        if (res.isInquiry) toast('Vielen Dank für Ihre Anfrage! Wir prüfen die Verfügbarkeit.');
                        else toast('Vielen Dank für Ihre Reservierung! Wir freuen uns auf Sie.');
                        resForm.reset();
                        checkLiveAvailability();
                    } else {
                        toast(res.reason || 'Etwas ist schiefgelaufen.');
                    }
                } catch (err) { toast('Verbindungsfehler. Bitte versuchen Sie es später erneut.'); }
            });
        }

        ['res-date', 'res-time', 'res-guests'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', checkLiveAvailability);
                el.addEventListener('input', checkLiveAvailability);
            }
        });
    }

    // --- BRANDING ---
    function applyBranding(d) {
        if (d.heroTitle) document.getElementById('hero-title').textContent = d.heroTitle;
        if (d.heroSlogan) document.getElementById('hero-slogan').textContent = d.heroSlogan;
        if (d.bgImage) {
            document.getElementById('hero-bg').style.backgroundImage = `url('${d.bgImage}')`;
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
    }

    // --- NAVIGATION ---
    function renderNav(tabs, modules = {}, pages = []) {
        const c = document.getElementById('nav-links');
        if (!c) return;
        if (!tabs || tabs.length === 0) {
            tabs = [
                { id: 'home', label: 'Startseite', active: true },
                { id: 'menu', label: 'Speisekarte', active: true },
                { id: 'reservations', label: 'Reservierung(Tisch)', active: true },
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
        c.innerHTML = active.map(t =>
            `<a data-tab="${t.id}" onclick="window.switchTab('${t.id}')">${t.label}</a>`
        ).join('');
    }

    // --- MENU ---
    let activeCat = 'all';
    let searchQuery = '';

    // Kachel-Klick-Modus: wird aus homeData.cartClickMode gelesen
    // Mögliche Werte: 'button' (nur +), 'tile' (nur Kachel), 'both' (beides)
    // FIX: Default auf 'tile' – kein + Button mehr vorhanden
    window.OPA_CART_CLICK_MODE = 'tile';

    function renderCategories() {
        const c = document.getElementById('categories');
        if (!c) return;
        const cats = ['Alle', ...new Set(menuItems.map(i => i.cat))];
        c.innerHTML = cats.map(cat =>
            `<button class="cat-btn ${cat === 'Alle' ? 'active' : ''}" onclick="window.filterMenu('${cat}', this)">${cat}</button>`
        ).join('');
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

    function applyMenuFilter() {
        let items = activeCat === 'all' ? menuItems : menuItems.filter(i => i.cat === activeCat);
        if (searchQuery) {
            items = items.filter(i =>
                i.name.toLowerCase().includes(searchQuery) ||
                (i.desc && i.desc.toLowerCase().includes(searchQuery))
            );
        }
        renderMenu(items);
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
                    ${item.image
                        ? `<img src="${item.image}" alt="${item.name}" loading="lazy">`
                        : `<span><i class="fas fa-utensils"></i> ${item.cat}</span>`
                    }
                </div>
                <div class="dish-card-body">
                    <span class="cat-tag">${item.cat}</span>
                    <h3 data-item-name>${numberBadge}${item.name}</h3>
                    ${item.desc ? `<p class="dish-desc">${item.desc}</p>` : ''}
                    <div class="dish-card-footer">
                        <span class="dish-price">${price} €</span>
                        ${allergenBadges}
                        ${tileClickable ? '<span class="dish-card-add-hint">+ Hinzufügen</span>' : ''}
                    </div>
                </div>
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

        window.scrollTo({ top: id === 'home' ? 0 : document.getElementById('main-nav').offsetHeight, behavior: 'smooth' });
    };

    function renderCustomPage(id) {
        const rawId = id.replace('custom-', '');
        const p = homeData.pages?.find(pg => pg.id === rawId || pg.id === id);
        const c = document.getElementById('custom-page-container');
        if (!p || !c) return;
        const hasImg = p.image && p.image.trim() !== '';
        c.innerHTML = `
            <div class="glass-panel" style="padding:0; border-radius:32px; overflow:hidden; border:1px solid rgba(255,255,255,.2);">
                ${hasImg ? `
                    <div style="height:320px; position:relative; overflow:hidden;">
                        <img src="${p.image}" style="width:100%; height:100%; object-fit:cover;">
                        <div style="position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 60%);"></div>
                        <div style="position:absolute; bottom:30px; left:40px; right:40px; color:#fff; text-align:left;">
                            <span class="badge" style="background:var(--primary); margin-bottom:12px;">INFO</span>
                            <h2 style="font-size:2.5rem; color:#fff; margin:0;">${p.headline || p.title}</h2>
                        </div>
                    </div>
                ` : `
                    <div style="padding:60px 40px; text-align:center; border-bottom:1px solid rgba(0,0,0,.05);">
                        <span class="badge" style="background:var(--primary); margin-bottom:15px; display:inline-block;">INFORMATION</span>
                        <h2 style="font-size:2.8rem; margin:0; line-height:1.2;">${p.headline || p.title}</h2>
                    </div>
                `}
                <div style="padding:50px 40px; font-size:1.15rem; line-height:1.8; opacity:.9; max-width:850px; margin:0 auto; text-align:left;">
                    ${p.content || ''}
                </div>
            </div>`;
    }

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
                        <span class="badge" style="margin-bottom:15px; background:var(--primary);">Unser Standort</span>
                        <h2 style="margin-bottom:15px; font-size:2rem;">So finden Sie uns</h2>
                        <p style="font-size:1.1rem; line-height:1.6; opacity:.8; margin-bottom:30px;">
                            ${loc.address ? loc.address.replace(/\n/g, '<br>') : `Wir freuen uns auf Ihren Besuch im ${restaurantName}.`}
                        </p>
                        <div style="display:flex; flex-wrap:wrap; gap:12px;">
                            <a href="${mapUrl}" target="_blank" class="btn small" style="background:#4285F4; border:none; display:flex; align-items:center; gap:8px;">
                                <i class="fab fa-google"></i> Google Maps
                            </a>
                            ${isApple ? `
                            <a href="http://maps.apple.com/?q=${encAddr}" target="_blank" class="btn small outline" style="display:flex; align-items:center; gap:8px;">
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
        if (!homeData.legal) return;
        document.getElementById('legal-title').textContent = type === 'impressum' ? 'Impressum' : 'Datenschutzerklärung';
        document.getElementById('legal-content').textContent = type === 'impressum' ? homeData.legal.impressum : homeData.legal.privacy;
    };

    function toast(msg) {
        const d = document.createElement('div');
        d.textContent = msg;
        d.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1B3A5C;color:#fff;padding:14px 36px;border-radius:8px;z-index:9999;font-weight:700;font-size:.9rem;box-shadow:0 8px 30px rgba(0,0,0,.15);';
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 3000);
    }

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
                    toast('Reservierung erfolgreich!');
                    window.closeResModal();
                    window.switchTab('home');
                    resForm2.reset();
                } else { toast('Fehler: ' + (res.reason || 'Unbekannt')); }
            } catch (e) { toast('Verbindungsfehler!'); }
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
        if (manual) isActive = true;
        else if (start && end && now >= start && now <= end) isActive = true;
        if (isActive && !sessionStorage.getItem('opa_vacation_seen')) {
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

    window.closeVacation = () => {
        const modal = document.getElementById('vacation-modal');
        if (modal) { modal.classList.remove('active'); sessionStorage.setItem('opa_vacation_seen', '1'); }
    };

    function checkHolidayStatus(v) {
        if (!v || !v.enabled) return;
        const now = new Date();
        const start = v.start ? new Date(v.start) : null;
        const end   = v.end   ? new Date(v.end)   : null;
        if (start && end && now >= start && now <= end && !sessionStorage.getItem('opa_holiday_seen')) {
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
        if (modal) { modal.classList.remove('active'); sessionStorage.setItem('opa_holiday_seen', '1'); }
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

    init();
});
