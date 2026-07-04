const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../core/logger.js');
const { requireRole, requireLicense, imageAiLimiter } = require('../core/middleware.js');

module.exports = (requireAuth, DB) => {
    /**
     * GET /api/image-ai/config
     * Returns configuration status of API keys (admin only).
     */
    router.get('/config', requireRole('admin'), async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const keys = settings.imageApiKeys || {};

            res.json({
                hasUnsplash: !!keys.unsplashKey,
                hasPexels: !!keys.pexelsKey,
                hasGoogleAi: !!keys.googleAiKey,
                hasPuter: !!keys.puterToken,
                defaultProvider: keys.defaultProvider || 'none',
            });
        } catch (err) {
            logger.error({ err }, 'Image-AI Config Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    /**
     * POST /api/image-ai/search
     * Proxies search requests to Unsplash or Pexels (admin + Lizenz + Rate-Limit).
     */
    router.post(
        '/search',
        requireRole('admin'),
        requireLicense('image_ai'),
        imageAiLimiter,
        async (req, res) => {
            try {
                const { query, provider } = req.body;
                if (!query)
                    return res.status(400).json({ success: false, reason: 'Query required' });

                const settings = await DB.getKV('settings', {});
                const keys = settings.imageApiKeys || {};

                if (provider === 'unsplash') {
                    const key = keys.unsplashKey;
                    if (!key)
                        return res
                            .status(400)
                            .json({ success: false, reason: 'Unsplash key not configured' });

                    const response = await fetch(
                        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=6&client_id=${key}`
                    );
                    const data = await response.json();

                    if (data.errors) {
                        return res
                            .status(400)
                            .json({ success: false, reason: data.errors.join(', ') });
                    }

                    const results = (data.results || []).map((img) => ({
                        url: img.urls.regular,
                        thumb: img.urls.small,
                        credit: `Photo by ${img.user.name} on Unsplash`,
                        link: `${img.links.html}?utm_source=opa_cms&utm_medium=referral`,
                    }));

                    res.json({ success: true, results });
                } else if (provider === 'pexels') {
                    const key = keys.pexelsKey;
                    if (!key)
                        return res
                            .status(400)
                            .json({ success: false, reason: 'Pexels key not configured' });

                    const response = await fetch(
                        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6`,
                        {
                            headers: { Authorization: key },
                        }
                    );
                    const data = await response.json();

                    if (data.error) {
                        return res.status(400).json({ success: false, reason: data.error });
                    }

                    const results = (data.photos || []).map((img) => ({
                        url: img.src.large2x,
                        thumb: img.src.medium,
                        credit: `Photo by ${img.photographer} on Pexels`,
                        link: img.url,
                    }));

                    res.json({ success: true, results });
                } else {
                    res.status(400).json({ success: false, reason: 'Invalid provider' });
                }
            } catch (err) {
                logger.error({ err }, 'Image Search Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    /**
     * POST /api/image-ai/generate
     * Proxies generation requests to Google Gemini Imagen 3 (admin + Lizenz + Rate-Limit).
     */
    router.post(
        '/generate',
        requireRole('admin'),
        requireLicense('image_ai'),
        imageAiLimiter,
        async (req, res) => {
            try {
                const { prompt } = req.body;
                if (!prompt)
                    return res.status(400).json({ success: false, reason: 'Prompt erforderlich' });

                const settings = await DB.getKV('settings', {});
                const key = (settings.imageApiKeys || {}).googleAiKey;
                if (!key)
                    return res
                        .status(400)
                        .json({ success: false, reason: 'Google AI Key nicht konfiguriert' });

                // Versuche zuerst Imagen 4 (Paid), dann Fallback auf Gemini Flash (Free)
                let predictions = null;
                let usedModel = '';

                // Versuch 1: Imagen 4 (für Paid-Accounts)
                const imagenRes = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${key}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            instances: [{ prompt }],
                            parameters: { sampleCount: 4, aspectRatio: '1:1' },
                        }),
                        signal: AbortSignal.timeout(15000),
                    }
                );
                const imagenData = await imagenRes.json();

                if (imagenRes.ok && imagenData.predictions?.length) {
                    predictions = imagenData.predictions.map((p) => ({
                        bytesBase64Encoded: p.bytesBase64Encoded,
                        mimeType: p.mimeType || 'image/png',
                    }));
                    usedModel = 'Google Imagen 4 Fast';
                } else {
                    // Versuch 2: Gemini 2.5 Flash Image (kostenloser Fallback)
                    // Gemini Flash generiert nur 1 Bild pro Request -> 4 parallele Requests
                    const makeFlashRequest = () =>
                        fetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ parts: [{ text: prompt }] }],
                                    generationConfig: {
                                        responseModalities: ['TEXT', 'IMAGE'],
                                    },
                                }),
                                signal: AbortSignal.timeout(20000),
                            }
                        );

                    const flashResponses = await Promise.all([
                        makeFlashRequest(),
                        makeFlashRequest(),
                        makeFlashRequest(),
                        makeFlashRequest(),
                    ]);

                    const flashDataArray = await Promise.all(flashResponses.map((r) => r.json()));

                    // Fehler prüfen (wenn kein einziges Bild generiert wurde)
                    const firstError = flashDataArray.find((d) => d.error);
                    if (
                        firstError &&
                        !flashDataArray.some((d) =>
                            d.candidates?.[0]?.content?.parts?.some((p) => p.inlineData)
                        )
                    ) {
                        const reason =
                            firstError.error?.message ||
                            imagenData.error?.message ||
                            'Unbekannter Fehler';
                        const isBilling =
                            reason.toLowerCase().includes('billing') ||
                            reason.toLowerCase().includes('quota') ||
                            flashResponses.some((r) => r.status === 403);
                        return res.status(400).json({
                            success: false,
                            reason: isBilling
                                ? 'Google AI: Kein Zugriff. Bitte Google Cloud Billing aktivieren oder Plan prüfen.'
                                : `Google AI Fehler: ${reason}`,
                        });
                    }

                    // Extrahiere Bilder aus allen erfolgreichen Gemini Flash Responses
                    predictions = flashDataArray
                        .flatMap((d) => d.candidates?.[0]?.content?.parts || [])
                        .filter((p) => p.inlineData?.mimeType?.startsWith('image/'))
                        .map((p) => ({
                            bytesBase64Encoded: p.inlineData.data,
                            mimeType: p.inlineData.mimeType,
                        }));

                    usedModel = 'Google Gemini 2.5 Flash Image';
                }

                if (!predictions || predictions.length === 0) {
                    return res
                        .status(400)
                        .json({ success: false, reason: 'Keine Bilder generiert' });
                }

                // Base64 → Datei schreiben (kein DB-Bloat)
                const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
                if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

                const results = predictions.map((pred) => {
                    const ALLOWED_EXTS = {
                        'image/png': 'png',
                        'image/jpeg': 'jpg',
                        'image/webp': 'webp',
                    };
                    const ext = ALLOWED_EXTS[pred.mimeType] || 'png';
                    const filename = `ai_${crypto.randomBytes(8).toString('hex')}.${ext}`;
                    const filepath = path.join(uploadsDir, filename);
                    fs.writeFileSync(filepath, Buffer.from(pred.bytesBase64Encoded, 'base64'));
                    return {
                        url: `/uploads/${filename}`,
                        thumb: `/uploads/${filename}`,
                        credit: `Generiert mit ${usedModel}`,
                    };
                });

                res.json({ success: true, results, model: usedModel });
            } catch (err) {
                if (err.name === 'TimeoutError') {
                    return res.status(504).json({
                        success: false,
                        reason: 'Zeitüberschreitung – Google AI hat nicht geantwortet (>15s)',
                    });
                }
                logger.error({ err }, 'Image Generate Fehler');
                res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
            }
        }
    );

    /**
     * POST /api/image-ai/test
     * Tests connectivity for all configured API keys.
     */
    router.post('/test', requireRole('admin'), imageAiLimiter, async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const keys = settings.imageApiKeys || {};
            const results = {};

            if (keys.unsplashKey) {
                try {
                    const r = await fetch(
                        `https://api.unsplash.com/search/photos?query=food&per_page=1&client_id=${keys.unsplashKey}`,
                        { signal: AbortSignal.timeout(8000) }
                    );
                    results.unsplash = r.ok ? 'ok' : `Fehler ${r.status}`;
                } catch {
                    results.unsplash = 'Keine Verbindung';
                }
            } else {
                results.unsplash = 'Kein API-Key konfiguriert';
            }

            if (keys.pexelsKey) {
                try {
                    const r = await fetch(
                        'https://api.pexels.com/v1/search?query=food&per_page=1',
                        {
                            headers: { Authorization: keys.pexelsKey },
                            signal: AbortSignal.timeout(8000),
                        }
                    );
                    results.pexels = r.ok ? 'ok' : `Fehler ${r.status}`;
                } catch {
                    results.pexels = 'Keine Verbindung';
                }
            } else {
                results.pexels = 'Kein API-Key konfiguriert';
            }

            if (keys.googleAiKey) {
                try {
                    const r = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models?key=${keys.googleAiKey}`,
                        { signal: AbortSignal.timeout(8000) }
                    );
                    results.googleAi = r.ok ? 'ok' : `Fehler ${r.status}`;
                } catch {
                    results.googleAi = 'Keine Verbindung';
                }
            } else {
                results.googleAi = 'Kein API-Key konfiguriert';
            }

            res.json({ success: true, results });
        } catch (err) {
            logger.error({ err }, 'Image-AI Test Fehler');
            res.status(500).json({ success: false, reason: 'Interner Serverfehler.' });
        }
    });

    return router;
};
