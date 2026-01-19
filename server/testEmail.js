/**
 * ============================================
 * EMAIL TEST - Tes Pengiriman Email
 * ============================================
 * 
 * File ini digunakan untuk menguji apakah konfigurasi email
 * sudah benar dan email bisa terkirim.
 * 
 * Cara menjalankan:
 * node testEmail.js
 */

// Load environment variables dari file .env
// loadEnv adalah fungsi yang harus dipanggil untuk memuat variabel dari .env
const { loadEnv } = require('./loadEnv');
loadEnv();

// Import email service yang sudah dibuat
const emailService = require('./services/emailService');

/**
 * FUNGSI TEST UTAMA
 * =================
 * Menjalankan berbagai tes pengiriman email
 */
async function runEmailTests() {
    console.log('========================================');
    console.log('🧪 MEMULAI TES EMAIL SERVICE');
    console.log('========================================\n');

    // ----------------------------------------
    // TEST 1: Verifikasi Koneksi SMTP
    // ----------------------------------------
    console.log('📡 TEST 1: Verifikasi Koneksi SMTP...');
    const isConnected = await emailService.verifyConnection();

    if (!isConnected) {
        console.log('❌ Koneksi SMTP gagal. Periksa konfigurasi di .env');
        console.log('   - SMTP_HOST:', process.env.SMTP_HOST);
        console.log('   - SMTP_PORT:', process.env.SMTP_PORT);
        console.log('   - SMTP_USER:', process.env.SMTP_USER);
        return; // Stop jika koneksi gagal
    }
    console.log('✅ Koneksi SMTP berhasil!\n');

    // ----------------------------------------
    // TEST 2: Kirim Email Sederhana
    // ----------------------------------------
    console.log('📧 TEST 2: Kirim Email Sederhana...');
    const simpleEmailResult = await emailService.sendEmail({
        to: process.env.SMTP_USER, // Kirim ke diri sendiri untuk tes
        subject: '🧪 Test Email dari Kohost',
        text: 'Ini adalah email tes sederhana dari Kohost Email Service.',
        html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>🎉 Email Berhasil Terkirim!</h2>
        <p>Ini adalah email tes dari Kohost Email Service.</p>
        <p>Waktu pengiriman: <strong>${new Date().toLocaleString('id-ID')}</strong></p>
      </div>
    `
    });

    if (simpleEmailResult.success) {
        console.log('✅ Email sederhana berhasil terkirim!');
        console.log('   Message ID:', simpleEmailResult.messageId);
    } else {
        console.log('❌ Email gagal:', simpleEmailResult.error);
    }
    console.log('');

    // ----------------------------------------
    // TEST 3: Kirim Welcome Email
    // ----------------------------------------
    console.log('📧 TEST 3: Kirim Welcome Email...');
    const welcomeResult = await emailService.sendWelcomeEmail(
        process.env.SMTP_USER, // Kirim ke diri sendiri
        'Test User'            // Nama user
    );

    if (welcomeResult.success) {
        console.log('✅ Welcome email berhasil terkirim!');
    } else {
        console.log('❌ Welcome email gagal:', welcomeResult.error);
    }
    console.log('');

    // ----------------------------------------
    // TEST 4: Kirim Notification Email
    // ----------------------------------------
    console.log('📧 TEST 4: Kirim Notification Email...');
    const notifResult = await emailService.sendNotificationEmail(
        process.env.SMTP_USER,
        'Deployment Berhasil',
        'Website example.kohost.id berhasil di-deploy dan sekarang sudah online!',
        'success' // Tipe: success, warning, error, info
    );

    if (notifResult.success) {
        console.log('✅ Notification email berhasil terkirim!');
    } else {
        console.log('❌ Notification email gagal:', notifResult.error);
    }
    console.log('');

    // ----------------------------------------
    // RINGKASAN HASIL
    // ----------------------------------------
    console.log('========================================');
    console.log('📊 TES SELESAI');
    console.log('========================================');
    console.log('Silakan cek inbox email Anda untuk melihat hasilnya.');
    console.log('Email penerima:', process.env.SMTP_USER);
}

// Jalankan fungsi test
runEmailTests().catch(console.error);
