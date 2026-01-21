/**
 * ============================================
 * SQL VALIDATOR SERVICE
 * ============================================
 * 
 * Validates SQL queries for security:
 * - Blocks dangerous statements
 * - Prevents cross-database access
 * - Validates table/column names
 * - Detects SQL injection patterns
 */

// ============================================
// BLOCKED PATTERNS - SECURITY CRITICAL
// ============================================

const BLOCKED_KEYWORDS = [
  // User/privilege management
  'GRANT',
  'REVOKE',
  'CREATE USER',
  'DROP USER',
  'ALTER USER',
  'SET PASSWORD',
  
  // System operations
  'SHUTDOWN',
  'KILL',
  'RESET',
  'FLUSH PRIVILEGES',
  'FLUSH TABLES',
  
  // File operations
  'LOAD_FILE',
  'INTO OUTFILE',
  'INTO DUMPFILE',
  'LOAD DATA',
  
  // System databases
  'mysql.',
  'information_schema.',
  'performance_schema.',
  'sys.',
  
  // Variables & settings
  'SET GLOBAL',
  'SET @@',
  
  // Stored procedures with risk
  'CREATE PROCEDURE',
  'CREATE FUNCTION',
  'CREATE TRIGGER',
  'CREATE EVENT',
];

const BLOCKED_PATTERNS = [
  // Stacked queries (multiple statements)
  /;\s*(?:DROP|DELETE|TRUNCATE|ALTER|CREATE)\s+/i,
  
  // Comments that might hide malicious code
  /\/\*[\s\S]*?(DROP|DELETE|TRUNCATE|ALTER)[\s\S]*?\*\//i,
  
  // Union-based injection
  /UNION\s+(ALL\s+)?SELECT\s+(?:NULL|[0-9]+)/i,
  
  // Time-based blind injection
  /SLEEP\s*\(/i,
  /BENCHMARK\s*\(/i,
  /WAITFOR\s+DELAY/i,
  
  // Error-based injection
  /EXTRACTVALUE\s*\(/i,
  /UPDATEXML\s*\(/i,
  
  // Out-of-band attacks
  /INTO\s+OUTFILE/i,
  /INTO\s+DUMPFILE/i,
  /LOAD_FILE\s*\(/i,
];

// ============================================
// ALLOWED STATEMENT TYPES
// ============================================

const ALLOWED_STATEMENT_TYPES = {
  'SELECT': { dangerous: false, requiresConfirm: false },
  'INSERT': { dangerous: false, requiresConfirm: false },
  'UPDATE': { dangerous: true, requiresConfirm: false },
  'DELETE': { dangerous: true, requiresConfirm: true },
  'CREATE TABLE': { dangerous: false, requiresConfirm: false },
  'ALTER TABLE': { dangerous: true, requiresConfirm: true },
  'DROP TABLE': { dangerous: true, requiresConfirm: true },
  'TRUNCATE': { dangerous: true, requiresConfirm: true },
  'SHOW': { dangerous: false, requiresConfirm: false },
  'DESCRIBE': { dangerous: false, requiresConfirm: false },
  'DESC': { dangerous: false, requiresConfirm: false },
  'EXPLAIN': { dangerous: false, requiresConfirm: false },
};

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate SQL query for security issues
 * @param {string} sql - SQL query to validate
 * @param {string[]} allowedDatabases - List of databases user can access
 * @returns {object} Validation result
 */
function validateQuery(sql, allowedDatabases = []) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    statementType: null,
    requiresConfirmation: false,
  };
  
  if (!sql || typeof sql !== 'string') {
    result.valid = false;
    result.errors.push('Empty or invalid query');
    return result;
  }
  
  const normalizedSql = sql.trim().toUpperCase();
  
  // 1. Check for blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (normalizedSql.includes(keyword.toUpperCase())) {
      result.valid = false;
      result.errors.push(`Blocked keyword detected: ${keyword}`);
    }
  }
  
  // 2. Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(sql)) {
      result.valid = false;
      result.errors.push(`Security pattern detected: potential SQL injection`);
    }
  }
  
  // 3. Detect statement type
  result.statementType = detectStatementType(normalizedSql);
  
  if (!result.statementType) {
    result.valid = false;
    result.errors.push('Unknown or unsupported statement type');
    return result;
  }
  
  const stmtConfig = ALLOWED_STATEMENT_TYPES[result.statementType];
  if (!stmtConfig) {
    result.valid = false;
    result.errors.push(`Statement type not allowed: ${result.statementType}`);
    return result;
  }
  
  if (stmtConfig.dangerous) {
    result.warnings.push(`This is a potentially dangerous operation: ${result.statementType}`);
  }
  
  if (stmtConfig.requiresConfirm) {
    result.requiresConfirmation = true;
  }
  
  // 4. Check for cross-database access
  if (allowedDatabases.length > 0) {
    const dbRefs = extractDatabaseReferences(sql);
    for (const dbRef of dbRefs) {
      if (!allowedDatabases.includes(dbRef)) {
        result.valid = false;
        result.errors.push(`Access denied to database: ${dbRef}`);
      }
    }
  }
  
  // 5. Check for DELETE/UPDATE without WHERE (very dangerous)
  if (['DELETE', 'UPDATE'].includes(result.statementType)) {
    if (!normalizedSql.includes('WHERE')) {
      result.warnings.push(`${result.statementType} without WHERE clause will affect ALL rows!`);
      result.requiresConfirmation = true;
    }
  }
  
  // 6. Check for DROP DATABASE
  if (normalizedSql.includes('DROP DATABASE')) {
    result.valid = false;
    result.errors.push('DROP DATABASE is not allowed via SQL editor. Use the UI to delete databases.');
  }
  
  return result;
}

/**
 * Detect SQL statement type
 */
function detectStatementType(normalizedSql) {
  const patterns = [
    { type: 'SELECT', regex: /^SELECT\s+/i },
    { type: 'INSERT', regex: /^INSERT\s+(INTO\s+)?/i },
    { type: 'UPDATE', regex: /^UPDATE\s+/i },
    { type: 'DELETE', regex: /^DELETE\s+(FROM\s+)?/i },
    { type: 'CREATE TABLE', regex: /^CREATE\s+TABLE/i },
    { type: 'ALTER TABLE', regex: /^ALTER\s+TABLE/i },
    { type: 'DROP TABLE', regex: /^DROP\s+TABLE/i },
    { type: 'TRUNCATE', regex: /^TRUNCATE\s+(TABLE\s+)?/i },
    { type: 'SHOW', regex: /^SHOW\s+/i },
    { type: 'DESCRIBE', regex: /^(DESCRIBE|DESC)\s+/i },
    { type: 'EXPLAIN', regex: /^EXPLAIN\s+/i },
  ];
  
  for (const { type, regex } of patterns) {
    if (regex.test(normalizedSql)) {
      return type;
    }
  }
  
  return null;
}

/**
 * Extract database references from SQL
 * Detects patterns like: database.table or `database`.`table`
 */
function extractDatabaseReferences(sql) {
  const databases = new Set();
  
  // Pattern: `database`.`table` or database.table
  const pattern = /(?:`([a-zA-Z0-9_]+)`\.`|([a-zA-Z0-9_]+)\.(?![\d]))/g;
  let match;
  
  while ((match = pattern.exec(sql)) !== null) {
    const dbName = match[1] || match[2];
    if (dbName) {
      databases.add(dbName.toLowerCase());
    }
  }
  
  return Array.from(databases);
}

/**
 * Sanitize identifier (table/column name)
 */
function sanitizeIdentifier(name) {
  if (!name || typeof name !== 'string') return null;
  // Only allow alphanumeric and underscore
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '');
  // Max length 64 (MySQL limit)
  return sanitized.substring(0, 64);
}

/**
 * Validate table name
 */
function validateTableName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Table name is required' };
  }
  
  if (name.length > 64) {
    return { valid: false, error: 'Table name too long (max 64 characters)' };
  }
  
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return { valid: false, error: 'Invalid table name. Use letters, numbers, and underscores only.' };
  }
  
  const reserved = ['select', 'insert', 'update', 'delete', 'drop', 'create', 'table', 'database', 'index', 'primary', 'key', 'foreign'];
  if (reserved.includes(name.toLowerCase())) {
    return { valid: false, error: `'${name}' is a reserved word` };
  }
  
  return { valid: true };
}

/**
 * Validate column definition
 */
function validateColumnDefinition(column) {
  const errors = [];
  
  if (!column.name) {
    errors.push('Column name is required');
  } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column.name)) {
    errors.push('Invalid column name');
  }
  
  if (!column.type) {
    errors.push('Column type is required');
  }
  
  const validTypes = [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
    'DECIMAL', 'FLOAT', 'DOUBLE',
    'VARCHAR', 'CHAR', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'TINYTEXT',
    'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
    'BOOLEAN', 'BOOL',
    'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'TINYBLOB',
    'JSON', 'ENUM', 'SET',
  ];
  
  const typeUpper = (column.type || '').toUpperCase().split('(')[0];
  if (!validTypes.includes(typeUpper)) {
    errors.push(`Invalid column type: ${column.type}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// EXPORT VALIDATION
// ============================================

/**
 * Validate SQL file for import
 * @param {string} sqlContent - Content of SQL file
 * @param {string[]} allowedDatabases - User's databases
 * @returns {object} Validation result
 */
function validateImportFile(sqlContent, allowedDatabases = []) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    statements: 0,
    blockedLines: [],
  };
  
  // Split into statements (simple split, not perfect but catches most cases)
  const statements = sqlContent.split(/;\s*\n/);
  result.statements = statements.length;
  
  let lineNumber = 1;
  
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) {
      lineNumber += (stmt.match(/\n/g) || []).length + 1;
      continue;
    }
    
    const validation = validateQuery(trimmed, allowedDatabases);
    
    if (!validation.valid) {
      result.valid = false;
      result.blockedLines.push({
        line: lineNumber,
        preview: trimmed.substring(0, 100),
        errors: validation.errors,
      });
    }
    
    lineNumber += (stmt.match(/\n/g) || []).length + 1;
  }
  
  if (result.blockedLines.length > 10) {
    result.errors.push(`Too many blocked statements (${result.blockedLines.length}). File may be malicious.`);
  }
  
  return result;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  validateQuery,
  validateImportFile,
  validateTableName,
  validateColumnDefinition,
  sanitizeIdentifier,
  detectStatementType,
  extractDatabaseReferences,
  BLOCKED_KEYWORDS,
  ALLOWED_STATEMENT_TYPES,
};
