// server/index.js

// Suppress specific deprecation warnings (Node specific)
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
    if (typeof warning === 'string' && warning.includes('util._extend')) return;
    if (warning && warning.name === 'DeprecationWarning' && warning.message.includes('util._extend')) return;
    return originalEmitWarning.call(process, warning, ...args);
};

// Load Environment Variables First
const { loadEnv } = require('./loadEnv');
loadEnv();

const initDB = require('./config/dbInit');
const initStorage = require('./config/initStorage');
const createApp = require('./app');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // 1. Initialize Infrastructure (Storage & Database)
        initStorage();
        await initDB();

        // 2. Create Express Application with WebSocket
        const { app, server } = createApp();

        // 3. Start Listening (using server instead of app for WebSocket support)
        server.listen(PORT, () => {
            console.log(`\n🚀 KolabPanel API running on http://localhost:${PORT}`);
            console.log(`   📡 WebSocket Server: ws://localhost:${PORT}`);
            console.log(`   Environment: ${process.platform}`);
            console.log(`   Storage: ${process.env.STORAGE_ROOT}`);
            console.log(`   SSH Host: ${process.env.SSH_HOST || '100.90.80.70'}\n`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();