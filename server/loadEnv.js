const path = require('path');
const dotenv = require('dotenv');

/**
 * Loads env vars deterministically from server/.env.
 * `override: true` ensures edits in .env take effect over any existing env vars.
 */
function loadEnv() {
  const envPath = path.resolve(__dirname, '.env');
  const result = dotenv.config({ path: envPath, override: true });

  if (result.error) {
    // Keep running; user might rely on real env vars.
    console.warn(`[env] Failed to load ${envPath}: ${result.error.message}`);
  } else {
    console.log(`[env] Loaded ${envPath}`);
  }

  return result;
}

module.exports = { loadEnv };
