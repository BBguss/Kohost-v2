/**
 * ============================================
 * RUN DATABASE CREDENTIALS MIGRATION
 * ============================================
 * 
 * Creates tables for user database credential management:
 * - user_db_credentials
 * - user_databases
 * - db_audit_logs
 * - db_query_history
 * 
 * Usage: node runMigrationDbCredentials.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function runMigration() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  DATABASE CREDENTIALS MIGRATION            ║');
  console.log('╚════════════════════════════════════════════╝');
  
  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'migration_database_credentials.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    console.log('\n📄 Migration file loaded');
    
    // Better parsing: split by semicolon followed by newline, but keep CREATE TABLE intact
    // Remove comments first
    let cleanSql = sql
      .replace(/--.*$/gm, '')  // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '');  // Remove multi-line comments
    
    // Split by semicolon at end of statement
    const statements = cleanSql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 10);  // Filter out empty/tiny statements
    
    console.log(`📊 Found ${statements.length} statements to execute\n`);
    
    let executed = 0;
    let skipped = 0;
    
    for (const stmt of statements) {
      try {
        // Log what we're executing (first 80 chars)
        const preview = stmt.replace(/\s+/g, ' ').substring(0, 80);
        process.stdout.write(`  ${preview}... `);
        
        await pool.query(stmt);
        console.log('✅');
        executed++;
      } catch (error) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log('⏭️ (table exists)');
          skipped++;
        } else if (error.code === 'ER_DUP_KEYNAME') {
          console.log('⏭️ (index exists)');
          skipped++;
        } else if (error.code === 'ER_DUP_ENTRY') {
          console.log('⏭️ (duplicate)');
          skipped++;
        } else {
          console.log('❌');
          console.error(`    Error: ${error.message}`);
        }
      }
    }
    
    console.log('\n════════════════════════════════════════════');
    console.log(`✅ Migration complete: ${executed} executed, ${skipped} skipped`);
    console.log('════════════════════════════════════════════\n');
    
    // Verify tables exist
    console.log('🔍 Verifying tables...');
    const [tables] = await pool.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME IN ('user_db_credentials', 'user_databases', 'db_audit_logs', 'db_query_history')
    `);
    
    const tableNames = tables.map(t => t.TABLE_NAME);
    console.log('  Found tables:', tableNames.join(', ') || '(none)');
    
    const expected = ['user_db_credentials', 'user_databases', 'db_audit_logs', 'db_query_history'];
    const missing = expected.filter(t => !tableNames.includes(t));
    
    if (missing.length > 0) {
      console.log('\n⚠️ Missing tables:', missing.join(', '));
    } else {
      console.log('\n✅ All tables created successfully!');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigration();
