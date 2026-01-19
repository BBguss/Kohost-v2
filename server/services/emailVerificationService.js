/**
 * ============================================
 * EMAIL VERIFICATION SERVICE
 * ============================================
 * 
 * Service ini menangani logika verifikasi email user:
 * - Generate token verification
 * - Kirim email verification secara async (background)
 * - Verifikasi token dari user
 * 
 * Lokasi: server/services/emailVerificationService.js
 */

const crypto = require('crypto');  // Built-in Node.js untuk generate token
const pool = require('../db');     // Koneksi database
const { sendEmail } = require('./emailService');  // Service untuk kirim email

/**
 * GENERATE VERIFICATION TOKEN
 * ===========================
 * Membuat token acak yang aman untuk verifikasi email.
 * Token ini akan dikirim ke email user sebagai bagian dari link verifikasi.
 * 
 * @returns {string} - Token 64 karakter hexadecimal
 * 
 * Penjelasan:
 * - crypto.randomBytes(32) = membuat 32 bytes data acak (256 bit)
 * - .toString('hex') = konversi ke string hexadecimal (64 karakter)
 * - Ini cukup aman dan tidak mudah ditebak
 */
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * CREATE VERIFICATION TOKEN
 * =========================
 * Membuat dan menyimpan token verifikasi ke database.
 * Token ini akan kadaluarsa dalam 24 jam.
 * 
 * @param {string} userId - ID user yang akan diverifikasi
 * @returns {Promise<string>} - Token yang dibuat
 */
const createVerificationToken = async (userId) => {
  // Generate token acak
  const token = generateToken();

  // Set waktu kadaluarsa (24 jam dari sekarang)
  // new Date() = waktu sekarang
  // + 24 * 60 * 60 * 1000 = tambah 24 jam dalam milliseconds
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Format tanggal untuk MySQL (YYYY-MM-DD HH:MM:SS)
  const expiresAtFormatted = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

  // Hapus token lama yang belum digunakan (jika ada)
  // Ini untuk mencegah banyak token aktif untuk 1 user
  await pool.execute(
    'DELETE FROM email_verifications WHERE user_id = ? AND is_used = FALSE',
    [userId]
  );

  // Simpan token baru ke database
  await pool.execute(
    'INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)',
    [userId, token, expiresAtFormatted]
  );

  console.log(`[EmailVerification] Token created for user: ${userId}`);
  return token;
};

/**
 * SEND VERIFICATION EMAIL (ASYNC/BACKGROUND)
 * ==========================================
 * Mengirim email verifikasi secara async (tidak blocking).
 * Ini berarti proses registrasi tidak perlu menunggu email terkirim.
 * 
 * @param {string} userId - ID user
 * @param {string} email - Alamat email user
 * @param {string} username - Nama user untuk personalisasi email
 * @param {string} baseUrl - URL dasar aplikasi (contoh: http://localhost:3000)
 * 
 * Cara kerja ASYNC:
 * - Fungsi ini tidak menggunakan "await" di caller
 * - Proses pengiriman email berjalan di background
 * - Jika gagal, error hanya di-log, tidak mengganggu alur utama
 * 
 * @param {boolean} isResend - Apakah ini email resend (true) atau registrasi baru (false)
 */
const sendVerificationEmailAsync = (userId, email, username, baseUrl, isResend = false) => {
  // setImmediate() menjadwalkan fungsi untuk dijalankan di iterasi event loop berikutnya
  // Ini membuat proses pengiriman email tidak blocking
  setImmediate(async () => {
    try {
      console.log(`[EmailVerification] Starting async email send to: ${email} (isResend: ${isResend})`);

      // 1. Buat token verifikasi
      const token = await createVerificationToken(userId);

      // 2. Buat link verifikasi
      // Link ini akan diklik oleh user untuk memverifikasi email
      const verificationLink = `${baseUrl}/verify-email?token=${token}`;

      // 3. Buat HTML email dengan template yang menarik
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            /* 
             * CSS Styling untuk Email
             * Email client memiliki dukungan CSS yang terbatas,
             * jadi kita gunakan inline styles dan style tag sederhana
             */
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
              border-radius: 10px 10px 0 0; 
            }
            .content { 
              background: #ffffff; 
              padding: 40px 30px; 
              border: 1px solid #e0e0e0;
              border-top: none;
            }
            .button { 
              display: inline-block; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white !important; 
              padding: 15px 40px; 
              text-decoration: none; 
              border-radius: 30px; 
              font-weight: bold;
              margin: 20px 0;
            }
            .button:hover {
              opacity: 0.9;
            }
            .warning { 
              background: #fff3cd; 
              border: 1px solid #ffc107; 
              padding: 15px; 
              border-radius: 5px; 
              margin-top: 25px;
              font-size: 14px;
            }
            .footer { 
              background: #f8f9fa;
              text-align: center; 
              padding: 20px;
              color: #888; 
              font-size: 12px;
              border: 1px solid #e0e0e0;
              border-top: none;
              border-radius: 0 0 10px 10px;
            }
            .code-box {
              background: #f5f5f5;
              border: 1px dashed #ccc;
              padding: 15px;
              border-radius: 5px;
              font-family: monospace;
              word-break: break-all;
              font-size: 12px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">${isResend ? '🔄 Link Verifikasi Baru' : '✉️ Verifikasi Email Anda'}</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">${isResend ? 'Permintaan Link Baru' : 'Selamat datang di Kohost!'}</p>
            </div>
            <div class="content">
              <h2 style="color: #333; margin-top: 0;">Halo ${username}! 👋</h2>
              ${isResend
          ? `<p>Kami menerima permintaan untuk mengirim ulang link verifikasi email Anda. Klik tombol di bawah untuk memverifikasi email:</p>`
          : `<p>Terima kasih telah mendaftar di <strong>Kohost</strong>. Untuk mengaktifkan akun Anda dan mulai menggunakan layanan kami, silakan verifikasi email Anda dengan mengklik tombol di bawah ini:</p>`
        }
              
              <div style="text-align: center;">
                <a href="${verificationLink}" class="button">✅ Verifikasi Email Saya</a>
              </div>
              
              <p style="color: #666; font-size: 14px;">Atau salin dan tempel link berikut di browser Anda:</p>
              <div class="code-box">
                ${verificationLink}
              </div>
              
              <div class="warning">
                <strong>⚠️ Penting:</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                  <li>Link ini hanya berlaku selama <strong>24 jam</strong></li>
                  <li>Jika Anda tidak mendaftar di Kohost, abaikan email ini</li>
                  <li>Jangan bagikan link ini kepada siapapun</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p>Email ini dikirim secara otomatis. Mohon jangan membalas email ini.</p>
              <p>&copy; ${new Date().getFullYear()} Kohost. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // 4. Kirim email menggunakan emailService
      const result = await sendEmail({
        to: email,
        subject: '✉️ Verifikasi Email - Kohost',
        html: html,
        // Plain text version untuk email client yang tidak support HTML
        text: `Halo ${username}! Verifikasi email Anda dengan mengunjungi link: ${verificationLink}. Link berlaku 24 jam.`
      });

      // 5. Log hasil
      if (result.success) {
        console.log(`[EmailVerification] ✅ Email sent successfully to: ${email}`);
      } else {
        console.error(`[EmailVerification] ❌ Failed to send email: ${result.error}`);
      }

    } catch (error) {
      // Error handling - hanya log, tidak throw
      // Karena ini async, error tidak akan mengganggu proses registrasi
      console.error('[EmailVerification] ❌ Async email error:', error.message);
    }
  });

  // Fungsi ini langsung return tanpa menunggu email terkirim
  console.log(`[EmailVerification] Email queued for: ${email} (running in background)`);
};

/**
 * VERIFY EMAIL TOKEN (IDEMPOTENT)
 * ================================
 * Memverifikasi token yang diberikan oleh user.
 * Endpoint ini bersifat IDEMPOTENT - aman untuk klik ulang, refresh, atau buka ulang link.
 * 
 * SUMBER KEBENARAN UTAMA: Status emailVerified di tabel users, BUKAN status token.
 * 
 * Flow:
 * 1. Cari token di database
 * 2. Jika ditemukan & emailVerified = false → verify user
 * 3. Jika ditemukan & emailVerified = true → return success (already verified)
 * 4. Jika token tidak ditemukan/sudah used/expired:
 *    - Jika user sudah emailVerified = true → return success
 *    - Jika tidak → return error
 * 
 * @param {string} token - Token dari URL verification link
 * @returns {Promise<Object>} - Hasil verifikasi
 */
const verifyEmailToken = async (token) => {
  try {
    console.log(`[EmailVerification] ========================================`);
    console.log(`[EmailVerification] 🔍 Verifying token...`);

    // 1. Cari token di database dengan JOIN ke tabel users
    const [rows] = await pool.execute(`
      SELECT ev.*, u.id as user_id, u.username, u.email, u.email_verified 
      FROM email_verifications ev
      JOIN users u ON ev.user_id = u.id
      WHERE ev.token = ?
    `, [token]);

    // Token ditemukan
    if (rows.length > 0) {
      const verification = rows[0];
      console.log(`[EmailVerification] Token found for user: ${verification.username}`);
      console.log(`[EmailVerification] Current email_verified status: ${verification.email_verified}`);
      console.log(`[EmailVerification] Token is_used: ${verification.is_used}`);

      // PRIORITAS 1: Cek apakah user sudah verified (sumber kebenaran utama)
      if (verification.email_verified === 1 || verification.email_verified === true) {
        console.log(`[EmailVerification] ✅ User already verified - returning success`);
        return {
          success: true,
          status: 'already_verified',
          message: 'Email sudah diverifikasi sebelumnya',
          alreadyVerified: true,
          user: {
            id: verification.user_id,
            username: verification.username,
            email: verification.email
          }
        };
      }

      // Token sudah digunakan TAPI user belum verified (kasus aneh, tapi handle)
      if (verification.is_used) {
        // Cek lagi status user terkini dari database
        const [userCheck] = await pool.execute(
          'SELECT email_verified FROM users WHERE id = ?',
          [verification.user_id]
        );
        if (userCheck.length > 0 && (userCheck[0].email_verified === 1 || userCheck[0].email_verified === true)) {
          console.log(`[EmailVerification] ✅ Token used but user verified - returning success`);
          return {
            success: true,
            status: 'already_verified',
            message: 'Email sudah diverifikasi',
            alreadyVerified: true,
            user: {
              id: verification.user_id,
              username: verification.username,
              email: verification.email
            }
          };
        }
        // User masih belum verified dan token sudah used - minta link baru
        console.log(`[EmailVerification] ❌ Token used and user not verified - need new link`);
        return {
          success: false,
          status: 'invalid_token',
          message: 'Token sudah digunakan. Silakan minta link verifikasi baru.'
        };
      }

      // Cek apakah token sudah kadaluarsa
      if (new Date(verification.expires_at) < new Date()) {
        console.log(`[EmailVerification] ❌ Token expired`);
        return {
          success: false,
          status: 'invalid_token',
          message: 'Token sudah kadaluarsa. Silakan minta link verifikasi baru.'
        };
      }

      // Token valid dan user belum verified - VERIFY NOW!
      console.log(`[EmailVerification] 🔄 Verifying user...`);

      // Update status email_verified di tabel users
      const updateResult = await pool.execute(
        'UPDATE users SET email_verified = 1 WHERE id = ?',
        [verification.user_id]
      );
      console.log(`[EmailVerification] UPDATE result: ${updateResult[0].affectedRows} rows affected`);

      // Tandai token sebagai sudah digunakan
      await pool.execute(
        'UPDATE email_verifications SET is_used = 1 WHERE token = ?',
        [token]
      );

      console.log(`[EmailVerification] ✅ Email verified successfully for: ${verification.username}`);

      return {
        success: true,
        status: 'success',
        message: 'Email berhasil diverifikasi!',
        user: {
          id: verification.user_id,
          username: verification.username,
          email: verification.email
        }
      };
    }

    // Token tidak ditemukan di database
    console.log(`[EmailVerification] ⚠️ Token not found in database`);

    // Tidak bisa cek user karena tidak ada referensi - return error
    return {
      success: false,
      status: 'invalid_token',
      message: 'Token tidak valid atau tidak ditemukan'
    };

  } catch (error) {
    console.error('[EmailVerification] Error verifying token:', error.message);
    return {
      success: false,
      status: 'error',
      message: 'Terjadi kesalahan saat verifikasi. Silakan coba lagi.'
    };
  }
};

/**
 * RESEND VERIFICATION EMAIL
 * =========================
 * Mengirim ulang email verifikasi untuk user yang belum verifikasi.
 * Berguna jika user tidak menerima email pertama atau token sudah kadaluarsa.
 * 
 * @param {string} email - Email user
 * @param {string} baseUrl - URL dasar aplikasi
 * @returns {Promise<Object>} - Hasil pengiriman
 */
const resendVerificationEmail = async (email, baseUrl) => {
  try {
    // 1. Cari user berdasarkan email
    const [users] = await pool.execute(
      'SELECT id, username, email, email_verified FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return {
        success: false,
        message: 'Email tidak terdaftar'
      };
    }

    const user = users[0];

    // 2. Cek apakah email sudah diverifikasi
    if (user.email_verified) {
      return {
        success: false,
        message: 'Email sudah diverifikasi'
      };
    }

    // 3. Kirim email verifikasi baru (async) dengan isResend = true
    // Ini akan menggunakan template email yang berbeda
    sendVerificationEmailAsync(user.id, user.email, user.username, baseUrl, true);

    return {
      success: true,
      message: 'Email verifikasi telah dikirim ulang. Silakan cek inbox Anda.'
    };

  } catch (error) {
    console.error('[EmailVerification] Resend error:', error.message);
    return {
      success: false,
      message: 'Gagal mengirim ulang email verifikasi'
    };
  }
};

/**
 * CHECK EMAIL VERIFIED STATUS
 * ===========================
 * Mengecek apakah email user sudah diverifikasi.
 * Berguna untuk validasi saat login atau akses fitur tertentu.
 * 
 * @param {string} userId - ID user
 * @returns {Promise<boolean>} - true jika sudah diverifikasi
 */
const isEmailVerified = async (userId) => {
  try {
    const [users] = await pool.execute(
      'SELECT email_verified FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) return false;

    // email_verified bisa berupa 1, true, atau '1' tergantung driver
    return users[0].email_verified === 1 || users[0].email_verified === true;

  } catch (error) {
    console.error('[EmailVerification] Check status error:', error.message);
    return false;
  }
};

// ============================================
// EXPORT SEMUA FUNGSI
// ============================================
module.exports = {
  generateToken,              // Generate token acak
  createVerificationToken,    // Buat & simpan token ke DB
  sendVerificationEmailAsync, // Kirim email async (background)
  verifyEmailToken,           // Verifikasi token dari user
  resendVerificationEmail,    // Kirim ulang email verifikasi
  isEmailVerified             // Cek status verifikasi
};
