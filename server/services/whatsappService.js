
// server/services/whatsappService.js
// const fetch = require('node-fetch'); // Removed: Using Node.js 18+ native fetch

/**
 * Sends a WhatsApp message via a custom gateway/bot.
 * 
 * @param {string} targetNumber - The phone number to send to (e.g., 628123456789)
 * @param {string} message - The message content
 * @param {string} gatewayUrl - The API URL of your WhatsApp Bot (e.g., http://localhost:3000/send-message)
 */
const sendWhatsApp = async (targetNumber, message, gatewayUrl) => {
    if (!targetNumber || !gatewayUrl) {
        console.log('[WhatsApp] Skipping: Missing target number or gateway URL');
        return false;
    }

    try {
        console.log(`[WhatsApp] Sending to ${targetNumber} via ${gatewayUrl}`);
        
        // This structure assumes a generic POST request. Adjust based on your specific Bot API.
        const response = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: targetNumber, // Adjust key based on your bot's requirement (e.g. 'phone', 'jid')
                message: message      // Adjust key (e.g. 'text', 'caption')
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gateway responded with ${response.status}: ${errText}`);
        }

        console.log('[WhatsApp] Message sent successfully.');
        return true;
    } catch (error) {
        console.error('[WhatsApp] Failed to send message:', error.message);
        return false;
    }
};

module.exports = { sendWhatsApp };
