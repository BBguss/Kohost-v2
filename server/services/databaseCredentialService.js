/**
 * ============================================
 * DATABASE CREDENTIAL SERVICE
 * ============================================
 * 
 * Manages MySQL user credentials for hosting users:
 * - Create MySQL users on first database creation
 * - Encrypt/decrypt passwords
 * - Manage connection pools per user
 * - Sync credentials to Docker workspace
 * 
 * Security: Each user gets isolated MySQL credentials
 */

const mysql = require('mysql2/promise');
const crypto = require('crypto');
const pool = require('../db');

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Encryption key for passwords (should be in .env)
  encryptionKey: process.env.DB_ENCRYPTION_KEY || 'kohost-panel-secret-key-32char!',
  
  // MySQL admin credentials (for creating users/databases)
  adminHost: process.env.MYSQL_ADMIN_HOST || 'localhost',
  adminUser: process.env.MYSQL_ADMIN_USER || 'root',
  adminPassword: process.env.MYSQL_ADMIN_PASSWORD || process.env.DB_PASSWORD || '',
  
  // Docker host for container access
  dockerHost: 'host.docker.internal',
  
  // Naming conventions
  userPrefix: 'kohost_u_',
  dbPrefix: 'kohost_',
  
  // Limits
  defaultMaxDatabases: 5,
  defaultMaxConnections: 10,
};

// Connection pools per user
const userPools = new Map();

// ============================================
// ENCRYPTION UTILITIES
// ============================================

/**
 * Encrypt password using AES-256-GCM
 */
function encryptPassword(password) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(CONFIG.encryptionKey, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt password
 */
function decryptPassword(encryptedData) {
  try {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = crypto.scryptSync(CONFIG.encryptionKey, 'salt', 32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('[CredentialService] Decrypt error:', error.message);
    throw new Error('Failed to decrypt password');
  }
}

/**
 * Generate secure random password
 */
function generateSecurePassword(length = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  
  return password;
}

// ============================================
// MYSQL USER MANAGEMENT
// ============================================

/**
 * Get admin MySQL connection (for creating users/databases)
 */
async function getAdminConnection() {
  return await mysql.createConnection({
    host: CONFIG.adminHost,
    user: CONFIG.adminUser,
    password: CONFIG.adminPassword,
    multipleStatements: true,
  });
}

/**
 * Generate MySQL username from user ID
 */
function generateMySQLUsername(userId) {
  // Take first 8 chars of userId to keep username short
  const shortId = userId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
  return `${CONFIG.userPrefix}${shortId}`;
}

/**
 * Generate database name
 * Format: db_projectname (user-friendly, based on project/site name)
 * If customName is provided, use it directly (after sanitization)
 */
function generateDatabaseName(userId, displayName, customName = null) {
  // If custom name provided, use it with db_ prefix
  if (customName) {
    const safeName = customName.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 48).toLowerCase();
    // Add db_ prefix if not already present
    if (safeName.startsWith('db_')) {
      return safeName;
    }
    return `db_${safeName}`;
  }
  
  // Default: use display name with db_ prefix
  const safeName = displayName.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 48).toLowerCase();
  return `db_${safeName}`;
}

/**
 * Validate database name (check if available)
 */
async function validateDatabaseName(dbName) {
  const connection = await getAdminConnection();
  try {
    const [existing] = await connection.query(`
      SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?
    `, [dbName]);
    
    if (existing.length > 0) {
      return { valid: false, error: `Database '${dbName}' already exists` };
    }
    return { valid: true };
  } finally {
    await connection.end();
  }
}

/**
 * Create MySQL user for hosting user (if not exists)
 */
async function createMySQLUser(userId) {
  const connection = await getAdminConnection();
  
  try {
    // Check if credentials already exist
    const [existing] = await pool.execute(
      'SELECT * FROM user_db_credentials WHERE user_id = ?',
      [userId]
    );
    
    if (existing.length > 0) {
      console.log(`[CredentialService] MySQL user already exists for user: ${userId}`);
      return {
        mysqlUser: existing[0].mysql_user,
        password: decryptPassword(existing[0].mysql_password_hash),
        isNew: false,
      };
    }
    
    // Generate new credentials
    const mysqlUser = generateMySQLUsername(userId);
    const password = generateSecurePassword();
    
    // Create MySQL user
    await connection.query(`
      CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?
    `, [mysqlUser, password]);
    
    // Grant privileges on user's databases (pattern: kohost_{userId}_*)
    const shortId = userId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
    const dbPattern = `${CONFIG.dbPrefix}${shortId}\\_%`;
    
    await connection.query(`
      GRANT ALL PRIVILEGES ON \`${dbPattern}\`.* TO ?@'%'
    `, [mysqlUser]);
    
    await connection.query('FLUSH PRIVILEGES');
    
    // Store encrypted credentials in panel database
    await pool.execute(`
      INSERT INTO user_db_credentials 
      (user_id, mysql_user, mysql_password_hash, max_databases, max_connections)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, mysqlUser, encryptPassword(password), CONFIG.defaultMaxDatabases, CONFIG.defaultMaxConnections]);
    
    console.log(`[CredentialService] ✅ Created MySQL user: ${mysqlUser} for user: ${userId}`);
    
    return {
      mysqlUser,
      password,
      isNew: true,
    };
  } finally {
    await connection.end();
  }
}

/**
 * Get user's MySQL credentials
 */
async function getUserCredentials(userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM user_db_credentials WHERE user_id = ?',
    [userId]
  );
  
  if (rows.length === 0) {
    // Create credentials if not exist
    return await createMySQLUser(userId);
  }
  
  return {
    mysqlUser: rows[0].mysql_user,
    password: decryptPassword(rows[0].mysql_password_hash),
    maxDatabases: rows[0].max_databases,
    maxConnections: rows[0].max_connections,
    isNew: false,
  };
}

/**
 * Get or create connection pool for user
 */
async function getUserPool(userId, database = null) {
  const creds = await getUserCredentials(userId);
  const poolKey = database ? `${userId}:${database}` : userId;
  
  if (!userPools.has(poolKey)) {
    const poolConfig = {
      host: CONFIG.adminHost,
      user: creds.mysqlUser,
      password: creds.password,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 10,
    };
    
    if (database) {
      poolConfig.database = database;
    }
    
    userPools.set(poolKey, mysql.createPool(poolConfig));
    console.log(`[CredentialService] Created pool for: ${poolKey}`);
  }
  
  return userPools.get(poolKey);
}

// ============================================
// DATABASE MANAGEMENT
// ============================================

/**
 * Create database for user
 * @param {string} userId - User ID
 * @param {string} displayName - Display name for the database
 * @param {string|null} siteId - Associated site ID (optional)
 * @param {string|null} customDbName - Custom database name (optional, e.g., "db_myproject")
 */
async function createDatabase(userId, displayName, siteId = null, customDbName = null) {
  // Get/create user credentials first
  const creds = await getUserCredentials(userId);
  
  // Check database limit
  const [existing] = await pool.execute(
    'SELECT COUNT(*) as count FROM user_databases WHERE user_id = ?',
    [userId]
  );
  
  const [credRow] = await pool.execute(
    'SELECT max_databases FROM user_db_credentials WHERE user_id = ?',
    [userId]
  );
  
  const maxDbs = credRow[0]?.max_databases || CONFIG.defaultMaxDatabases;
  
  if (existing[0].count >= maxDbs) {
    throw new Error(`Database limit reached (${maxDbs}). Upgrade your plan for more.`);
  }
  
  // Generate database name (use custom if provided)
  const dbName = customDbName 
    ? generateDatabaseName(userId, displayName, customDbName)
    : generateDatabaseName(userId, displayName);
  
  // Validate database name is available
  const validation = await validateDatabaseName(dbName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // Create database using admin connection
  const adminConn = await getAdminConnection();
  
  try {
    await adminConn.query(`
      CREATE DATABASE IF NOT EXISTS \`${dbName}\`
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
    `);
    
    // Grant access to user
    await adminConn.query(`
      GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO ?@'%'
    `, [creds.mysqlUser]);
    
    await adminConn.query('FLUSH PRIVILEGES');
    
    // Record in user_databases
    await pool.execute(`
      INSERT INTO user_databases 
      (user_id, site_id, db_name, display_name, db_host, db_port)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, siteId, dbName, displayName, CONFIG.adminHost, 3306]);
    
    console.log(`[CredentialService] ✅ Created database: ${dbName}`);
    
    return {
      dbName,
      displayName,
      mysqlUser: creds.mysqlUser,
      host: CONFIG.adminHost,
      dockerHost: CONFIG.dockerHost,
      port: 3306,
    };
  } finally {
    await adminConn.end();
  }
}

/**
 * Get all databases for user
 */
async function getUserDatabases(userId) {
  const [databases] = await pool.execute(`
    SELECT 
      ud.id,
      ud.db_name,
      ud.display_name,
      ud.db_host,
      ud.db_port,
      ud.size_mb,
      ud.tables_count,
      ud.created_at,
      s.name as site_name
    FROM user_databases ud
    LEFT JOIN sites s ON ud.site_id = s.id
    WHERE ud.user_id = ?
    ORDER BY ud.created_at DESC
  `, [userId]);
  
  return databases;
}

/**
 * Drop database
 */
async function dropDatabase(userId, dbName) {
  // Verify ownership
  const [owned] = await pool.execute(
    'SELECT id FROM user_databases WHERE user_id = ? AND db_name = ?',
    [userId, dbName]
  );
  
  if (owned.length === 0) {
    throw new Error('Database not found or access denied');
  }
  
  const adminConn = await getAdminConnection();
  
  try {
    await adminConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await pool.execute('DELETE FROM user_databases WHERE db_name = ?', [dbName]);
    
    // Remove pool if exists
    const poolKey = `${userId}:${dbName}`;
    if (userPools.has(poolKey)) {
      await userPools.get(poolKey).end();
      userPools.delete(poolKey);
    }
    
    console.log(`[CredentialService] ✅ Dropped database: ${dbName}`);
    return true;
  } finally {
    await adminConn.end();
  }
}

/**
 * Verify user owns a database
 */
async function verifyDatabaseOwnership(userId, dbName) {
  const [rows] = await pool.execute(
    'SELECT id FROM user_databases WHERE user_id = ? AND db_name = ?',
    [userId, dbName]
  );
  return rows.length > 0;
}

// ============================================
// TERMINAL INTEGRATION
// ============================================

/**
 * Generate .env content for Docker workspace
 */
async function generateEnvForWorkspace(userId) {
  const creds = await getUserCredentials(userId);
  const databases = await getUserDatabases(userId);
  
  let envContent = `# ============================================
# KOHOST DATABASE CREDENTIALS
# ============================================
# Auto-generated - DO NOT EDIT MANUALLY
# Generated at: ${new Date().toISOString()}

# MySQL Connection (for Docker containers)
DB_CONNECTION=mysql
DB_HOST=${CONFIG.dockerHost}
DB_PORT=3306
DB_USERNAME=${creds.mysqlUser}
DB_PASSWORD=${creds.password}

`;

  // Add each database
  if (databases.length > 0) {
    envContent += `# Default database (first one)\n`;
    envContent += `DB_DATABASE=${databases[0].db_name}\n\n`;
    
    envContent += `# All available databases:\n`;
    databases.forEach((db, index) => {
      envContent += `# [${index + 1}] ${db.display_name}: ${db.db_name}\n`;
    });
  }
  
  return envContent;
}

/**
 * Sync credentials to Docker container workspace
 */
async function syncCredentialsToContainer(userId, containerName) {
  const { spawn } = require('child_process');
  const envContent = await generateEnvForWorkspace(userId);
  
  return new Promise((resolve, reject) => {
    // Create .kohost directory and write env file
    const cmd = `mkdir -p /workspace/.kohost && cat > /workspace/.kohost/database.env << 'ENVEOF'
${envContent}
ENVEOF`;

    const docker = spawn('docker', ['exec', containerName, 'sh', '-c', cmd]);
    
    let stderr = '';
    docker.stderr.on('data', (data) => stderr += data.toString());
    
    docker.on('close', (code) => {
      if (code === 0) {
        console.log(`[CredentialService] ✅ Synced credentials to container: ${containerName}`);
        resolve(true);
      } else {
        console.error(`[CredentialService] Failed to sync: ${stderr}`);
        reject(new Error(`Sync failed: ${stderr}`));
      }
    });
  });
}

// ============================================
// AUDIT LOGGING
// ============================================

/**
 * Log database action for audit trail
 */
async function logAuditAction(userId, action, details = {}) {
  try {
    await pool.execute(`
      INSERT INTO db_audit_logs 
      (user_id, action, database_name, table_name, query_preview, rows_affected, ip_address, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      action,
      details.database || null,
      details.table || null,
      details.query ? details.query.substring(0, 500) : null,
      details.rowsAffected || 0,
      details.ip || null,
      details.status || 'success',
      details.error || null,
    ]);
  } catch (error) {
    console.error('[CredentialService] Audit log error:', error.message);
  }
}

// ============================================
// DATABASE DISCOVERY & SYNC
// ============================================

/**
 * Discover databases created outside UI (e.g., via terminal/migrate)
 * Syncs MySQL databases with user_databases table
 */
async function discoverUserDatabases(userId) {
  const creds = await getUserCredentials(userId);
  const adminConn = await getAdminConnection();
  
  try {
    const shortId = userId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toLowerCase();
    const dbPattern = `${CONFIG.dbPrefix}${shortId}_%`;
    
    // Get all databases that match user's pattern
    const [mysqlDatabases] = await adminConn.query(`
      SHOW DATABASES LIKE ?
    `, [dbPattern]);
    
    // Get currently tracked databases
    const [trackedDatabases] = await pool.execute(
      'SELECT db_name FROM user_databases WHERE user_id = ?',
      [userId]
    );
    
    const trackedNames = new Set(trackedDatabases.map(d => d.db_name));
    const discovered = [];
    
    // Find databases not yet tracked
    for (const row of mysqlDatabases) {
      const dbName = Object.values(row)[0];
      
      if (!trackedNames.has(dbName)) {
        // Extract display name from database name
        // Format: kohost_{shortId}_{displayName}
        const prefix = `${CONFIG.dbPrefix}${shortId}_`;
        const displayName = dbName.substring(prefix.length) || dbName;
        
        // Get database stats
        let tablesCount = 0;
        let sizeMb = 0;
        
        try {
          const [tables] = await adminConn.query(`
            SELECT COUNT(*) as count FROM information_schema.tables 
            WHERE table_schema = ?
          `, [dbName]);
          tablesCount = tables[0]?.count || 0;
          
          const [size] = await adminConn.query(`
            SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
            FROM information_schema.tables 
            WHERE table_schema = ?
          `, [dbName]);
          sizeMb = size[0]?.size_mb || 0;
        } catch (e) {
          console.warn(`[CredentialService] Could not get stats for ${dbName}:`, e.message);
        }
        
        // Add to tracking
        await pool.execute(`
          INSERT INTO user_databases 
          (user_id, site_id, db_name, display_name, db_host, db_port, tables_count, size_mb)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
        `, [userId, dbName, displayName, CONFIG.adminHost, 3306, tablesCount, sizeMb]);
        
        discovered.push({
          db_name: dbName,
          display_name: displayName,
          tables_count: tablesCount,
          size_mb: sizeMb,
        });
        
        console.log(`[CredentialService] 📥 Discovered database: ${dbName}`);
      }
    }
    
    return {
      discovered,
      totalTracked: trackedNames.size + discovered.length,
    };
  } finally {
    await adminConn.end();
  }
}

/**
 * Import an existing database (e.g., donasi1) into user's management
 * This allows users to manage databases they created with root access
 */
async function importExternalDatabase(userId, existingDbName, displayName = null) {
  const creds = await getUserCredentials(userId);
  const adminConn = await getAdminConnection();
  
  try {
    // Check if database exists
    const [exists] = await adminConn.query(`
      SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?
    `, [existingDbName]);
    
    if (exists.length === 0) {
      throw new Error(`Database '${existingDbName}' not found`);
    }
    
    // Check if already tracked
    const [tracked] = await pool.execute(
      'SELECT id FROM user_databases WHERE db_name = ?',
      [existingDbName]
    );
    
    if (tracked.length > 0) {
      throw new Error(`Database '${existingDbName}' is already managed`);
    }
    
    // Grant user access to this database
    await adminConn.query(`
      GRANT ALL PRIVILEGES ON \`${existingDbName}\`.* TO ?@'%'
    `, [creds.mysqlUser]);
    
    await adminConn.query('FLUSH PRIVILEGES');
    
    // Get stats
    const [tables] = await adminConn.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = ?
    `, [existingDbName]);
    
    const [size] = await adminConn.query(`
      SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
      FROM information_schema.tables 
      WHERE table_schema = ?
    `, [existingDbName]);
    
    // Add to tracking
    const finalDisplayName = displayName || existingDbName;
    await pool.execute(`
      INSERT INTO user_databases 
      (user_id, site_id, db_name, display_name, db_host, db_port, tables_count, size_mb)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `, [userId, existingDbName, finalDisplayName, CONFIG.adminHost, 3306, 
        tables[0]?.count || 0, size[0]?.size_mb || 0]);
    
    console.log(`[CredentialService] ✅ Imported external database: ${existingDbName} for user ${userId}`);
    
    return {
      db_name: existingDbName,
      display_name: finalDisplayName,
      tables_count: tables[0]?.count || 0,
      size_mb: size[0]?.size_mb || 0,
      imported: true,
    };
  } finally {
    await adminConn.end();
  }
}

/**
 * Update database stats (size, tables count)
 */
async function refreshDatabaseStats(userId) {
  const adminConn = await getAdminConnection();
  
  try {
    const [databases] = await pool.execute(
      'SELECT id, db_name FROM user_databases WHERE user_id = ?',
      [userId]
    );
    
    for (const db of databases) {
      try {
        const [tables] = await adminConn.query(`
          SELECT COUNT(*) as count FROM information_schema.tables 
          WHERE table_schema = ?
        `, [db.db_name]);
        
        const [size] = await adminConn.query(`
          SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
          FROM information_schema.tables 
          WHERE table_schema = ?
        `, [db.db_name]);
        
        await pool.execute(`
          UPDATE user_databases SET tables_count = ?, size_mb = ? WHERE id = ?
        `, [tables[0]?.count || 0, size[0]?.size_mb || 0, db.id]);
      } catch (e) {
        console.warn(`[CredentialService] Could not refresh stats for ${db.db_name}`);
      }
    }
    
    return true;
  } finally {
    await adminConn.end();
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Credential management
  createMySQLUser,
  getUserCredentials,
  getUserPool,
  
  // Database operations
  createDatabase,
  getUserDatabases,
  dropDatabase,
  verifyDatabaseOwnership,
  generateDatabaseName,
  validateDatabaseName,
  
  // Database discovery & sync
  discoverUserDatabases,
  importExternalDatabase,
  refreshDatabaseStats,
  
  // Terminal integration
  generateEnvForWorkspace,
  syncCredentialsToContainer,
  
  // Utilities
  encryptPassword,
  decryptPassword,
  logAuditAction,
  
  // Config access
  CONFIG,
};
