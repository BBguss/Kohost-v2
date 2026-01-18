const { ensureWritableDirSync } = require('../utils/helpers');
const { STORAGE_ROOT, AVATAR_ROOT, PAYMENT_PROOF_PATH, APACHE_SITES_PATH } = require('./paths');

const initStorage = () => {
    const isUNCPath = (p) => p && p.startsWith('\\\\');
    try {
        console.log('[Storage] Verifying directories...');
        ensureWritableDirSync(STORAGE_ROOT, isUNCPath(STORAGE_ROOT));
        ensureWritableDirSync(AVATAR_ROOT);
        ensureWritableDirSync(PAYMENT_PROOF_PATH);
        
        // Only create Apache path if it's set in env (not using mock internal path)
        if (process.env.APACHE_SITES_PATH) {
            ensureWritableDirSync(APACHE_SITES_PATH);
        }
        
        console.log('[Storage] Directories ready.');
    } catch (e) {
        console.error('[Storage] Initialization warning:', e.message);
    }
};

module.exports = initStorage;