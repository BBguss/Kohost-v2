
const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');

// Controllers
const authController = require('../controllers/authController');
const siteController = require('../controllers/siteController');
const fileController = require('../controllers/fileController');
const databaseController = require('../controllers/databaseController'); // NEW
const userDatabaseController = require('../controllers/userDatabaseController'); // User-isolated DB
const adminController = require('../controllers/adminController');
const ticketController = require('../controllers/ticketController');
const paymentController = require('../controllers/paymentController');

// Auth Routes
router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register); // Added Register
router.get('/auth/me', authController.getMe);
router.put('/auth/profile', authController.updateProfile);
router.post('/auth/change-password', authController.changePassword);

// ============================================
// EMAIL VERIFICATION ROUTES
// ============================================
// Route untuk verifikasi email (dipanggil dari link di email)
// GET /api/auth/verify-email?token=xxxxx
router.get('/auth/verify-email', authController.verifyEmail);

// Route untuk kirim ulang email verifikasi
// POST /api/auth/resend-verification
// Body: { email: "user@example.com" }
router.post('/auth/resend-verification', authController.resendVerification);

// Route untuk cek status verifikasi email
// GET /api/auth/check-verification/:userId
router.get('/auth/check-verification/:userId', authController.checkVerificationStatus);

// ============================================
// DATABASE MANAGEMENT ROUTES (KolabPanel DB Manager)
// ============================================

// Legacy routes (keep for backward compatibility)
router.get('/sites/:siteId/db/tables', siteController.getDatabasetables);
router.get('/sites/:siteId/db/schema', siteController.getDatabaseSchema);
router.get('/sites/:siteId/db/tables/:tableName', siteController.getTableData);
router.post('/sites/:siteId/db/create', siteController.createDatabase);
router.delete('/sites/:siteId/db', siteController.dropDatabase);
router.post('/sites/:siteId/db/import', upload.single('file'), siteController.importDatabase);

// NEW: Enhanced Database Routes
// Table Operations
router.get('/db/:siteId/tables', databaseController.getTables);
router.post('/db/:siteId/tables', databaseController.createTable);
router.delete('/db/:siteId/tables/:tableName', databaseController.dropTable);
router.put('/db/:siteId/tables/:tableName/rename', databaseController.renameTable);
router.put('/db/:siteId/tables/:tableName/truncate', databaseController.truncateTable);

// Row CRUD
router.get('/db/:siteId/tables/:tableName/rows', databaseController.getRows);
router.post('/db/:siteId/tables/:tableName/rows', databaseController.insertRow);
router.put('/db/:siteId/tables/:tableName/rows/:id', databaseController.updateRow);
router.delete('/db/:siteId/tables/:tableName/rows/:id', databaseController.deleteRow);
router.post('/db/:siteId/tables/:tableName/bulk', databaseController.bulkOperation);

// Column Operations
router.get('/db/:siteId/tables/:tableName/columns', databaseController.getColumns);
router.post('/db/:siteId/tables/:tableName/columns', databaseController.addColumn);
router.put('/db/:siteId/tables/:tableName/columns/:columnName', databaseController.modifyColumn);
router.delete('/db/:siteId/tables/:tableName/columns/:columnName', databaseController.dropColumn);

// Index Operations
router.post('/db/:siteId/tables/:tableName/indexes', databaseController.createIndex);
router.delete('/db/:siteId/tables/:tableName/indexes/:indexName', databaseController.dropIndex);

// Schema & ERD
router.get('/db/:siteId/schema', databaseController.getFullSchema);
router.get('/db/:siteId/erd', databaseController.getERDData);
router.get('/db/:siteId/fingerprint', databaseController.getSchemaFingerprint);

// Query & Export/Import
router.post('/db/:siteId/query', databaseController.executeQuery);
router.get('/db/:siteId/export', databaseController.exportDatabase);
router.post('/db/:siteId/import', upload.single('file'), databaseController.importDatabase);

// ============================================
// USER DATABASE MANAGEMENT (Multi-tenant isolated)
// ============================================
// These routes use per-user MySQL credentials for isolation

// Credentials
router.get('/user-db/credentials', userDatabaseController.getCredentials);
router.post('/user-db/credentials/reset', userDatabaseController.resetPassword);

// Database CRUD
router.get('/user-db/databases', userDatabaseController.listDatabases);
router.post('/user-db/databases', userDatabaseController.createDatabase);
router.delete('/user-db/databases/:dbName', userDatabaseController.dropDatabase);
router.get('/user-db/databases/:dbName/info', userDatabaseController.getDatabaseInfo);

// SQL Query
router.post('/user-db/databases/:dbName/query', userDatabaseController.executeQuery);
router.get('/user-db/databases/:dbName/history', userDatabaseController.getQueryHistory);

// Import/Export
router.post('/user-db/databases/:dbName/import', upload.single('file'), userDatabaseController.importDatabase);
router.get('/user-db/databases/:dbName/export', userDatabaseController.exportDatabase);

// Terminal Integration
router.post('/user-db/sync-terminal', userDatabaseController.syncToTerminal);
router.get('/user-db/env-content', userDatabaseController.getEnvContent);

// Database Discovery & Sync (Terminal ↔ UI)
router.post('/user-db/discover', userDatabaseController.discoverDatabases);
router.post('/user-db/import-external', userDatabaseController.importExternalDatabase);
router.post('/user-db/refresh-stats', userDatabaseController.refreshStats);

console.log('[Routes] User Database routes registered');

console.log('[Routes] Database management routes registered');

// Site Routes
router.get('/sites', siteController.listSites);
router.post('/sites/deploy', upload.single('file'), siteController.deploySite);
router.put('/sites/:siteId', siteController.updateSite);
router.delete('/sites/:siteId', siteController.deleteSite);
router.get('/sites/:siteId/storage', siteController.getSiteStorage);           // NEW: Get storage info
router.post('/sites/:siteId/storage/recalculate', siteController.recalculateStorage); // NEW: Recalculate storage

router.get('/debug/site/:siteId', async (req, res) => {
    const pool = require('../db');
    const { siteId } = req.params;
    const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
    const [dbs] = await pool.execute('SELECT * FROM `databases` WHERE site_id = ?', [siteId]);
    const [allDbs] = await pool.execute('SELECT * FROM `databases` LIMIT 5');
    res.json({ site: sites[0], linkedDb: dbs[0], allDatabases: allDbs });
});
console.log('[Routes] Database routes registered');

// File Manager Routes
router.get('/files', fileController.listFiles);
router.get('/files/tree', fileController.listTree);           // NEW: Recursive file tree
router.get('/files/open', fileController.openFile);           // NEW: Open file for editing
router.post('/files/save', fileController.saveFile);          // NEW: Save file (with backup option)
router.post('/files/create', fileController.createFile);      // NEW: Create new file
router.post('/files/folder', fileController.createFolder);
router.post('/files/upload', upload.single('file'), fileController.uploadFile);
router.delete('/files', fileController.deleteItem);
router.put('/files/rename', fileController.renameItem);
router.get('/files/content', fileController.getContent);      // Legacy: for simple read
router.post('/files/content', fileController.saveContent);    // Legacy: for simple save

// Ticket / Support Routes
router.post('/tickets', ticketController.createTicket);
router.get('/tickets', ticketController.listTickets);
router.get('/tickets/:ticketId/messages', ticketController.getMessages);
router.post('/tickets/:ticketId/messages', ticketController.sendMessage);
router.put('/tickets/:ticketId/close', ticketController.closeTicket);

// Payment Routes
router.post('/payments', upload.single('proof'), paymentController.submitPayment);
router.get('/payments/history/:userId', paymentController.getHistory);

// Admin Routes
router.get('/admin/stats', adminController.getStats);
router.get('/admin/system-health', adminController.getSystemHealth);
router.get('/admin/users', adminController.listUsers);
router.put('/admin/users/:userId/toggle', async (req, res) => {
    // Quick inline toggle for simplicity or move to controller
    const { userId } = req.params;
    try {
        const pool = require('../db');
        const [users] = await pool.execute('SELECT status FROM users WHERE id = ?', [userId]);
        if (users.length) {
            const newStatus = users[0].status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
            await pool.execute('UPDATE users SET status = ? WHERE id = ?', [newStatus, userId]);
            res.json({ success: true, status: newStatus });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (e) { res.status(500).json({ message: e.message }); }
});
router.get('/admin/payments', adminController.getPayments);
router.put('/admin/payments/:id/verify', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const pool = require('../db');
        await pool.execute('UPDATE payments SET status = ? WHERE id = ?', [status, id]);

        // If Verified, update user plan logic could go here
        if (status === 'VERIFIED') {
            const [rows] = await pool.execute('SELECT user_id, plan FROM payments WHERE id = ?', [id]);
            if (rows.length > 0) {
                await pool.execute('UPDATE users SET plan = ? WHERE id = ?', [rows[0].plan, rows[0].user_id]);
            }
        }

        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Admin Tunnels
router.get('/admin/tunnels', adminController.listTunnels);
router.post('/admin/tunnels', adminController.createTunnel);
router.put('/admin/tunnels/edit', adminController.editTunnel);
router.delete('/admin/tunnels', adminController.deleteTunnel);

// Common
router.get('/plans', adminController.getPlans);
router.post('/plans', async (req, res) => { /* Mock create plan */ res.json({ id: 'p_' + Date.now() }); });
router.put('/plans/:id', async (req, res) => { /* Mock update plan */ res.json({ success: true }); });
router.delete('/plans/:id', async (req, res) => { /* Mock delete plan */ res.json({ success: true }); });

router.get('/domains', adminController.getDomains);
router.post('/domains', async (req, res) => {
    const { name } = req.body;
    const pool = require('../db');
    const id = `d_${Date.now()}`;
    await pool.execute('INSERT INTO domains (id, name, is_primary) VALUES (?, ?, ?)', [id, name, false]);
    res.json({ id, name, isPrimary: false });
});
router.delete('/domains/:id', async (req, res) => {
    const { id } = req.params;
    const pool = require('../db');
    await pool.execute('DELETE FROM domains WHERE id = ?', [id]);
    res.json({ success: true });
});

// Apache
router.get('/admin/apache/sites', adminController.listApacheSites);
router.get('/admin/apache/sites/:filename', adminController.getApacheSite);
// Stub routes for full CRUD on apache if needed
router.post('/admin/apache/sites', (req, res) => res.json({ success: true }));
router.put('/admin/apache/sites/:filename', (req, res) => res.json({ success: true }));
router.delete('/admin/apache/sites/:filename', (req, res) => res.json({ success: true }));
router.get('/admin/apache/httpd', (req, res) => res.json({ content: '# Mock httpd.conf' }));
router.post('/admin/apache/reload', (req, res) => res.json({ success: true }));

// ============================================
// TERMINAL ROUTES (Docker-based)
// ============================================
const terminalController = require('../controllers/terminalController');

router.post('/terminal/start', terminalController.startTerminal);
router.post('/terminal/stop', terminalController.stopTerminal);
router.post('/terminal/exec', terminalController.execCommand);
router.get('/terminal/status', terminalController.getStatus);

console.log('[Routes] Terminal routes registered');

module.exports = router;
