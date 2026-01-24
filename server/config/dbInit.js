
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SEED_SQL = `
  INSERT IGNORE INTO users (id, username, password, email, role, plan, avatar, status) VALUES 
  ('u1', 'demo_user', 'password', 'user@example.com', 'USER', 'Basic', '', 'ACTIVE'),
  ('a1', 'sys_admin', 'admin', 'admin@kolabpanel.com', 'ADMIN', 'Premium', '', 'ACTIVE');

  INSERT IGNORE INTO plans (id, name, price, currency, features, limits, is_popular) VALUES 
  ('plan_basic', 'Basic', 0, 'Rp', '["1 Site", "100MB Storage", "Shared Database"]', '{"sites": 1, "storage": 100, "databases": 0}', FALSE),
  ('plan_pro', 'Pro', 50000, 'Rp', '["5 Sites", "1GB Storage", "Private Database"]', '{"sites": 5, "storage": 1024, "databases": 1}', TRUE),
  ('plan_premium', 'Premium', 100000, 'Rp', '["Unlimited Sites", "10GB Storage"]', '{"sites": 9999, "storage": 10240, "databases": 5}', FALSE);

  INSERT IGNORE INTO domains (id, name, is_primary) VALUES ('d1', 'kolabpanel.com', TRUE);

  INSERT IGNORE INTO tunnels (hostname, service) VALUES 
  ('api.kolabpanel.com', 'http://127.0.0.1:5000'),
  ('app.kolabpanel.com', 'http://127.0.0.1:3000'),
  ('db.kolabpanel.com', 'http://127.0.0.1:3306');
`;

const initDB = async () => {
  console.log('[DB] Starting Database Initialization...');
  let rootConnection;
  try {
    // 1. Connect without DB selected to ensure DB exists
    rootConnection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        multipleStatements: true 
    });

    // Attempt to create database, ignoring "Schema directory already exists" error
    try {
        await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    } catch (createErr) {
        if (createErr.message && (createErr.message.includes('already exists') || createErr.message.includes('database exists'))) {
            console.warn(`[DB] Warning: Database directory exists (${createErr.message}). Attempting to proceed...`);
        } else {
            throw createErr;
        }
    }

    await rootConnection.changeUser({ database: process.env.DB_NAME });

    // Explicitly disable FK checks
    await rootConnection.query('SET FOREIGN_KEY_CHECKS = 0');

    // 2. Load Schema (Tables)
    // Manually ensure critical tables exist if schema.sql isn't read
    
    // Verifications Table (For Auth)
    await rootConnection.query(`
        CREATE TABLE IF NOT EXISTS verifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(191) NOT NULL,
          code VARCHAR(10) NOT NULL,
          type ENUM('REGISTER', 'RESET') NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          INDEX idx_email_type (email, type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Existing Tables (Quick check)
    await rootConnection.query(`
        CREATE TABLE IF NOT EXISTS \`databases\` (
          id VARCHAR(50) PRIMARY KEY,
          site_id VARCHAR(50),
          name VARCHAR(255),
          db_name VARCHAR(255),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Schema Load from file (Best effort)
    const schemaPath = path.resolve(__dirname, '..', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        // Simple splitter for safety
        const statements = schemaSql
            .replace(/--.*$/gm, '') 
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            if (statement.toUpperCase().startsWith('SET FOREIGN_KEY_CHECKS')) continue;
            try {
                await rootConnection.query(statement);
            } catch (stmtErr) {
                // Ignore if exists, otherwise log
                if (!stmtErr.message.includes('already exists')) {
                    console.warn(`[DB] Schema sync warning: ${stmtErr.message}`);
                }
            }
        }
    }

    // 4. Migrations (Backward compatibility)
    try {
        await rootConnection.query("ALTER TABLE users ADD COLUMN theme VARCHAR(10) DEFAULT 'light'");
    } catch (err) { /* ignore */ }

    // 5. Seed if empty
    try {
        const [rows] = await rootConnection.query('SELECT COUNT(*) as count FROM users');
        if (rows[0].count === 0) {
            await rootConnection.query(SEED_SQL);
            console.log('[DB] Seed data inserted.');
        }
    } catch(err) { console.warn("[DB] Skipping seed (tables might not be ready)"); }

    // 6. Data Consistency Check
    try {
        const [orphanedSites] = await rootConnection.query(`
            SELECT id, name FROM sites 
            WHERE has_database = 1 
            AND id NOT IN (SELECT site_id FROM \`databases\`)
        `);
        
        if (orphanedSites.length > 0) {
            console.log(`[DB] Found ${orphanedSites.length} sites with broken database links. Repairing...`);
            for (const site of orphanedSites) {
                 await rootConnection.query('UPDATE sites SET has_database = 0 WHERE id = ?', [site.id]);
            }
        }
    } catch (healErr) { /* ignore */ }

    // Re-enable FK checks
    await rootConnection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('[DB] Database ready.');
  } catch (err) {
    console.error('[DB] Initialization failed:', err.message);
  } finally {
      if (rootConnection) await rootConnection.end();
  }
};

module.exports = initDB;
