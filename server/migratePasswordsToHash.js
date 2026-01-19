/**
 * ============================================
 * MIGRATION: Hash Existing Plain Text Passwords
 * ============================================
 * 
 * Script ini mengkonversi password plain text yang ada di database
 * menjadi password ter-hash menggunakan bcrypt.
 * 
 * PENTING: Jalankan script ini SEKALI saja setelah implementasi bcrypt!
 * 
 * Cara menjalankan:
 * node migratePasswordsToHash.js
 */

// Load environment variables
const { loadEnv } = require('./loadEnv');
loadEnv();

// Import dependencies
const pool = require('./db');
const bcrypt = require('bcryptjs');

// Jumlah salt rounds untuk bcrypt (sama dengan yang di authController)
const SALT_ROUNDS = 10;

/**
 * MAIN MIGRATION FUNCTION
 * =======================
 * Mengambil semua user dan hash password yang masih plain text
 */
async function migratePasswords() {
    console.log('========================================');
    console.log('🔐 STARTING PASSWORD HASH MIGRATION');
    console.log('========================================\n');

    try {
        // 1. Ambil semua user dari database
        const [users] = await pool.execute('SELECT id, username, password FROM users');
        console.log(`📋 Found ${users.length} users to process\n`);

        let migratedCount = 0;
        let skippedCount = 0;

        for (const user of users) {
            // 2. Cek apakah password sudah di-hash
            // Password bcrypt selalu dimulai dengan $2a$ atau $2b$
            const isAlreadyHashed = user.password.startsWith('$2a$') ||
                user.password.startsWith('$2b$') ||
                user.password.startsWith('$2y$');

            if (isAlreadyHashed) {
                console.log(`⏭️  ${user.username}: Already hashed, skipping`);
                skippedCount++;
                continue;
            }

            // 3. Hash password plain text
            console.log(`🔄 ${user.username}: Hashing password...`);
            const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);

            // 4. Update password di database
            await pool.execute(
                'UPDATE users SET password = ? WHERE id = ?',
                [hashedPassword, user.id]
            );
            console.log(`✅ ${user.username}: Password migrated successfully`);
            migratedCount++;
        }

        console.log('\n========================================');
        console.log('📊 MIGRATION SUMMARY');
        console.log('========================================');
        console.log(`   ✅ Migrated: ${migratedCount} users`);
        console.log(`   ⏭️  Skipped:  ${skippedCount} users (already hashed)`);
        console.log('========================================\n');

        console.log('🎉 Migration completed successfully!');
        console.log('⚠️  IMPORTANT: Do NOT run this script again!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        // Tutup koneksi database
        await pool.end();
        console.log('✅ Database connection closed');
    }
}

// Jalankan migration
migratePasswords();
