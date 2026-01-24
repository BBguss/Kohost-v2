const fs = require('fs');
const path = require('path');
const { getSafePath } = require('../utils/helpers');
const pool = require('../db');

exports.listFiles = async (req, res) => {
    const { siteId, path: queryPath } = req.query;
    if (!siteId) return res.status(400).json({ message: 'Missing siteId' });

    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path' });

        if (!fs.existsSync(pathInfo.fullPath)) return res.json([]);

        const items = fs.readdirSync(pathInfo.fullPath, { withFileTypes: true });
        const files = items.map(item => {
            let size = '-';
            if (!item.isDirectory()) {
                try {
                    const stats = fs.statSync(path.join(pathInfo.fullPath, item.name));
                    size = (stats.size / 1024).toFixed(2) + ' KB';
                } catch(e) {}
            }
            return {
                id: `${item.name}-${Date.now()}`,
                name: item.name,
                type: item.isDirectory() ? 'folder' : 'file',
                size: size,
                path: queryPath || '/',
                createdAt: new Date().toISOString()
            };
        });
        
        files.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });

        res.json(files);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message });
    }
};

exports.createFolder = async (req, res) => {
    const { siteId, path: queryPath, folderName } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path' });

        const newFolderPath = path.join(pathInfo.fullPath, folderName);
        if (!fs.existsSync(newFolderPath)) {
            fs.mkdirSync(newFolderPath, { recursive: true });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.uploadFile = async (req, res) => {
    const { siteId, path: queryPath } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path' });

        if (!fs.existsSync(pathInfo.fullPath)) {
            fs.mkdirSync(pathInfo.fullPath, { recursive: true });
        }

        const filePath = path.join(pathInfo.fullPath, file.originalname);
        fs.writeFileSync(filePath, file.buffer);
        
        const sizeMB = file.size / (1024 * 1024);
        await pool.execute('UPDATE sites SET storage_used = storage_used + ? WHERE id = ?', [sizeMB, siteId]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.deleteItem = async (req, res) => {
    const { siteId, path: queryPath, name } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        if (!pathInfo) return res.status(403).json({ message: 'Invalid path' });

        const targetPath = path.join(pathInfo.fullPath, name);
        if (fs.existsSync(targetPath)) {
            const stats = fs.statSync(targetPath);
            fs.rmSync(targetPath, { recursive: true, force: true });
            
            const sizeMB = stats.size / (1024 * 1024);
            if (sizeMB > 0) {
                 await pool.execute('UPDATE sites SET storage_used = GREATEST(0, storage_used - ?) WHERE id = ?', [sizeMB, siteId]);
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.renameItem = async (req, res) => {
    const { siteId, path: queryPath, oldName, newName } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        const site = sites[0];
        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        
        const oldPath = path.join(pathInfo.fullPath, oldName);
        const newPath = path.join(pathInfo.fullPath, newName);
        
        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getContent = async (req, res) => {
    const { siteId, path: queryPath, name } = req.query;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        const site = sites[0];
        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        const filePath = path.join(pathInfo.fullPath, name);
        
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            res.send(content);
        } else {
            res.status(404).send('File not found');
        }
    } catch (e) { res.status(500).send(e.message); }
};

exports.saveContent = async (req, res) => {
    const { siteId, path: queryPath, name, content } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        const site = sites[0];
        const pathInfo = await getSafePath(site.user_id, site.name, queryPath);
        const filePath = path.join(pathInfo.fullPath, name);
        
        fs.writeFileSync(filePath, content);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
};