
const pool = require('../db');
const fs = require('fs');
const path = require('path');
const { extractZip } = require('../extract');
const { STORAGE_ROOT } = require('../config/paths');
const { getSafePath } = require('../utils/helpers');
const { spawn } = require('child_process'); // Required for mysqldump

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
        const [sites] = await pool.execute('SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        const mapped = sites.map((s) => ({
            id: s.id, userId: s.user_id, name: s.name, subdomain: s.subdomain, framework: s.framework,
            status: s.status, createdAt: s.created_at, storageUsed: s.storage_used, hasDatabase: !!s.has_database,
        }));
        res.json(mapped);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deploySite = async (req, res) => {
    const { userId, name, subdomain, framework, needsDatabase, attachedDatabaseId } = req.body;
    const file = req.file;
    const io = req.app.get('io'); // Get Socket.IO instance

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

        if (file) {
            // Realtime Extraction with Progress Callback
            await extractZip(file.buffer, siteDir, (percent) => {
                if (io) {
                    io.emit(`deploy_progress_${userId}`, { 
                        stage: 'EXTRACTING', 
                        progress: percent,
                        message: `Extracting files: ${percent}%` 
                    });
                }
            });
        } else {
            fs.writeFileSync(path.join(siteDir, 'index.html'), `<h1>Welcome to ${name}</h1><p>Deployed via KolabPanel</p>`);
        }

        const siteId = `s_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const hasDb = needsDatabase === 'true';
        const sizeMB = file ? (file.size / (1024 * 1024)) : 0;

        await pool.execute(
            `INSERT INTO sites (id, user_id, name, subdomain, framework, status, created_at, storage_used, has_database) 
             VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), ?, ?)`,
            [siteId, userId, siteFolderName, subdomain, framework || 'HTML', sizeMB, hasDb || !!attachedDatabaseId]
        );

        if (hasDb) {
            const suffix = Math.random().toString(36).substr(2, 6);
            const uPart = username.substring(0, 3).toLowerCase();
            const sPart = name.substring(0, 3).toLowerCase();
            const realDbName = `db_${uPart}_${sPart}_${suffix}`.replace(/[^a-z0-9_]/g, '');
            const mysqlUser = `sql_${username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
            const idPart = userId.substring(0, 4);
            const namePart = username.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
            const mysqlPass = `kp_${idPart}@${namePart}#88`;

            try {
                // 1. Create DB
                await pool.query(`CREATE DATABASE IF NOT EXISTS \`${realDbName}\``);
                
                // 2. Ensure User Exists
                await pool.query(`CREATE USER IF NOT EXISTS '${mysqlUser}'@'%' IDENTIFIED BY '${mysqlPass}'`);

                // 3. Grant Privileges
                await pool.query(`GRANT ALL PRIVILEGES ON \`${realDbName}\`.* TO '${mysqlUser}'@'%'`);
                await pool.query('FLUSH PRIVILEGES');
                
                // 4. Register in 'databases' table (Backticks REQUIRED for reserved keyword 'databases')
                const dbId = `db_${Date.now()}`;
                await pool.execute(
                    'INSERT INTO `databases` (id, site_id, name, db_name) VALUES (?, ?, ?, ?)',
                    [dbId, siteId, name || realDbName, realDbName]
                );
                
                // 5. Update site flag
                await pool.execute('UPDATE sites SET has_database = TRUE WHERE id = ?', [siteId]);

                console.log(`[MySQL] Created DB ${realDbName} and granted to ${mysqlUser}`);
            } catch (dbErr) {
                console.error(`[MySQL] Failed to setup database for ${name}:`, dbErr);
                // Don't fail the whole request, but log error
            }
        } else if (attachedDatabaseId) {
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
            } catch(e) {}
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
    const { name } = req.body;
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

        const suffix = Math.random().toString(36).substr(2, 6);
        const uPart = username.substring(0, 3).toLowerCase();
        const sPart = site.name.substring(0, 3).toLowerCase();
        const realDbName = `db_${uPart}_${sPart}_${suffix}`.replace(/[^a-z0-9_]/g, '');
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
    const file = req.file;
    if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        const dbName = await getDbName(req.params);
        if (!dbName) return res.status(404).json({ message: 'Database not found. Please create one first.' });
        
        const sqlContent = file.buffer.toString('utf-8');

        const connection = await pool.getConnection();
        try {
            await connection.query(`USE \`${dbName}\``);
            // NOTE: This approach works for moderate files. For massive dumps, spawning `mysql` command line is safer.
            // But we already handle large payloads via express limit.
            await connection.query(sqlContent);
            console.log(`[Database] Imported ${file.originalname} into ${dbName}`);
        } finally {
            connection.release();
        }

        res.json({ success: true, message: 'Database imported successfully' });
    } catch (e) {
        console.error("[Database] Import Failed:", e);
        res.status(500).json({ message: 'Import failed: ' + e.message });
    }
};

// Real Export Implementation via mysqldump
exports.exportDatabase = async (req, res) => {
    try {
        const dbName = await getDbName(req.params);
        if (!dbName) return res.status(404).send("Database not found");

        console.log(`[Database] Exporting ${dbName} via mysqldump...`);

        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename=${dbName}_${Date.now()}.sql`);

        // Spawn mysqldump process
        // NOTE: Ensure 'mysqldump' is in your system PATH or provide absolute path in .env
        const dump = spawn('mysqldump', [
            '-h', process.env.DB_HOST || 'localhost',
            '-u', process.env.DB_USER || 'root',
            process.env.DB_PASSWORD ? `-p${process.env.DB_PASSWORD}` : '', // Empty string if no password
            dbName,
            '--single-transaction', // Good for InnoDB
            '--skip-lock-tables', // Avoid locking if user doesn't have privs
            '--no-tablespaces' // Fix for some permissions issues
        ].filter(Boolean)); // Remove empty strings

        // Pipe the output to response
        dump.stdout.pipe(res);

        dump.stderr.on('data', (data) => {
            console.error(`[mysqldump stderr]: ${data}`);
        });

        dump.on('close', (code) => {
            if (code !== 0) {
                console.error(`[mysqldump] process exited with code ${code}`);
                // If headers haven't been sent (unlikely if piping started), we could send error
                // typically we just log it as response stream might be partially sent
            } else {
                console.log(`[mysqldump] Export finished for ${dbName}`);
            }
        });

        dump.on('error', (err) => {
             console.error('[mysqldump] Failed to start subprocess.', err);
             if (!res.headersSent) {
                 res.status(500).send('Failed to execute export tool.');
             }
        });

    } catch (e) {
        console.error("[Database] Export Error:", e);
        if (!res.headersSent) res.status(500).send("Export failed: " + e.message);
    }
};
