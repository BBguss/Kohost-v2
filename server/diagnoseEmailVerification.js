/**
 * DIAGNOSTIC: Check Email Verification Database Status
 * =====================================================
 * Script ini mengecek apakah database sudah siap untuk email verification
 */

const { loadEnv } = require('./loadEnv');
loadEnv();

const pool = require('./db');

async function diagnose() {
    console.log('\n========================================');
    console.log('🔍 EMAIL VERIFICATION DIAGNOSTIC');
    console.log('========================================\n');

    try {
        // 1. Check if email_verified column exists in users table
        console.log('1️⃣ Checking users table for email_verified column...');
        const [userCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'email_verified'");
        if (userCols.length > 0) {
            console.log('   ✅ email_verified column EXISTS\n');
        } else {
            console.log('   ❌ email_verified column MISSING - Run migration!\n');
        }

        // 2. Check if email_verifications table exists
        console.log('2️⃣ Checking if email_verifications table exists...');
        const [tables] = await pool.query("SHOW TABLES LIKE 'email_verifications'");
        if (tables.length > 0) {
            console.log('   ✅ email_verifications table EXISTS\n');

            // 3. Check tokens in the table
            console.log('3️⃣ Checking tokens in email_verifications...');
            const [tokens] = await pool.query('SELECT * FROM email_verifications ORDER BY created_at DESC LIMIT 5');
            console.log(`   Found ${tokens.length} token(s):`);
            tokens.forEach(t => {
                console.log(`   - User: ${t.user_id}, Used: ${t.is_used}, Expires: ${t.expires_at}`);
            });
            console.log('');
        } else {
            console.log('   ❌ email_verifications table MISSING - Run migration!\n');
        }

        // 4. Check users and their verification status
        console.log('4️⃣ Checking users verification status...');
        const [users] = await pool.query('SELECT id, username, email, email_verified FROM users LIMIT 10');
        console.log(`   Found ${users.length} user(s):`);
        users.forEach(u => {
            const status = u.email_verified ? '✅ VERIFIED' : '❌ NOT VERIFIED';
            console.log(`   - ${u.username} (${u.email}): ${status}`);
        });

        console.log('\n========================================');
        console.log('📋 DIAGNOSIS COMPLETE');
        console.log('========================================\n');

    } catch (error) {
        console.error('❌ Diagnostic error:', error.message);
    } finally {
        await pool.end();
    }
}

diagnose();
