/**
 * ============================================
 * TERMINAL WEBSOCKET HANDLER
 * ============================================
 * 
 * Real-time terminal communication via WebSocket.
 * Handles bidirectional communication between frontend and Docker container.
 */

const WebSocket = require('ws');
const url = require('url');
const {
    validateCommand,
    startContainer,
    stopContainer,
    executeCommand,
    getContainerName,
    containerRunning,
    TERMINAL_CONFIG
} = require('../controllers/terminalController');

// Active sessions tracking
const activeSessions = new Map(); // ws -> { userId, containerName, currentProcess }

/**
 * Initialize WebSocket server for terminal
 * @param {http.Server} server - HTTP server instance
 */
const initTerminalWebSocket = (server) => {
    const wss = new WebSocket.Server({
        server,
        path: '/ws/terminal'
    });

    console.log('[Terminal WS] WebSocket server initialized on /ws/terminal');

    wss.on('connection', async (ws, req) => {
        // Parse URL to get userId
        const params = url.parse(req.url, true).query;
        const userId = params.userId;

        if (!userId) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'User ID required. Connect with ?userId=xxx'
            }));
            ws.close();
            return;
        }

        console.log(`[Terminal WS] Client connected: User ${userId}`);

        // Store session info
        activeSessions.set(ws, {
            userId,
            containerName: getContainerName(userId),
            currentProcess: null
        });

        // Start container on connect
        try {
            await startContainer(userId);
            ws.send(JSON.stringify({
                type: 'connected',
                message: 'Terminal ready',
                container: getContainerName(userId)
            }));

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'output',
                data: `\r\n\x1b[32m╔════════════════════════════════════════╗\r\n║     KoHost Web Terminal Connected      ║\r\n║  Type 'help' for available commands    ║\r\n╚════════════════════════════════════════╝\x1b[0m\r\n\r\n$ `
            }));

        } catch (e) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to start terminal: ' + e.message
            }));
            ws.close();
            return;
        }

        // Handle incoming messages
        ws.on('message', async (message) => {
            const session = activeSessions.get(ws);
            if (!session) return;

            try {
                const data = JSON.parse(message.toString());

                switch (data.type) {
                    case 'command':
                        await handleCommand(ws, session, data.command);
                        break;

                    case 'input':
                        handleInput(session, data.data);
                        break;

                    case 'resize':
                        // Handle terminal resize (for future PTY support)
                        break;

                    case 'kill':
                        killCurrentProcess(session);
                        ws.send(JSON.stringify({ type: 'output', data: '^C\r\n$ ' }));
                        break;

                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong' }));
                        break;

                    default:
                        console.log('[Terminal WS] Unknown message type:', data.type);
                }
            } catch (e) {
                console.error('[Terminal WS] Message parse error:', e);
            }
        });

        // Handle disconnect
        ws.on('close', () => {
            const session = activeSessions.get(ws);
            if (session) {
                console.log(`[Terminal WS] Client disconnected: User ${session.userId}`);
                killCurrentProcess(session);
                activeSessions.delete(ws);
            }
        });

        // Handle errors
        ws.on('error', (err) => {
            console.error('[Terminal WS] WebSocket error:', err);
            const session = activeSessions.get(ws);
            if (session) {
                killCurrentProcess(session);
                activeSessions.delete(ws);
            }
        });
    });

    return wss;
};

/**
 * Handle command execution
 */
const handleCommand = async (ws, session, command) => {
    if (!command || typeof command !== 'string') return;

    const trimmedCmd = command.trim();
    if (!trimmedCmd) {
        ws.send(JSON.stringify({ type: 'output', data: '$ ' }));
        return;
    }

    // Handle built-in commands
    if (trimmedCmd === 'help') {
        ws.send(JSON.stringify({
            type: 'output',
            data: `\r\n\x1b[36mAvailable Commands:\x1b[0m\r\n` +
                `  ls, cd, pwd, cat     - File navigation\r\n` +
                `  nano, vim            - Text editors\r\n` +
                `  git                  - Version control\r\n` +
                `  npm, node            - Node.js\r\n` +
                `  php, composer        - PHP\r\n` +
                `  mysql                - MySQL client\r\n` +
                `  unzip, zip, tar      - Archive tools\r\n` +
                `  clear                - Clear screen\r\n` +
                `  exit                 - Close terminal\r\n\r\n$ `
        }));
        return;
    }

    if (trimmedCmd === 'clear') {
        ws.send(JSON.stringify({ type: 'clear' }));
        ws.send(JSON.stringify({ type: 'output', data: '$ ' }));
        return;
    }

    if (trimmedCmd === 'exit') {
        ws.send(JSON.stringify({ type: 'output', data: 'Goodbye!\r\n' }));
        ws.close();
        return;
    }

    // Validate command
    const validation = validateCommand(trimmedCmd);
    if (!validation.valid) {
        ws.send(JSON.stringify({
            type: 'output',
            data: `\x1b[31m❌ ${validation.error}\x1b[0m\r\n$ `
        }));
        return;
    }

    // Execute command in container
    try {
        const process = await executeCommand(
            session.userId,
            trimmedCmd,
            // stdout
            (data) => {
                ws.send(JSON.stringify({ type: 'output', data: data.replace(/\n/g, '\r\n') }));
            },
            // stderr
            (data) => {
                ws.send(JSON.stringify({ type: 'output', data: `\x1b[31m${data.replace(/\n/g, '\r\n')}\x1b[0m` }));
            },
            // onEnd
            (exitCode) => {
                session.currentProcess = null;
                const prompt = exitCode === 0 ? '$ ' : `\x1b[31m[${exitCode}]\x1b[0m $ `;
                ws.send(JSON.stringify({ type: 'output', data: prompt }));
            }
        );

        session.currentProcess = process;

    } catch (e) {
        ws.send(JSON.stringify({
            type: 'output',
            data: `\x1b[31m❌ Error: ${e.message}\x1b[0m\r\n$ `
        }));
    }
};

/**
 * Handle stdin input to running process
 */
const handleInput = (session, data) => {
    if (session.currentProcess && session.currentProcess.stdin) {
        session.currentProcess.stdin.write(data);
    }
};

/**
 * Kill currently running process
 */
const killCurrentProcess = (session) => {
    if (session.currentProcess) {
        try {
            session.currentProcess.kill('SIGINT');
        } catch (e) {
            console.log('[Terminal WS] Failed to kill process:', e.message);
        }
        session.currentProcess = null;
    }
};

module.exports = {
    initTerminalWebSocket
};
