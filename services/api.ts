// This file aggregates all modules into the single API object used by the app.
import { authApi } from './api/modules/auth';
import { sitesApi, databaseApi, filesApi } from './api/modules/sites';
import { adminApi } from './api/modules/admin';
import { commonApi, billingApi, ticketsApi, executeTerminalCommand } from './api/modules/admin'; // Admin module also holds shared logic for simplicity in this refactor step, or create shared modules.

// Re-export the consolidated API object
export const api = {
    auth: authApi,
    sites: sitesApi,
    database: databaseApi,
    files: filesApi,
    admin: adminApi,
    // The following were grouped in admin module file for brevity in file count
    common: commonApi,
    billing: billingApi,
    tickets: ticketsApi,
    executeTerminalCommand: executeTerminalCommand
};
