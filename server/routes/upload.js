/**
 * Routes – Image Upload
 * POST   /api/upload
 * DELETE /api/upload/:filename
 *
 * SECURITY:
 *  - SEC-05: SVG entfernt (XSS via eingebettetes JS)
 *  - Doppelte Validierung: Extension + MIME-Type
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

// Erlaubte Dateierweiterungen (SVG bewusst ausgeschlossen – XSS-Risiko)
const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp)$/i;
// Erlaubte MIME-Types (verhindert Extension-Spoofing)
const ALLOWED_MIMETYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
];

module.exports = (requireAuth, UPLOADS_DIR) => {
    // Ensure uploads dir exists at route registration time
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
        }
    });

    const upload = multer({
        storage,
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const mimeOk = ALLOWED_MIMETYPES.includes(file.mimetype);
            const extOk  = ALLOWED_EXTENSIONS.test(ext);
            if (mimeOk && extOk) {
                cb(null, true);
            } else {
                const err = new Error('Nur Bilddateien erlaubt (jpg, jpeg, png, gif, webp). SVG ist aus Sicherheitsgründen nicht erlaubt.');
                err.code = 'INVALID_FILE_TYPE';
                cb(err, false);
            }
        }
    });

    router.post('/', requireAuth, (req, res) => {
        upload.single('image')(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ 
                        success: false, 
                        reason: 'Datei zu groß. Maximale Größe: 5 MB.' 
                    });
                }
                return res.status(400).json({ 
                    success: false, 
                    reason: err.message || 'Ungültige Datei.' 
                });
            }
            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    reason: 'Keine Datei hochgeladen.' 
                });
            }
            res.json({
                success:  true,
                url:      `/uploads/${req.file.filename}`,
                filename: req.file.filename,
                size:     req.file.size
            });
        });
    });

    router.delete('/:filename', requireAuth, (req, res) => {
        const fp = path.join(UPLOADS_DIR, path.basename(req.params.filename));
        if (fs.existsSync(fp)) { fs.unlinkSync(fp); return res.json({ success: true }); }
        res.status(404).json({ success: false, reason: 'Datei nicht gefunden.' });
    });

    return router;
};
