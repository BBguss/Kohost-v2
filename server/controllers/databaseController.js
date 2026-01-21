/**
 * ============================================
 * DATABASE CONTROLLER - KolabPanel DB Manager
 * ============================================
 * 
 * Complete database management with:
 * - Row CRUD (INSERT, UPDATE, DELETE)
 * - Table Management (CREATE, ALTER, DROP)
 * - Column Operations (ADD, MODIFY, DROP)
 * - Index/Key Management
 * - Pagination & Search
 * - ERD Data for visualization
 * - SQL Export/Import
 */

const pool = require('../db');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Sanitize SQL identifier (table/column names)
 * Prevents SQL injection in dynamic identifiers
 */
const sanitizeIdentifier = (name) => {
    if (!name || typeof name !== 'string') return null;
    return name.replace(/[^a-zA-Z0-9_]/g, '');
};

/**
 * Get database name from siteId
 */
const getDbNameFromSite = async (siteId) => {
    const [dbs] = await pool.execute('SELECT db_name FROM `databases` WHERE site_id = ?', [siteId]);
    return dbs.length > 0 ? dbs[0].db_name : null;
};

/**
 * Verify user owns the site/database
 */
const verifyOwnership = async (siteId, userId) => {
    const [sites] = await pool.execute('SELECT id FROM sites WHERE id = ? AND user_id = ?', [siteId, userId]);
    return sites.length > 0;
};

/**
 * Build column definition SQL
 */
const buildColumnDefinition = (col) => {
    let sql = `\`${sanitizeIdentifier(col.name)}\` ${col.type}`;

    if (col.length) sql += `(${parseInt(col.length)})`;
    if (col.unsigned) sql += ' UNSIGNED';
    if (col.nullable === false) sql += ' NOT NULL';
    if (col.default !== undefined && col.default !== null) {
        if (col.default === 'CURRENT_TIMESTAMP') {
            sql += ` DEFAULT ${col.default}`;
        } else {
            sql += ` DEFAULT '${col.default}'`;
        }
    }
    if (col.autoIncrement) sql += ' AUTO_INCREMENT';
    if (col.primaryKey) sql += ' PRIMARY KEY';

    return sql;
};

// ============================================
// TABLE OPERATIONS
// ============================================

/**
 * GET /api/db/:siteId/tables
 * List all tables with info
 * 
 * IMPORTANT: Always fetches LIVE data from information_schema
 * NO CACHING - Database is SINGLE SOURCE OF TRUTH
 */
exports.getTables = async (req, res) => {
    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        // Set no-cache headers to ensure fresh data
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        });

        const [tables] = await pool.execute(`
            SELECT 
                TABLE_NAME as name,
                TABLE_ROWS as \`rows\`,
                ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024, 2) as size_kb,
                ENGINE as engine,
                TABLE_COLLATION as collation,
                CREATE_TIME as created_at,
                UPDATE_TIME as updated_at
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME
        `, [dbName]);

        res.json({ success: true, tables, fetchedAt: new Date().toISOString() });
    } catch (e) {
        console.error('[DB] getTables error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * POST /api/db/:siteId/tables
 * Create new table
 */
exports.createTable = async (req, res) => {
    const { tableName, columns, primaryKey, engine = 'InnoDB' } = req.body;

    if (!tableName || !columns || columns.length === 0) {
        return res.status(400).json({ error: 'Table name and columns are required' });
    }

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        if (!safeTableName) return res.status(400).json({ error: 'Invalid table name' });

        // Build column definitions
        const columnDefs = columns.map(col => buildColumnDefinition(col));

        // Add primary key if specified separately
        if (primaryKey && !columns.some(c => c.primaryKey)) {
            columnDefs.push(`PRIMARY KEY (\`${sanitizeIdentifier(primaryKey)}\`)`);
        }

        const sql = `CREATE TABLE \`${dbName}\`.\`${safeTableName}\` (
            ${columnDefs.join(',\n            ')}
        ) ENGINE=${engine}`;

        await pool.query(sql);

        console.log(`[DB] ✅ Table created: ${safeTableName}`);
        res.json({ success: true, message: `Table '${safeTableName}' created successfully` });
    } catch (e) {
        console.error('[DB] createTable error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * DELETE /api/db/:siteId/tables/:tableName
 * Drop table
 */
exports.dropTable = async (req, res) => {
    const { tableName } = req.params;

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        if (!safeTableName) return res.status(400).json({ error: 'Invalid table name' });

        await pool.query(`DROP TABLE IF EXISTS \`${dbName}\`.\`${safeTableName}\``);

        console.log(`[DB] ✅ Table dropped: ${safeTableName}`);
        res.json({ success: true, message: `Table '${safeTableName}' dropped successfully` });
    } catch (e) {
        console.error('[DB] dropTable error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * PUT /api/db/:siteId/tables/:tableName/rename
 * Rename table
 */
exports.renameTable = async (req, res) => {
    const { tableName } = req.params;
    const { newName } = req.body;

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeOldName = sanitizeIdentifier(tableName);
        const safeNewName = sanitizeIdentifier(newName);

        if (!safeOldName || !safeNewName) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        await pool.query(`RENAME TABLE \`${dbName}\`.\`${safeOldName}\` TO \`${dbName}\`.\`${safeNewName}\``);

        console.log(`[DB] ✅ Table renamed: ${safeOldName} → ${safeNewName}`);
        res.json({ success: true, message: `Table renamed to '${safeNewName}'` });
    } catch (e) {
        console.error('[DB] renameTable error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * PUT /api/db/:siteId/tables/:tableName/truncate
 * Truncate table (delete all rows)
 */
exports.truncateTable = async (req, res) => {
    const { tableName } = req.params;

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        if (!safeTableName) return res.status(400).json({ error: 'Invalid table name' });

        await pool.query(`TRUNCATE TABLE \`${dbName}\`.\`${safeTableName}\``);

        console.log(`[DB] ✅ Table truncated: ${safeTableName}`);
        res.json({ success: true, message: `Table '${safeTableName}' truncated` });
    } catch (e) {
        console.error('[DB] truncateTable error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================
// ROW CRUD OPERATIONS
// ============================================

/**
 * GET /api/db/:siteId/tables/:tableName/rows
 * Get rows with pagination, search, sort
 */
exports.getRows = async (req, res) => {
    const { tableName } = req.params;
    const {
        page = 1,
        limit = 50,
        search = '',
        searchColumn = '',
        sortBy = '',
        sortOrder = 'ASC'
    } = req.query;

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        if (!safeTableName) return res.status(400).json({ error: 'Invalid table name' });

        const offset = (parseInt(page) - 1) * parseInt(limit);
        let whereClause = '';
        let orderClause = '';
        const params = [];

        // Search filter
        if (search && searchColumn) {
            const safeColumn = sanitizeIdentifier(searchColumn);
            if (safeColumn) {
                whereClause = `WHERE \`${safeColumn}\` LIKE ?`;
                params.push(`%${search}%`);
            }
        }

        // Sort
        if (sortBy) {
            const safeSortBy = sanitizeIdentifier(sortBy);
            const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            if (safeSortBy) {
                orderClause = `ORDER BY \`${safeSortBy}\` ${safeSortOrder}`;
            }
        }

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM \`${dbName}\`.\`${safeTableName}\` ${whereClause}`,
            params
        );
        const total = countResult[0].total;

        // Get rows
        const [rows] = await pool.query(
            `SELECT * FROM \`${dbName}\`.\`${safeTableName}\` ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );

        // Get columns
        const [columns] = await pool.query(`SHOW COLUMNS FROM \`${dbName}\`.\`${safeTableName}\``);
        const mappedColumns = columns.map(c => ({
            name: c.Field,
            type: c.Type,
            nullable: c.Null === 'YES',
            key: c.Key,
            default: c.Default,
            extra: c.Extra
        }));

        res.json({
            success: true,
            columns: mappedColumns,
            rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (e) {
        console.error('[DB] getRows error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * POST /api/db/:siteId/tables/:tableName/rows
 * Insert new row
 */
exports.insertRow = async (req, res) => {
    const { tableName } = req.params;
    const { data } = req.body;

    if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Data is required' });
    }

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        if (!safeTableName) return res.status(400).json({ error: 'Invalid table name' });

        // Sanitize column names
        const columns = Object.keys(data).map(sanitizeIdentifier).filter(Boolean);
        const values = columns.map(col => data[col]);
        const placeholders = columns.map(() => '?').join(', ');
        const columnList = columns.map(c => `\`${c}\``).join(', ');

        const [result] = await pool.execute(
            `INSERT INTO \`${dbName}\`.\`${safeTableName}\` (${columnList}) VALUES (${placeholders})`,
            values
        );

        console.log(`[DB] ✅ Row inserted in ${safeTableName}, ID: ${result.insertId}`);
        res.json({
            success: true,
            insertId: result.insertId,
            message: 'Row inserted successfully'
        });
    } catch (e) {
        console.error('[DB] insertRow error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * PUT /api/db/:siteId/tables/:tableName/rows/:id
 * Update row by primary key
 */
exports.updateRow = async (req, res) => {
    const { tableName, id } = req.params;
    const { data, primaryKeyColumn = 'id' } = req.body;

    if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Data is required' });
    }

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        const safePKColumn = sanitizeIdentifier(primaryKeyColumn);
        if (!safeTableName || !safePKColumn) {
            return res.status(400).json({ error: 'Invalid table or column name' });
        }

        // Build SET clause
        const setClauses = [];
        const values = [];
        for (const [col, val] of Object.entries(data)) {
            const safeCol = sanitizeIdentifier(col);
            if (safeCol) {
                setClauses.push(`\`${safeCol}\` = ?`);
                values.push(val);
            }
        }
        values.push(id);

        const [result] = await pool.execute(
            `UPDATE \`${dbName}\`.\`${safeTableName}\` SET ${setClauses.join(', ')} WHERE \`${safePKColumn}\` = ?`,
            values
        );

        console.log(`[DB] ✅ Row updated in ${safeTableName}, affected: ${result.affectedRows}`);
        res.json({
            success: true,
            affectedRows: result.affectedRows,
            message: 'Row updated successfully'
        });
    } catch (e) {
        console.error('[DB] updateRow error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * DELETE /api/db/:siteId/tables/:tableName/rows/:id
 * Delete row by primary key
 */
exports.deleteRow = async (req, res) => {
    const { tableName, id } = req.params;
    const { primaryKeyColumn = 'id' } = req.query;

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        const safePKColumn = sanitizeIdentifier(primaryKeyColumn);
        if (!safeTableName || !safePKColumn) {
            return res.status(400).json({ error: 'Invalid table or column name' });
        }

        const [result] = await pool.execute(
            `DELETE FROM \`${dbName}\`.\`${safeTableName}\` WHERE \`${safePKColumn}\` = ?`,
            [id]
        );

        console.log(`[DB] ✅ Row deleted from ${safeTableName}, affected: ${result.affectedRows}`);
        res.json({
            success: true,
            affectedRows: result.affectedRows,
            message: 'Row deleted successfully'
        });
    } catch (e) {
        console.error('[DB] deleteRow error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * POST /api/db/:siteId/tables/:tableName/bulk
 * Bulk insert/update/delete
 */
exports.bulkOperation = async (req, res) => {
    const { tableName } = req.params;
    const { operation, rows, primaryKeyColumn = 'id' } = req.body;

    if (!operation || !rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Operation and rows array required' });
    }

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        if (!safeTableName) return res.status(400).json({ error: 'Invalid table name' });

        let affectedRows = 0;

        if (operation === 'insert') {
            // Bulk insert
            const columns = Object.keys(rows[0]).map(sanitizeIdentifier).filter(Boolean);
            const columnList = columns.map(c => `\`${c}\``).join(', ');
            const placeholders = columns.map(() => '?').join(', ');

            for (const row of rows) {
                const values = columns.map(col => row[col]);
                const [result] = await pool.execute(
                    `INSERT INTO \`${dbName}\`.\`${safeTableName}\` (${columnList}) VALUES (${placeholders})`,
                    values
                );
                affectedRows += result.affectedRows;
            }
        } else if (operation === 'delete') {
            // Bulk delete
            const safePKColumn = sanitizeIdentifier(primaryKeyColumn);
            const ids = rows.map(r => r[primaryKeyColumn] || r);
            const placeholders = ids.map(() => '?').join(', ');

            const [result] = await pool.execute(
                `DELETE FROM \`${dbName}\`.\`${safeTableName}\` WHERE \`${safePKColumn}\` IN (${placeholders})`,
                ids
            );
            affectedRows = result.affectedRows;
        }

        console.log(`[DB] ✅ Bulk ${operation} on ${safeTableName}, affected: ${affectedRows}`);
        res.json({ success: true, affectedRows, message: `Bulk ${operation} completed` });
    } catch (e) {
        console.error('[DB] bulkOperation error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================
// COLUMN OPERATIONS
// ============================================

/**
 * GET /api/db/:siteId/tables/:tableName/columns
 * Get table columns with full info
 */
exports.getColumns = async (req, res) => {
    const { tableName } = req.params;

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        if (!safeTableName) return res.status(400).json({ error: 'Invalid table name' });

        // Get columns
        const [columns] = await pool.query(`SHOW FULL COLUMNS FROM \`${dbName}\`.\`${safeTableName}\``);

        // Get indexes
        const [indexes] = await pool.query(`SHOW INDEX FROM \`${dbName}\`.\`${safeTableName}\``);

        const mappedColumns = columns.map(c => ({
            name: c.Field,
            type: c.Type,
            collation: c.Collation,
            nullable: c.Null === 'YES',
            key: c.Key,
            default: c.Default,
            extra: c.Extra,
            comment: c.Comment
        }));

        const mappedIndexes = indexes.map(i => ({
            name: i.Key_name,
            column: i.Column_name,
            unique: i.Non_unique === 0,
            type: i.Index_type
        }));

        res.json({ success: true, columns: mappedColumns, indexes: mappedIndexes });
    } catch (e) {
        console.error('[DB] getColumns error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * POST /api/db/:siteId/tables/:tableName/columns
 * Add new column
 */
exports.addColumn = async (req, res) => {
    const { tableName } = req.params;
    const { column, afterColumn } = req.body;

    if (!column || !column.name || !column.type) {
        return res.status(400).json({ error: 'Column name and type are required' });
    }

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        if (!safeTableName) return res.status(400).json({ error: 'Invalid table name' });

        let sql = `ALTER TABLE \`${dbName}\`.\`${safeTableName}\` ADD ${buildColumnDefinition(column)}`;

        if (afterColumn) {
            const safeAfter = sanitizeIdentifier(afterColumn);
            if (safeAfter) sql += ` AFTER \`${safeAfter}\``;
        }

        await pool.query(sql);

        console.log(`[DB] ✅ Column added: ${column.name} to ${safeTableName}`);
        res.json({ success: true, message: `Column '${column.name}' added successfully` });
    } catch (e) {
        console.error('[DB] addColumn error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * PUT /api/db/:siteId/tables/:tableName/columns/:columnName
 * Modify column
 */
exports.modifyColumn = async (req, res) => {
    const { tableName, columnName } = req.params;
    const { column } = req.body;

    if (!column || !column.type) {
        return res.status(400).json({ error: 'Column definition is required' });
    }

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        const safeColumnName = sanitizeIdentifier(columnName);
        if (!safeTableName || !safeColumnName) {
            return res.status(400).json({ error: 'Invalid table or column name' });
        }

        // Use CHANGE if renaming, MODIFY if not
        const newName = column.name ? sanitizeIdentifier(column.name) : safeColumnName;
        const colDef = buildColumnDefinition({ ...column, name: newName });

        const sql = `ALTER TABLE \`${dbName}\`.\`${safeTableName}\` CHANGE \`${safeColumnName}\` ${colDef}`;
        await pool.query(sql);

        console.log(`[DB] ✅ Column modified: ${columnName} in ${safeTableName}`);
        res.json({ success: true, message: `Column '${columnName}' modified successfully` });
    } catch (e) {
        console.error('[DB] modifyColumn error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * DELETE /api/db/:siteId/tables/:tableName/columns/:columnName
 * Drop column
 */
exports.dropColumn = async (req, res) => {
    const { tableName, columnName } = req.params;

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        const safeColumnName = sanitizeIdentifier(columnName);
        if (!safeTableName || !safeColumnName) {
            return res.status(400).json({ error: 'Invalid table or column name' });
        }

        await pool.query(`ALTER TABLE \`${dbName}\`.\`${safeTableName}\` DROP COLUMN \`${safeColumnName}\``);

        console.log(`[DB] ✅ Column dropped: ${columnName} from ${safeTableName}`);
        res.json({ success: true, message: `Column '${columnName}' dropped successfully` });
    } catch (e) {
        console.error('[DB] dropColumn error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================
// INDEX OPERATIONS
// ============================================

/**
 * POST /api/db/:siteId/tables/:tableName/indexes
 * Create index
 */
exports.createIndex = async (req, res) => {
    const { tableName } = req.params;
    const { indexName, columns, unique = false, type = 'BTREE' } = req.body;

    if (!columns || columns.length === 0) {
        return res.status(400).json({ error: 'Columns are required for index' });
    }

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        const safeIndexName = sanitizeIdentifier(indexName || `idx_${columns.join('_')}`);
        const safeColumns = columns.map(sanitizeIdentifier).filter(Boolean);

        if (!safeTableName || safeColumns.length === 0) {
            return res.status(400).json({ error: 'Invalid table or column names' });
        }

        const columnList = safeColumns.map(c => `\`${c}\``).join(', ');
        const uniqueKeyword = unique ? 'UNIQUE' : '';

        const sql = `CREATE ${uniqueKeyword} INDEX \`${safeIndexName}\` ON \`${dbName}\`.\`${safeTableName}\` (${columnList}) USING ${type}`;
        await pool.query(sql);

        console.log(`[DB] ✅ Index created: ${safeIndexName} on ${safeTableName}`);
        res.json({ success: true, message: `Index '${safeIndexName}' created successfully` });
    } catch (e) {
        console.error('[DB] createIndex error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * DELETE /api/db/:siteId/tables/:tableName/indexes/:indexName
 * Drop index
 */
exports.dropIndex = async (req, res) => {
    const { tableName, indexName } = req.params;

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        const safeTableName = sanitizeIdentifier(tableName);
        const safeIndexName = sanitizeIdentifier(indexName);

        if (!safeTableName || !safeIndexName) {
            return res.status(400).json({ error: 'Invalid table or index name' });
        }

        await pool.query(`DROP INDEX \`${safeIndexName}\` ON \`${dbName}\`.\`${safeTableName}\``);

        console.log(`[DB] ✅ Index dropped: ${indexName} from ${safeTableName}`);
        res.json({ success: true, message: `Index '${indexName}' dropped successfully` });
    } catch (e) {
        console.error('[DB] dropIndex error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================
// SCHEMA & ERD
// ============================================

/**
 * GET /api/db/:siteId/schema
 * Get full database schema
 */
exports.getFullSchema = async (req, res) => {
    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        // Get all tables
        const [tables] = await pool.query(`SHOW TABLES FROM \`${dbName}\``);
        const tableNames = tables.map(t => Object.values(t)[0]);

        const schema = [];

        for (const tableName of tableNames) {
            // Get columns
            const [columns] = await pool.query(`SHOW FULL COLUMNS FROM \`${dbName}\`.\`${tableName}\``);

            // Get indexes
            const [indexes] = await pool.query(`SHOW INDEX FROM \`${dbName}\`.\`${tableName}\``);

            schema.push({
                name: tableName,
                columns: columns.map(c => ({
                    name: c.Field,
                    type: c.Type,
                    nullable: c.Null === 'YES',
                    key: c.Key,
                    default: c.Default,
                    extra: c.Extra
                })),
                indexes: indexes.map(i => ({
                    name: i.Key_name,
                    column: i.Column_name,
                    unique: i.Non_unique === 0
                }))
            });
        }

        res.json({ success: true, database: dbName, schema });
    } catch (e) {
        console.error('[DB] getFullSchema error:', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * GET /api/db/:siteId/erd
 * Get ERD data (tables + relationships/foreign keys)
 */
exports.getERDData = async (req, res) => {
    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        // Get all tables
        const [tables] = await pool.query(`
            SELECT TABLE_NAME as name, TABLE_ROWS as \`rows\`
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ?
        `, [dbName]);

        const erdData = {
            tables: [],
            relationships: []
        };

        for (const table of tables) {
            // Get columns for each table
            const [columns] = await pool.query(`SHOW COLUMNS FROM \`${dbName}\`.\`${table.name}\``);

            erdData.tables.push({
                name: table.name,
                rows: table.rows || 0,
                columns: columns.map(c => ({
                    name: c.Field,
                    type: c.Type,
                    isPrimary: c.Key === 'PRI',
                    isForeign: c.Key === 'MUL'
                }))
            });
        }

        // Get foreign key relationships
        const [fks] = await pool.query(`
            SELECT 
                TABLE_NAME as fromTable,
                COLUMN_NAME as fromColumn,
                REFERENCED_TABLE_NAME as toTable,
                REFERENCED_COLUMN_NAME as toColumn
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = ? 
            AND REFERENCED_TABLE_NAME IS NOT NULL
        `, [dbName]);

        erdData.relationships = fks.map(fk => ({
            from: { table: fk.fromTable, column: fk.fromColumn },
            to: { table: fk.toTable, column: fk.toColumn }
        }));

        res.json({ success: true, erd: erdData });
    } catch (e) {
        console.error('[DB] getERDData error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================
// SQL QUERY EXECUTION
// ============================================

/**
 * POST /api/db/:siteId/query
 * Execute SQL query (SELECT only for security)
 */
exports.executeQuery = async (req, res) => {
    const { sql } = req.body;

    if (!sql) {
        return res.status(400).json({ error: 'SQL query is required' });
    }

    // Only allow SELECT queries for security
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT') && !trimmedSql.startsWith('SHOW') && !trimmedSql.startsWith('DESCRIBE')) {
        return res.status(403).json({
            error: 'Only SELECT, SHOW, and DESCRIBE queries are allowed for security reasons'
        });
    }

    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        // Execute with USE database prefix
        const [rows, fields] = await pool.query(`USE \`${dbName}\`; ${sql}`);

        // Get the actual results (after USE statement)
        const results = Array.isArray(rows) && rows.length > 1 ? rows[1] : rows;
        const resultFields = Array.isArray(fields) && fields.length > 1 ? fields[1] : fields;

        res.json({
            success: true,
            rows: results,
            columns: resultFields?.map(f => f.name) || []
        });
    } catch (e) {
        console.error('[DB] executeQuery error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================
// EXPORT DATABASE (Real SQL)
// ============================================

/**
 * GET /api/db/:siteId/export
 * Export database as SQL
 */
exports.exportDatabase = async (req, res) => {
    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        let sqlDump = `-- Database Export: ${dbName}\n`;
        sqlDump += `-- Generated: ${new Date().toISOString()}\n`;
        sqlDump += `-- By: KolabPanel Database Manager\n\n`;
        sqlDump += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

        // Get all tables
        const [tables] = await pool.query(`SHOW TABLES FROM \`${dbName}\``);

        for (const tableRow of tables) {
            const tableName = Object.values(tableRow)[0];

            // Get CREATE TABLE statement
            const [createTable] = await pool.query(`SHOW CREATE TABLE \`${dbName}\`.\`${tableName}\``);
            const createStatement = createTable[0]['Create Table'];

            sqlDump += `-- Table: ${tableName}\n`;
            sqlDump += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
            sqlDump += `${createStatement};\n\n`;

            // Get data
            const [rows] = await pool.query(`SELECT * FROM \`${dbName}\`.\`${tableName}\``);

            if (rows.length > 0) {
                const columns = Object.keys(rows[0]);
                const columnList = columns.map(c => `\`${c}\``).join(', ');

                for (const row of rows) {
                    const values = columns.map(col => {
                        const val = row[col];
                        if (val === null) return 'NULL';
                        if (typeof val === 'number') return val;
                        if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
                        return `'${String(val).replace(/'/g, "''")}'`;
                    }).join(', ');

                    sqlDump += `INSERT INTO \`${tableName}\` (${columnList}) VALUES (${values});\n`;
                }
                sqlDump += '\n';
            }
        }

        sqlDump += `SET FOREIGN_KEY_CHECKS=1;\n`;

        // Send as downloadable file
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="${dbName}_export.sql"`);
        res.send(sqlDump);

    } catch (e) {
        console.error('[DB] exportDatabase error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================
// IMPORT DATABASE (Stream-Based)
// ============================================

const fs = require('fs');
const {
    parseSqlStatements,
    parseStreamFromFile,
    executeSqlStatements,
    validateSqlFile,
    looksLikeSql
} = require('../utils/sqlImportUtils');

/**
 * POST /api/db/:siteId/import
 * Import SQL file with stream-based parsing
 * 
 * Features:
 * - Stream-based file reading (not entire file in memory)
 * - Per-statement execution
 * - Transaction support with rollback
 * - Progress tracking
 * - Detailed error reporting
 */
exports.importDatabase = async (req, res) => {
    console.log('[DB Import] Starting import for siteId:', req.params.siteId);

    const file = req.file;

    // 1. Validate file
    const validation = validateSqlFile(file);
    if (!validation.valid) {
        console.log('[DB Import] Validation failed:', validation.error);
        return res.status(400).json({
            status: 'failed',
            executedQueries: 0,
            errorMessage: validation.error
        });
    }

    try {
        // 2. Get database name
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) {
            return res.status(404).json({
                status: 'failed',
                executedQueries: 0,
                errorMessage: 'Database not found. Please create one first.'
            });
        }

        console.log('[DB Import] Target database:', dbName);
        console.log('[DB Import] File:', file.originalname, 'Size:', file.size, 'bytes');

        // 3. Parse SQL content
        let statements;

        if (file.path) {
            // File stored on disk (diskStorage) - use stream
            console.log('[DB Import] Parsing from file stream...');
            statements = await parseStreamFromFile(file.path);
        } else if (file.buffer) {
            // File in memory (memoryStorage)
            console.log('[DB Import] Parsing from buffer...');
            const sqlContent = file.buffer.toString('utf-8');

            // Quick validation
            if (!looksLikeSql(sqlContent.substring(0, 1000))) {
                return res.status(400).json({
                    status: 'failed',
                    executedQueries: 0,
                    errorMessage: 'File does not appear to contain valid SQL'
                });
            }

            statements = parseSqlStatements(sqlContent);
        } else {
            return res.status(400).json({
                status: 'failed',
                executedQueries: 0,
                errorMessage: 'Unable to read uploaded file'
            });
        }

        console.log('[DB Import] Parsed', statements.length, 'statements');

        if (statements.length === 0) {
            return res.status(400).json({
                status: 'failed',
                executedQueries: 0,
                errorMessage: 'No valid SQL statements found in file'
            });
        }

        // 4. Execute statements
        const result = await executeSqlStatements(pool, dbName, statements, {
            useTransaction: true,
            stopOnError: true
        });

        // 5. Clean up temp file if exists
        if (file.path) {
            try {
                fs.unlinkSync(file.path);
            } catch (e) {
                console.log('[DB Import] Failed to delete temp file:', e.message);
            }
        }

        // 6. Return result
        console.log('[DB Import] Result:', result.status, result.executedQueries, 'queries');

        res.json(result);

    } catch (e) {
        console.error('[DB Import] Error:', e);

        // Clean up temp file on error
        if (file && file.path) {
            try {
                fs.unlinkSync(file.path);
            } catch (cleanupError) { }
        }

        res.status(500).json({
            status: 'failed',
            executedQueries: 0,
            errorMessage: e.message
        });
    }
};
// ============================================
// SCHEMA FINGERPRINT (for change detection)
// ============================================

/**
 * GET /api/db/:siteId/fingerprint
 * Get a hash representing current database schema state
 * Used for polling-based change detection
 * 
 * Returns a hash that changes whenever:
 * - Tables are added/removed
 * - Table structure changes (UPDATE_TIME changes)
 */
exports.getSchemaFingerprint = async (req, res) => {
    try {
        const dbName = await getDbNameFromSite(req.params.siteId);
        if (!dbName) return res.status(404).json({ error: 'Database not found' });

        // Set no-cache headers
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        // Create fingerprint from table metadata
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
            return res.json({ hash: 'empty', tableCount: 0, database: dbName });
        }

        const fingerprint = result[0].fingerprint || 'empty';
        const tableCount = result[0].table_count || 0;

        // Simple hash function
        const hash = fingerprint.split('').reduce((acc, char) => {
            return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
        }, 0).toString(16);

        res.json({
            hash,
            tableCount,
            database: dbName,
            timestamp: new Date().toISOString()
        });

    } catch (e) {
        console.error('[DB] getSchemaFingerprint error:', e);
        res.status(500).json({ error: e.message });
    }
};