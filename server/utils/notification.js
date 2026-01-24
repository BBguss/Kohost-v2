
const pool = require('../db');
const { sendEmail } = require('../services/emailService');
const { sendWhatsApp } = require('../services/whatsappService');

/**
 * Creates a notification in the database and forwards to external channels if configured.
 * 
 * @param {string} userId - Target User ID or 'ADMIN' for all administrators
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @param {string} type - 'INFO', 'SUCCESS', 'WARNING', 'ERROR'
 * @param {string} link - Optional internal link (e.g., 'BILLING')
 */
const createNotification = async (userId, title, message, type = 'INFO', link = null) => {
    try {
        // 1. Insert into Database (Internal Notification)
        await pool.execute(
            'INSERT INTO notifications (user_id, title, message, type, link, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [userId, title, message, type, link]
        );
        console.log(`[Notification] Created for ${userId}: ${title}`);

        // 2. Check for Forwarding Rules (Only for ADMIN notifications for now)
        if (userId === 'ADMIN') {
            await forwardAdminNotification(title, message, type);
        }

    } catch (error) {
        console.error('[Notification] Failed to create/forward:', error.message);
    }
};

const forwardAdminNotification = async (title, message, type = 'INFO') => {
    try {
        // Fetch Settings
        const [rows] = await pool.execute("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('notif_emails', 'notif_wa_number', 'notif_wa_gateway')");
        
        const settings = rows.reduce((acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        }, {});

        // --- EMAIL FORWARDING ---
        if (settings.notif_emails) {
            try {
                const emails = JSON.parse(settings.notif_emails);
                if (Array.isArray(emails) && emails.length > 0) {
                    
                    // Determine color based on type
                    let headerColor = '#1e293b'; // Default Slate
                    let accentColor = '#4f46e5'; // Indigo
                    if (type === 'ERROR') { accentColor = '#dc2626'; }
                    else if (type === 'WARNING') { accentColor = '#d97706'; }
                    else if (type === 'SUCCESS') { accentColor = '#059669'; }

                    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body { margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f3f4f6; padding: 20px 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .header { background-color: ${headerColor}; padding: 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; }
    .content { padding: 30px; color: #334155; }
    .alert-box { background-color: #f8fafc; border-left: 4px solid ${accentColor}; padding: 20px; margin-bottom: 25px; border-radius: 4px; }
    .title { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 10px; display: block; }
    .message { font-size: 15px; line-height: 1.6; color: #475569; white-space: pre-wrap; }
    .btn-container { text-align: center; margin-top: 10px; }
    .btn { display: inline-block; padding: 12px 24px; background-color: ${accentColor}; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; }
    .footer { background-color: #f1f5f9; padding: 15px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <h1>System Notification</h1>
            </div>
            <div class="content">
                <div class="alert-box">
                    <span class="title">${title}</span>
                    <div class="message">${message.replace(/\n/g, '<br/>')}</div>
                </div>
                <div class="btn-container">
                    <a href="${process.env.FRONTEND_URL || '#'}" class="btn">View Dashboard</a>
                </div>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} KolabPanel. Automated Alert.
            </div>
        </div>
    </div>
</body>
</html>
                    `;
                    
                    console.log(`[Notification] Forwarding email to ${emails.length} recipients...`);
                    
                    // Send to all emails
                    emails.forEach(email => {
                        sendEmail(email, `[Admin Alert] ${title}`, htmlContent).catch(e => console.error(`[Notification] Email forward fail to ${email}:`, e.message));
                    });
                }
            } catch (e) {
                console.error('[Notification] Invalid email settings JSON:', e.message);
            }
        }

        // --- WHATSAPP FORWARDING ---
        if (settings.notif_wa_number && settings.notif_wa_gateway) {
            let emoji = '🔔';
            if (type === 'ERROR') emoji = '🚨';
            if (type === 'SUCCESS') emoji = '✅';
            if (type === 'WARNING') emoji = '⚠️';

            const waMessage = `${emoji} *ADMIN ALERT: ${title}*\n\n${message}\n\n_Sent via KolabPanel_`;
            console.log(`[Notification] Forwarding to WhatsApp: ${settings.notif_wa_number}`);
            sendWhatsApp(settings.notif_wa_number, waMessage, settings.notif_wa_gateway)
                .catch(e => console.error('[Notification] WA forward fail:', e.message));
        }

    } catch (error) {
        console.error('[Notification] Forwarding logic error:', error.message);
    }
};

module.exports = { createNotification };
