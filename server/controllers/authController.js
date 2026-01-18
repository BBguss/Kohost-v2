
const pool = require('../db');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { AVATAR_ROOT } = require('../config/paths');

const SECRET_KEY = process.env.JWT_SECRET || 'dev_secret_key';

exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        const user = users[0];
        
        if (user && user.password === password) {
            // Added username to payload for easier logging/debugging on backend
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '12h' });
            const { password, ...u } = user;
            res.json({ token, user: u });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.register = async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // Sanitize username for MySQL (alphanumeric only)
    const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '');
    if (safeUsername.length < 3) {
        return res.status(400).json({ message: 'Username must contain at least 3 alphanumeric characters' });
    }

    try {
        // 1. Check if user exists
        const [existing] = await pool.execute('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Username or Email already exists' });
        }

        // 2. Generate ID
        const userId = `u_${Date.now().toString(36)}`;
        
        // 3. Insert into App DB
        await pool.execute(
            'INSERT INTO users (id, username, email, password, role, plan, status, avatar, theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, username, email, password, 'USER', 'Basic', 'ACTIVE', `https://ui-avatars.com/api/?name=${username}`, 'light']
        );

        // 4. Create Real MySQL User for phpMyAdmin
        const mysqlUser = `sql_${safeUsername.toLowerCase()}`;
        // Ensure substring doesn't fail if strings are short
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

        res.status(201).json({ message: 'Registration successful' });

    } catch (err) {
        console.error(err);
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
        
        if (users[0].password === current) {
            await pool.execute('UPDATE users SET password = ? WHERE id = ?', [newPass, userId]);
            res.json({ success: true });
        } else {
            res.status(400).json({ message: 'Incorrect current password' });
        }
    } catch (err) { res.status(500).json({ message: err.message }); }
};
