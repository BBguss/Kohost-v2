/**
 * ============================================
 * USER DATABASE CONTROLLER
 * ============================================
 * 
 * Database management endpoints with user isolation.
 * Each user has their own MySQL credentials and databases.
 * 
 * Features:
 * - User-specific MySQL credentials
 * - Database CRUD with ownership validation
 * - Terminal integration (credential sync)
 * - Audit logging
 */

const pool = require('../db');
const credentialService = require('../services/databaseCredentialService');
const sqlValidator = require('../services/sqlValidatorService');
const fs = require('fs');
const path = require('path');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get userId from request (from JWT middleware)
 */
const getUserId = (req) => {
  return req.user?.id || req.body?.userId || req.query?.userId;
};

/**
 * Get client IP address
 */
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         'unknown';
};

// ============================================
// CREDENTIAL MANAGEMENT
// ============================================

/**
 * GET /api/user-db/credentials
 * Get current user's MySQL credentials
 */
exports.getCredentials = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const creds = await credentialService.getUserCredentials(userId);
    
    // Don't expose the actual password in API response
    // Only show for first-time setup or explicit request
    res.json({
      success: true,
      credentials: {
        mysqlUser: creds.mysqlUser,
        host: 'localhost',
        dockerHost: 'host.docker.internal',
        port: 3306,
        isNew: creds.isNew,
        // Only show password once when newly created
        password: creds.isNew ? creds.password : undefined,
      },
      message: creds.isNew 
        ? 'MySQL credentials created! Save the password, it will only be shown once.'
        : 'MySQL credentials retrieved.',
    });
    
    // Log action
    await credentialService.logAuditAction(userId, 'GET_CREDENTIALS', {
      ip: getClientIP(req),
    });
    
  } catch (error) {
    console.error('[UserDB] getCredentials error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/user-db/credentials/reset
 * Reset MySQL password (generates new one)
 */
exports.resetPassword = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // This would regenerate the password - implementation needed
    // For security, we don't allow password reset via API in this version
    res.status(501).json({ 
      error: 'Password reset not available via API. Contact support.' 
    });
    
  } catch (error) {
    console.error('[UserDB] resetPassword error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// DATABASE CRUD
// ============================================

/**
 * GET /api/user-db/databases
 * List all databases owned by current user
 */
exports.listDatabases = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const databases = await credentialService.getUserDatabases(userId);
    const creds = await credentialService.getUserCredentials(userId);
    
    // Get limits
    const [credRow] = await pool.execute(
      'SELECT max_databases FROM user_db_credentials WHERE user_id = ?',
      [userId]
    );
    
    res.json({
      success: true,
      databases: databases.map(db => ({
        id: db.id,
        name: db.display_name,
        fullName: db.db_name,
        host: db.db_host,
        port: db.db_port,
        sizeMb: db.size_mb,
        tablesCount: db.tables_count,
        siteName: db.site_name,
        createdAt: db.created_at,
      })),
      limits: {
        current: databases.length,
        max: credRow[0]?.max_databases || 5,
      },
      connection: {
        mysqlUser: creds.mysqlUser,
        host: 'localhost',
        dockerHost: 'host.docker.internal',
        port: 3306,
      },
    });
    
  } catch (error) {
    console.error('[UserDB] listDatabases error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/user-db/databases
 * Create new database for user
 */
exports.createDatabase = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { name, siteId } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Database name is required' });
    }
    
    // Validate name
    const validation = sqlValidator.validateTableName(name);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // customDbName allows user to set exact database name like "db_myproject"
    const { customDbName } = req.body;
    
    const result = await credentialService.createDatabase(userId, name, siteId, customDbName);
    
    // Log action
    await credentialService.logAuditAction(userId, 'CREATE_DATABASE', {
      database: result.dbName,
      ip: getClientIP(req),
    });
    
    res.status(201).json({
      success: true,
      database: {
        name: name,
        fullName: result.dbName,
        mysqlUser: result.mysqlUser,
        host: result.host,
        dockerHost: result.dockerHost,
        port: result.port,
      },
      envConfig: `
# Add these to your .env file:
DB_CONNECTION=mysql
DB_HOST=${result.dockerHost}
DB_PORT=${result.port}
DB_DATABASE=${result.dbName}
DB_USERNAME=${result.mysqlUser}
DB_PASSWORD=********
      `.trim(),
      message: `Database '${name}' created successfully!`,
    });
    
  } catch (error) {
    console.error('[UserDB] createDatabase error:', error);
    
    if (error.message.includes('limit reached')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
};

/**
 * DELETE /api/user-db/databases/:dbName
 * Drop database (requires confirmation)
 */
exports.dropDatabase = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { dbName } = req.params;
    const { confirm } = req.body;
    
    if (confirm !== dbName) {
      return res.status(400).json({ 
        error: 'Confirmation required. Send { confirm: "database_name" } to confirm deletion.',
        requireConfirm: true,
      });
    }
    
    await credentialService.dropDatabase(userId, dbName);
    
    // Log action
    await credentialService.logAuditAction(userId, 'DROP_DATABASE', {
      database: dbName,
      ip: getClientIP(req),
    });
    
    res.json({
      success: true,
      message: `Database '${dbName}' has been deleted permanently.`,
    });
    
  } catch (error) {
    console.error('[UserDB] dropDatabase error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/user-db/databases/:dbName/info
 * Get database info (size, tables, etc.)
 */
exports.getDatabaseInfo = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { dbName } = req.params;
    
    // Verify ownership
    if (!await credentialService.verifyDatabaseOwnership(userId, dbName)) {
      return res.status(403).json({ error: 'Access denied to this database' });
    }
    
    const userPool = await credentialService.getUserPool(userId, dbName);
    
    // Get database size
    const [sizeResult] = await userPool.query(`
      SELECT 
        SUM(data_length + index_length) / 1024 / 1024 AS size_mb,
        COUNT(*) as tables_count
      FROM information_schema.TABLES 
      WHERE table_schema = ?
    `, [dbName]);
    
    // Get tables
    const [tables] = await userPool.query(`
      SELECT 
        TABLE_NAME as name,
        TABLE_ROWS as rows,
        ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024, 2) as size_kb,
        ENGINE as engine,
        CREATE_TIME as created_at
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [dbName]);
    
    res.json({
      success: true,
      database: {
        name: dbName,
        sizeMb: parseFloat(sizeResult[0]?.size_mb || 0).toFixed(2),
        tablesCount: sizeResult[0]?.tables_count || 0,
      },
      tables,
    });
    
  } catch (error) {
    console.error('[UserDB] getDatabaseInfo error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// SQL QUERY EXECUTION
// ============================================

/**
 * POST /api/user-db/databases/:dbName/query
 * Execute SQL query with validation
 */
exports.executeQuery = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { dbName } = req.params;
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Verify ownership
    if (!await credentialService.verifyDatabaseOwnership(userId, dbName)) {
      return res.status(403).json({ error: 'Access denied to this database' });
    }
    
    // Get all user's databases for cross-db validation
    const userDatabases = await credentialService.getUserDatabases(userId);
    const allowedDbs = userDatabases.map(db => db.db_name);
    
    // Validate query
    const validation = sqlValidator.validateQuery(query, allowedDbs);
    
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Query validation failed',
        details: validation.errors,
      });
    }
    
    if (validation.requiresConfirmation && !req.body.confirmed) {
      return res.json({
        requiresConfirmation: true,
        warnings: validation.warnings,
        statementType: validation.statementType,
        message: 'This query requires confirmation. Resend with confirmed: true',
      });
    }
    
    // Execute query
    const userPool = await credentialService.getUserPool(userId, dbName);
    const startTime = Date.now();
    
    const [results] = await userPool.query(query);
    
    const executionTime = Date.now() - startTime;
    
    // Log query
    await credentialService.logAuditAction(userId, 'EXECUTE_QUERY', {
      database: dbName,
      query: query,
      rowsAffected: results.affectedRows || (Array.isArray(results) ? results.length : 0),
      ip: getClientIP(req),
    });
    
    // Store in query history
    try {
      await pool.execute(`
        INSERT INTO db_query_history 
        (user_id, database_name, query_text, query_type, execution_time_ms, rows_returned)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        userId, 
        dbName, 
        query.substring(0, 5000), 
        validation.statementType || 'OTHER',
        executionTime,
        Array.isArray(results) ? results.length : 0,
      ]);
    } catch (historyError) {
      console.warn('[UserDB] Failed to save query history:', historyError.message);
    }
    
    res.json({
      success: true,
      statementType: validation.statementType,
      executionTimeMs: executionTime,
      results: Array.isArray(results) ? results : null,
      affectedRows: results.affectedRows,
      insertId: results.insertId,
      warnings: validation.warnings,
    });
    
  } catch (error) {
    console.error('[UserDB] executeQuery error:', error);
    
    // Log failed query
    const userId = getUserId(req);
    if (userId) {
      await credentialService.logAuditAction(userId, 'EXECUTE_QUERY', {
        database: req.params.dbName,
        query: req.body.query,
        status: 'failed',
        error: error.message,
        ip: getClientIP(req),
      });
    }
    
    res.status(400).json({ 
      error: 'Query execution failed',
      mysqlError: error.message,
      sqlState: error.sqlState,
    });
  }
};

/**
 * GET /api/user-db/databases/:dbName/history
 * Get query history for database
 */
exports.getQueryHistory = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { dbName } = req.params;
    const { limit = 50 } = req.query;
    
    const [history] = await pool.execute(`
      SELECT 
        id, query_text, query_type, execution_time_ms, 
        rows_returned, is_favorite, executed_at
      FROM db_query_history
      WHERE user_id = ? AND database_name = ?
      ORDER BY executed_at DESC
      LIMIT ?
    `, [userId, dbName, parseInt(limit)]);
    
    res.json({
      success: true,
      history,
    });
    
  } catch (error) {
    console.error('[UserDB] getQueryHistory error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// TERMINAL INTEGRATION
// ============================================

/**
 * POST /api/user-db/sync-terminal
 * Sync database credentials to Docker container workspace
 */
exports.syncToTerminal = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { containerName } = req.body;
    
    if (!containerName) {
      return res.status(400).json({ error: 'Container name is required' });
    }
    
    await credentialService.syncCredentialsToContainer(userId, containerName);
    
    res.json({
      success: true,
      message: 'Credentials synced to container workspace',
      path: '/workspace/.kohost/database.env',
    });
    
  } catch (error) {
    console.error('[UserDB] syncToTerminal error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/user-db/env-content
 * Get .env content for manual copy
 */
exports.getEnvContent = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const envContent = await credentialService.generateEnvForWorkspace(userId);
    
    res.json({
      success: true,
      envContent,
    });
    
  } catch (error) {
    console.error('[UserDB] getEnvContent error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// DATABASE DISCOVERY & SYNC
// ============================================

/**
 * POST /api/user-db/discover
 * Discover databases created via terminal/migrate and sync to UI
 */
exports.discoverDatabases = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const result = await credentialService.discoverUserDatabases(userId);
    
    // Log action
    await credentialService.logAuditAction(userId, 'DISCOVER_DATABASES', {
      ip: getClientIP(req),
    });
    
    res.json({
      success: true,
      discovered: result.discovered,
      discoveredCount: result.discovered.length,
      totalDatabases: result.totalTracked,
      message: result.discovered.length > 0 
        ? `Found ${result.discovered.length} new database(s) created outside UI`
        : 'No new databases found',
    });
    
  } catch (error) {
    console.error('[UserDB] discoverDatabases error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/user-db/import-external
 * Import an existing database (e.g., created with root) into user's management
 */
exports.importExternalDatabase = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const { databaseName, displayName } = req.body;
    
    if (!databaseName) {
      return res.status(400).json({ error: 'Database name is required' });
    }
    
    const result = await credentialService.importExternalDatabase(userId, databaseName, displayName);
    
    // Log action
    await credentialService.logAuditAction(userId, 'IMPORT_EXTERNAL_DATABASE', {
      database: databaseName,
      ip: getClientIP(req),
    });
    
    // Get credentials for response
    const creds = await credentialService.getUserCredentials(userId);
    
    res.json({
      success: true,
      database: {
        name: result.display_name,
        fullName: result.db_name,
        tablesCount: result.tables_count,
        sizeMb: result.size_mb,
      },
      connection: {
        mysqlUser: creds.mysqlUser,
        host: 'localhost',
        dockerHost: 'host.docker.internal',
        port: 3306,
      },
      envConfig: `
# Update your .env file:
DB_CONNECTION=mysql
DB_HOST=host.docker.internal
DB_PORT=3306
DB_DATABASE=${result.db_name}
DB_USERNAME=${creds.mysqlUser}
DB_PASSWORD=<your_password>
      `.trim(),
      message: `Database '${databaseName}' imported successfully! You can now manage it from this panel.`,
    });
    
  } catch (error) {
    console.error('[UserDB] importExternalDatabase error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/user-db/refresh-stats
 * Refresh database statistics (size, tables count)
 */
exports.refreshStats = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    await credentialService.refreshDatabaseStats(userId);
    
    // Return updated database list
    const databases = await credentialService.getUserDatabases(userId);
    
    res.json({
      success: true,
      databases: databases.map(db => ({
        id: db.id,
        name: db.display_name,
        fullName: db.db_name,
        sizeMb: db.size_mb,
        tablesCount: db.tables_count,
      })),
      message: 'Database statistics refreshed',
    });
    
  } catch (error) {
    console.error('[UserDB] refreshStats error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// IMPORT / EXPORT
// ============================================

/**
 * POST /api/user-db/databases/:dbName/import
 * Import SQL file with security validation
 */
exports.importDatabase = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { dbName } = req.params;
    
    // Verify ownership
    if (!await credentialService.verifyDatabaseOwnership(userId, dbName)) {
      return res.status(403).json({ error: 'Access denied to this database' });
    }
    
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'SQL file is required' });
    }
    
    // Read file content
    let sqlContent;
    if (file.buffer) {
      sqlContent = file.buffer.toString('utf-8');
    } else if (file.path) {
      sqlContent = fs.readFileSync(file.path, 'utf-8');
    } else {
      return res.status(400).json({ error: 'Unable to read file' });
    }
    
    // Get allowed databases
    const userDatabases = await credentialService.getUserDatabases(userId);
    const allowedDbs = userDatabases.map(db => db.db_name);
    
    // Validate SQL file
    const validation = sqlValidator.validateImportFile(sqlContent, allowedDbs);
    
    if (!validation.valid) {
      // Clean up temp file
      if (file.path) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }
      
      return res.status(400).json({
        error: 'SQL file contains blocked statements',
        blockedLines: validation.blockedLines.slice(0, 10),
        totalBlocked: validation.blockedLines.length,
      });
    }
    
    // Execute import
    const userPool = await credentialService.getUserPool(userId, dbName);
    
    // Split and execute statements
    const statements = sqlContent
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));
    
    let executed = 0;
    let failed = 0;
    const errors = [];
    
    // Use transaction
    const connection = await userPool.getConnection();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.beginTransaction();
    
    try {
      for (const stmt of statements) {
        try {
          await connection.query(stmt);
          executed++;
        } catch (stmtError) {
          failed++;
          errors.push({
            statement: stmt.substring(0, 100),
            error: stmtError.message,
          });
          
          if (failed > 10) {
            throw new Error('Too many errors, import aborted');
          }
        }
      }
      
      await connection.commit();
    } catch (txError) {
      await connection.rollback();
      throw txError;
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      connection.release();
    }
    
    // Clean up temp file
    if (file.path) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
    
    // Log action
    await credentialService.logAuditAction(userId, 'IMPORT_SQL', {
      database: dbName,
      rowsAffected: executed,
      ip: getClientIP(req),
    });
    
    res.json({
      success: true,
      executed,
      failed,
      errors: errors.slice(0, 5),
      message: `Import complete: ${executed} statements executed, ${failed} failed.`,
    });
    
  } catch (error) {
    console.error('[UserDB] importDatabase error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/user-db/databases/:dbName/export
 * Export database to SQL file
 */
exports.exportDatabase = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { dbName } = req.params;
    const { tables, includeData = 'true' } = req.query;
    
    // Verify ownership
    if (!await credentialService.verifyDatabaseOwnership(userId, dbName)) {
      return res.status(403).json({ error: 'Access denied to this database' });
    }
    
    const userPool = await credentialService.getUserPool(userId, dbName);
    
    // Get tables to export
    let tablesToExport = [];
    if (tables) {
      tablesToExport = tables.split(',').map(t => t.trim());
    } else {
      const [allTables] = await userPool.query(`
        SELECT TABLE_NAME FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
      `, [dbName]);
      tablesToExport = allTables.map(t => t.TABLE_NAME);
    }
    
    // Build SQL dump
    let sqlDump = `-- KoHost SQL Export
-- Database: ${dbName}
-- Date: ${new Date().toISOString()}
-- Tables: ${tablesToExport.join(', ')}

SET FOREIGN_KEY_CHECKS = 0;

`;
    
    for (const tableName of tablesToExport) {
      // Get CREATE TABLE statement
      const [createResult] = await userPool.query(`SHOW CREATE TABLE \`${tableName}\``);
      if (createResult[0]) {
        sqlDump += `-- Table: ${tableName}\n`;
        sqlDump += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
        sqlDump += createResult[0]['Create Table'] + ';\n\n';
        
        // Get data if requested
        if (includeData === 'true') {
          const [rows] = await userPool.query(`SELECT * FROM \`${tableName}\``);
          
          if (rows.length > 0) {
            const columns = Object.keys(rows[0]);
            const columnList = columns.map(c => `\`${c}\``).join(', ');
            
            sqlDump += `-- Data for ${tableName}\n`;
            
            for (const row of rows) {
              const values = columns.map(col => {
                const val = row[col];
                if (val === null) return 'NULL';
                if (typeof val === 'number') return val;
                if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
                return `'${String(val).replace(/'/g, "''")}'`;
              });
              
              sqlDump += `INSERT INTO \`${tableName}\` (${columnList}) VALUES (${values.join(', ')});\n`;
            }
            
            sqlDump += '\n';
          }
        }
      }
    }
    
    sqlDump += 'SET FOREIGN_KEY_CHECKS = 1;\n';
    
    // Log action
    await credentialService.logAuditAction(userId, 'EXPORT_SQL', {
      database: dbName,
      ip: getClientIP(req),
    });
    
    // Send as file download
    const filename = `${dbName}_${new Date().toISOString().slice(0, 10)}.sql`;
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sqlDump);
    
  } catch (error) {
    console.error('[UserDB] exportDatabase error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// EXPORTS
// ============================================

module.exports = exports;
