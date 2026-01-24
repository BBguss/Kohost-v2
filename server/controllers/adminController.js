
const pool = require('../db');
const os = require('os');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt'); // Import bcrypt
const { APACHE_SITES_PATH, APACHE_HTTPD_PATH } = require('../config/paths');
const { getCpuUsage } = require('../utils/helpers');
const { createNotification } = require('../utils/notification');

// --- STATS ---
exports.getStats = async (req, res) => {
    try {
        const [[{count: totalUsers}]] = await pool.execute('SELECT COUNT(*) as count FROM users');
        const [[{count: totalSites}]] = await pool.execute('SELECT COUNT(*) as count FROM sites');
        const [[{count: totalTunnels}]] = await pool.execute('SELECT COUNT(*) as count FROM tunnels');
        const [[{revenue}]] = await pool.execute("SELECT SUM(amount) as revenue FROM payments WHERE status = 'VERIFIED'");
        
        let totalApacheSites = 0;
        try {
            if (fs.existsSync(APACHE_SITES_PATH)) {
                const stats = fs.statSync(APACHE_SITES_PATH);
                if (stats.isDirectory()) {
                    totalApacheSites = fs.readdirSync(APACHE_SITES_PATH).filter(f => f.endsWith('.conf')).length;
                } else if (stats.isFile()) {
                    // Single file mode (Laragon httpd-vhosts.conf)
                    // Rudimentary count of <VirtualHost> tags
                    const content = fs.readFileSync(APACHE_SITES_PATH, 'utf8');
                    totalApacheSites = (content.match(/<VirtualHost/g) || []).length;
                }
            }
        } catch (err) {
            console.error("[Stats] Failed to count apache sites:", err.message);
        }

        res.json({ totalUsers, totalSites, activeRevenue: (revenue || 0).toLocaleString(), totalTunnels, totalApacheSites });
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.getSystemHealth = async (req, res) => {
    try {
        const cpuUsage = await getCpuUsage();
        res.json({
            cpu: parseFloat(cpuUsage),
            memory: { total: os.totalmem(), free: os.freemem(), used: os.totalmem() - os.freemem() },
            uptime: os.uptime(),
            platform: `${os.type()} ${os.release()} (${os.arch()})`
        });
    } catch (e) { res.status(500).json({ message: "Failed to fetch metrics" }); }
};

// --- TUNNELS ---
exports.listTunnels = async (req, res) => {
    try {
        const [tunnels] = await pool.execute('SELECT * FROM tunnels ORDER BY created_at DESC');
        res.json(tunnels);
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.createTunnel = async (req, res) => {
    const { hostname, service } = req.body;
    try {
        await pool.execute('INSERT INTO tunnels (hostname, service) VALUES (?, ?)', [hostname, service]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.editTunnel = async (req, res) => {
    const { hostname, newHostname, service } = req.body;
    try {
        await pool.execute('UPDATE tunnels SET hostname = ?, service = ? WHERE hostname = ?', [newHostname, service, hostname]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.deleteTunnel = async (req, res) => {
    const { hostname } = req.body;
    try {
        await pool.execute('DELETE FROM tunnels WHERE hostname = ?', [hostname]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({message: e.message}); }
};

// --- USERS & COMMON ---
exports.listUsers = async (req, res) => {
    try {
        const [users] = await pool.execute('SELECT * FROM users');
        const safeUsers = users.map(({password, ...u}) => u);
        res.json(safeUsers);
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.getPlans = async (req, res) => {
    try {
        const [plans] = await pool.execute('SELECT * FROM plans');
        res.json(plans);
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.getDomains = async (req, res) => {
    try {
        const [domains] = await pool.execute('SELECT * FROM domains');
        const mapped = domains.map(d => ({...d, isPrimary: !!d.is_primary}));
        res.json(mapped);
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.getPayments = async (req, res) => {
    try {
        const [payments] = await pool.execute(`
            SELECT p.*, u.username 
            FROM payments p 
            LEFT JOIN users u ON p.user_id = u.id 
            ORDER BY p.date DESC
        `);
        const mapped = payments.map(p => ({
            ...p,
            userId: p.user_id,
            proofUrl: p.proof_url
        }));
        res.json(mapped);
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.verifyPayment = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    try {
        // 1. Update Payment Status
        await pool.execute('UPDATE payments SET status = ? WHERE id = ?', [status, id]);
        
        // 2. Fetch Payment Info to get User ID and Plan
        const [rows] = await pool.execute('SELECT user_id, plan FROM payments WHERE id = ?', [id]);
        
        if (rows.length > 0) {
            const payment = rows[0];
            
            // 3. If Verified, Update User Plan
            if (status === 'VERIFIED') {
                await pool.execute('UPDATE users SET plan = ? WHERE id = ?', [payment.plan, payment.user_id]);
            }

            // 4. Send Notification to User
            const title = status === 'VERIFIED' ? 'Payment Verified' : 'Payment Rejected';
            const type = status === 'VERIFIED' ? 'SUCCESS' : 'ERROR';
            const msg = status === 'VERIFIED' 
                ? `Your payment for plan ${payment.plan} has been verified! Your account is now upgraded.`
                : `Your payment for plan ${payment.plan} was rejected. Please contact support.`;
            
            await createNotification(payment.user_id, title, msg, type, 'BILLING');
        }
        
        res.json({ success: true });
    } catch(e) { 
        res.status(500).json({message: e.message}); 
    }
};

exports.createUser = async (req, res) => {
    const { username, email, password, role, plan } = req.body;
    try {
        const id = `u_${Date.now()}`;
        
        // Hash Password before inserting
        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.execute(
            'INSERT INTO users (id, username, email, password, role, plan, status, avatar, theme) VALUES (?, ?, ?, ?, ?, ?, "ACTIVE", ?, "light")',
            [id, username, email, hashedPassword, role, plan, `https://ui-avatars.com/api/?name=${username}`]
        );
        res.json({ success: true, id });
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.deleteUser = async (req, res) => {
    const { userId } = req.params;
    try {
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({message: e.message}); }
};

// --- APACHE MANAGEMENT (Enhanced for Single File) ---

exports.listApacheSites = async (req, res) => {
    try {
        if (!fs.existsSync(APACHE_SITES_PATH)) return res.json([]);
        
        const stats = fs.statSync(APACHE_SITES_PATH);
        if (stats.isDirectory()) {
            const files = fs.readdirSync(APACHE_SITES_PATH).filter(f => f.endsWith('.conf'));
            res.json(files);
        } else {
            // If it's a single file (Laragon), just return that file name
            res.json([path.basename(APACHE_SITES_PATH)]);
        }
    } catch (e) { res.status(500).json({message: e.message}); }
};

exports.getApacheSite = async (req, res) => {
    try {
        const stats = fs.statSync(APACHE_SITES_PATH);
        let filePath;

        if (stats.isDirectory()) {
            filePath = path.join(APACHE_SITES_PATH, req.params.filename);
        } else {
            // In single file mode, ignore the filename param and read the main file
            // But verify the param matches the basename to be safe/consistent
            if (req.params.filename !== path.basename(APACHE_SITES_PATH)) {
                return res.status(404).json({ message: "File mismatch in single-file mode" });
            }
            filePath = APACHE_SITES_PATH;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ content });
    } catch (e) { res.status(500).json({message: e.message}); }
};
