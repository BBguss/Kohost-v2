
const pool = require('../db');

exports.getNotificationSettings = async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT setting_key, setting_value FROM settings WHERE setting_key IN ("notif_emails", "notif_wa_number", "notif_wa_gateway")');
        
        const settings = {
            emails: [],
            waNumber: '',
            waGateway: ''
        };

        rows.forEach(row => {
            if (row.setting_key === 'notif_emails') {
                try { settings.emails = JSON.parse(row.setting_value) || []; } catch(e) { settings.emails = []; }
            }
            if (row.setting_key === 'notif_wa_number') settings.waNumber = row.setting_value;
            if (row.setting_key === 'notif_wa_gateway') settings.waGateway = row.setting_value;
        });

        res.json(settings);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.updateNotificationSettings = async (req, res) => {
    const { emails, waNumber, waGateway } = req.body;

    try {
        // Use Insert on Duplicate Key Update
        const queries = [
            pool.execute('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', ['notif_emails', JSON.stringify(emails || [])]),
            pool.execute('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', ['notif_wa_number', waNumber || '']),
            pool.execute('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', ['notif_wa_gateway', waGateway || ''])
        ];

        await Promise.all(queries);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
