/**
 * ============================================
 * SQL IMPORT UTILITY - Stream-Based Parser
 * ============================================
 * 
 * Stream-based SQL file parser for importing large SQL files:
 * - Reads file in chunks (not entire file in memory)
 * - Parses statements one by one
 * - Handles multiline queries
 * - Ignores comments
 * - Supports transaction for rollback on error
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

// ============================================
// SQL STATEMENT PARSER
// ============================================

/**
 * Parse SQL content and extract individual statements
 * Handles: multiline statements, comments (-- and block comments), different delimiters
 * @param {string} sqlContent - Raw SQL content
 * @returns {string[]} - Array of SQL statements
 */
const parseSqlStatements = (sqlContent) => {
    const statements = [];
    let currentStatement = '';
    let inMultilineComment = false;
    let inString = false;
    let stringChar = '';

    const lines = sqlContent.split('\n');

    for (const line of lines) {
        let cleanLine = '';
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1] || '';

            // Handle multiline comments /* */
            if (!inString && !inMultilineComment && char === '/' && nextChar === '*') {
                inMultilineComment = true;
                i += 2;
                continue;
            }
            if (inMultilineComment && char === '*' && nextChar === '/') {
                inMultilineComment = false;
                i += 2;
                continue;
            }
            if (inMultilineComment) {
                i++;
                continue;
            }

            // Handle single line comments --
            if (!inString && char === '-' && nextChar === '-') {
                break; // Skip rest of line
            }

            // Handle single line comments #
            if (!inString && char === '#') {
                break; // Skip rest of line
            }

            // Handle strings
            if ((char === "'" || char === '"' || char === '`') && (i === 0 || line[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            cleanLine += char;
            i++;
        }

        if (cleanLine.trim()) {
            currentStatement += cleanLine + '\n';
        }

        // Check if statement ends with semicolon (outside of strings)
        if (!inString && currentStatement.trim().endsWith(';')) {
            const stmt = currentStatement.trim();
            if (stmt && stmt !== ';') {
                statements.push(stmt.slice(0, -1)); // Remove trailing semicolon
            }
            currentStatement = '';
        }
    }

    // Handle last statement without semicolon
    if (currentStatement.trim()) {
        statements.push(currentStatement.trim());
    }

    return statements.filter(s => s.trim().length > 0);
};

/**
 * Stream-based SQL file reader
 * Reads file line by line without loading entire file into memory
 * 
 * @param {string} filePath - Path to SQL file
 * @returns {Promise<string[]>} - Array of SQL statements
 */
const parseStreamFromFile = (filePath) => {
    return new Promise((resolve, reject) => {
        const statements = [];
        let currentStatement = '';
        let inMultilineComment = false;
        let inString = false;
        let stringChar = '';

        const readStream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({
            input: readStream,
            crlfDelay: Infinity
        });

        rl.on('line', (line) => {
            let cleanLine = '';
            let i = 0;

            while (i < line.length) {
                const char = line[i];
                const nextChar = line[i + 1] || '';

                // Handle multiline comments /* */
                if (!inString && !inMultilineComment && char === '/' && nextChar === '*') {
                    inMultilineComment = true;
                    i += 2;
                    continue;
                }
                if (inMultilineComment && char === '*' && nextChar === '/') {
                    inMultilineComment = false;
                    i += 2;
                    continue;
                }
                if (inMultilineComment) {
                    i++;
                    continue;
                }

                // Handle single line comments --
                if (!inString && char === '-' && nextChar === '-') {
                    break;
                }

                // Handle single line comments #
                if (!inString && char === '#') {
                    break;
                }

                // Handle strings
                if ((char === "'" || char === '"' || char === '`') && (i === 0 || line[i - 1] !== '\\')) {
                    if (!inString) {
                        inString = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inString = false;
                    }
                }

                cleanLine += char;
                i++;
            }

            if (cleanLine.trim()) {
                currentStatement += cleanLine + '\n';
            }

            // Check if statement ends with semicolon
            if (!inString && currentStatement.trim().endsWith(';')) {
                const stmt = currentStatement.trim();
                if (stmt && stmt !== ';') {
                    statements.push(stmt.slice(0, -1));
                }
                currentStatement = '';
            }
        });

        rl.on('close', () => {
            if (currentStatement.trim()) {
                statements.push(currentStatement.trim());
            }
            resolve(statements.filter(s => s.trim().length > 0));
        });

        rl.on('error', (err) => {
            reject(err);
        });
    });
};

// ============================================
// SQL IMPORT EXECUTOR
// ============================================

/**
 * Execute SQL statements one by one with transaction support
 * 
 * @param {object} pool - Database connection pool
 * @param {string} dbName - Target database name
 * @param {string[]} statements - Array of SQL statements
 * @param {object} options - Options { useTransaction: boolean, stopOnError: boolean }
 * @returns {Promise<object>} - Result { success, executedQueries, failedQuery, errorMessage }
 */
const executeSqlStatements = async (pool, dbName, statements, options = {}) => {
    const {
        useTransaction = true,
        stopOnError = true,
        maxQuerySize = 10 * 1024 * 1024 // 10MB per query
    } = options;

    const result = {
        status: 'success',
        executedQueries: 0,
        totalQueries: statements.length,
        failedQuery: null,
        failedQueryIndex: null,
        errorMessage: null,
        errors: []
    };

    if (statements.length === 0) {
        return result;
    }

    const connection = await pool.getConnection();

    try {
        // Switch to target database
        await connection.query(`USE \`${dbName}\``);

        // Disable foreign key checks temporarily for import
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.query('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO"');

        // Start transaction if enabled
        if (useTransaction) {
            await connection.query('START TRANSACTION');
        }

        // Execute statements one by one
        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i].trim();

            // Skip empty statements
            if (!stmt) continue;

            // Skip dangerous statements
            const upperStmt = stmt.toUpperCase();
            if (upperStmt.startsWith('DROP DATABASE') ||
                upperStmt.startsWith('CREATE DATABASE') ||
                upperStmt.includes('GRANT ') ||
                upperStmt.includes('REVOKE ')) {
                console.log(`[SQL Import] Skipped dangerous statement: ${stmt.substring(0, 50)}...`);
                continue;
            }

            // Check query size
            if (stmt.length > maxQuerySize) {
                throw new Error(`Query #${i + 1} exceeds maximum size (${maxQuerySize} bytes)`);
            }

            try {
                await connection.query(stmt);
                result.executedQueries++;

                // Log progress every 100 queries
                if (result.executedQueries % 100 === 0) {
                    console.log(`[SQL Import] Executed ${result.executedQueries}/${statements.length} queries`);
                }
            } catch (queryError) {
                const errorInfo = {
                    queryIndex: i + 1,
                    query: stmt.substring(0, 200) + (stmt.length > 200 ? '...' : ''),
                    error: queryError.message
                };

                result.errors.push(errorInfo);

                if (stopOnError) {
                    result.status = 'failed';
                    result.failedQuery = stmt.substring(0, 500);
                    result.failedQueryIndex = i + 1;
                    result.errorMessage = queryError.message;

                    if (useTransaction) {
                        await connection.query('ROLLBACK');
                    }

                    throw queryError;
                }
            }
        }

        // Commit transaction if successful
        if (useTransaction) {
            await connection.query('COMMIT');
        }

        // Re-enable foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        // Set status based on errors
        if (result.errors.length > 0 && result.executedQueries > 0) {
            result.status = 'partial';
        }

        console.log(`[SQL Import] ✅ Completed: ${result.executedQueries}/${statements.length} queries`);

    } catch (error) {
        console.error('[SQL Import] Error:', error.message);

        if (result.status !== 'failed') {
            result.status = 'failed';
            result.errorMessage = error.message;
        }

        // Try to rollback if in transaction
        try {
            if (useTransaction) {
                await connection.query('ROLLBACK');
            }
        } catch (rollbackError) {
            console.error('[SQL Import] Rollback error:', rollbackError.message);
        }

    } finally {
        // Re-enable foreign key checks
        try {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        } catch (e) { }

        connection.release();
    }

    return result;
};

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate uploaded SQL file
 * 
 * @param {object} file - Multer file object
 * @returns {object} - { valid: boolean, error?: string }
 */
const validateSqlFile = (file) => {
    if (!file) {
        return { valid: false, error: 'No file uploaded' };
    }

    // Check extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.sql') {
        return { valid: false, error: 'File must have .sql extension' };
    }

    // Check MIME type (allow common SQL MIME types)
    const allowedMimes = [
        'text/plain',
        'text/x-sql',
        'application/sql',
        'application/x-sql',
        'text/sql',
        'application/octet-stream' // Some browsers send this
    ];

    if (file.mimetype && !allowedMimes.includes(file.mimetype)) {
        return { valid: false, error: `Invalid file type: ${file.mimetype}` };
    }

    // Check file size (max 100MB)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { valid: false, error: `File too large. Maximum size is 100MB.` };
    }

    return { valid: true };
};

/**
 * Check if content looks like valid SQL (basic check)
 * 
 * @param {string} content - First chunk of file content
 * @returns {boolean}
 */
const looksLikeSql = (content) => {
    const upperContent = content.toUpperCase().trim();
    const sqlKeywords = [
        'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'SELECT',
        'ALTER', 'DROP', 'SET', 'USE', '--', '/*'
    ];

    return sqlKeywords.some(keyword => upperContent.includes(keyword));
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
    parseSqlStatements,
    parseStreamFromFile,
    executeSqlStatements,
    validateSqlFile,
    looksLikeSql
};
