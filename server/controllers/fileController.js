/**
 * ============================================
 * FILE CONTROLLER - Stream-Based File Operations
 * ============================================
 * 
 * Semua operasi file menggunakan stream untuk:
 * - Mengurangi penggunaan memory
 * - Mendukung file besar
 * - Aman untuk multi-user environment
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { getSafePath } = require('../utils/helpers');
const pool = require('../db');

/**
 * LIST FILES
 * ==========
 * Menampilkan daftar file dan folder dalam sebuah path
 */
exports.listFiles = async (req, res) => {
    const { siteId, path: queryPath } = req.query;
    if (!siteId) return res.status(400).json({ message: 'Missing siteId' });

    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path', status: 'forbidden_path' });

        if (!fs.existsSync(pathInfo.fullPath)) return res.json([]);

        const items = await fsp.readdir(pathInfo.fullPath, { withFileTypes: true });
        const files = await Promise.all(items.map(async (item) => {
            let size = '-';
            if (!item.isDirectory()) {
                try {
                    const stats = await fsp.stat(path.join(pathInfo.fullPath, item.name));
                    size = (stats.size / 1024).toFixed(2) + ' KB';
                } catch (e) { }
            }
            return {
                id: `${item.name}-${Date.now()}`,
                name: item.name,
                type: item.isDirectory() ? 'folder' : 'file',
                size: size,
                path: queryPath || '/',
                createdAt: new Date().toISOString()
            };
        }));

        files.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });

        res.json(files);
    } catch (e) {
        console.error('[FileController] listFiles error:', e);
        res.status(500).json({ message: e.message });
    }
};

/**
 * CREATE FOLDER
 * =============
 * Membuat folder baru
 */
exports.createFolder = async (req, res) => {
    const { siteId, path: queryPath, folderName } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path', status: 'forbidden_path' });

        // Sanitize folder name
        const safeFolderName = folderName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const newFolderPath = path.join(pathInfo.fullPath, safeFolderName);

        if (!fs.existsSync(newFolderPath)) {
            await fsp.mkdir(newFolderPath, { recursive: true });
        }
        res.json({ success: true, status: 'success' });
    } catch (e) {
        console.error('[FileController] createFolder error:', e);
        res.status(500).json({ message: e.message });
    }
};

/**
 * UPLOAD FILE (Stream-Based)
 * ==========================
 * Upload file menggunakan stream dari temp file (Multer diskStorage)
 */
exports.uploadFile = async (req, res) => {
    const { siteId, path: queryPath } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) {
            // Clean up temp file
            try { await fsp.unlink(file.path); } catch (e) { }
            return res.status(404).json({ message: 'Site not found' });
        }
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) {
            try { await fsp.unlink(file.path); } catch (e) { }
            return res.status(403).json({ message: 'Invalid path', status: 'forbidden_path' });
        }

        if (!fs.existsSync(pathInfo.fullPath)) {
            await fsp.mkdir(pathInfo.fullPath, { recursive: true });
        }

        const destPath = path.join(pathInfo.fullPath, file.originalname);

        // Stream copy from temp file to destination
        await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(file.path);
            const writeStream = fs.createWriteStream(destPath);

            readStream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);

            readStream.pipe(writeStream);
        });

        // Clean up temp file
        try { await fsp.unlink(file.path); } catch (e) { }

        // Update storage used
        const sizeMB = file.size / (1024 * 1024);
        await pool.execute('UPDATE sites SET storage_used = storage_used + ? WHERE id = ?', [sizeMB, siteId]);

        console.log(`[FileController] ✅ File uploaded: ${file.originalname} (${sizeMB.toFixed(2)}MB)`);
        res.json({ success: true, status: 'success' });
    } catch (e) {
        console.error('[FileController] uploadFile error:', e);
        // Clean up temp file on error
        try { await fsp.unlink(file.path); } catch (e) { }
        res.status(500).json({ message: e.message });
    }
};

/**
 * DELETE ITEM
 * ===========
 * Menghapus file atau folder
 */
exports.deleteItem = async (req, res) => {
    const { siteId, path: queryPath, name } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path', status: 'forbidden_path' });

        const targetPath = path.join(pathInfo.fullPath, name);

        // Validate target path is within site directory
        if (!targetPath.startsWith(pathInfo.siteDir)) {
            return res.status(403).json({ message: 'Access denied', status: 'forbidden_path' });
        }

        if (fs.existsSync(targetPath)) {
            const stats = await fsp.stat(targetPath);
            await fsp.rm(targetPath, { recursive: true, force: true });

            const sizeMB = stats.size / (1024 * 1024);
            if (sizeMB > 0) {
                await pool.execute('UPDATE sites SET storage_used = GREATEST(0, storage_used - ?) WHERE id = ?', [sizeMB, siteId]);
            }
        }
        res.json({ success: true, status: 'success' });
    } catch (e) {
        console.error('[FileController] deleteItem error:', e);
        res.status(500).json({ message: e.message });
    }
};

/**
 * RENAME ITEM
 * ===========
 * Mengubah nama file atau folder
 */
exports.renameItem = async (req, res) => {
    const { siteId, path: queryPath, oldName, newName } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path', status: 'forbidden_path' });

        // Sanitize new name
        const safeNewName = newName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const oldPath = path.join(pathInfo.fullPath, oldName);
        const newPath = path.join(pathInfo.fullPath, safeNewName);

        // Validate paths are within site directory
        if (!oldPath.startsWith(pathInfo.siteDir) || !newPath.startsWith(pathInfo.siteDir)) {
            return res.status(403).json({ message: 'Access denied', status: 'forbidden_path' });
        }

        if (fs.existsSync(oldPath)) {
            await fsp.rename(oldPath, newPath);
        }
        res.json({ success: true, status: 'success' });
    } catch (e) {
        console.error('[FileController] renameItem error:', e);
        res.status(500).json({ message: e.message });
    }
};

/**
 * GET CONTENT (Stream-Based)
 * ==========================
 * Membaca isi file menggunakan stream
 */
exports.getContent = async (req, res) => {
    const { siteId, path: queryPath, name } = req.query;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).send('Site not found');
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).send('Invalid path');

        const filePath = path.join(pathInfo.fullPath, name);

        // Validate file path is within site directory
        if (!filePath.startsWith(pathInfo.siteDir)) {
            return res.status(403).send('Access denied');
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }

        // Check file size - for large files, consider pagination or streaming differently
        const stats = await fsp.stat(filePath);
        const MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB limit for inline read

        if (stats.size > MAX_INLINE_SIZE) {
            return res.status(413).send('File too large for inline viewing');
        }

        // Stream file to response
        const readStream = fs.createReadStream(filePath, { encoding: 'utf8' });
        readStream.on('error', (err) => {
            console.error('[FileController] getContent stream error:', err);
            res.status(500).send('Error reading file');
        });
        readStream.pipe(res);

    } catch (e) {
        console.error('[FileController] getContent error:', e);
        res.status(500).send(e.message);
    }
};

/**
 * SAVE CONTENT (Stream-Based)
 * ===========================
 * Menyimpan isi file menggunakan stream
 */
exports.saveContent = async (req, res) => {
    const { siteId, path: queryPath, name, content } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path', status: 'forbidden_path' });

        const filePath = path.join(pathInfo.fullPath, name);

        // Validate file path is within site directory
        if (!filePath.startsWith(pathInfo.siteDir)) {
            return res.status(403).json({ message: 'Access denied', status: 'forbidden_path' });
        }

        // Ensure parent directory exists
        const parentDir = path.dirname(filePath);
        if (!fs.existsSync(parentDir)) {
            await fsp.mkdir(parentDir, { recursive: true });
        }

        // Write using stream
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(filePath);
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);
            writeStream.write(content);
            writeStream.end();
        });

        console.log(`[FileController] ✅ File saved: ${name}`);
        res.json({ success: true, status: 'success' });
    } catch (e) {
        console.error('[FileController] saveContent error:', e);
        res.status(500).json({ message: e.message });
    }
};
