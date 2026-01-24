
const pool = require('../db');
const fs = require('fs');
const path = require('path');
const { PAYMENT_PROOF_PATH } = require('../config/paths');
const { createNotification } = require('../utils/notification');

exports.submitPayment = async (req, res) => {
    const { userId, username, plan, amount, method } = req.body;
    const file = req.file;
    
    if (!file) return res.status(400).json({ message: "Proof file required" });

    try {
        if (!fs.existsSync(PAYMENT_PROOF_PATH)) {
            fs.mkdirSync(PAYMENT_PROOF_PATH, { recursive: true });
        }
        
        // Save file to disk
        const filename = `proof_${userId}_${Date.now()}${path.extname(file.originalname)}`;
        fs.writeFileSync(path.join(PAYMENT_PROOF_PATH, filename), file.buffer);
        
        const proofUrl = `/uploads/proofs/${filename}`; // Public URL pattern
        const id = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 3)}`;
        
        await pool.execute(
            'INSERT INTO payments (id, user_id, amount, plan, method, status, date, proof_url) VALUES (?, ?, ?, ?, ?, "PENDING", NOW(), ?)',
            [id, userId, amount, plan, method, proofUrl]
        );

        // --- TRIGGER ADMIN NOTIFICATION ---
        await createNotification(
            'ADMIN', 
            'New Payment Submitted', 
            `User ${username} has submitted a payment of Rp ${Number(amount).toLocaleString()} for ${plan} plan via ${method}.`,
            'INFO',
            'ADMIN_PAYMENTS'
        );
        
        res.json({ success: true, id });
    } catch (e) {
        console.error("Payment Submit Error:", e);
        res.status(500).json({ message: e.message });
    }
};

exports.getHistory = async (req, res) => {
    const { userId } = req.params;
    try {
        const [payments] = await pool.execute(`
            SELECT p.id, p.user_id as userId, u.username, p.amount, p.plan, p.method, p.status, p.date, p.proof_url as proofUrl
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.user_id = ?
            ORDER BY p.date DESC
        `, [userId]);
        
        res.json(payments);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
