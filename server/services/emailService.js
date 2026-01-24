
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: process.env.MAIL_ENCRYPTION === 'ssl', // true for 465, false for other ports
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
    },
});

// Helper for consistent professional styling
const getBaseTemplate = (title, bodyContent, color = '#4f46e5') => {
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 0;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: ${color}; padding: 30px 0;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">KolabPanel<span style="opacity: 0.8">.</span></h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            ${bodyContent}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #6b7280; font-size: 12px;">&copy; ${new Date().getFullYear()} KolabPanel Hosting. All rights reserved.</p>
                            <p style="margin: 5px 0 0; color: #9ca3af; font-size: 11px;">This is an automated message, please do not reply.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
};

const sendEmail = async (to, subject, htmlContent) => {
    try {
        const fromName = process.env.MAIL_FROM_NAME || "Kolab Panel Support";
        const fromAddress = process.env.MAIL_FROM_ADDRESS;
        
        const info = await transporter.sendMail({
            from: `"${fromName}" <${fromAddress}>`,
            to: to,
            subject: subject,
            html: htmlContent,
        });
        console.log(`[Email] Message sent to ${to}: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`[Email] Error sending email to ${to}:`, error.message);
        return false;
    }
};

const sendVerificationEmail = async (to, code) => {
    const body = `
        <h2 style="color: #111827; margin-top: 0; font-size: 20px; text-align: center; font-weight: 600;">Verify Your Email Address</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
            Welcome to KolabPanel! To complete your registration or verify your account update, please use the secure code below.
        </p>
        <div style="background-color: #eff6ff; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; border: 1px dashed #bfdbfe;">
            <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: 700; color: #4f46e5; letter-spacing: 8px;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 0;">
            This verification code is valid for <strong>15 minutes</strong>.<br>If you did not request this code, please ignore this email.
        </p>
    `;
    const html = getBaseTemplate('Verify Email', body, '#4f46e5'); // Indigo header
    return await sendEmail(to, 'Verify Your Email - KolabPanel', html);
};

const sendPasswordResetEmail = async (to, code) => {
    const body = `
        <h2 style="color: #111827; margin-top: 0; font-size: 20px; text-align: center; font-weight: 600;">Password Reset Request</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
            We received a request to reset your password. Please enter the following code to verify your identity and create a new password.
        </p>
        <div style="background-color: #fef2f2; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; border: 1px dashed #fecaca;">
            <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: 700; color: #dc2626; letter-spacing: 8px;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 0;">
            For your security, this code expires in <strong>15 minutes</strong>.<br>If you didn't request a password reset, you can safely ignore this email.
        </p>
    `;
    const html = getBaseTemplate('Reset Password', body, '#dc2626'); // Red header
    return await sendEmail(to, 'Reset Password Request - KolabPanel', html);
};

module.exports = {
    sendEmail, 
    sendVerificationEmail,
    sendPasswordResetEmail
};
