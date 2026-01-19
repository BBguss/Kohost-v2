/**
 * ============================================
 * EMAIL SERVICE - Layanan Pengiriman Email
 * ============================================
 * 
 * File ini berisi konfigurasi dan fungsi untuk mengirim email
 * menggunakan Nodemailer dengan SMTP Gmail.
 * 
 * Dependensi: nodemailer
 * Konfigurasi: .env file (SMTP_HOST, SMTP_PORT, dll)
 */

// Import nodemailer - library untuk mengirim email di Node.js
const nodemailer = require('nodemailer');

/**
 * TRANSPORTER CONFIGURATION
 * =========================
 * Transporter adalah objek yang bertanggung jawab untuk mengirim email.
 * Kita mengkonfigurasinya dengan detail SMTP server.
 */
const transporter = nodemailer.createTransport({
    // host: alamat server SMTP (contoh: smtp.gmail.com untuk Gmail)
    host: process.env.SMTP_HOST,

    // port: nomor port untuk koneksi SMTP
    // 587 = TLS (Transport Layer Security) - recommended
    // 465 = SSL (Secure Sockets Layer)
    port: parseInt(process.env.SMTP_PORT) || 587,

    // secure: true jika menggunakan port 465 (SSL), false untuk port lain (TLS)
    // Untuk port 587, kita set false karena TLS akan diaktifkan secara otomatis
    secure: process.env.SMTP_SECURE === 'true',

    // auth: kredensial untuk autentikasi ke SMTP server
    auth: {
        // user: alamat email pengirim
        user: process.env.SMTP_USER,

        // pass: password (untuk Gmail, gunakan App Password, bukan password biasa)
        pass: process.env.SMTP_PASS,
    },

    // tls: konfigurasi TLS tambahan
    tls: {
        // rejectUnauthorized: false = menerima sertifikat self-signed
        // Berguna untuk development, tapi di production sebaiknya true
        rejectUnauthorized: false
    }
});

/**
 * VERIFY TRANSPORTER
 * ==================
 * Fungsi untuk memverifikasi apakah konfigurasi SMTP sudah benar
 * dan koneksi ke server berhasil.
 * 
 * @returns {Promise<boolean>} - true jika koneksi berhasil
 */
const verifyConnection = async () => {
    try {
        // verify() akan mencoba koneksi ke SMTP server
        await transporter.verify();
        console.log('✅ Email service is ready to send emails');
        return true;
    } catch (error) {
        // Jika gagal, tampilkan error untuk debugging
        console.error('❌ Email service error:', error.message);
        return false;
    }
};

/**
 * SEND EMAIL - Fungsi Utama untuk Mengirim Email
 * ==============================================
 * 
 * @param {Object} options - Opsi email
 * @param {string} options.to - Alamat email penerima (bisa multiple: "a@mail.com, b@mail.com")
 * @param {string} options.subject - Subjek/judul email
 * @param {string} options.text - Isi email dalam format plain text (opsional)
 * @param {string} options.html - Isi email dalam format HTML (opsional)
 * @param {Array} options.attachments - Lampiran file (opsional)
 * 
 * @returns {Promise<Object>} - Hasil pengiriman email
 * 
 * Contoh penggunaan:
 * await sendEmail({
 *   to: 'customer@example.com',
 *   subject: 'Selamat Datang!',
 *   html: '<h1>Hello World</h1>'
 * });
 */
const sendEmail = async ({ to, subject, text, html, attachments = [] }) => {
    try {
        // Membuat objek mail options dengan semua detail email
        const mailOptions = {
            // from: alamat pengirim (diambil dari .env)
            from: process.env.EMAIL_FROM || process.env.SMTP_USER,

            // to: alamat penerima
            to: to,

            // subject: judul email
            subject: subject,

            // text: versi plain text dari email (untuk email client yang tidak support HTML)
            text: text,

            // html: versi HTML dari email (untuk tampilan yang lebih menarik)
            html: html,

            // attachments: array file yang akan dilampirkan
            // Format: [{ filename: 'file.pdf', path: '/path/to/file.pdf' }]
            attachments: attachments
        };

        // sendMail() mengirim email dan mengembalikan info tentang pengiriman
        const info = await transporter.sendMail(mailOptions);

        // Log hasil pengiriman untuk debugging
        console.log('📧 Email sent successfully!');
        console.log('   Message ID:', info.messageId);
        console.log('   To:', to);

        // Mengembalikan objek hasil dengan status sukses
        return {
            success: true,
            messageId: info.messageId,
            message: 'Email sent successfully'
        };

    } catch (error) {
        // Jika terjadi error, log dan throw error untuk ditangani di caller
        console.error('❌ Failed to send email:', error.message);

        // Mengembalikan objek error
        return {
            success: false,
            error: error.message,
            message: 'Failed to send email'
        };
    }
};

/**
 * SEND WELCOME EMAIL - Email Selamat Datang
 * =========================================
 * Template email untuk user baru yang mendaftar.
 * 
 * @param {string} to - Email penerima
 * @param {string} name - Nama user
 * @returns {Promise<Object>} - Hasil pengiriman
 */
const sendWelcomeEmail = async (to, name) => {
    // HTML template untuk email selamat datang
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        /* Styling untuk email */
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Selamat Datang di Kohost!</h1>
        </div>
        <div class="content">
          <h2>Halo ${name}!</h2>
          <p>Terima kasih telah mendaftar di Kohost. Akun Anda telah berhasil dibuat dan siap digunakan.</p>
          <p>Dengan Kohost, Anda dapat:</p>
          <ul>
            <li>🚀 Hosting website dengan mudah</li>
            <li>📊 Mengelola domain dan subdomain</li>
            <li>💾 Backup otomatis dan aman</li>
            <li>📈 Monitoring performa real-time</li>
          </ul>
          <p>Jika Anda memiliki pertanyaan, jangan ragu untuk menghubungi tim support kami.</p>
          <a href="#" class="button">Mulai Sekarang</a>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Kohost. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

    // Kirim email menggunakan fungsi sendEmail
    return await sendEmail({
        to: to,
        subject: '🎉 Selamat Datang di Kohost!',
        html: html,
        // text adalah versi plain text untuk email client yang tidak support HTML
        text: `Halo ${name}! Terima kasih telah mendaftar di Kohost. Akun Anda telah berhasil dibuat.`
    });
};

/**
 * SEND PASSWORD RESET EMAIL - Email Reset Password
 * ================================================
 * Template email untuk reset password user.
 * 
 * @param {string} to - Email penerima
 * @param {string} name - Nama user
 * @param {string} resetLink - Link untuk reset password
 * @returns {Promise<Object>} - Hasil pengiriman
 */
const sendPasswordResetEmail = async (to, name, resetLink) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e74c3c; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin-top: 20px; }
        .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Reset Password</h1>
        </div>
        <div class="content">
          <h2>Halo ${name}!</h2>
          <p>Kami menerima permintaan untuk mereset password akun Anda. Klik tombol di bawah untuk membuat password baru:</p>
          <a href="${resetLink}" class="button">Reset Password</a>
          <div class="warning">
            <strong>⚠️ Penting:</strong>
            <ul>
              <li>Link ini hanya berlaku selama 1 jam</li>
              <li>Jika Anda tidak meminta reset password, abaikan email ini</li>
              <li>Jangan bagikan link ini kepada siapapun</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Kohost. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

    return await sendEmail({
        to: to,
        subject: '🔐 Reset Password - Kohost',
        html: html,
        text: `Halo ${name}! Klik link berikut untuk reset password: ${resetLink}. Link berlaku selama 1 jam.`
    });
};

/**
 * SEND INVOICE EMAIL - Email Invoice/Tagihan
 * ==========================================
 * Template email untuk mengirim invoice pembayaran.
 * 
 * @param {string} to - Email penerima
 * @param {Object} invoice - Data invoice
 * @param {string} invoice.number - Nomor invoice
 * @param {string} invoice.customerName - Nama customer
 * @param {string} invoice.planName - Nama paket/plan
 * @param {number} invoice.amount - Jumlah tagihan
 * @param {string} invoice.dueDate - Tanggal jatuh tempo
 * @returns {Promise<Object>} - Hasil pengiriman
 */
const sendInvoiceEmail = async (to, invoice) => {
    // Format angka ke format Rupiah
    const formatRupiah = (amount) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    };

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .invoice-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .invoice-table th, .invoice-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .invoice-table th { background: #ecf0f1; }
        .total { font-size: 24px; color: #2c3e50; font-weight: bold; }
        .button { display: inline-block; background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📄 Invoice</h1>
          <p>No: ${invoice.number}</p>
        </div>
        <div class="content">
          <h2>Halo ${invoice.customerName}!</h2>
          <p>Berikut adalah detail tagihan Anda:</p>
          
          <table class="invoice-table">
            <tr>
              <th>Deskripsi</th>
              <th>Jumlah</th>
            </tr>
            <tr>
              <td>${invoice.planName}</td>
              <td>${formatRupiah(invoice.amount)}</td>
            </tr>
            <tr>
              <td><strong>Total</strong></td>
              <td class="total">${formatRupiah(invoice.amount)}</td>
            </tr>
          </table>
          
          <p><strong>Jatuh Tempo:</strong> ${invoice.dueDate}</p>
          
          <a href="#" class="button">Bayar Sekarang</a>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Kohost. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

    return await sendEmail({
        to: to,
        subject: `📄 Invoice ${invoice.number} - Kohost`,
        html: html,
        text: `Invoice ${invoice.number} untuk ${invoice.customerName}. Total: ${formatRupiah(invoice.amount)}. Jatuh tempo: ${invoice.dueDate}`
    });
};

/**
 * SEND NOTIFICATION EMAIL - Email Notifikasi Umum
 * ===============================================
 * Template email untuk notifikasi umum (deployment sukses, domain aktif, dll).
 * 
 * @param {string} to - Email penerima
 * @param {string} title - Judul notifikasi
 * @param {string} message - Isi pesan
 * @param {string} type - Tipe notifikasi: 'success', 'warning', 'error', 'info'
 * @returns {Promise<Object>} - Hasil pengiriman
 */
const sendNotificationEmail = async (to, title, message, type = 'info') => {
    // Mapping warna berdasarkan tipe notifikasi
    const colors = {
        success: '#27ae60',  // Hijau
        warning: '#f39c12',  // Kuning
        error: '#e74c3c',    // Merah
        info: '#3498db'      // Biru
    };

    // Mapping emoji berdasarkan tipe
    const emojis = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        info: 'ℹ️'
    };

    const color = colors[type] || colors.info;
    const emoji = emojis[type] || emojis.info;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${color}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${emoji} ${title}</h1>
        </div>
        <div class="content">
          <p>${message}</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Kohost. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

    return await sendEmail({
        to: to,
        subject: `${emoji} ${title} - Kohost`,
        html: html,
        text: `${title}: ${message}`
    });
};

// ============================================
// EXPORT SEMUA FUNGSI
// ============================================
// Mengexport semua fungsi agar bisa digunakan di file lain
module.exports = {
    // Fungsi utama
    sendEmail,              // Kirim email custom
    verifyConnection,       // Verifikasi koneksi SMTP

    // Template email siap pakai
    sendWelcomeEmail,       // Email selamat datang
    sendPasswordResetEmail, // Email reset password
    sendInvoiceEmail,       // Email invoice
    sendNotificationEmail,  // Email notifikasi umum

    // Transporter (jika perlu akses langsung)
    transporter
};
