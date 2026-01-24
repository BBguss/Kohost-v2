// server/config/paths.js
const path = require('path');
require('dotenv').config();

const normalizeWindowsPath = (raw) => {
    if (!raw) return raw;
    let value = String(raw).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
    }
    if (value.startsWith('//')) value = `\\\\${value.slice(2).replace(/\//g, '\\')}`;
    if (/^[A-Za-z]:[^\\/]/.test(value)) value = `${value[0]}:${path.win32.sep}${value.slice(2)}`;
    return value;
};

const resolveEnvPath = (raw) => {
    if (!raw) return path.resolve(__dirname, '..', '..', 'userdata'); 
    const normalized = normalizeWindowsPath(raw);
    return path.resolve(normalized);
};

const STORAGE_ROOT = resolveEnvPath(process.env.STORAGE_ROOT);
const AVATAR_ROOT = process.env.AVATAR_ROOT 
    ? resolveEnvPath(process.env.AVATAR_ROOT)
    : path.join(STORAGE_ROOT, 'avatars');

const PAYMENT_PROOF_PATH = process.env.PAYMENT_PROOF_PATH
    ? resolveEnvPath(process.env.PAYMENT_PROOF_PATH)
    : path.join(STORAGE_ROOT, 'payments');

const APACHE_SITES_PATH = process.env.APACHE_SITES_PATH
    ? resolveEnvPath(process.env.APACHE_SITES_PATH)
    : path.resolve(__dirname, '..', 'apache_mock/sites');

const APACHE_HTTPD_PATH = process.env.APACHE_HTTPD_PATH
    ? resolveEnvPath(process.env.APACHE_HTTPD_PATH)
    : path.resolve(__dirname, '..', 'apache_mock/httpd.conf');

const SSH_ROOT_PATH = process.env.SSH_ROOT_PATH || '/volume1/web/project/kohost_users';

// ==================== LARAGON PATHS (TAMBAHAN) ====================
// Path PHP Binary untuk Windows execution
const PHP_BINARY = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';

// Laragon/XAMPP Composer path (opsional, bisa diambil dari PATH environment)
const COMPOSER_BINARY = process.env.COMPOSER_BINARY || 'composer';
const NPM_BINARY = process.env.NPM_BINARY || 'npm';

module.exports = {
    STORAGE_ROOT,
    AVATAR_ROOT,
    PAYMENT_PROOF_PATH,
    APACHE_SITES_PATH,
    APACHE_HTTPD_PATH,
    SSH_ROOT_PATH,
    
    // Binary paths untuk terminal execution
    PHP_BINARY,
    COMPOSER_BINARY,
    NPM_BINARY,
    
    // SSH Configuration
    SSH_HOST: process.env.SSH_HOST || '100.90.80.70',
    SSH_PORT: parseInt(process.env.SSH_PORT) || 22,
    SSH_USER: process.env.SSH_USER || 'Aslabkolab',
    SSH_PASSWORD: process.env.SSH_PASSWORD || '',
    
    resolveEnvPath
};