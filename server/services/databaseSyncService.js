/**
 * ============================================
 * DATABASE SYNC SERVICE
 * ============================================
 * 
 * Service untuk sinkronisasi REALTIME antara:
 * - Terminal (Docker container) → Database changes
 * - UI Database Management → information_schema queries
 * 
 * PRINSIP ARSITEKTUR:
 * 1. Database adalah SINGLE SOURCE OF TRUTH
 * 2. UI TIDAK menyimpan schema - selalu query langsung
 * 3. Terminal dan UI pakai credential yang sama
 * 4. Perubahan via terminal langsung terlihat di UI
 * 
 * METODE SINKRONISASI:
 * - Setelah command database-related selesai → emit event
 * - Frontend listen event → refresh UI
 * - UI selalu query information_schema (no cache)
 */

const pool = require('../db');

// ============================================
// DATABASE COMMANDS DETECTION
// ============================================

/**
 * Commands yang mungkin mengubah struktur database
 * Saat command ini selesai, emit DATABASE_CHANGED event
 */
const DATABASE_MODIFYING_COMMANDS = [
    // PHP/Laravel Artisan
    'php artisan migrate',
    'php artisan migrate:fresh',
    'php artisan migrate:rollback',
    'php artisan migrate:reset',
    'php artisan migrate:refresh',
    'php artisan db:seed',
    'php artisan db:wipe',
    'php artisan schema:dump',
    'php artisan tinker',
    
    // Direct MySQL commands
    'mysql ',
    'mysql -',
    
    // Composer (might affect migrations)
    'composer dump-autoload',
    
    // Node.js/Prisma/TypeORM
    'npx prisma migrate',
    'npx prisma db push',
    'npm run migrate',
    'npx typeorm migration:run',
    'npx sequelize-cli db:migrate',
    'npx knex migrate:latest',
];

/**
 * Check if a command might modify database structure
 * @param {string} command - The command to check
 * @returns {boolean}
 */
const isDatabaseCommand = (command) => {
    if (!command || typeof command !== 'string') return false;
    
    const lowerCmd = command.toLowerCase().trim();
    
    return DATABASE_MODIFYING_COMMANDS.some(dbCmd => 
        lowerCmd.startsWith(dbCmd.toLowerCase()) ||
        lowerCmd.includes(dbCmd.toLowerCase())
    );
};

/**
 * Get the type of database operation from command
 * @param {string} command - The command
 * @returns {string} - Operation type: 'migrate', 'seed', 'wipe', 'query', 'unknown'
 */
const getDatabaseOperationType = (command) => {
    if (!command) return 'unknown';
    
    const lowerCmd = command.toLowerCase();
    
    if (lowerCmd.includes('migrate:fresh') || lowerCmd.includes('db:wipe')) {
        return 'wipe'; // Destructive - drops all tables
    }
    if (lowerCmd.includes('migrate:rollback') || lowerCmd.includes('migrate:reset')) {
        return 'rollback';
    }
    if (lowerCmd.includes('migrate')) {
        return 'migrate';
    }
    if (lowerCmd.includes('db:seed') || lowerCmd.includes('seed')) {
        return 'seed';
    }
    if (lowerCmd.includes('mysql')) {
        return 'query';
    }
    
    return 'unknown';
};

// ============================================
// REAL-TIME SCHEMA FETCHING (NO CACHE)
// ============================================

/**
 * Get current database schema directly from MySQL
 * IMPORTANT: This always queries information_schema - NO CACHING
 * 
 * @param {string} dbName - Database name to fetch schema from
 * @returns {Object} - Complete schema information
 */
const getLiveDatabaseSchema = async (dbName) => {
    if (!dbName) throw new Error('Database name required');
    
    try {
        // 1. Get all tables with stats
        const [tables] = await pool.execute(`
            SELECT 
                TABLE_NAME as name,
                TABLE_ROWS as row_count,
                ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024, 2) as size_kb,
                ENGINE as engine,
                TABLE_COLLATION as collation,
                CREATE_TIME as created_at,
                UPDATE_TIME as updated_at,
                TABLE_COMMENT as comment
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME
        `, [dbName]);
        
        // 2. Get all columns for all tables
        const [columns] = await pool.execute(`
            SELECT 
                TABLE_NAME as table_name,
                COLUMN_NAME as name,
                ORDINAL_POSITION as position,
                COLUMN_DEFAULT as default_value,
                IS_NULLABLE as nullable,
                DATA_TYPE as data_type,
                COLUMN_TYPE as full_type,
                CHARACTER_MAXIMUM_LENGTH as max_length,
                COLUMN_KEY as key_type,
                EXTRA as extra,
                COLUMN_COMMENT as comment
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `, [dbName]);
        
        // 3. Get indexes/keys
        const [indexes] = await pool.execute(`
            SELECT 
                TABLE_NAME as table_name,
                INDEX_NAME as index_name,
                NON_UNIQUE as non_unique,
                SEQ_IN_INDEX as seq,
                COLUMN_NAME as column_name,
                INDEX_TYPE as index_type
            FROM information_schema.STATISTICS 
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
        `, [dbName]);
        
        // 4. Get foreign keys
        const [foreignKeys] = await pool.execute(`
            SELECT 
                tc.TABLE_NAME as table_name,
                tc.CONSTRAINT_NAME as constraint_name,
                kcu.COLUMN_NAME as column_name,
                kcu.REFERENCED_TABLE_NAME as ref_table,
                kcu.REFERENCED_COLUMN_NAME as ref_column,
                rc.UPDATE_RULE as on_update,
                rc.DELETE_RULE as on_delete
            FROM information_schema.TABLE_CONSTRAINTS tc
            JOIN information_schema.KEY_COLUMN_USAGE kcu 
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
                AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                AND tc.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
            WHERE tc.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME
        `, [dbName]);
        
        // 5. Build structured response
        const schema = {
            database: dbName,
            fetchedAt: new Date().toISOString(),
            tableCount: tables.length,
            tables: tables.map(table => ({
                ...table,
                columns: columns.filter(c => c.table_name === table.name),
                indexes: indexes.filter(i => i.table_name === table.name),
                foreignKeys: foreignKeys.filter(fk => fk.table_name === table.name)
            }))
        };
        
        return schema;
        
    } catch (error) {
        console.error(`[DBSync] Error fetching schema for ${dbName}:`, error.message);
        throw error;
    }
};

/**
 * Get quick table list (lightweight version)
 * @param {string} dbName - Database name
 * @returns {Array} - List of table names with row counts
 */
const getLiveTableList = async (dbName) => {
    if (!dbName) throw new Error('Database name required');
    
    const [tables] = await pool.execute(`
        SELECT 
            TABLE_NAME as name,
            TABLE_ROWS as rows,
            ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024, 2) as size_kb,
            UPDATE_TIME as updated_at
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME
    `, [dbName]);
    
    return tables;
};

/**
 * Get table structure (columns + indexes)
 * @param {string} dbName - Database name
 * @param {string} tableName - Table name
 * @returns {Object} - Table structure
 */
const getLiveTableStructure = async (dbName, tableName) => {
    if (!dbName || !tableName) throw new Error('Database and table name required');
    
    // Sanitize identifiers
    const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    
    // Get columns
    const [columns] = await pool.execute(`
        SELECT 
            COLUMN_NAME as name,
            COLUMN_TYPE as type,
            IS_NULLABLE as nullable,
            COLUMN_KEY as key_type,
            COLUMN_DEFAULT as default_value,
            EXTRA as extra
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
    `, [dbName, safeTable]);
    
    // Get indexes
    const [indexes] = await pool.execute(`
        SELECT 
            INDEX_NAME as name,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
            NON_UNIQUE as non_unique,
            INDEX_TYPE as type
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
    `, [dbName, safeTable]);
    
    return {
        table: tableName,
        columns,
        indexes,
        fetchedAt: new Date().toISOString()
    };
};

// ============================================
// CHANGE DETECTION
// ============================================

/**
 * Compare old schema hash with current
 * Useful for polling-based change detection
 * 
 * @param {string} dbName - Database name
 * @returns {string} - Hash representing current schema state
 */
const getSchemaFingerprint = async (dbName) => {
    if (!dbName) throw new Error('Database name required');
    
    // Create a fingerprint based on table checksums
    // This is a lightweight way to detect changes
    const [result] = await pool.execute(`
        SELECT 
            GROUP_CONCAT(
                CONCAT(TABLE_NAME, ':', IFNULL(UPDATE_TIME, CREATE_TIME))
                ORDER BY TABLE_NAME
                SEPARATOR '|'
            ) as fingerprint,
            COUNT(*) as table_count
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
    `, [dbName]);
    
    if (!result || !result[0]) {
        return { fingerprint: 'empty', tableCount: 0 };
    }
    
    // Create a simple hash
    const fingerprint = result[0].fingerprint || 'empty';
    const tableCount = result[0].table_count || 0;
    
    // Simple hash function for string
    const hash = fingerprint.split('').reduce((acc, char) => {
        return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0).toString(16);
    
    return { 
        hash, 
        tableCount,
        raw: fingerprint
    };
};

/**
 * Detect if schema has changed since last check
 * @param {string} dbName - Database name
 * @param {string} lastHash - Previous hash value
 * @returns {Object} - { changed: boolean, currentHash: string }
 */
const hasSchemaChanged = async (dbName, lastHash) => {
    const current = await getSchemaFingerprint(dbName);
    return {
        changed: current.hash !== lastHash,
        currentHash: current.hash,
        tableCount: current.tableCount
    };
};

// ============================================
// USER DATABASE RESOLUTION
// ============================================

/**
 * Get database name for a user's site
 * @param {string} siteId - Site ID
 * @returns {string|null} - Database name or null
 */
const getDatabaseForSite = async (siteId) => {
    if (!siteId) return null;
    
    const [dbs] = await pool.execute(
        'SELECT db_name FROM `databases` WHERE site_id = ?',
        [siteId]
    );
    
    return dbs.length > 0 ? dbs[0].db_name : null;
};

/**
 * Get all databases for a user
 * @param {string} userId - User ID
 * @returns {Array} - List of databases with site info
 */
const getUserDatabases = async (userId) => {
    if (!userId) return [];
    
    const [databases] = await pool.execute(`
        SELECT 
            d.db_name,
            d.site_id,
            s.name as site_name
        FROM \`databases\` d
        JOIN sites s ON d.site_id = s.id
        WHERE s.user_id = ?
    `, [userId]);
    
    return databases;
};

// ============================================
// EVENT BROADCASTING
// ============================================

// Store for registered IO instance
let ioInstance = null;

/**
 * Register Socket.IO instance for broadcasting
 * Called from app.js after io is initialized
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
const registerSocketIO = (io) => {
    ioInstance = io;
    console.log('[DBSync] Socket.IO registered for database events');
};

/**
 * Broadcast database change event to relevant clients
 * @param {Object} eventData - Event data
 * @param {string} eventData.userId - User who made the change
 * @param {string} eventData.dbName - Database that changed
 * @param {string} eventData.operation - Type of change
 * @param {string} eventData.command - Original command
 */
const broadcastDatabaseChange = async (eventData) => {
    const { userId, dbName, operation, command, siteId } = eventData;
    
    console.log(`[DBSync] 📡 Broadcasting DATABASE_CHANGED:`, {
        userId,
        dbName,
        operation
    });
    
    if (!ioInstance) {
        console.warn('[DBSync] Socket.IO not registered, cannot broadcast');
        return;
    }
    
    // Get fresh schema fingerprint
    let schemaInfo = null;
    try {
        schemaInfo = await getSchemaFingerprint(dbName);
    } catch (e) {
        console.warn('[DBSync] Could not get schema fingerprint:', e.message);
    }
    
    const event = {
        type: 'DATABASE_CHANGED',
        timestamp: new Date().toISOString(),
        userId,
        siteId,
        dbName,
        operation,
        command: command ? command.substring(0, 100) : null, // Truncate for safety
        schema: schemaInfo
    };
    
    // Broadcast to all sockets of this user
    // Using room pattern: user_<userId>
    const userRoom = `user_${userId}`;
    ioInstance.to(userRoom).emit('database:changed', event);
    
    // Also emit globally for debugging/admin
    ioInstance.emit('database:activity', {
        userId,
        dbName,
        operation,
        timestamp: event.timestamp
    });
    
    console.log(`[DBSync] ✅ Event emitted to room: ${userRoom}`);
};

/**
 * Notify that a database-related command has completed
 * Called from terminal controller after command execution
 * 
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.command - The command that was executed
 * @param {number} params.exitCode - Command exit code
 * @param {string} params.siteId - Site ID (optional)
 */
const notifyDatabaseCommandCompleted = async ({ userId, command, exitCode, siteId }) => {
    // Only notify on successful commands
    if (exitCode !== 0) {
        console.log(`[DBSync] Command failed (exit ${exitCode}), skipping notification`);
        return;
    }
    
    // Check if this is a database-modifying command
    if (!isDatabaseCommand(command)) {
        return; // Not a database command, ignore
    }
    
    const operation = getDatabaseOperationType(command);
    console.log(`[DBSync] 🔍 Database command detected:`, { command, operation });
    
    try {
        // Get user's databases
        const databases = await getUserDatabases(userId);
        
        if (databases.length === 0) {
            console.log(`[DBSync] User ${userId} has no databases, skipping`);
            return;
        }
        
        // If siteId provided, get specific database
        let dbName = null;
        if (siteId) {
            dbName = await getDatabaseForSite(siteId);
        } else {
            // Fallback to first database
            dbName = databases[0].db_name;
        }
        
        if (!dbName) {
            console.log(`[DBSync] Could not resolve database for user ${userId}`);
            return;
        }
        
        // Broadcast the change
        await broadcastDatabaseChange({
            userId,
            dbName,
            operation,
            command,
            siteId
        });
        
    } catch (error) {
        console.error('[DBSync] Error notifying database change:', error.message);
    }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Command detection
    isDatabaseCommand,
    getDatabaseOperationType,
    DATABASE_MODIFYING_COMMANDS,
    
    // Live schema fetching (NO CACHE)
    getLiveDatabaseSchema,
    getLiveTableList,
    getLiveTableStructure,
    
    // Change detection
    getSchemaFingerprint,
    hasSchemaChanged,
    
    // User database resolution
    getDatabaseForSite,
    getUserDatabases,
    
    // Event broadcasting
    registerSocketIO,
    broadcastDatabaseChange,
    notifyDatabaseCommandCompleted
};
