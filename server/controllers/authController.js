
const pool = require('../db');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { AVATAR_ROOT } = require('../config/paths');

// ============================================
// BCRYPT - Password Hashing Library
// ============================================
// bcryptjs adalah library untuk hashing password yang aman
// - hash() = mengenkripsi password sebelum disimpan ke database
// - compare() = membandingkan password input dengan hash di database
// Salt rounds = 10 (semakin tinggi semakin aman tapi lebih lambat)
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 10;  // Jumlah iterasi untuk hash (10 = standar yang aman)

// ============================================
// EMAIL VERIFICATION SERVICE
// ============================================
// Import service untuk mengirim email verifikasi secara async (background)
// Ini tidak akan blocking proses registrasi
const {
    sendVerificationEmailAsync,  // Kirim email async (tidak blocking)
    verifyEmailToken,            // Verifikasi token dari link email
    resendVerificationEmail,     // Kirim ulang email verifikasi
    isEmailVerified              // Cek status verifikasi email
} = require('../services/emailVerificationService');

const SECRET_KEY = process.env.JWT_SECRET || 'dev_secret_key';

// ============================================
// BASE URL untuk link verifikasi email
// ============================================
// Menggunakan FRONTEND_URL dari .env untuk generate link verifikasi
const getBaseUrl = (req) => {
    // Jika ada environment variable, gunakan itu (prioritas utama)
    if (process.env.FRONTEND_URL) {
        console.log(`[getBaseUrl] Using FRONTEND_URL: ${process.env.FRONTEND_URL}`);
        return process.env.FRONTEND_URL;
    }
    // Fallback ke origin request atau localhost:3000
    const fallback = req.headers.origin || `${req.protocol}://${req.get('host').replace(':5000', ':3000')}`;
    console.log(`[getBaseUrl] Using fallback: ${fallback}`);
    return fallback;
};

/**
 * LOGIN - Autentikasi User
 * =========================
 * Endpoint: POST /api/auth/login
 * Body: { username, password }
 * 
 * Alur:
 * 1. Cari user berdasarkan username
 * 2. Bandingkan password dengan hash menggunakan bcrypt.compare()
 * 3. Cek apakah email sudah diverifikasi
 * 4. Jika semua valid, generate JWT token
 */
exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        // 1. Cari user di database
        const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        const user = users[0];

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // 2. Bandingkan password dengan hash menggunakan bcrypt
        // bcrypt.compare() mengembalikan true jika cocok
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // 3. CEK EMAIL VERIFICATION
        // Jika email belum diverifikasi, tolak login
        // email_verified bisa berupa 0, false, atau null
        if (!user.email_verified) {
            console.log(`[Login] Blocked - Email not verified: ${user.email}`);
            return res.status(403).json({
                message: 'Please verify your email before logging in. Check your inbox for the verification link.',
                code: 'EMAIL_NOT_VERIFIED',
                email: user.email,
                userId: user.id
            });
        }

        // 4. Email sudah diverifikasi, generate JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            SECRET_KEY,
            { expiresIn: '12h' }
        );

        // Hapus password dari response (keamanan)
        const { password: pwd, ...userWithoutPassword } = user;

        console.log(`[Login] Success: ${user.username}`);
        res.json({ token, user: userWithoutPassword });

    } catch (err) {
        console.error('[Login Error]', err);
        res.status(500).json({ message: err.message });
    }
};

/**
 * REGISTER - Registrasi User Baru
 * ================================
 * Endpoint: POST /api/auth/register
 * 
 * Alur:
 * 1. Validasi input (username, email, password)
 * 2. Cek apakah user sudah ada
 * 3. Buat user baru dengan email_verified = FALSE
 * 4. Buat MySQL user untuk phpMyAdmin
 * 5. Kirim email verifikasi secara ASYNC (background)
 * 6. Return response (tidak menunggu email terkirim)
 */
exports.register = async (req, res) => {
    const { username, email, password } = req.body;

    // Validasi: semua field wajib diisi
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // Sanitize username untuk MySQL (hanya alphanumeric)
    // replace(/[^a-zA-Z0-9]/g, '') = hapus semua karakter selain huruf dan angka
    const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '');
    if (safeUsername.length < 3) {
        return res.status(400).json({ message: 'Username must contain at least 3 alphanumeric characters' });
    }

    try {
        // 1. Check if user exists
        // Cek apakah username atau email sudah terdaftar
        const [existing] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Username or Email already exists' });
        }

        // 2. Generate User ID
        // Format: u_[timestamp dalam base36]
        // Contoh: u_m1x2y3z4
        const userId = `u_${Date.now().toString(36)}`;

        // 3. Hash password dengan bcrypt sebelum disimpan
        // bcrypt.hash() mengenkripsi password dengan salt
        // SALT_ROUNDS = 10 berarti 2^10 = 1024 iterasi
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        console.log('[Register] Password hashed successfully');

        // 4. Insert into App DB
        // email_verified = FALSE karena user belum verifikasi email
        await pool.execute(
            `INSERT INTO users (id, username, email, password, role, plan, status, avatar, theme, email_verified) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                username,
                email,
                hashedPassword,   // Password sudah di-hash!
                'USER',          // Role default: USER
                'Basic',         // Plan default: Basic
                'ACTIVE',        // Status: ACTIVE (bisa login, tapi fitur terbatas)
                `https://ui-avatars.com/api/?name=${username}`,  // Avatar default
                'light',         // Theme default
                false            // email_verified = FALSE (belum verifikasi)
            ]
        );

        // 4. Create Real MySQL User for phpMyAdmin
        // User ini digunakan untuk akses database via phpMyAdmin
        const mysqlUser = `sql_${safeUsername.toLowerCase()}`;
        const idPart = userId.substring(0, 4);
        const namePart = safeUsername.substring(0, 3).toUpperCase();
        const mysqlPass = `kp_${idPart}@${namePart}#88`;

        try {
            // Drop if exists to be safe
            await pool.query(`DROP USER IF EXISTS '${mysqlUser}'@'%'`);
            // Create User
            await pool.query(`CREATE USER '${mysqlUser}'@'%' IDENTIFIED BY '${mysqlPass}'`);
            // Grant Usage (Login only)
            await pool.query(`GRANT USAGE ON *.* TO '${mysqlUser}'@'%'`);
            await pool.query('FLUSH PRIVILEGES');

            console.log(`[MySQL] Created user: ${mysqlUser}`);
        } catch (sqlErr) {
            console.error('[MySQL] Failed to create system user:', sqlErr);
        }

        // ============================================
        // 5. KIRIM EMAIL VERIFIKASI SECARA ASYNC
        // ============================================
        // Fungsi ini TIDAK BLOCKING - response langsung dikembalikan
        // Email dikirim di background menggunakan setImmediate()
        // 
        // Parameter:
        // - userId: ID user yang baru dibuat
        // - email: alamat email user
        // - username: nama user untuk personalisasi
        // - baseUrl: URL frontend untuk link verifikasi
        const baseUrl = getBaseUrl(req);
        sendVerificationEmailAsync(userId, email, username, baseUrl);

        // Log untuk debugging
        console.log(`[Register] User created: ${username} (${email})`);
        console.log(`[Register] Verification email queued (async)`);

        // 6. Return response
        // Response dikirim segera, tidak menunggu email terkirim
        res.status(201).json({
            message: 'Registration successful! Please check your email to verify your account.',
            emailSent: true,  // Menandakan email sedang dikirim
            userId: userId
        });

    } catch (err) {
        console.error('[Register Error]', err);
        res.status(500).json({ message: 'Registration failed', error: err.message });
    }
};

exports.getMe = async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, SECRET_KEY, async (err, userDecoded) => {
            if (err) return res.status(403).json({ message: 'Invalid Token' });
            try {
                const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userDecoded.id]);
                if (users.length === 0) return res.status(404).json({ message: 'User not found' });
                const { password, ...u } = users[0];
                res.json(u);
            } catch (e) { res.status(500).json({ message: e.message }); }
        });
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
};

exports.updateProfile = async (req, res) => {
    const { id, ...data } = req.body;
    if (data.avatar && data.avatar.startsWith('data:image')) {
        try {
            const matches = data.avatar.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                const filename = `avatar_${id}_${Date.now()}.png`;
                const filePath = path.join(AVATAR_ROOT, filename);
                fs.writeFileSync(filePath, buffer);
                data.avatar = `${req.protocol}://${req.get('host')}/avatars/${filename}`;
            }
        } catch (err) { console.error("Failed to save avatar:", err); }
    }

    const keys = Object.keys(data);
    const values = Object.values(data);
    if (keys.length === 0) return res.json({});

    const setClause = keys.map(k => `${k} = ?`).join(', ');

    try {
        await pool.execute(`UPDATE users SET ${setClause} WHERE id = ?`, [...values, id]);
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
        const { password, ...u } = users[0];
        res.json(u);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

/**
 * CHANGE PASSWORD - Ganti Password User
 * ======================================
 * Endpoint: POST /api/auth/change-password
 * Body: { userId, current, newPass }
 * 
 * Alur:
 * 1. Cari user dan ambil password hash dari database
 * 2. Bandingkan current password dengan hash menggunakan bcrypt.compare()
 * 3. Jika cocok, hash password baru dan simpan ke database
 */
exports.changePassword = async (req, res) => {
    const { userId, current, newPass } = req.body;
    try {
        // 1. Ambil password hash dari database
        const [users] = await pool.execute('SELECT password FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // 2. Bandingkan current password dengan hash di database
        const isPasswordValid = await bcrypt.compare(current, users[0].password);

        if (isPasswordValid) {
            // 3. Hash password baru sebelum disimpan
            const hashedNewPassword = await bcrypt.hash(newPass, SALT_ROUNDS);

            // 4. Update password di database
            await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId]);

            console.log(`[ChangePassword] Password updated for user: ${userId}`);
            res.json({ success: true, message: 'Password changed successfully' });
        } else {
            res.status(400).json({ message: 'Incorrect current password' });
        }
    } catch (err) {
        console.error('[ChangePassword Error]', err);
        res.status(500).json({ message: err.message });
    }
};

/**
 * VERIFY EMAIL - Verifikasi Email User
 * =====================================
 * Endpoint: GET /api/auth/verify-email?token=xxxxx
 * 
 * Dipanggil ketika user mengklik link verifikasi di email.
 * Token dikirim sebagai query parameter.
 * 
 * Alur:
 * 1. Ambil token dari query string
 * 2. Verifikasi token (cek valid, belum kadaluarsa, belum digunakan)
 * 3. Update status email_verified = true
 * 4. Return response sukses/gagal
 */
exports.verifyEmail = async (req, res) => {
    // Ambil token dari query string (?token=xxxxx)
    const { token } = req.query;

    console.log(`[VerifyEmail] ========================================`);
    console.log(`[VerifyEmail] 📧 Verification request received`);
    console.log(`[VerifyEmail] Token: ${token ? token.substring(0, 20) + '...' : 'MISSING'}`);

    // Validasi: token wajib ada
    if (!token) {
        console.log(`[VerifyEmail] ❌ No token provided`);
        return res.status(400).json({
            success: false,
            message: 'Token verifikasi tidak ditemukan'
        });
    }

    try {
        // Panggil service untuk verifikasi token
        console.log(`[VerifyEmail] 🔍 Calling verifyEmailToken service...`);
        const result = await verifyEmailToken(token);
        console.log(`[VerifyEmail] Service result:`, JSON.stringify(result, null, 2));

        if (result.success) {
            // Token valid, email berhasil diverifikasi
            console.log(`[VerifyEmail] ✅ Email verified for: ${result.user?.email}`);

            // Jika sudah diverifikasi sebelumnya
            if (result.alreadyVerified) {
                return res.json({
                    success: true,
                    message: 'Email Anda sudah diverifikasi sebelumnya',
                    alreadyVerified: true
                });
            }

            // Berhasil verifikasi
            return res.json({
                success: true,
                message: 'Email berhasil diverifikasi! Sekarang Anda bisa menggunakan semua fitur.',
                user: result.user
            });
        } else {
            // Token tidak valid
            console.log(`[VerifyEmail] ❌ Verification failed: ${result.message}`);
            return res.status(400).json({
                success: false,
                message: result.message
            });
        }

    } catch (err) {
        console.error('[VerifyEmail Error]', err);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat verifikasi email'
        });
    }
};

/**
 * RESEND VERIFICATION EMAIL - Kirim Ulang Email Verifikasi
 * =========================================================
 * Endpoint: POST /api/auth/resend-verification
 * Body: { email: "user@example.com" }
 * 
 * Digunakan ketika:
 * - User tidak menerima email verifikasi
 * - Token sudah kadaluarsa dan user perlu link baru
 * 
 * Alur:
 * 1. Validasi email
 * 2. Cek apakah user ada dan belum diverifikasi
 * 3. Kirim email verifikasi baru (async)
 */
exports.resendVerification = async (req, res) => {
    const { email } = req.body;

    // Validasi: email wajib ada
    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email wajib diisi'
        });
    }

    try {
        // Dapatkan base URL untuk link verifikasi
        const baseUrl = getBaseUrl(req);

        // Panggil service untuk kirim ulang email
        // Service akan cek apakah email valid dan belum diverifikasi
        const result = await resendVerificationEmail(email, baseUrl);

        if (result.success) {
            console.log(`[ResendVerification] ✅ Email queued for: ${email}`);
            return res.json({
                success: true,
                message: result.message
            });
        } else {
            console.log(`[ResendVerification] ❌ Failed: ${result.message}`);
            return res.status(400).json({
                success: false,
                message: result.message
            });
        }

    } catch (err) {
        console.error('[ResendVerification Error]', err);
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim ulang email verifikasi'
        });
    }
};

/**
 * CHECK EMAIL VERIFICATION STATUS
 * ================================
 * Endpoint: GET /api/auth/check-verification/:userId
 * 
 * Mengecek apakah email user sudah diverifikasi.
 * Berguna untuk frontend mengecek status tanpa login ulang.
 */
exports.checkVerificationStatus = async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID wajib diisi'
        });
    }

    try {
        // Panggil service untuk cek status
        const verified = await isEmailVerified(userId);

        res.json({
            success: true,
            userId: userId,
            emailVerified: verified
        });

    } catch (err) {
        console.error('[CheckVerification Error]', err);
        res.status(500).json({
            success: false,
            message: 'Gagal mengecek status verifikasi'
        });
    }
};
