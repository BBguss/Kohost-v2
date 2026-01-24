
const pool = require('../db');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt'); // Import bcrypt
const { AVATAR_ROOT } = require('../config/paths');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

const SECRET_KEY = process.env.JWT_SECRET || 'dev_secret_key';
const SALT_ROUNDS = 10;

// Helper to generate 6 digit code
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        const user = users[0];
        
        // Compare input password with stored hash
        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '12h' });
            const { password, ...u } = user; // Exclude password from response
            res.json({ token, user: u });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (err) { res.status(500).json({ message: err.message }); }
};

// 1. Verify Email for Registration (Step 1)
exports.verifyRegisterEmail = async (req, res) => {
    const { email, username } = req.body;
    
    if (!email || !username) {
        return res.status(400).json({ message: 'Email and username are required' });
    }

    try {
        // Check availability
        const [existing] = await pool.execute('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Username or Email is already taken.' });
        }

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 15 * 60000); // 15 mins

        // Save code to DB
        await pool.execute(
            'INSERT INTO verifications (email, code, type, expires_at) VALUES (?, ?, "REGISTER", ?)',
            [email, code, expiresAt]
        );

        // Send Email
        const sent = await sendVerificationEmail(email, code);
        
        if (!sent) {
            return res.status(500).json({ message: 'Failed to send verification email. Please check your SMTP settings.' });
        }

        // Production behavior: Don't send code back to client
        res.json({ 
            success: true, 
            message: 'Verification code sent to email' 
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error during verification' });
    }
};

// 2. Register User (Step 2)
exports.register = async (req, res) => {
    const { username, email, password, code } = req.body;

    if (!username || !email || !password || !code) {
        return res.status(400).json({ message: 'All fields including verification code are required' });
    }

    // Sanitize username
    const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '');
    if (safeUsername.length < 3) {
        return res.status(400).json({ message: 'Username must contain at least 3 alphanumeric characters' });
    }

    try {
        // Verify Code
        const [verifications] = await pool.execute(
            'SELECT * FROM verifications WHERE email = ? AND code = ? AND type = "REGISTER" AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [email, code]
        );
        
        const isCodeValid = verifications.length > 0;

        if (!isCodeValid) {
            return res.status(400).json({ message: 'Invalid or expired verification code' });
        }

        // Double check user existence (race condition)
        const [existing] = await pool.execute('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Username or Email already exists' });
        }

        // Hash Password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Create User
        const userId = `u_${Date.now().toString(36)}`;
        await pool.execute(
            'INSERT INTO users (id, username, email, password, role, plan, status, avatar, theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, username, email, hashedPassword, 'USER', 'Basic', 'ACTIVE', `https://ui-avatars.com/api/?name=${username}`, 'light']
        );

        // Create MySQL User (System Logic remains same, passwords for MySQL users are handled by MySQL internal hashing via SQL)
        const mysqlUser = `sql_${safeUsername.toLowerCase()}`;
        const idPart = userId.substring(0, 4);
        const namePart = safeUsername.substring(0, 3).toUpperCase();
        const mysqlPass = `kp_${idPart}@${namePart}#88`;

        try {
            await pool.query(`DROP USER IF EXISTS '${mysqlUser}'@'%'`);
            // MySQL 8.0 uses caching_sha2_password by default, or mysql_native_password
            await pool.query(`CREATE USER '${mysqlUser}'@'%' IDENTIFIED BY '${mysqlPass}'`);
            await pool.query(`GRANT USAGE ON *.* TO '${mysqlUser}'@'%'`);
            await pool.query('FLUSH PRIVILEGES');
        } catch (sqlErr) {
            console.error('[MySQL] Failed to create system user:', sqlErr);
        }

        // Cleanup used verification code
        await pool.execute('DELETE FROM verifications WHERE email = ? AND type = "REGISTER"', [email]);

        res.status(201).json({ message: 'Registration successful' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Registration failed', error: err.message });
    }
};

// 3. Initiate Password Reset
exports.initiateReset = async (req, res) => {
    const { email } = req.body;
    
    try {
        const [users] = await pool.execute('SELECT id, username FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            // Security: Don't reveal if email exists, but locally we might handle 404
            return res.status(404).json({ message: 'Email address not found.' });
        }

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 15 * 60000); // 15 mins

        await pool.execute(
            'INSERT INTO verifications (email, code, type, expires_at) VALUES (?, ?, "RESET", ?)',
            [email, code, expiresAt]
        );

        const sent = await sendPasswordResetEmail(email, code);
        
        if (!sent) {
            return res.status(500).json({ message: 'Failed to send reset email.' });
        }

        res.json({ 
            success: true, 
            message: 'Reset code sent to email'
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// 4. Confirm Password Reset
exports.confirmReset = async (req, res) => {
    const { email, code, newPassword } = req.body;

    try {
        const [verifications] = await pool.execute(
            'SELECT * FROM verifications WHERE email = ? AND code = ? AND type = "RESET" AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [email, code]
        );
        const isCodeValid = verifications.length > 0;

        if (!isCodeValid) {
            return res.status(400).json({ message: 'Invalid or expired verification code' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await pool.execute('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
        
        // Cleanup
        await pool.execute('DELETE FROM verifications WHERE email = ? AND type = "RESET"', [email]);

        res.json({ success: true, message: 'Password reset successfully' });

    } catch (e) {
        res.status(500).json({ message: e.message });
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
    if(keys.length === 0) return res.json({});

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    
    try {
        await pool.execute(`UPDATE users SET ${setClause} WHERE id = ?`, [...values, id]);
        const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
        const { password, ...u } = users[0];
        res.json(u);
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.changePassword = async (req, res) => {
    const { userId, current, newPass } = req.body;
    try {
        const [users] = await pool.execute('SELECT password FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });
        
        const user = users[0];

        // Check if current password matches hash
        const match = await bcrypt.compare(current, user.password);

        if (match) {
            // Hash new password
            const hashedNewPass = await bcrypt.hash(newPass, SALT_ROUNDS);
            await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedNewPass, userId]);
            res.json({ success: true });
        } else {
            res.status(400).json({ message: 'Incorrect current password' });
        }
    } catch (err) { res.status(500).json({ message: err.message }); }
};
