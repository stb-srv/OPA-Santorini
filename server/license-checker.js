/**
 * OPA-CMS – License Checker (Stufe 3: Periodische Online-Validierung)
 *
 * Prüft alle 72h ob die Lizenz noch gültig ist, indem er den Lizenzserver
 * kontaktiert und ein frisch signiertes Token zurückbekommt.
 *
 * Graceful Degradation: Nach 3 aufeinanderfolgenden Fehlversuchen wird
 * der zuletzt bekannte Plan als Fallback genutzt (nicht FREE).
 * Erst bei widerrufener/abgelaufener Lizenz wird auf FREE umgestuft.
 *
 * Der Lizenzserver muss auf POST /api/v1/refresh antworten mit:
 * { status: 'active', token: '<RS256-signiertes JWT>' }
 */

const jwt = require('jsonwebtoken');
const { verifyLicenseToken } = require('./license.js');

const CHECK_INTERVAL_MS       = 72 * 60 * 60 * 1000; // 72h
const STARTUP_DELAY_MS        = 10 * 1000;            // 10s nach Boot
const TOKEN_REFRESH_THRESHOLD_H = 78;                 // Token < 78h gültig → sofort erneuern
const MAX_FAILURES            = 3;

class LicenseChecker {
    constructor(DB, licenseServerUrl, host) {
        this.DB               = DB;
        this.licenseServerUrl = (licenseServerUrl || 'https://licens-prod.stb-srv.de').replace(/\/+$/, '');
        this.host             = host || 'localhost';
        this.failCount        = 0;
        this.timer            = null;
        this.startupTimer     = null;
        this.degraded         = false;
    }

    start() {
        this.startupTimer = setTimeout(() => {
            this._checkIfTokenNeedsRefresh();
            this.timer = setInterval(() => this._check(), CHECK_INTERVAL_MS);
        }, STARTUP_DELAY_MS);
        console.log(`\uD83D\uDD12 LicenseChecker gestartet \u2013 Startup-Check in 10s, dann alle 72h.`);
    }

    stop() {
        if (this.timer)        clearInterval(this.timer);
        if (this.startupTimer) clearTimeout(this.startupTimer);
    }

    /**
     * Startup-Prüfung: Wenn das gespeicherte Token in weniger als TOKEN_REFRESH_THRESHOLD_H
     * Stunden abläuft (oder fehlt), sofort einen /refresh-Call machen.
     */
    async _checkIfTokenNeedsRefresh() {
        try {
            const settings = await this.DB.getKV('settings', {});
            const lic      = settings.license || {};

            if (!lic.key || lic.isTrial) return;

            const token   = lic.licenseToken || null;
            const payload = token ? verifyLicenseToken(token, this.host) : null;

            if (!payload) {
                console.log(`\uD83D\uDD04 [Startup] Kein gültiges Token gefunden – sofortiger Refresh...`);
                await this._check();
                return;
            }

            const nowSec    = Math.floor(Date.now() / 1000);
            const hoursLeft = ((payload.exp || 0) - nowSec) / 3600;

            if (hoursLeft < TOKEN_REFRESH_THRESHOLD_H) {
                console.log(`\uD83D\uDD04 [Startup] Token läuft in ${hoursLeft.toFixed(1)}h ab – sofortiger Refresh...`);
                await this._check();
            } else {
                console.log(`\u2705 [Startup] Token noch ${hoursLeft.toFixed(1)}h gültig – kein sofortiger Refresh nötig.`);
            }
        } catch (e) {
            console.warn(`\u26a0\ufe0f  [Startup] Token-Prüfung fehlgeschlagen: ${e.message} – starte normalen Check...`);
            await this._check();
        }
    }

    async _check() {
        const settings = await this.DB.getKV('settings', {});
        const lic      = settings.license || {};

        if (!lic.key || lic.isTrial) return;

        console.log(`\uD83D\uDD04 [${new Date().toISOString()}] Lizenz-Online-Check läuft...`);

        try {
            const response = await fetch(`${this.licenseServerUrl}/api/v1/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    license_key: lic.key,
                    domain:      this.host
                }),
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const rawToken = data.token || data.license_token || null;

            if (data.status === 'active' && rawToken) {
                const payload = verifyLicenseToken(rawToken, this.host);
                if (!payload) {
                    throw new Error('Server returned token with invalid signature');
                }

                settings.license.licenseToken = rawToken;
                // Fallback-Snapshot aktualisieren
                settings.license.lastKnownType    = payload.type;
                settings.license.lastKnownModules = payload.allowed_modules || null;
                settings.license.lastKnownLimits  = payload.limits || null;
                settings.license.lastKnownAt      = new Date().toISOString();
                delete settings.license.degraded;
                delete settings.license.degradedReason;
                delete settings.license.degradedAt;
                await this.DB.setKV('settings', settings);

                this.failCount = 0;
                this.degraded  = false;
                console.log(`\u2705 [${new Date().toISOString()}] Lizenz-Token erfolgreich erneuert (Plan: ${payload.type}, Domain: ${payload.domain}).`);

            } else if (data.status === 'revoked' || data.status === 'cancelled') {
                console.warn(`\u26a0\ufe0f  Lizenz wurde vom Server widerrufen (${data.status}). Degradiere auf FREE.`);
                this._degrade(settings, 'revoked');

            } else {
                throw new Error(`Unerwartete Serverantwort: ${JSON.stringify(data)}`);
            }

        } catch (e) {
            this.failCount++;
            console.warn(`\u26a0\ufe0f  [${new Date().toISOString()}] Lizenz-Check Fehler (${this.failCount}/${MAX_FAILURES}): ${e.message}`);

            if (this.failCount >= MAX_FAILURES) {
                console.warn(`\u26a0\ufe0f  Lizenz-Check ${MAX_FAILURES}x fehlgeschlagen – Offline-Fallback aktiv (letzter bekannter Plan bleibt erhalten).`);
                this._setOfflineFallback(settings);
            }
        }
    }

    /**
     * Offline-Fallback: Lizenzserver nicht erreichbar.
     * Behält den zuletzt bekannten Plan bei – kein FREE-Downgrade.
     * Setzt nur ein degraded-Flag zur Info, löscht aber NICHT das licenseToken.
     */
    _setOfflineFallback(settings) {
        this.degraded = true;
        if (settings.license) {
            settings.license.degraded       = true;
            settings.license.degradedReason = 'unreachable';
            settings.license.degradedAt     = new Date().toISOString();
            // licenseToken NICHT löschen – letzter gültiger Plan bleibt aktiv
            this.DB.setKV('settings', settings);
        }
    }

    /**
     * Hard-Degrade: Nur bei explizit widerrufener/gecancelter Lizenz.
     * Hier wird auf FREE umgestuft.
     */
    _degrade(settings, reason) {
        this.degraded = true;
        if (settings.license) {
            settings.license.degraded        = true;
            settings.license.degradedReason  = reason;
            settings.license.degradedAt      = new Date().toISOString();
            delete settings.license.licenseToken;
            this.DB.setKV('settings', settings);
        }
    }

    isDegraded() { return this.degraded; }
}

module.exports = LicenseChecker;
