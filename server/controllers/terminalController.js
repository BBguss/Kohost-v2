/**
 * ============================================
 * TERMINAL CONTROLLER - Docker-Based Web Terminal
 * ============================================
 * 
 * Provides isolated terminal environment via Docker containers.
 * Each user gets their own container with:
 * - Isolated filesystem (bind mount to user storage)
 * - Resource limits (CPU, RAM)
 * - Command filtering (security)
 * - Real-time output via WebSocket
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { STORAGE_ROOT } = require('../config/paths');

// ============================================
// CONFIGURATION
// ============================================

const TERMINAL_CONFIG = {
    // Docker image name (build from terminal.Dockerfile)
    imageName: 'kohost-terminal:latest',

    // Container naming pattern
    containerPrefix: 'kohost_terminal_',

    // Resource limits
    cpuLimit: '0.5',        // 50% of one CPU core
    memoryLimit: '512m',    // 512MB RAM

    // Timeouts
    idleTimeout: 30 * 60 * 1000,  // 30 minutes
    execTimeout: 300 * 1000,       // 5 minutes per command (for npm install, composer install)

    // Security
    networkMode: 'bridge',    // Allow network access for npm/composer installs
};

// Active containers tracking
const activeContainers = new Map(); // userId -> { containerId, lastActivity, process }

// ============================================
// COMMAND SECURITY - STRICT ALLOWLIST APPROACH
// ============================================
// SECURITY PRINCIPLE: Only EXPLICITLY ALLOWED commands can run
// Everything else is BLOCKED by default

/**
 * ALLOWLIST - Commands that are permitted
 * Only these base commands will be allowed to execute
 */
const ALLOWED_COMMANDS = {
    // ========== Navigation & File Reading ==========
    'ls': { allowed: true, description: 'List directory' },
    'pwd': { allowed: true, description: 'Print working directory' },
    'cd': { allowed: true, description: 'Change directory (restricted)' },
    'cat': { allowed: true, description: 'Display file content' },
    'less': { allowed: true, description: 'File pager' },
    'head': { allowed: true, description: 'Display first lines' },
    'tail': { allowed: true, description: 'Display last lines' },
    'grep': { allowed: true, description: 'Search pattern in files' },
    'find': { allowed: true, description: 'Find files' },

    // ========== Text Editors ==========
    'nano': { allowed: true, description: 'Text editor' },
    'vim': { allowed: true, description: 'Text editor' },
    'vi': { allowed: true, description: 'Text editor' },

    // ========== Archive & Compression ==========
    'zip': { allowed: true, description: 'Create zip archive' },
    'unzip': { allowed: true, description: 'Extract zip archive' },
    'tar': { allowed: true, description: 'Archive utility' },

    // ========== PHP & Laravel ==========
    'php': { allowed: true, description: 'PHP interpreter' },
    'composer': { allowed: true, description: 'PHP package manager' },

    // ========== Node.js & NPM ==========
    'node': { allowed: true, description: 'Node.js runtime' },
    'npm': { allowed: true, description: 'Node package manager' },
    'npx': { allowed: true, description: 'Node package executor' },
    'yarn': { allowed: true, description: 'Yarn package manager' },
    'pnpm': { allowed: true, description: 'PNPM package manager' },

    // ========== Git (with subcommand validation) ==========
    'git': { allowed: true, description: 'Version control', validateSubcommand: true },

    // ========== Utility ==========
    'echo': { allowed: true, description: 'Print text' },
    'clear': { allowed: true, description: 'Clear terminal' },
    'whoami': { allowed: true, description: 'Show current user' },
    'date': { allowed: true, description: 'Show date/time' },
    'which': { allowed: true, description: 'Locate command' },
    'mkdir': { allowed: true, description: 'Create directory' },
    'touch': { allowed: true, description: 'Create empty file' },
    'cp': { allowed: true, description: 'Copy files' },
    'mv': { allowed: true, description: 'Move/rename files' },

    // ========== Windows Equivalents ==========
    'dir': { allowed: true, description: 'List directory (Windows)' },
    'type': { allowed: true, description: 'Display file (Windows)' },
    'cls': { allowed: true, description: 'Clear screen (Windows)' },
    'copy': { allowed: true, description: 'Copy files (Windows)' },
    'move': { allowed: true, description: 'Move files (Windows)' },
    'md': { allowed: true, description: 'Create directory (Windows)' },
};

/**
 * ALLOWED GIT SUBCOMMANDS
 * Only these git subcommands are permitted
 */
const ALLOWED_GIT_SUBCOMMANDS = [
    'status', 'log', 'pull', 'fetch', 'checkout',
    'branch', 'diff', 'add', 'commit', 'stash',
    'push', 'clone', 'init', 'remote', 'merge',
    'rebase', 'reset', 'show', 'tag', 'config'
];

/**
 * BLOCKED OPERATORS - TOTAL BLOCK
 * Any command containing these is immediately rejected
 * NOTE: These are shell operators that could be used for command injection
 */
const BLOCKED_OPERATORS = [
    ';',        // Command chaining
    '&&',       // Conditional execution
    '||',       // Conditional execution
    '|',        // Pipe
    '>',        // Redirect output
    '>>',       // Append output
    '<',        // Redirect input
    '2>',       // Redirect stderr
    '2>>',      // Append stderr
    '&>',       // Redirect all
    '`',        // Command substitution (backticks)
    '$(',       // Command substitution
    '${',       // Variable expansion (dangerous)
];

// NOTE: '&' alone is NOT blocked because it appears in valid URLs and strings
// Background execution is controlled by Docker timeout instead

/**
 * BLOCKED PATH PATTERNS
 * Commands containing these paths are rejected
 * NOTE: Removed /usr because php/composer/node live there in container
 */
const BLOCKED_PATH_PATTERNS = [
    '../',              // Parent directory traversal
    '..\\',             // Windows parent traversal
    '/etc/passwd',      // Password file (specific)
    '/etc/shadow',      // Shadow file (specific)
    '/root',            // Root home
    '/proc',            // Process info
    '/sys',             // System info
    '/dev',             // Devices (except /dev/null which is safe)
    '/boot',            // Boot files
    'C:\\Windows',      // Windows system
    'C:\\Program',      // Windows programs
    'C:\\Users\\Administrator', // Windows admin
];

/**
 * ABSOLUTELY BLOCKED COMMANDS
 * These are NEVER allowed regardless of context
 */
const ABSOLUTELY_BLOCKED = [
    // Destructive
    'rm', 'rmdir', 'del', 'erase', 'shred', 'dd',

    // Privilege escalation
    'sudo', 'su', 'runas', 'login', 'logout', 'passwd', 'chown', 'chmod',

    // System/Service
    'systemctl', 'service', 'reboot', 'shutdown', 'poweroff', 'halt', 'init',

    // Container/VM
    'docker', 'docker-compose', 'kubectl', 'podman', 'containerd',
    'vagrant', 'virtualbox', 'vmware',

    // Network dangerous
    'nmap', 'nc', 'netcat', 'ncat', 'telnet', 'tcpdump', 'wireshark',

    // Resource abuse
    'yes', 'stress', 'stress-ng', 'fork',

    // Background/Daemon
    'nohup', 'screen', 'tmux', 'bg', 'fg', 'disown', 'at', 'cron', 'crontab',

    // Filesystem
    'mount', 'umount', 'fdisk', 'mkfs', 'parted', 'lsblk',

    // Download & Execute
    'wget', 'curl',

    // Shell bypass
    'bash', 'sh', 'zsh', 'fish', 'csh', 'ksh', 'eval', 'exec',
    'powershell', 'pwsh', 'cmd',
];

/**
 * Validate command using STRICT ALLOWLIST approach
 * @param {string} command - The command to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
const validateSecureCommand = (command) => {
    // 1. Basic validation
    if (!command || typeof command !== 'string') {
        return { valid: false, error: '❌ Invalid command: Empty or not a string' };
    }

    const trimmedCommand = command.trim();

    if (trimmedCommand.length === 0) {
        return { valid: false, error: '❌ Invalid command: Empty command' };
    }

    if (trimmedCommand.length > 1000) {
        return { valid: false, error: '❌ Command too long (max 1000 chars)' };
    }

    // 2. Check for BLOCKED OPERATORS (before anything else!)
    for (const operator of BLOCKED_OPERATORS) {
        if (trimmedCommand.includes(operator)) {
            console.log(`[Security] ❌ BLOCKED operator detected: "${operator}"`);
            return {
                valid: false,
                error: `❌ Operator tidak diizinkan: "${operator}" - Command chaining/redirect tidak diperbolehkan`
            };
        }
    }

    // 3. Extract primary command (first word)
    const parts = trimmedCommand.split(/\s+/);
    const primaryCommand = parts[0].toLowerCase();

    console.log(`[Security] Validating command: "${primaryCommand}"`);

    // 4. Check ABSOLUTELY BLOCKED first
    if (ABSOLUTELY_BLOCKED.includes(primaryCommand)) {
        console.log(`[Security] ❌ ABSOLUTELY BLOCKED: "${primaryCommand}"`);
        return {
            valid: false,
            error: `❌ Command "${primaryCommand}" DIBLOKIR - Tidak diizinkan untuk keamanan sistem`
        };
    }

    // 5. Check if command is in ALLOWLIST
    const allowedEntry = ALLOWED_COMMANDS[primaryCommand];

    if (!allowedEntry || !allowedEntry.allowed) {
        console.log(`[Security] ❌ NOT IN ALLOWLIST: "${primaryCommand}"`);
        return {
            valid: false,
            error: `❌ Command "${primaryCommand}" tidak ada dalam daftar yang diizinkan. Ketik "help" untuk melihat command yang tersedia.`
        };
    }

    // 6. Special validation for GIT subcommands
    if (primaryCommand === 'git' && allowedEntry.validateSubcommand) {
        const subcommand = parts[1]?.toLowerCase();

        if (!subcommand) {
            return { valid: true }; // Just 'git' alone is fine
        }

        if (!ALLOWED_GIT_SUBCOMMANDS.includes(subcommand)) {
            console.log(`[Security] ❌ GIT subcommand blocked: "${subcommand}"`);
            return {
                valid: false,
                error: `❌ Git subcommand "${subcommand}" tidak diizinkan. Gunakan: ${ALLOWED_GIT_SUBCOMMANDS.join(', ')}`
            };
        }
    }

    // 7. Check for PATH ESCAPE attempts
    const lowerCommand = trimmedCommand.toLowerCase();
    for (const blockedPath of BLOCKED_PATH_PATTERNS) {
        if (lowerCommand.includes(blockedPath.toLowerCase())) {
            console.log(`[Security] ❌ PATH ESCAPE detected: "${blockedPath}"`);
            return {
                valid: false,
                error: `❌ Akses ke path "${blockedPath}" tidak diizinkan - Tetap dalam folder project`
            };
        }
    }

    // 8. Additional dangerous pattern checks
    const dangerousPatterns = [
        /\$\w+/,                    // Variable expansion $VAR
        /[\x00-\x1F]/,              // Control characters
        /\\x[0-9a-fA-F]{2}/,        // Hex escapes
        /:+\(\)\s*\{/,              // Fork bomb pattern
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmedCommand)) {
            console.log(`[Security] ❌ Dangerous pattern detected`);
            return {
                valid: false,
                error: '❌ Command mengandung pattern berbahaya'
            };
        }
    }

    // ✅ Command passed all checks
    console.log(`[Security] ✅ ALLOWED: "${trimmedCommand}"`);
    return { valid: true };
};

/**
 * Get list of allowed commands for help display
 */
const getAllowedCommandsList = () => {
    const categories = {
        'Navigasi & File': ['ls', 'pwd', 'cd', 'cat', 'head', 'tail', 'grep', 'find'],
        'Editor': ['nano', 'vim', 'vi'],
        'Arsip': ['zip', 'unzip', 'tar'],
        'PHP/Laravel': ['php', 'composer'],
        'Node.js': ['node', 'npm', 'npx', 'yarn', 'pnpm'],
        'Git': ['git status', 'git log', 'git pull', 'git push', 'git add', 'git commit'],
        'Utility': ['echo', 'clear', 'whoami', 'date', 'mkdir', 'touch', 'cp', 'mv'],
        'Windows': ['dir', 'type', 'cls', 'copy', 'move', 'md'],
    };
    return categories;
};

// Keep old validateCommand as alias for backward compatibility
const validateCommand = validateSecureCommand;

// ============================================
// DOCKER CONTAINER MANAGEMENT
// ============================================

const getContainerName = (userId) => `${TERMINAL_CONFIG.containerPrefix}${userId}`;

const containerExists = async (containerName) => {
    return new Promise((resolve) => {
        exec(`docker ps -a --filter "name=${containerName}" --format "{{.Names}}"`,
            (error, stdout) => resolve(stdout.trim() === containerName)
        );
    });
};

const containerRunning = async (containerName) => {
    return new Promise((resolve) => {
        exec(`docker ps --filter "name=${containerName}" --filter "status=running" --format "{{.Names}}"`,
            (error, stdout) => resolve(stdout.trim() === containerName)
        );
    });
};

const getUserStoragePath = async (userId) => {
    console.log('[Terminal] getUserStoragePath called with userId:', userId);

    // userId dari socket bisa berupa string ID atau integer id
    // Database schema: users.id is VARCHAR(50), NOT unique_id
    let query = 'SELECT username FROM users WHERE id = ?';
    let params = [userId];

    console.log('[Terminal] Query:', query, 'Params:', params);
    const [users] = await pool.execute(query, params);

    if (users.length === 0) {
        console.log('[Terminal] User not found for userId:', userId);
        return null;
    }

    const storagePath = path.join(STORAGE_ROOT, users[0].username);
    console.log('[Terminal] Storage path:', storagePath);
    return storagePath;
};

const startContainer = async (userId) => {
    console.log('[Terminal] startContainer called for userId:', userId);

    const containerName = getContainerName(userId);
    console.log('[Terminal] Container name:', containerName);

    const storagePath = await getUserStoragePath(userId);
    console.log('[Terminal] Storage path result:', storagePath);

    if (!storagePath) {
        console.error('[Terminal] ERROR: User storage path not found for userId:', userId);
        throw new Error('User storage path not found');
    }

    if (!fs.existsSync(storagePath)) {
        console.log('[Terminal] Creating storage directory:', storagePath);
        fs.mkdirSync(storagePath, { recursive: true });
    }

    const exists = await containerExists(containerName);
    console.log('[Terminal] Container exists:', exists);

    if (exists) {
        const running = await containerRunning(containerName);
        console.log('[Terminal] Container running:', running);
        if (running) return containerName;

        console.log('[Terminal] Starting existing container:', containerName);
        return new Promise((resolve, reject) => {
            exec(`docker start ${containerName}`, (error, stdout, stderr) => {
                if (error) {
                    console.error('[Terminal] docker start error:', error.message);
                    reject(error);
                } else {
                    console.log('[Terminal] Container started:', containerName);
                    resolve(containerName);
                }
            });
        });
    }

    console.log('[Terminal] Creating new container...');
    const dockerCmd = [
        'docker run -d',
        `--name ${containerName}`,
        `--cpus=${TERMINAL_CONFIG.cpuLimit}`,
        `--memory=${TERMINAL_CONFIG.memoryLimit}`,
        `--network=${TERMINAL_CONFIG.networkMode}`,
        '--security-opt=no-new-privileges',
        `--workdir=/workspace`,
        `-v "${storagePath}:/workspace"`,
        TERMINAL_CONFIG.imageName,
        'tail -f /dev/null'
    ].join(' ');

    console.log('[Terminal] Docker command:', dockerCmd);
    return new Promise((resolve, reject) => {
        exec(dockerCmd, (error) => {
            if (error) reject(error);
            else resolve(containerName);
        });
    });
};

const stopContainer = async (userId) => {
    const containerName = getContainerName(userId);
    return new Promise((resolve) => {
        exec(`docker stop ${containerName}`, () => resolve());
    });
};

// ============================================
// DOCKER STATUS HELPERS
// ============================================

/**
 * Check if Docker daemon is running
 * @returns {Promise<{running: boolean, error?: string}>}
 */
const isDockerRunning = () => {
    return new Promise((resolve) => {
        exec('docker info', { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
                console.log('[Docker] ❌ Docker daemon not running:', error.message);
                resolve({ 
                    running: false, 
                    error: 'Docker is not running. Please start Docker Desktop.' 
                });
            } else {
                console.log('[Docker] ✅ Docker daemon is running');
                resolve({ running: true });
            }
        });
    });
};

/**
 * Check if Docker image exists, if not show build instructions
 * @returns {Promise<{exists: boolean, error?: string}>}
 */
const imageExists = () => {
    return new Promise((resolve) => {
        exec(`docker images -q ${TERMINAL_CONFIG.imageName}`, (error, stdout) => {
            if (error || !stdout.trim()) {
                console.log('[Docker] ❌ Image not found:', TERMINAL_CONFIG.imageName);
                resolve({ 
                    exists: false, 
                    error: `Docker image "${TERMINAL_CONFIG.imageName}" not found. Run: docker build -t ${TERMINAL_CONFIG.imageName} -f docker/terminal.Dockerfile .` 
                });
            } else {
                console.log('[Docker] ✅ Image exists:', TERMINAL_CONFIG.imageName);
                resolve({ exists: true });
            }
        });
    });
};

// ============================================
// COMMAND EXECUTION
// ============================================

const executeCommand = async (userId, command, onData, onError, onEnd) => {
    const validation = validateCommand(command);
    if (!validation.valid) {
        onError(`❌ ${validation.error}\n`);
        onEnd(1);
        return null;
    }

    // First check if Docker is running
    const dockerStatus = await isDockerRunning();
    if (!dockerStatus.running) {
        onError(`❌ ${dockerStatus.error}\n`);
        onEnd(1);
        return null;
    }

    // Check if image exists
    const imgStatus = await imageExists();
    if (!imgStatus.exists) {
        onError(`❌ ${imgStatus.error}\n`);
        onEnd(1);
        return null;
    }

    const containerName = getContainerName(userId);
    const running = await containerRunning(containerName);

    if (!running) {
        try {
            onData('⏳ Starting container...\n');
            await startContainer(userId);
            onData('✓ Container ready\n');
        } catch (e) {
            onError(`❌ Failed to start terminal: ${e.message}\n`);
            onEnd(1);
            return null;
        }
    }

    // Execute with proper environment and PATH
    // Using -e to set environment variables and ensure all tools are available
    const dockerExec = spawn('docker', [
        'exec',
        '-i',                    // Interactive mode for stdin
        '-e', 'TERM=xterm-256color',
        '-e', 'PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin',
        '-e', 'NODE_ENV=development',
        containerName,
        '/bin/bash',
        '-c',
        command
    ], {
        timeout: TERMINAL_CONFIG.execTimeout
    });

    activeContainers.set(userId, {
        containerId: containerName,
        lastActivity: Date.now(),
        process: dockerExec
    });

    dockerExec.stdout.on('data', (data) => onData(data.toString()));
    dockerExec.stderr.on('data', (data) => onError(data.toString()));
    dockerExec.on('close', (code) => onEnd(code));
    dockerExec.on('error', (err) => {
        // More informative error message
        if (err.message.includes('ENOENT')) {
            onError(`❌ Docker command not found. Is Docker installed and in PATH?\n`);
        } else {
            onError(`❌ Error: ${err.message}\n`);
        }
        onEnd(1);
    });

    return dockerExec;
};

// ============================================
// HTTP ENDPOINTS
// ============================================

exports.startTerminal = async (req, res) => {
    const userId = req.body.userId || req.user?.id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const containerName = await startContainer(userId);
        res.json({ success: true, container: containerName });
    } catch (e) {
        res.status(500).json({ error: 'Failed to start terminal: ' + e.message });
    }
};

exports.stopTerminal = async (req, res) => {
    const userId = req.body.userId || req.user?.id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    await stopContainer(userId);
    activeContainers.delete(userId);
    res.json({ success: true });
};

exports.execCommand = async (req, res) => {
    const userId = req.body.userId || req.user?.id;
    const { command } = req.body;

    if (!userId) return res.status(400).json({ error: 'User ID required' });
    if (!command) return res.status(400).json({ error: 'Command required' });

    let output = '', errorOutput = '';

    await executeCommand(userId, command,
        (data) => { output += data; },
        (data) => { errorOutput += data; },
        (code) => {
            res.json({ success: code === 0, exitCode: code, output, error: errorOutput });
        }
    );
};

exports.getStatus = async (req, res) => {
    const userId = req.query.userId || req.user?.id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const containerName = getContainerName(userId);
    const running = await containerRunning(containerName);

    res.json({ success: true, container: containerName, running });
};

// ============================================
// SOCKET.IO HANDLER
// ============================================

// Session state per socket - stores current working directory
const sessionState = new Map(); // socketId -> { cwd: string, siteId: string }

/**
 * Handle terminal connection via Socket.IO
 * Called from app.js when a socket connects
 */
const handleTerminalConnection = (socket) => {
    const userId = socket.user?.id;
    const username = socket.user?.username || 'unknown';

    console.log(`[Terminal] User ${username} (${userId}) connected to terminal`);

    // Initialize session state with default working directory
    sessionState.set(socket.id, { cwd: '/workspace', siteId: null });

    // Start container when user connects
    if (userId) {
        startContainer(userId).then(() => {
            socket.emit('terminal:ready', {
                message: 'Terminal ready',
                container: getContainerName(userId)
            });
            socket.emit('terminal:output', '\r\n\x1b[32m╔════════════════════════════════════════╗\r\n║     KoHost Web Terminal Connected      ║\r\n║  Type "help" for available commands    ║\r\n╚════════════════════════════════════════╝\x1b[0m\r\n\r\n$ ');
        }).catch(err => {
            socket.emit('terminal:error', { message: 'Failed to start container: ' + err.message });
        });
    }

    // Cleanup session state on disconnect
    socket.on('disconnect', () => {
        console.log(`[Terminal] User ${username} disconnected from terminal`);
        sessionState.delete(socket.id);
    });

    // Handle command execution
    socket.on('terminal:command', async (data) => {
        const command = data?.command || data;
        console.log('[Terminal] 📥 Command received:', command);
        console.log('[Terminal] From user:', socket.user?.username);

        if (!command || typeof command !== 'string') {
            console.log('[Terminal] ⚠️ Empty command, sending prompt');
            socket.emit('terminal:output', '$ ');
            return;
        }

        const trimmedCmd = command.trim();

        // Handle built-in commands
        if (trimmedCmd === 'help') {
            console.log('[Terminal] Handling built-in: help');
            socket.emit('terminal:output',
                '\r\n\x1b[36mAvailable Commands:\x1b[0m\r\n' +
                '  ls, cd, pwd, cat     - File navigation\r\n' +
                '  nano, vim            - Text editors\r\n' +
                '  git                  - Version control\r\n' +
                '  npm, node            - Node.js\r\n' +
                '  php, composer        - PHP\r\n' +
                '  mysql                - MySQL client\r\n' +
                '  unzip, zip, tar      - Archive tools\r\n' +
                '  clear                - Clear screen\r\n\r\n$ '
            );
            return;
        }

        if (trimmedCmd === 'clear') {
            console.log('[Terminal] Handling built-in: clear');
            socket.emit('terminal:clear');
            socket.emit('terminal:output', '$ ');
            return;
        }

        // Execute command in container
        console.log('[Terminal] 🚀 Executing in container:', trimmedCmd);
        await executeCommand(
            userId,
            trimmedCmd,
            (output) => {
                console.log('[Terminal] 📤 Output:', output.substring(0, 100) + (output.length > 100 ? '...' : ''));
                socket.emit('terminal:output', output.replace(/\n/g, '\r\n'));
            },
            (error) => {
                console.log('[Terminal] ❌ Error:', error);
                socket.emit('terminal:output', `\x1b[31m${error.replace(/\n/g, '\r\n')}\x1b[0m`);
            },
            (exitCode) => {
                console.log('[Terminal] ✅ Command finished with exit code:', exitCode);
                const prompt = exitCode === 0 ? '$ ' : `\x1b[31m[${exitCode}]\x1b[0m $ `;
                socket.emit('terminal:output', prompt);
            }
        );
    });

    // ============================================
    // Handler for RealtimeTerminal.tsx (execute_command event)
    // ============================================
    // FIXED: Now uses Docker container for execution, not local Windows spawn
    // This ensures php, node, npm, composer are available via container's PATH
    // ALSO: Supports persistent working directory with cd command
    socket.on('execute_command', async (data) => {
        const { command, siteId } = data || {};
        console.log('══════════════════════════════════════════');
        console.log('[Terminal] 📥 execute_command received');
        console.log('[Terminal] Command:', command);
        console.log('[Terminal] SiteId:', siteId);
        console.log('[Terminal] User:', socket.user?.username, '| ID:', userId);
        console.log('══════════════════════════════════════════');

        if (!command || typeof command !== 'string') {
            socket.emit('command_error', { error: 'Empty command' });
            return;
        }

        const trimmedCmd = command.trim();

        // Get or initialize session state
        let session = sessionState.get(socket.id);
        if (!session) {
            session = { cwd: '/workspace', siteId: null };
            sessionState.set(socket.id, session);
        }

        // Initialize working directory based on siteId (first time or siteId changed)
        if (siteId && session.siteId !== siteId) {
            session.siteId = siteId;
            try {
                // Query database to get site name (folder name)
                const [sites] = await pool.execute(
                    'SELECT name FROM sites WHERE id = ?',
                    [siteId]
                );
                if (sites.length > 0 && sites[0].name) {
                    session.cwd = `/workspace/${sites[0].name}`;
                    console.log('[Terminal] 📂 Site folder from DB:', sites[0].name);
                } else {
                    session.cwd = `/workspace`;
                }
            } catch (dbErr) {
                console.log('[Terminal] ⚠️ DB lookup failed:', dbErr.message);
                session.cwd = `/workspace`;
            }
        }

        // Handle built-in commands without Docker
        if (trimmedCmd === 'help') {
            socket.emit('command_output', { 
                data: '\nAvailable Commands:\n' +
                    '  ls, cd, pwd, cat     - File navigation\n' +
                    '  nano, vim            - Text editors\n' +
                    '  git                  - Version control\n' +
                    '  npm, node, npx       - Node.js\n' +
                    '  php, composer        - PHP/Laravel\n' +
                    '  unzip, zip, tar      - Archive tools\n' +
                    '  clear                - Clear screen\n' +
                    '\nTip: Use "cd folder" to change directory persistently\n\n',
                type: 'stdout' 
            });
            socket.emit('command_completed', { exitCode: 0 });
            return;
        }

        if (trimmedCmd === 'clear') {
            socket.emit('terminal:clear');
            socket.emit('command_completed', { exitCode: 0 });
            return;
        }

        // Handle 'pwd' to show current directory
        if (trimmedCmd === 'pwd') {
            socket.emit('command_output', { data: session.cwd + '\n', type: 'stdout' });
            socket.emit('command_completed', { exitCode: 0 });
            return;
        }

        // Handle 'cd' command - update session working directory
        if (trimmedCmd.startsWith('cd ') || trimmedCmd === 'cd') {
            const targetDir = trimmedCmd.substring(3).trim() || '/workspace';
            
            // Build the new path
            let newCwd;
            if (targetDir === '..') {
                // Go up one directory
                const parts = session.cwd.split('/').filter(p => p);
                if (parts.length > 1) {
                    parts.pop();
                    newCwd = '/' + parts.join('/');
                } else {
                    newCwd = '/workspace';
                }
            } else if (targetDir === '~' || targetDir === '') {
                newCwd = '/workspace';
            } else if (targetDir.startsWith('/')) {
                // Absolute path - but restrict to /workspace
                if (targetDir.startsWith('/workspace')) {
                    newCwd = targetDir;
                } else {
                    socket.emit('command_error', { error: 'Access denied: Can only navigate within /workspace' });
                    return;
                }
            } else {
                // Relative path
                newCwd = session.cwd + '/' + targetDir;
            }

            // Normalize path (remove double slashes, trailing slash)
            newCwd = newCwd.replace(/\/+/g, '/').replace(/\/$/, '') || '/workspace';

            // Verify directory exists in container
            const containerName = getContainerName(userId);
            
            console.log('[Terminal] 📁 CD command: target=', targetDir, 'newCwd=', newCwd);

            try {
                // Use spawn instead of exec for better handling
                const result = await new Promise((resolve, reject) => {
                    const checkProcess = spawn('docker', [
                        'exec', containerName, 
                        'test', '-d', newCwd
                    ]);
                    
                    checkProcess.on('close', (code) => {
                        resolve(code === 0 ? 'EXISTS' : 'NOT_FOUND');
                    });
                    
                    checkProcess.on('error', (err) => {
                        reject(err);
                    });
                });

                console.log('[Terminal] 📁 CD check result:', result);

                if (result === 'EXISTS') {
                    session.cwd = newCwd;
                    socket.emit('command_output', { data: `${newCwd}\n`, type: 'stdout' });
                    socket.emit('command_completed', { exitCode: 0 });
                } else {
                    socket.emit('command_error', { error: `Directory not found: ${targetDir}` });
                }
            } catch (err) {
                console.log('[Terminal] ❌ CD error:', err.message);
                socket.emit('command_error', { error: `Failed to change directory: ${err.message}` });
            }
            return;
        }

        // Validate command for security
        const validation = validateCommand(trimmedCmd);
        if (!validation.valid) {
            socket.emit('command_error', { error: validation.error });
            return;
        }

        // Emit command_started
        socket.emit('command_started', {
            command: trimmedCmd,
            type: 'docker' // Using Docker container execution
        });

        // ============================================
        // DOCKER CONTAINER EXECUTION
        // ============================================
        const containerName = getContainerName(userId);
        console.log('[Terminal] Container name:', containerName);
        console.log('[Terminal] 📂 Session CWD:', session.cwd);

        try {
            // Ensure container is running
            const running = await containerRunning(containerName);
            if (!running) {
                console.log('[Terminal] Container not running, starting...');
                socket.emit('command_output', { data: '⏳ Starting container...\n', type: 'stderr' });
                await startContainer(userId);
                socket.emit('command_output', { data: '✓ Container ready\n', type: 'stderr' });
            }

            // Build command with persistent working directory from session
            const fullCommand = `cd "${session.cwd}" 2>/dev/null || cd /workspace; ${trimmedCmd}`;

            console.log('[Terminal] 🐳 Docker exec:', fullCommand);

            // Execute in Docker container using spawn for streaming
            const dockerProcess = spawn('docker', [
                'exec',
                '-i',                    // Interactive mode for stdin
                '-e', 'TERM=xterm-256color',  // Terminal type
                '-e', 'PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin',
                containerName,
                '/bin/bash',
                '-c',
                fullCommand
            ], {
                timeout: TERMINAL_CONFIG.execTimeout,
                env: { ...process.env }
            });

            let hasOutput = false;

            dockerProcess.stdout.on('data', (data) => {
                hasOutput = true;
                const output = data.toString();
                console.log('[Terminal] 📤 stdout:', output.substring(0, 100) + (output.length > 100 ? '...' : ''));
                socket.emit('command_output', { data: output, type: 'stdout' });
            });

            dockerProcess.stderr.on('data', (data) => {
                hasOutput = true;
                const output = data.toString();
                console.log('[Terminal] 📤 stderr:', output.substring(0, 100) + (output.length > 100 ? '...' : ''));
                socket.emit('command_output', { data: output, type: 'stderr' });
            });

            dockerProcess.on('close', (code) => {
                console.log('[Terminal] ✅ Docker command finished with exit code:', code);
                
                if (!hasOutput && code !== 0) {
                    socket.emit('command_output', { 
                        data: `Command finished with no output (exit code: ${code})\n`, 
                        type: 'stderr' 
                    });
                }

                if (code === 0) {
                    socket.emit('command_completed', { exitCode: code });
                } else {
                    socket.emit('command_error', { 
                        error: `Command exited with code ${code}`,
                        exitCode: code 
                    });
                }
            });

            dockerProcess.on('error', (err) => {
                console.log('[Terminal] ❌ Docker spawn error:', err.message);
                
                if (err.message.includes('ENOENT') || err.message.includes('docker')) {
                    socket.emit('command_error', { 
                        error: '❌ Docker is not running. Please start Docker Desktop and try again.',
                        details: err.message
                    });
                } else {
                    socket.emit('command_error', { error: err.message });
                }
            });

        } catch (err) {
            console.log('[Terminal] ❌ Execution error:', err.message);
            socket.emit('command_error', { 
                error: `Failed to execute command: ${err.message}`,
                details: err.stack
            });
        }
    });

    // Note: disconnect handler already added above with sessionState cleanup
};

// Export for WebSocket
module.exports = {
    ...exports,
    validateCommand,
    startContainer,
    stopContainer,
    executeCommand,
    getContainerName,
    containerRunning,
    isDockerRunning,
    imageExists,
    handleTerminalConnection,
    TERMINAL_CONFIG
};
