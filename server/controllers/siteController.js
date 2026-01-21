
const pool = require('../db');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { extractZip } = require('../extract');
const { STORAGE_ROOT } = require('../config/paths');
const { getSafePath } = require('../utils/helpers');

/**
 * Parse .env file content into object
 */
const parseEnvFile = (content) => {
    const result = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
};

/**
 * Find .env file in directory (handles nested Laravel structure)
 */
const findEnvFile = (dir) => {
    // Direct .env in dir
    const directEnv = path.join(dir, '.env');
    if (fs.existsSync(directEnv)) return directEnv;
    
    // Check for .env.example to copy
    const envExample = path.join(dir, '.env.example');
    if (fs.existsSync(envExample)) {
        fs.copyFileSync(envExample, directEnv);
        return directEnv;
    }
    
    // Check first-level subdirectory (common for zip with root folder)
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const itemPath = path.join(dir, item);
        if (fs.statSync(itemPath).isDirectory()) {
            const nestedEnv = path.join(itemPath, '.env');
            if (fs.existsSync(nestedEnv)) return nestedEnv;
            
            const nestedExample = path.join(itemPath, '.env.example');
            if (fs.existsSync(nestedExample)) {
                fs.copyFileSync(nestedExample, nestedEnv);
                return nestedEnv;
            }
        }
    }
    
    return null;
};

/**
 * Auto-update .env database name with prefix
 * - Reads DB_DATABASE from .env
 * - Adds prefix: db_username_originalname
 * - Updates .env with new database name and credentials
 * - User will run migrate themselves
 */
const autoUpdateEnvDatabase = async (siteDir, username, userId) => {
    try {
        const envPath = findEnvFile(siteDir);
        if (!envPath) {
            console.log('[AutoEnv] No .env file found, skipping');
            return null;
        }
        
        console.log(`[AutoEnv] Found .env at: ${envPath}`);
        
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envVars = parseEnvFile(envContent);
        
        // Get original database name from .env
        const originalDbName = envVars.DB_DATABASE;
        if (!originalDbName) {
            console.log('[AutoEnv] No DB_DATABASE in .env, skipping');
            return null;
        }
        
        // Create new database name: db_username_originalname
        const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const safeDbName = originalDbName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        const newDbName = `db_${safeUsername}_${safeDbName}`;
        
        console.log(`[AutoEnv] Renaming DB: ${originalDbName} → ${newDbName}`);
        
        // MySQL user for this user
        const mysqlUser = `sql_${safeUsername}`;
        
        // Get or create MySQL password for user
        const [creds] = await pool.execute(
            'SELECT mysql_password FROM database_credentials WHERE user_id = ?', 
            [userId]
        );
        
        let mysqlPass;
        if (creds.length > 0 && creds[0].mysql_password) {
            mysqlPass = creds[0].mysql_password;
        } else {
            // Generate new password
            const idPart = userId.substring(0, 4);
            const namePart = username.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
            mysqlPass = `kp_${idPart}@${namePart}#88`;
            
            // Ensure MySQL user exists
            await pool.query(`CREATE USER IF NOT EXISTS '${mysqlUser}'@'%' IDENTIFIED BY '${mysqlPass}'`);
            
            // Save credentials to panel
            await pool.execute(
                `INSERT INTO database_credentials (user_id, mysql_user, mysql_password, created_at) 
                 VALUES (?, ?, ?, NOW()) 
                 ON DUPLICATE KEY UPDATE mysql_password = VALUES(mysql_password)`,
                [userId, mysqlUser, mysqlPass]
            );
        }
        
        // Update .env file with new database name and credentials
        let newEnvContent = envContent;
        
        const dbSettings = {
            'DB_CONNECTION': 'mysql',
            'DB_HOST': 'host.docker.internal',
            'DB_PORT': '3306',
            'DB_DATABASE': newDbName,
            'DB_USERNAME': mysqlUser,
            'DB_PASSWORD': mysqlPass
        };
        
        for (const [key, value] of Object.entries(dbSettings)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(newEnvContent)) {
                newEnvContent = newEnvContent.replace(regex, `${key}=${value}`);
            } else {
                newEnvContent += `\n${key}=${value}`;
            }
        }
        
        fs.writeFileSync(envPath, newEnvContent, 'utf-8');
        console.log(`[AutoEnv] ✅ Updated .env: DB_DATABASE=${newDbName}`);
        
        return {
            originalDbName,
            newDbName,
            mysqlUser,
            envPath
        };
        
    } catch (error) {
        console.error('[AutoEnv] Error:', error);
        return null;
    }
};

/**
 * Calculate directory size recursively (async)
 * @param {string} dirPath - Path to directory
 * @returns {Promise<number>} - Total size in bytes
 */
const calculateDirSize = async (dirPath) => {
    let totalSize = 0;

    try {
        const items = await fsp.readdir(dirPath, { withFileTypes: true });

        for (const item of items) {
            const itemPath = path.join(dirPath, item.name);

            // Skip symbolic links for security
            const stats = await fsp.lstat(itemPath);
            if (stats.isSymbolicLink()) continue;

            if (item.isDirectory()) {
                totalSize += await calculateDirSize(itemPath);
            } else {
                totalSize += stats.size;
            }
        }
    } catch (e) {
        console.warn(`[Storage] Could not read: ${dirPath}`, e.message);
    }

    return totalSize;
};

// Helper to resolve DB Name from siteId or databaseId
const getDbName = async (params) => {
    const { siteId, databaseId } = params;

    if (databaseId) {
        const [dbs] = await pool.execute('SELECT db_name FROM `databases` WHERE id = ?', [databaseId]);
        return dbs.length ? dbs[0].db_name : null;
    }

    if (siteId) {
        // Find database linked to this site
        const [dbs] = await pool.execute('SELECT db_name FROM `databases` WHERE site_id = ?', [siteId]);
        return dbs.length ? dbs[0].db_name : null;
    }

    return null;
};

exports.listSites = async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId is required' });
    try {
        // Join with databases table to get the actual db_name
        const [sites] = await pool.execute(`
            SELECT s.*, d.db_name as database_name 
            FROM sites s 
            LEFT JOIN \`databases\` d ON s.id = d.site_id 
            WHERE s.user_id = ? 
            ORDER BY s.created_at DESC
        `, [userId]);
        const mapped = sites.map((s) => ({
            id: s.id, userId: s.user_id, name: s.name, subdomain: s.subdomain, framework: s.framework,
            status: s.status, createdAt: s.created_at, storageUsed: s.storage_used, hasDatabase: !!s.has_database,
            dbName: s.database_name || null, // Include actual database name
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deploySite = async (req, res) => {
    const { userId, name, subdomain, framework, needsDatabase, attachedDatabaseId } = req.body;
    const file = req.file;

    if (!userId || !name) return res.status(400).json({ message: 'Missing required fields' });

    try {
        const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });
        const username = users[0].username;

        const siteFolderName = name.trim().replace(/[^a-z0-9_-]/gi, '_');
        const userDir = path.join(STORAGE_ROOT, username);
        const siteDir = path.join(userDir, siteFolderName);

        if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
        if (!fs.existsSync(siteDir)) fs.mkdirSync(siteDir, { recursive: true });

        let sizeMB = 0;

        if (file) {
            console.log(`[Deploy] 📦 Processing uploaded file: ${file.originalname}`);
            console.log(`[Deploy] File path (disk): ${file.path}`);

            // Stream-based extraction using file path (not buffer)
            // file.path is set by multer diskStorage
            const extractResult = await extractZip(file.path, siteDir);

            if (!extractResult.success) {
                // Clean up temp file on failure
                try { fs.unlinkSync(file.path); } catch (e) { }
                return res.status(400).json({
                    message: extractResult.message,
                    status: extractResult.status
                });
            }

            // Use extracted size if available, otherwise file size
            sizeMB = extractResult.stats?.totalMB
                ? parseFloat(extractResult.stats.totalMB)
                : (file.size / (1024 * 1024));

            // Clean up temp file after successful extraction
            try { fs.unlinkSync(file.path); } catch (e) {
                console.warn(`[Deploy] Could not clean temp file: ${file.path}`);
            }

            console.log(`[Deploy] ✅ Extraction complete: ${extractResult.stats?.fileCount || 'unknown'} files, ${sizeMB.toFixed(2)}MB`);
        } else {
            fs.writeFileSync(path.join(siteDir, 'index.html'), `<h1>Welcome to ${name}</h1><p>Deployed via KolabPanel</p>`);
        }

        const siteId = `s_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        await pool.execute(
            `INSERT INTO sites (id, user_id, name, subdomain, framework, status, created_at, storage_used, has_database) 
             VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), ?, ?)`,
            [siteId, userId, siteFolderName, subdomain, framework || 'HTML', sizeMB, false]
        );

        // AUTO ENV UPDATE: If file was uploaded, update .env with db_username_dbname format
        if (file) {
            const autoEnvResult = await autoUpdateEnvDatabase(siteDir, username, userId);
            if (autoEnvResult) {
                console.log(`[Deploy] 📝 Updated .env: ${autoEnvResult.originalDbName} → ${autoEnvResult.newDbName}`);
            }
        }

        if (attachedDatabaseId) {
            // Link existing orphaned database
            await pool.execute('UPDATE `databases` SET site_id = ? WHERE id = ?', [siteId, attachedDatabaseId]);
            await pool.execute('UPDATE sites SET has_database = TRUE WHERE id = ?', [siteId]);
        }

        res.json({ success: true, id: siteId, message: 'Deployed successfully' });

    } catch (e) {
        console.error("[Deploy] Error:", e);
        res.status(500).json({ message: e.message });
    }
};

exports.updateSite = async (req, res) => {
    const { siteId } = req.params;
    const data = req.body;
    const allowed = ['subdomain', 'hasDatabase', 'status', 'framework'];
    const updates = Object.keys(data).filter(k => allowed.includes(k));
    if (updates.length === 0) return res.json({ success: true });

    try {
        const setClause = updates.map(k => k === 'hasDatabase' ? 'has_database = ?' : `${k} = ?`).join(', ');
        const values = updates.map(k => data[k]);
        await pool.execute(`UPDATE sites SET ${setClause} WHERE id = ?`, [...values, siteId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.deleteSite = async (req, res) => {
    const { siteId } = req.params;
    const { deleteDb } = req.body;
    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const pathInfo = await getSafePath(site.user_id, site.name, '/');
        if (pathInfo && fs.existsSync(pathInfo.siteDir)) {
            try {
                fs.rmSync(pathInfo.siteDir, { recursive: true, force: true });
            } catch (e) { }
        }

        if (deleteDb) {
            const [dbs] = await pool.execute('SELECT db_name FROM `databases` WHERE site_id = ?', [siteId]);
            for (const db of dbs) {
                try {
                    await pool.query(`DROP DATABASE IF EXISTS \`${db.db_name}\``);
                } catch (dbErr) { console.error("Failed to drop DB:", dbErr); }
            }
            await pool.execute('DELETE FROM sites WHERE id = ?', [siteId]);
            await pool.execute('DELETE FROM `databases` WHERE site_id = ?', [siteId]);
        } else {
            await pool.execute("UPDATE sites SET status = 'DB_ONLY', storage_used = 0 WHERE id = ?", [siteId]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.listDatabases = async (req, res) => {
    const { siteId } = req.params;
    try {
        const [dbs] = await pool.execute('SELECT * FROM `databases` WHERE site_id = ? ORDER BY created_at DESC', [siteId]);
        res.json(dbs);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.createDatabase = async (req, res) => {
    const { siteId } = req.params;
    const { name } = req.body; // Custom database name from user
    try {
        const [existing] = await pool.execute('SELECT id FROM `databases` WHERE site_id = ?', [siteId]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Project already has a database. Only 1 database per project is allowed.' });
        }

        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) return res.status(404).json({ message: 'Site not found' });
        const site = sites[0];

        const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [site.user_id]);
        const username = users[0].username;

        // Use custom name if provided, otherwise generate one
        // Format: db_username_dbname
        const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        let realDbName;
        if (name && name.trim()) {
            // Sanitize custom name
            const customName = name.trim().replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
            // Format: db_username_customname
            realDbName = `db_${safeUsername}_${customName}`;
        } else {
            // Generate name from username and site
            const safeSiteName = site.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            realDbName = `db_${safeUsername}_${safeSiteName}`;
        }
        
        // Check if database name already exists
        const [existingDb] = await pool.execute('SELECT id FROM `databases` WHERE db_name = ?', [realDbName]);
        if (existingDb.length > 0) {
            return res.status(400).json({ message: `Database name '${realDbName}' already exists. Please choose a different name.` });
        }
        
        const mysqlUser = `sql_${username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;

        await pool.query(`CREATE DATABASE IF NOT EXISTS \`${realDbName}\``);
        await pool.query(`GRANT ALL PRIVILEGES ON \`${realDbName}\`.* TO '${mysqlUser}'@'%'`);
        await pool.query('FLUSH PRIVILEGES');

        const dbId = `db_${Date.now()}`;
        await pool.execute(
            'INSERT INTO `databases` (id, site_id, name, db_name) VALUES (?, ?, ?, ?)',
            [dbId, siteId, name || realDbName, realDbName]
        );
        await pool.execute('UPDATE sites SET has_database = TRUE WHERE id = ?', [siteId]);

        res.json({ success: true, id: dbId, name, db_name: realDbName });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.dropDatabase = async (req, res) => {
    const { siteId } = req.params;
    try {
        // 1. Get DB Info
        const [dbs] = await pool.execute('SELECT db_name FROM `databases` WHERE site_id = ?', [siteId]);

        if (dbs.length > 0) {
            const dbName = dbs[0].db_name;
            // 2. Drop Actual MySQL Database
            await pool.query(`DROP DATABASE IF EXISTS \`${dbName}\``);

            // 3. Remove from metadata table
            await pool.execute('DELETE FROM `databases` WHERE site_id = ?', [siteId]);
        }

        // 4. Update Site flag
        await pool.execute('UPDATE sites SET has_database = 0 WHERE id = ?', [siteId]);

        res.json({ success: true, message: 'Database dropped successfully' });
    } catch (e) {
        console.error("Drop Database Error:", e);
        res.status(500).json({ message: e.message });
    }
};

exports.deleteDatabase = async (req, res) => {
    const { databaseId } = req.params;
    try {
        const [dbs] = await pool.execute('SELECT db_name FROM `databases` WHERE id = ?', [databaseId]);
        if (dbs.length > 0) {
            const dbName = dbs[0].db_name;
            await pool.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
            await pool.execute('DELETE FROM `databases` WHERE id = ?', [databaseId]);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// FIX: Handle siteId param to resolve DB
exports.getDatabasetables = async (req, res) => {
    try {
        const dbName = await getDbName(req.params);
        if (!dbName) return res.status(404).json({ message: 'Database not found for this site' });

        const [tables] = await pool.execute(`
            SELECT 
                TABLE_NAME as name, 
                TABLE_ROWS as \`rows\`, 
                ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024, 1) as size_kb,
                ENGINE as engine,
                TABLE_COLLATION as collation
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ?
        `, [dbName]);

        const mappedTables = tables.map(t => ({
            name: t.name,
            rows: t.rows || 0,
            size: `${t.size_kb} KB`,
            engine: t.engine,
            collation: t.collation
        }));

        res.json(mappedTables);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// FIX: Handle siteId param to resolve DB
exports.getTableData = async (req, res) => {
    const { tableName } = req.params;
    try {
        const dbName = await getDbName(req.params);
        if (!dbName) return res.status(404).json({ message: 'Database not found' });

        // 1. Get Columns Structure
        const [columns] = await pool.query(`SHOW COLUMNS FROM \`${dbName}\`.\`${tableName}\``);
        const mappedColumns = columns.map(c => ({
            name: c.Field,
            type: c.Type,
            null: c.Null,
            key: c.Key,
            default: c.Default,
            extra: c.Extra
        }));

        // 2. Get Data Rows (Limit 100 for performance)
        const [rows] = await pool.query(`SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 100`);

        res.json({
            columns: mappedColumns,
            data: rows
        });
    } catch (e) {
        console.error("Get Table Data Error:", e);
        res.status(500).json({ message: e.message });
    }
};

exports.getDatabaseSchema = async (req, res) => {
    try {
        const dbName = await getDbName(req.params);
        if (!dbName) return res.status(404).json({ message: 'Database not found' });

        // 1. Get All Tables
        const [tables] = await pool.query(`SHOW TABLES FROM \`${dbName}\``);
        const tableNames = tables.map(t => Object.values(t)[0]);

        // 2. Get Columns for each table
        const fullSchema = [];
        for (const tableName of tableNames) {
            const [cols] = await pool.query(`SHOW COLUMNS FROM \`${dbName}\`.\`${tableName}\``);
            fullSchema.push({
                tableName: tableName,
                columns: cols.map(c => ({
                    name: c.Field,
                    type: c.Type,
                    key: c.Key
                }))
            });
        }

        res.json(fullSchema);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// FIX: Handle siteId param to resolve DB
exports.importDatabase = async (req, res) => {
    console.log('[importDatabase] Called with siteId:', req.params.siteId);
    const file = req.file;

    // 1. Validate file exists
    if (!file) {
        console.log('[importDatabase] No file uploaded');
        return res.status(400).json({
            status: 'failed',
            message: 'No file uploaded',
            executedQueries: 0
        });
    }

    console.log('[importDatabase] File info:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path || 'N/A (memory)',
        hasBuffer: !!file.buffer
    });

    try {
        console.log('[importDatabase] Looking up database for siteId:', req.params.siteId);
        const dbName = await getDbName(req.params);
        console.log('[importDatabase] Found dbName:', dbName);

        if (!dbName) {
            return res.status(404).json({
                status: 'failed',
                message: 'Database not found. Please create one first.',
                executedQueries: 0
            });
        }

        // 2. Read SQL content - handle both diskStorage and memoryStorage
        let sqlContent;

        if (file.path) {
            // diskStorage: read from file path
            console.log('[importDatabase] Reading from disk:', file.path);
            const fs = require('fs');

            if (!fs.existsSync(file.path)) {
                return res.status(400).json({
                    status: 'failed',
                    message: 'Uploaded file not found on disk',
                    executedQueries: 0
                });
            }

            sqlContent = fs.readFileSync(file.path, 'utf-8');

            // Clean up temp file after reading
            try {
                fs.unlinkSync(file.path);
            } catch (cleanupErr) {
                console.log('[importDatabase] Failed to cleanup temp file:', cleanupErr.message);
            }
        } else if (file.buffer) {
            // memoryStorage: read from buffer
            console.log('[importDatabase] Reading from buffer');
            sqlContent = file.buffer.toString('utf-8');
        } else {
            console.log('[importDatabase] No file.path and no file.buffer!');
            return res.status(400).json({
                status: 'failed',
                message: 'Unable to read uploaded file (no path or buffer)',
                executedQueries: 0
            });
        }

        console.log('[importDatabase] SQL content length:', sqlContent.length, 'bytes');

        // 3. Parse SQL statements - improved for phpMyAdmin dumps
        const rawStatements = sqlContent
            .split(/;\s*(?=(?:[^'"`]*(['"`])[^'"`]*\1)*[^'"`]*$)/g) // Split by ; outside quotes
            .filter(s => s && typeof s === 'string'); // Remove undefined/null

        console.log('[importDatabase] Raw statements after split:', rawStatements.length);

        // 4. Filter and clean statements
        const isSkippableStatement = (stmt) => {
            const trimmed = stmt.trim();
            const upper = trimmed.toUpperCase();

            // Skip empty
            if (!trimmed || trimmed.length === 0) return true;

            // Skip single quotes/chars (regex artifacts)
            if (trimmed.length <= 2) return true;

            // Skip comments
            if (trimmed.startsWith('--')) return true;
            if (trimmed.startsWith('#')) return true;
            if (trimmed.startsWith('/*') && !trimmed.startsWith('/*!')) return true;

            // Skip SET statements (phpMyAdmin config)
            if (upper.startsWith('SET ')) return true;
            if (upper.startsWith('SET\t')) return true;
            if (upper.startsWith('SET\n')) return true;

            // Skip USE database (we already switched)
            if (upper.startsWith('USE ')) return true;

            // Skip phpMyAdmin directives (but execute some important ones)
            if (trimmed.startsWith('/*!40')) return true; // MySQL version comments
            if (trimmed.startsWith('/*!50')) return true;
            if (trimmed.startsWith('/*!80')) return true;

            // Skip dangerous statements
            if (upper.startsWith('DROP DATABASE')) return true;
            if (upper.startsWith('CREATE DATABASE')) return true;
            if (upper.includes('GRANT ')) return true;
            if (upper.includes('REVOKE ')) return true;

            return false;
        };

        const statements = rawStatements
            .map(s => s.trim())
            .filter(s => !isSkippableStatement(s));

        console.log('[importDatabase] Executable statements after filter:', statements.length);

        // Log first 3 statements for debugging
        for (let i = 0; i < Math.min(3, statements.length); i++) {
            console.log(`[importDatabase] Statement #${i + 1} preview:`, statements[i].substring(0, 100));
        }

        if (statements.length === 0) {
            return res.status(400).json({
                status: 'failed',
                message: 'No executable SQL statements found in file (all were comments or SET statements)',
                executedQueries: 0
            });
        }

        // 5. Execute statements one by one
        const connection = await pool.getConnection();
        let executedQueries = 0;
        let skippedQueries = 0;
        let failedQuery = null;
        let failedQueryIndex = null;
        let errorMessage = null;

        try {
            await connection.query(`USE \`${dbName}\``);
            await connection.query('SET FOREIGN_KEY_CHECKS = 0');
            await connection.query('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO"');
            await connection.query('SET NAMES utf8mb4');

            for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i].trim();

                // Double-check: skip if empty or too short
                if (!stmt || stmt.length < 5) {
                    skippedQueries++;
                    continue;
                }

                // Log first query for debugging
                if (i === 0) {
                    console.log('[importDatabase] EXECUTING QUERY #1:', stmt.substring(0, 200));
                }

                try {
                    await connection.query(stmt);
                    executedQueries++;

                    if (executedQueries % 50 === 0) {
                        console.log(`[importDatabase] Progress: ${executedQueries}/${statements.length}`);
                    }
                } catch (queryErr) {
                    failedQuery = stmt.substring(0, 300);
                    failedQueryIndex = i + 1;
                    errorMessage = queryErr.message;
                    console.error(`[importDatabase] Query #${i + 1} failed:`);
                    console.error(`[importDatabase] Query content:`, stmt.substring(0, 200));
                    console.error(`[importDatabase] Error:`, queryErr.message);
                    throw queryErr;
                }
            }

            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            console.log(`[importDatabase] ✅ Success: ${executedQueries} queries executed`);

            res.json({
                status: 'success',
                message: 'Database imported successfully',
                executedQueries,
                totalQueries: statements.length
            });

        } catch (execErr) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => { });

            res.status(422).json({
                status: 'failed',
                message: 'Import failed at query ' + (executedQueries + 1),
                executedQueries,
                totalQueries: statements.length,
                failedQuery,
                errorMessage
            });
        } finally {
            connection.release();
        }

    } catch (e) {
        console.error("[importDatabase] Error:", e);
        res.status(500).json({
            status: 'failed',
            message: 'Import failed: ' + e.message,
            executedQueries: 0
        });
    }
};

// FIX: Handle siteId param to resolve DB
exports.exportDatabase = async (req, res) => {
    try {
        const dbName = await getDbName(req.params);
        if (!dbName) return res.status(404).send("Database not found");

        console.log(`[Database] Exporting ${dbName}`);
        // In a real app, we would spawn `mysqldump` here.
        // For now, we return a mock SQL file with basic structure.
        const sql = `-- KolabPanel Database Dump\n-- DB: ${dbName}\n-- Date: ${new Date().toISOString()}\n\n-- Mock Export: Real export requires mysqldump binary execution --`;

        res.setHeader('Content-disposition', `attachment; filename=${dbName}.sql`);
        res.setHeader('Content-type', 'application/sql');
        res.send(sql);
    } catch (e) {
        res.status(500).send("Export failed: " + e.message);
    }
};

/**
 * RECALCULATE STORAGE
 * ===================
 * Menghitung ulang storage usage dari ukuran file yang sebenarnya di disk
 */
exports.recalculateStorage = async (req, res) => {
    const { siteId } = req.params;

    if (!siteId) {
        return res.status(400).json({ message: 'siteId is required' });
    }

    try {
        // Get site info
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) {
            return res.status(404).json({ message: 'Site not found' });
        }
        const site = sites[0];

        // Get user info
        const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [site.user_id]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Calculate actual storage from disk
        const siteDir = path.join(STORAGE_ROOT, users[0].username, site.name);

        if (!fs.existsSync(siteDir)) {
            // Site folder doesn't exist, set to 0
            await pool.execute('UPDATE sites SET storage_used = 0 WHERE id = ?', [siteId]);
            return res.json({
                success: true,
                siteId,
                oldStorageMB: site.storage_used,
                newStorageMB: 0,
                message: 'Site folder not found, storage set to 0'
            });
        }

        // Calculate actual size
        const totalBytes = await calculateDirSize(siteDir);
        const totalMB = totalBytes / (1024 * 1024);

        // Update database
        await pool.execute('UPDATE sites SET storage_used = ? WHERE id = ?', [totalMB, siteId]);

        console.log(`[Storage] ✅ Recalculated storage for ${site.name}: ${site.storage_used?.toFixed(2) || 0}MB → ${totalMB.toFixed(2)}MB`);

        res.json({
            success: true,
            siteId,
            siteName: site.name,
            oldStorageMB: site.storage_used || 0,
            newStorageMB: parseFloat(totalMB.toFixed(2)),
            totalBytes,
            message: 'Storage recalculated from disk'
        });

    } catch (e) {
        console.error('[Storage] Recalculate error:', e);
        res.status(500).json({ message: e.message });
    }
};

/**
 * GET SITE STORAGE INFO
 * =====================
 * Mendapatkan info storage untuk site dengan opsi recalculate
 */
exports.getSiteStorage = async (req, res) => {
    const { siteId } = req.params;
    const { recalculate } = req.query;

    try {
        const [sites] = await pool.execute('SELECT * FROM sites WHERE id = ?', [siteId]);
        if (sites.length === 0) {
            return res.status(404).json({ message: 'Site not found' });
        }
        const site = sites[0];

        let storageUsed = site.storage_used || 0;
        let recalculated = false;

        // Optionally recalculate from disk
        if (recalculate === 'true') {
            const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [site.user_id]);
            if (users.length > 0) {
                const siteDir = path.join(STORAGE_ROOT, users[0].username, site.name);
                if (fs.existsSync(siteDir)) {
                    const totalBytes = await calculateDirSize(siteDir);
                    storageUsed = totalBytes / (1024 * 1024);
                    await pool.execute('UPDATE sites SET storage_used = ? WHERE id = ?', [storageUsed, siteId]);
                    recalculated = true;
                }
            }
        }

        res.json({
            success: true,
            siteId,
            siteName: site.name,
            storageUsedMB: parseFloat(storageUsed.toFixed(2)),
            storageUsedFormatted: storageUsed < 1
                ? `${(storageUsed * 1024).toFixed(0)} KB`
                : `${storageUsed.toFixed(2)} MB`,
            recalculated
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
