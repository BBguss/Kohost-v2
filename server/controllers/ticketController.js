const pool = require('../db');

exports.listTickets = async (req, res) => {
    const { userId } = req.query;
    try {
        let query = `
            SELECT t.id, t.user_id as userId, u.username, t.subject, t.status, t.created_at as createdAt, t.last_message_at as lastMessageAt
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id
        `;
        const params = [];
        
        if (userId) {
            query += ' WHERE t.user_id = ?';
            params.push(userId);
        }
        
        query += ' ORDER BY t.last_message_at DESC';
        
        const [tickets] = await pool.execute(query, params);
        res.json(tickets);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.createTicket = async (req, res) => {
    const { userId, username, subject } = req.body;
    const ticketId = `t_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    
    try {
        await pool.execute(
            'INSERT INTO tickets (id, user_id, subject, status, created_at, last_message_at) VALUES (?, ?, ?, "OPEN", NOW(), NOW())',
            [ticketId, userId, subject]
        );
        
        // Return the created structure directly
        res.json({
            id: ticketId,
            userId,
            username,
            subject,
            status: 'OPEN',
            createdAt: new Date().toISOString(),
            lastMessageAt: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.getMessages = async (req, res) => {
    const { ticketId } = req.params;
    try {
        // We join users to get the sender name if needed, or rely on stored sender_id logic
        // For simplicity, we'll fetch messages and assume sender info is handled by frontend logic or basic lookup
        const [messages] = await pool.execute(`
            SELECT m.id, m.ticket_id as ticketId, m.sender_id as senderId, m.text, m.timestamp, m.is_admin as isAdmin,
                   COALESCE(u.username, 'Support Agent') as senderName
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.ticket_id = ?
            ORDER BY m.timestamp ASC
        `, [ticketId]);
        
        res.json(messages);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.sendMessage = async (req, res) => {
    const { ticketId } = req.params;
    const { senderId, text, isAdmin } = req.body;
    const msgId = `m_${Date.now()}`;
    
    try {
        await pool.execute(
            'INSERT INTO messages (id, ticket_id, sender_id, text, timestamp, is_admin) VALUES (?, ?, ?, ?, NOW(), ?)',
            [msgId, ticketId, senderId, text, isAdmin]
        );
        
        // Update ticket last_message_at
        await pool.execute('UPDATE tickets SET last_message_at = NOW() WHERE id = ?', [ticketId]);
        
        // Fetch username for response
        let senderName = 'Support Agent';
        if (!isAdmin) {
            const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [senderId]);
            if (users.length > 0) senderName = users[0].username;
        }

        res.json({
            id: msgId,
            ticketId,
            senderId,
            senderName,
            text,
            timestamp: new Date().toISOString(),
            isAdmin
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.closeTicket = async (req, res) => {
    const { ticketId } = req.params;
    try {
        await pool.execute('UPDATE tickets SET status = "CLOSED" WHERE id = ?', [ticketId]);
        res.json({ status: 'CLOSED' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};