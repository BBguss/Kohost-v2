
const pool = require('../db');
const { createNotification } = require('../utils/notification');

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

        // --- NOTIFICATION: Tell Admin about new ticket ---
        await createNotification(
            'ADMIN',
            'New Support Ticket',
            `User ${username} created a new ticket: "${subject}"`,
            'INFO',
            'ADMIN_SUPPORT' // Link to Admin Support Page
        );
        
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
        // 1. Insert Message
        await pool.execute(
            'INSERT INTO messages (id, ticket_id, sender_id, text, timestamp, is_admin) VALUES (?, ?, ?, ?, NOW(), ?)',
            [msgId, ticketId, senderId, text, isAdmin]
        );
        
        // 2. Update Ticket Timestamp
        await pool.execute('UPDATE tickets SET last_message_at = NOW() WHERE id = ?', [ticketId]);
        
        // 3. Get User Info for Response & Notification
        let senderName = 'Support Agent';
        let ticketOwnerId = null;
        let ticketSubject = 'Support Ticket';

        // Fetch Ticket Details to know who owns it
        const [ticketRows] = await pool.execute('SELECT user_id, subject FROM tickets WHERE id = ?', [ticketId]);
        if (ticketRows.length > 0) {
            ticketOwnerId = ticketRows[0].user_id;
            ticketSubject = ticketRows[0].subject;
        }

        if (!isAdmin) {
            const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [senderId]);
            if (users.length > 0) senderName = users[0].username;
            
            // --- NOTIFICATION: User replied -> Notify Admin ---
            await createNotification(
                'ADMIN',
                'New Reply on Ticket',
                `${senderName} replied to ticket: "${ticketSubject}"`,
                'INFO',
                'ADMIN_SUPPORT'
            );
        } else {
            // --- NOTIFICATION: Admin replied -> Notify User ---
            if (ticketOwnerId) {
                await createNotification(
                    ticketOwnerId,
                    'Support Agent Replied',
                    `New reply on your ticket: "${ticketSubject}"`,
                    'INFO',
                    'SUPPORT' // Link to User Support Page
                );
            }
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

        // Get Ticket Owner to notify them
        const [ticketRows] = await pool.execute('SELECT user_id, subject FROM tickets WHERE id = ?', [ticketId]);
        
        if (ticketRows.length > 0) {
            const { user_id, subject } = ticketRows[0];
            
            // --- NOTIFICATION: Admin closed ticket -> Notify User ---
            await createNotification(
                user_id,
                'Ticket Closed',
                `Your ticket "${subject}" has been marked as resolved/closed.`,
                'WARNING', // Using WARNING style for closed status
                'SUPPORT'
            );
        }

        res.json({ status: 'CLOSED' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
