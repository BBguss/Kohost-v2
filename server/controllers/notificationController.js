
const pool = require('../db');

exports.listNotifications = async (req, res) => {
    const { userId, role } = req.query;
    
    if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
    }

    try {
        let query = 'SELECT id, user_id as userId, title, message, type, is_read as `read`, link, created_at as createdAt FROM notifications WHERE user_id = ?';
        let params = [userId];

        // If user is admin, also fetch notifications targeted at 'ADMIN'
        if (role === 'ADMIN') {
            query += ' OR user_id = "ADMIN"';
        }

        query += ' ORDER BY created_at DESC LIMIT 50';

        const [notifications] = await pool.execute(query, params);
        
        // Convert boolean for frontend
        const formatted = notifications.map(n => ({
            ...n,
            read: !!n.read // Ensure boolean
        }));

        res.json(formatted);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message });
    }
};

exports.markRead = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.markAllRead = async (req, res) => {
    const { userId, role } = req.body;
    try {
        let query = 'UPDATE notifications SET is_read = 1 WHERE user_id = ?';
        let params = [userId];

        if (role === 'ADMIN') {
            query += ' OR user_id = "ADMIN"';
        }

        await pool.execute(query, params);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.clearAll = async (req, res) => {
    const { userId, role } = req.body;
    try {
        let query = 'DELETE FROM notifications WHERE user_id = ?';
        let params = [userId];

        if (role === 'ADMIN') {
            query += ' OR user_id = "ADMIN"';
        }

        await pool.execute(query, params);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
