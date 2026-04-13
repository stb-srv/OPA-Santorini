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
            const ext = path.extname(file.originalname);
            const mimeOk = ALLOWED_MIMETYPES.includes(file.mimetype);
            const extOk  = ALLOWED_EXTENSIONS.test(ext);
            if (mimeOk && extOk) {
                cb(null, true);
            } else {
                cb(new Error('Nur Bilddateien erlaubt (jpg, jpeg, png, gif, webp). SVG ist aus Sicherheitsgründen nicht erlaubt.'));
            }
        }
    });

    router.post('/', requireAuth, upload.single('image'), (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, reason: 'Keine Datei hochgeladen.' });
        res.json({
            success:  true,
            url:      `/uploads/${req.file.filename}`,
            filename: req.file.filename,
            size:     req.file.size
        });
    });

    router.delete('/:filename', requireAuth, (req, res) => {
        const fp = path.join(UPLOADS_DIR, path.basename(req.params.filename));
        if (fs.existsSync(fp)) { fs.unlinkSync(fp); return res.json({ success: true }); }
        res.status(404).json({ success: false });
    });

    return router;
};
