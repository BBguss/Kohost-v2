/**
 * ============================================
 * MIGRATION: Add Email Verification Support
 * ============================================
 * 
 * Script ini menjalankan migration untuk menambahkan fitur
 * email verification ke database.
 * 
 * Cara menjalankan:
 * node runMigrationEmail.js
 */

// Load environment variables
const { loadEnv } = require('./loadEnv');
loadEnv();

// Import database connection
const pool = require('./db');

/**
 * MIGRATION QUERIES
 * =================
 * Array berisi semua query migration yang akan dijalankan
 */
const migrations = [
    {
        name: 'Add email_verified column to users',
        query: `
      ALTER TABLE users 
      ADD COLUMN email_verified BOOLEAN DEFAULT FALSE
    `,
        // Jika kolom sudah ada, pesan ini akan ditampilkan
        ignoreError: 'Duplicate column name'
    },
    {
        name: 'Create email_verifications table',
        query: `
      CREATE TABLE IF NOT EXISTS email_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_used BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
    },
    {
        name: 'Create password_resets table',
        query: `
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_used BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
    }
];

/**
 * RUN MIGRATIONS
 * ==============
 * Menjalankan semua migration satu per satu
 */
async function runMigrations() {
    console.log('========================================');
    console.log('🚀 STARTING EMAIL VERIFICATION MIGRATION');
    console.log('========================================\n');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const migration of migrations) {
        console.log(`📋 Running: ${migration.name}...`);

        try {
            await pool.query(migration.query);
            console.log(`   ✅ Success\n`);
            successCount++;
        } catch (error) {
            // Cek apakah error adalah kesalahan yang bisa diabaikan
            if (migration.ignoreError && error.message.includes(migration.ignoreError)) {
                console.log(`   ⏭️  Skipped (already exists)\n`);
                skipCount++;
            } else {
                console.log(`   ❌ Error: ${error.message}\n`);
                errorCount++;
            }
        }
    }

    console.log('========================================');
    console.log('📊 MIGRATION SUMMARY');
    console.log('========================================');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors:  ${errorCount}`);
    console.log('========================================\n');

    // Tutup koneksi database
    await pool.end();
    console.log('✅ Database connection closed');
    console.log('🎉 Migration completed!');
}

// Jalankan migration
runMigrations().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
