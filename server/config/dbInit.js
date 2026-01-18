
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

    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    await rootConnection.changeUser({ database: process.env.DB_NAME });

    // 2. Ensure 'databases' table exists (Fix for ER_NO_SUCH_TABLE)
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

    // 3. Ensure 'command_logs' table exists (For Terminal Logs)
    await rootConnection.query(`
        CREATE TABLE IF NOT EXISTS command_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(50) NOT NULL,
          site_id VARCHAR(50) NOT NULL,
          command TEXT NOT NULL,
          type ENUM('windows', 'ssh') NOT NULL,
          status ENUM('success', 'error') NOT NULL,
          error TEXT,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          INDEX idx_user_site (user_id, site_id),
          INDEX idx_executed_at (executed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Schema Load (Only if tables are missing - heuristic check)
    const schemaPath = path.resolve(__dirname, '..', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        // Uncomment below if you want to force schema sync:
        // const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        // await rootConnection.query(schemaSql);
    }

    // 5. Migrations (Auto-patching)
    try {
        await rootConnection.query("ALTER TABLE users ADD COLUMN theme VARCHAR(10) DEFAULT 'light'");
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') { /* ignore */ }
    }

    // 6. Seed if empty
    const [rows] = await rootConnection.query('SELECT COUNT(*) as count FROM users');
    if (rows[0].count === 0) {
        await rootConnection.query(SEED_SQL);
        console.log('[DB] Seed data inserted.');
    }

    // 7. Data Consistency Check (Self-Healing)
    // Fix sites that think they have a DB but don't have a metadata record (e.g. from failed deployments)
    try {
        const [orphanedSites] = await rootConnection.query(`
            SELECT id, name FROM sites 
            WHERE has_database = 1 
            AND id NOT IN (SELECT site_id FROM \`databases\`)
        `);
        
        if (orphanedSites.length > 0) {
            console.log(`[DB] Found ${orphanedSites.length} sites with broken database links. Repairing...`);
            for (const site of orphanedSites) {
                 // Reset flag so user can recreate DB cleanly
                 await rootConnection.query('UPDATE sites SET has_database = 0 WHERE id = ?', [site.id]);
                 console.log(`[DB] Reset has_database=0 for site '${site.name}' (${site.id})`);
            }
        }
    } catch (healErr) {
        console.warn('[DB] Self-healing skipped:', healErr.message);
    }

    console.log('[DB] Database ready.');
  } catch (err) {
    console.error('[DB] Initialization failed:', err.message);
  } finally {
      if (rootConnection) await rootConnection.end();
  }
};

module.exports = initDB;
