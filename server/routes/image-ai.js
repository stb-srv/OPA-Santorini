const express = require('express');
const router = express.Router();

module.exports = (requireAuth, DB) => {

    /**
     * GET /api/image-ai/config
     * Returns configuration status of API keys
     */
    router.get('/config', async (req, res) => {
        try {
            const settings = await DB.getKV('settings', {});
            const keys = settings.imageApiKeys || {};
            
            res.json({
                hasUnsplash: !!keys.unsplashKey,
                hasPexels: !!keys.pexelsKey,
                hasGoogleAi: !!keys.googleAiKey,
                defaultProvider: keys.defaultProvider || 'none'
            });
        } catch (err) {
            res.status(500).json({ success: false, reason: err.message });
        }
    });

    /**
     * POST /api/image-ai/search
     * Proxies search requests to Unsplash or Pexels
     */
    router.post('/search', async (req, res) => {
        try {
            const { query, provider } = req.body;
            if (!query) return res.status(400).json({ success: false, reason: 'Query required' });

            const settings = await DB.getKV('settings', {});
            const keys = settings.imageApiKeys || {};

            if (provider === 'unsplash') {
                const key = keys.unsplashKey;
                if (!key) return res.status(400).json({ success: false, reason: 'Unsplash key not configured' });

                const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=6&client_id=${key}`);
                const data = await response.json();

                if (data.errors) {
                    return res.status(400).json({ success: false, reason: data.errors.join(', ') });
                }

                const results = (data.results || []).map(img => ({
                    url: img.urls.regular,
                    thumb: img.urls.small,
                    credit: `Photo by ${img.user.name} on Unsplash`,
                    link: `${img.links.html}?utm_source=opa_cms&utm_medium=referral`
                }));

                res.json({ success: true, results });

            } else if (provider === 'pexels') {
                const key = keys.pexelsKey;
                if (!key) return res.status(400).json({ success: false, reason: 'Pexels key not configured' });

                const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6`, {
                    headers: { 'Authorization': key }
                });
                const data = await response.json();

                if (data.error) {
                    return res.status(400).json({ success: false, reason: data.error });
                }

                const results = (data.photos || []).map(img => ({
                    url: img.src.large2x,
                    thumb: img.src.medium,
                    credit: `Photo by ${img.photographer} on Pexels`,
                    link: img.url
                }));

                res.json({ success: true, results });

            } else {
                res.status(400).json({ success: false, reason: 'Invalid provider' });
            }
        } catch (err) {
            console.error('[Image Search Error]', err);
            res.status(500).json({ success: false, reason: err.message });
        }
    });

    /**
     * POST /api/image-ai/generate
     * Proxies generation requests to Google Gemini Imagen 3
     */
    router.post('/generate', async (req, res) => {
        try {
            const { prompt } = req.body;
            if (!prompt) return res.status(400).json({ success: false, reason: 'Prompt required' });

            const settings = await DB.getKV('settings', {});
            const keys = settings.imageApiKeys || {};
            const key = keys.googleAiKey;

            if (!key) return res.status(400).json({ success: false, reason: 'Google AI key not configured' });

            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`;
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters: { sampleCount: 4, aspectRatio: "1:1" }
                })
            });

            const data = await response.json();

            if (data.error) {
                return res.status(400).json({ success: false, reason: data.error.message || 'Gemini API Error' });
            }

            if (!data.predictions || data.predictions.length === 0) {
                return res.status(400).json({ success: false, reason: 'No images generated' });
            }

            const results = data.predictions.map(pred => {
                const mime = pred.mimeType || 'image/png';
                const b64 = pred.bytesBase64Encoded;
                const url = `data:${mime};base64,${b64}`;
                return {
                    url,
                    thumb: url, // For base64, thumb is the same
                    credit: 'Generated by Google Gemini Imagen 3'
                };
            });

            res.json({ success: true, results });

        } catch (err) {
            console.error('[Image Generate Error]', err);
            res.status(500).json({ success: false, reason: err.message });
        }
    });

    return router;
};
