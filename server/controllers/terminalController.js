
// server/controllers/terminalController.js
const { exec } = require('child_process');
const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const {
    STORAGE_ROOT,
    SSH_ROOT_PATH,
    SSH_HOST,
    SSH_PORT,
    SSH_USER,
    SSH_PASSWORD,
    PHP_BINARY,
    COMPOSER_BINARY,
    NPM_BINARY
} = require('../config/paths');

// Store current working directory per socket connection
const socketWorkingDirs = new Map();

// Store running processes per socket
const runningProcesses = new Map();

// Command whitelist configuration
const ALLOWED_COMMANDS = {
    windows: [
        'php artisan migrate',
        'php artisan migrate:fresh',
        'php artisan migrate:rollback',
        'php artisan migrate:reset',
        'php artisan migrate:status',
        'php artisan db:seed',
        'php artisan tinker',
        'php artisan cache:clear',
        'php artisan config:cache',
        'php artisan route:cache',
        'php artisan view:clear',
        'dir',
        'cls',
        'cd',
        'type',
        'copy',
        'move',
        'del',
        'mkdir',
        'rmdir'
    ],
    ssh: [
        '/usr/local/bin/php82 /usr/local/bin/composer install',
        '/usr/local/bin/php82 /usr/local/bin/composer update',
        'composer install',
        'composer update',
        'export PATH=/usr/local/bin:$PATH && npm install',
        'export PATH=/usr/local/bin:$PATH && npm run build',
        'npm install',
        'npm run build',
        'npm run dev',
        'npm start',
        '/usr/local/bin/php82 artisan storage:link',
        '/usr/local/bin/php82 artisan route:list',
        'php artisan storage:link',
        'git pull',
        'git status',
        'ls',
        'pwd',
        'cd',
        'cat',
        'cp',
        'mv',
        'rm',
        'mkdir',
        'touch'
    ]
};

function getCommandType(command) {
    const trimmed = command.trim();
    
    if (ALLOWED_COMMANDS.windows.some(cmd => trimmed.startsWith(cmd))) {
        return 'windows';
    }
    
    if (ALLOWED_COMMANDS.ssh.some(cmd => trimmed.startsWith(cmd))) {
        return 'ssh';
    }
    
    return null;
}

async function getSiteInfo(siteId, userId) {
    const [sites] = await db.query(
        'SELECT * FROM sites WHERE id = ? AND user_id = ?',
        [siteId, userId]
    );
    
    if (sites.length === 0) {
        throw new Error('Site not found or access denied');
    }
    
    return sites[0];
}

async function getUserInfo(userId) {
    const [users] = await db.query(
        'SELECT * FROM users WHERE id = ?',
        [userId]
    );
    
    if (users.length === 0) {
        throw new Error('User not found');
    }
    
    return users[0];
}

/**
 * Retrieves database credentials for a specific site/user combo
 * and formats them as environment variables override.
 */
async function getDatabaseEnv(siteId, userId, username) {
    try {
        // Find database associated with this site
        const [dbs] = await db.query('SELECT db_name FROM `databases` WHERE site_id = ?', [siteId]);
        
        if (dbs.length === 0) {
            return {}; // No database attached
        }

        const dbName = dbs[0].db_name;

        // Reconstruct Credentials (Logic matches siteController.js)
        const safeUsername = username.replace(/[^a-zA-Z0-9]/g, '');
        const mysqlUser = `sql_${safeUsername.toLowerCase()}`;
        
        const idPart = userId.substring(0, 4);
        const namePart = safeUsername.substring(0, 3).toUpperCase();
        const mysqlPass = `kp_${idPart}@${namePart}#88`;

        return {
            DB_CONNECTION: 'mysql',
            DB_HOST: '127.0.0.1',
            DB_PORT: '3306',
            DB_DATABASE: dbName,
            DB_USERNAME: mysqlUser,
            DB_PASSWORD: mysqlPass
        };
    } catch (error) {
        console.error("Error fetching DB Env:", error);
        return {};
    }
}

// Get current working directory for socket
function getCurrentWorkingDir(socketId, defaultPath) {
    if (!socketWorkingDirs.has(socketId)) {
        socketWorkingDirs.set(socketId, defaultPath);
    }
    return socketWorkingDirs.get(socketId);
}

// Set current working directory for socket
function setCurrentWorkingDir(socketId, newPath) {
    socketWorkingDirs.set(socketId, newPath);
}

// Validate path is within project boundaries
function isPathWithinProject(targetPath, projectRoot) {
    const normalizedTarget = path.normalize(targetPath);
    const normalizedRoot = path.normalize(projectRoot);
    
    return normalizedTarget.startsWith(normalizedRoot);
}

// Get relative path for display (hide full server path)
function getDisplayPath(fullPath, projectRoot, siteName, isWindows = true) {
    const normalizedFull = isWindows ? path.normalize(fullPath) : path.posix.normalize(fullPath);
    const normalizedRoot = isWindows ? path.normalize(projectRoot) : path.posix.normalize(projectRoot);
    
    let relativePath = normalizedFull.replace(normalizedRoot, '');
    relativePath = relativePath.replace(/^[\\\/]+/, '');
    
    if (!relativePath || relativePath === '') {
        return `~/${siteName}`;
    }
    
    return `~/${siteName}/${relativePath.replace(/\\/g, '/')}`;
}

// Cleanup all temporary network drives
async function cleanupAllTempDrives() {
    return new Promise((resolve) => {
        exec('net use', (err, stdout) => {
            if (err) {
                return resolve();
            }
            
            const lines = stdout.split('\n');
            const deleteCommands = [];
            
            // Find all mapped drives pointing to STORAGE_ROOT
            const storageUNC = STORAGE_ROOT.toLowerCase();
            
            lines.forEach(line => {
                // Check if line contains our UNC path
                if (line.toLowerCase().includes(storageUNC)) {
                    // Extract drive letter (format: "OK           Z:        \\server\share")
                    const match = line.match(/\s+([A-Z]:)\s+/);
                    if (match && match[1]) {
                        deleteCommands.push(`net use ${match[1]} /delete /y`);
                    }
                }
            });
            
            if (deleteCommands.length === 0) {
                return resolve();
            }
            
            // Execute all delete commands
            const deleteCmd = deleteCommands.join(' & ');
            exec(deleteCmd, (err) => {
                if (err) {
                    console.error('Cleanup warning:', err.message);
                }
                console.log(`Cleaned up ${deleteCommands.length} temporary drive(s)`);
                resolve();
            });
        });
    });
}

// Kill running process for socket
async function killSocketProcess(socketId) {
    const processInfo = runningProcesses.get(socketId);
    if (!processInfo) return;
    
    try {
        const { pid } = processInfo;
        
        // Kill process tree (parent + children)
        await new Promise((resolve) => {
            exec(`taskkill /F /T /PID ${pid}`, (err) => {
                if (err) {
                    console.error(`Failed to kill process ${pid}:`, err.message);
                }
                resolve();
            });
        });
        
        runningProcesses.delete(socketId);
        console.log(`Killed process ${pid} for socket ${socketId}`);
    } catch (err) {
        console.error(`Error killing process:`, err.message);
    }
}

async function executeWindowsCommand(socket, command, site, user) {
    return new Promise(async (resolve, reject) => {
        try {
            // Cleanup stale drives BEFORE executing
            await cleanupAllTempDrives();
            
            const projectPath = path.join(STORAGE_ROOT, user.username, site.name);
            
            let currentDir = getCurrentWorkingDir(socket.id, projectPath);
            
            // Validate path exists
            if (!fs.existsSync(projectPath)) {
                const error = `Project path does not exist: ${projectPath}`;
                socket.emit('command_output', {
                    type: 'error',
                    data: error + '\n'
                });
                return reject(new Error(error));
            }
            
            // Validate PHP binary for PHP commands
            if (command.startsWith('php ') && !fs.existsSync(PHP_BINARY)) {
                const error = `PHP binary not found: ${PHP_BINARY}`;
                socket.emit('command_output', {
                    type: 'error',
                    data: error + '\n'
                });
                return reject(new Error(error));
            }
            
            // Handle CD command specially
            if (command.trim().startsWith('cd')) {
                // Handle 'cd' without arguments (show current directory)
                if (command.trim() === 'cd') {
                    const displayPath = getDisplayPath(currentDir, projectPath, site.name, true);
                    socket.emit('command_output', {
                        type: 'stdout',
                        data: `${displayPath}\n`
                    });
                    return resolve();
                }
                
                const cdMatch = command.match(/^cd\s+(.+)$/);
                if (cdMatch) {
                    let targetPath = cdMatch[1].trim().replace(/['"]/g, '');
                    
                    // Handle relative paths
                    if (!path.isAbsolute(targetPath)) {
                        targetPath = path.join(currentDir, targetPath);
                    }
                    
                    // Normalize path (resolve .. and .)
                    targetPath = path.normalize(targetPath);
                    
                    // Security check: ensure path is within project
                    if (!isPathWithinProject(targetPath, projectPath)) {
                        socket.emit('command_output', {
                            type: 'error',
                            data: 'Access denied: Cannot navigate outside project directory\n'
                        });
                        return reject(new Error('Access denied'));
                    }
                    
                    // Check if target path exists
                    if (!fs.existsSync(targetPath)) {
                        socket.emit('command_output', {
                            type: 'error',
                            data: `The system cannot find the path specified: ${path.basename(targetPath)}\n`
                        });
                        return reject(new Error('Path not found'));
                    }
                    
                    // Check if it's a directory
                    const stats = fs.statSync(targetPath);
                    if (!stats.isDirectory()) {
                        socket.emit('command_output', {
                            type: 'error',
                            data: 'The directory name is invalid.\n'
                        });
                        return reject(new Error('Not a directory'));
                    }
                    
                    // Update current directory
                    setCurrentWorkingDir(socket.id, targetPath);
                    
                    // Display relative path instead of full path
                    const displayPath = getDisplayPath(targetPath, projectPath, site.name, true);
                    
                    socket.emit('command_output', {
                        type: 'stdout',
                        data: `${displayPath}\n`
                    });
                    
                    return resolve();
                }
            }
            
            socket.emit('command_output', {
                type: 'info',
                data: `Environment Ready. Executing...\n`
            });
            
            // Fetch Database Environment Variables for this site
            const dbEnv = await getDatabaseEnv(site.id, user.id, user.username);

            // Replace 'php' with full PHP binary path
            let fullCommand = command.replace(/^php\s/, `"${PHP_BINARY}" `);
            
            // Use pushd/popd with forced cleanup
            // Add error suppression (2>nul) to hide "UNC path" warning
            const wrappedCommand = `pushd "${currentDir}" 2>nul && ${fullCommand} & popd`;
            
            // Execute command
            const cmdProcess = exec(wrappedCommand, {
                env: {
                    ...process.env,
                    ...dbEnv, // Inject DB credentials into environment
                    PATH: `${path.dirname(PHP_BINARY)};${process.env.PATH}`,
                    PHP_BINARY: PHP_BINARY
                },
                maxBuffer: 1024 * 1024 * 10, // 10MB buffer
                timeout: 300000, // 5 minutes timeout
                windowsHide: true
            });
            
            // Store process info for cleanup
            runningProcesses.set(socket.id, {
                pid: cmdProcess.pid,
                command: command,
                startTime: Date.now()
            });
            
            // Stream stdout
            cmdProcess.stdout.on('data', (data) => {
                socket.emit('command_output', {
                    type: 'stdout',
                    data: data.toString()
                });
            });
            
            // Stream stderr
            cmdProcess.stderr.on('data', (data) => {
                socket.emit('command_output', {
                    type: 'stderr',
                    data: data.toString()
                });
            });
            
            // Handle completion
            cmdProcess.on('close', async (code) => {
                // Remove from running processes
                runningProcesses.delete(socket.id);
                
                // Cleanup drives after command completes
                await cleanupAllTempDrives();
                
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });
            
            // Handle errors
            cmdProcess.on('error', async (error) => {
                // Remove from running processes
                runningProcesses.delete(socket.id);
                
                // Cleanup drives on error
                await cleanupAllTempDrives();
                
                socket.emit('command_output', {
                    type: 'error',
                    data: `Process execution failed: ${error.message}\n`
                });
                reject(error);
            });
            
        } catch (error) {
            // Cleanup drives on exception
            await cleanupAllTempDrives();
            
            socket.emit('command_output', {
                type: 'error',
                data: `Process execution failed: ${error.message}\n`
            });
            reject(error);
        }
    });
}

async function executeSSHCommand(socket, command, site, user) {
    return new Promise(async (resolve, reject) => {
        const sshConfig = {
            host: SSH_HOST,
            port: SSH_PORT,
            username: SSH_USER,
            password: SSH_PASSWORD
        };
        
        const projectPath = path.posix.join(SSH_ROOT_PATH, user.username, site.name);
        
        // Get or set current working directory (SSH version)
        let currentDir = getCurrentWorkingDir(`ssh_${socket.id}`, projectPath);
        
        const conn = new Client();
        
        // Fetch Database Environment Variables for this site
        const dbEnv = await getDatabaseEnv(site.id, user.id, user.username);
        
        // Construct environment variable prefix string for SSH command
        // e.g., "DB_HOST='127.0.0.1' DB_DATABASE='dbname' "
        let envPrefix = '';
        if (Object.keys(dbEnv).length > 0) {
            envPrefix = Object.entries(dbEnv)
                .map(([k, v]) => `${k}='${v}'`)
                .join(' ') + ' ';
        }

        conn.on('ready', () => {
            // Handle CD command specially for SSH
            if (command.trim().startsWith('cd')) {
                const cdMatch = command.match(/^cd\s+(.+)$/);
                if (cdMatch) {
                    let targetPath = cdMatch[1].trim().replace(/['"]/g, '');
                    
                    // Handle relative paths
                    if (!path.posix.isAbsolute(targetPath)) {
                        targetPath = path.posix.join(currentDir, targetPath);
                    }
                    
                    // Normalize path
                    targetPath = path.posix.normalize(targetPath);
                    
                    // Security check: ensure path is within project
                    if (!targetPath.startsWith(projectPath)) {
                        socket.emit('command_output', {
                            type: 'error',
                            data: 'Access denied: Cannot navigate outside project directory\n'
                        });
                        conn.end();
                        return reject(new Error('Access denied'));
                    }
                    
                    // Check if path exists via SSH
                    const checkCommand = `[ -d "${targetPath}" ] && echo "EXISTS" || echo "NOT_FOUND"`;
                    
                    conn.exec(checkCommand, (err, stream) => {
                        if (err) {
                            conn.end();
                            return reject(err);
                        }
                        
                        let output = '';
                        stream.on('data', (data) => {
                            output += data.toString();
                        });
                        
                        stream.on('close', () => {
                            if (output.trim() === 'EXISTS') {
                                // Update current directory
                                setCurrentWorkingDir(`ssh_${socket.id}`, targetPath);
                                
                                // Display relative path
                                const displayPath = getDisplayPath(targetPath, projectPath, site.name, false);
                                
                                socket.emit('command_output', {
                                    type: 'stdout',
                                    data: `${displayPath}\n`
                                });
                                conn.end();
                                resolve();
                            } else {
                                socket.emit('command_output', {
                                    type: 'error',
                                    data: `cd: ${path.posix.basename(targetPath)}: No such file or directory\n`
                                });
                                conn.end();
                                reject(new Error('Path not found'));
                            }
                        });
                    });
                    
                    return;
                }
            }
            
            // For pwd command, return current directory (relative)
            if (command.trim() === 'pwd') {
                const displayPath = getDisplayPath(currentDir, projectPath, site.name, false);
                socket.emit('command_output', {
                    type: 'stdout',
                    data: `${displayPath}\n`
                });
                conn.end();
                return resolve();
            }
            
            // Inject Env Vars inline: cd "dir" && DB_HOST='...' DB_PASS='...' command
            const fullCommand = `cd "${currentDir}" && ${envPrefix}${command}`;
            
            socket.emit('command_output', {
                type: 'info',
                data: ` Establishing secure connection to node...\n`
            });
            socket.emit('command_output', {
                type: 'info',
                data: ` Environment: ${site.framework} Container\n`
            });
            
            conn.exec(fullCommand, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                
                stream.on('data', (data) => {
                    socket.emit('command_output', {
                        type: 'stdout',
                        data: data.toString()
                    });
                });
                
                stream.stderr.on('data', (data) => {
                    socket.emit('command_output', {
                        type: 'stderr',
                        data: data.toString()
                    });
                });
                
                stream.on('close', (code) => {
                    conn.end();
                    
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`SSH command exited with code ${code}`));
                    }
                });
            });
        });
        
        conn.on('error', (err) => {
            reject(err);
        });
        
        setTimeout(() => {
            if (!conn._sock || !conn._sock.readable) {
                // Connection timeout check
            }
        }, 10000);
        
        try {
            conn.connect(sshConfig);
        } catch (err) {
            reject(err);
        }
    });
}

async function logCommand(userId, siteId, command, type, status, error = null) {
    try {
        await db.query(
            `INSERT INTO command_logs (user_id, site_id, command, type, status, error, executed_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [userId, siteId, command, type, status, error]
        );
    } catch (err) {
        console.error('Failed to log command:', err);
    }
}

function handleTerminalConnection(socket) {
    const socketUser = socket.user;
    
    socket.on('execute_command', async (data) => {
        const { command, siteId } = data;
        let commandType = null;
        
        try {
            if (!command || !command.trim()) {
                socket.emit('command_error', {
                    error: 'Empty command'
                });
                return;
            }
            
            commandType = getCommandType(command);
            
            if (!commandType) {
                socket.emit('command_error', {
                    error: 'Command not allowed. Only whitelisted commands are permitted.\n' +
                           'Allowed: php artisan, composer, npm, git, cd, ls, dir, cat, etc.'
                });
                return;
            }
            
            const site = await getSiteInfo(siteId, socketUser.id);
            const user = await getUserInfo(socketUser.id);
            
            socket.emit('command_started', { 
                command,
                type: commandType,
                site: site.name
            });
            
            if (commandType === 'windows') {
                await executeWindowsCommand(socket, command, site, user);
            } else if (commandType === 'ssh') {
                await executeSSHCommand(socket, command, site, user);
            }
            
            await logCommand(socketUser.id, siteId, command, commandType, 'success');
            
            socket.emit('command_completed', {
                command,
                type: commandType,
                status: 'success'
            });
            
        } catch (error) {
            console.error('Command execution error:', error);
            
            if (commandType) {
                await logCommand(
                    socketUser.id,
                    data.siteId,
                    command,
                    commandType,
                    'error',
                    error.message
                );
            }
            
            socket.emit('command_error', {
                command,
                error: error.message
            });
        }
    });
    
    // Clean up socket working directory when disconnected
    socket.on('disconnect', async () => {
        console.log(`Socket ${socket.id} disconnected, cleaning up...`);
        
        socketWorkingDirs.delete(socket.id);
        socketWorkingDirs.delete(`ssh_${socket.id}`);
        
        // Force kill running process
        await killSocketProcess(socket.id);
        
        // Cleanup temp drives
        await cleanupAllTempDrives();
    });
    
    // Handle cancel command
    socket.on('cancel_command', async () => {
        console.log(`Canceling command for socket ${socket.id}`);
        
        await killSocketProcess(socket.id);
        
        socket.emit('command_output', {
            type: 'error',
            data: '\n^C\nCommand canceled by user\n'
        });
        
        socket.emit('command_completed', {
            command: 'canceled',
            type: 'canceled',
            status: 'canceled'
        });
    });
}

// Periodic cleanup every 5 minutes
setInterval(async () => {
    console.log('Running periodic temp drive cleanup...');
    await cleanupAllTempDrives();
}, 5 * 60 * 1000);

// Cleanup all running processes on application shutdown
process.on('SIGINT', async () => {
    console.log('\nCleaning up all running processes and drives...');
    
    const killPromises = [];
    for (const [socketId, processInfo] of runningProcesses.entries()) {
        killPromises.push(
            new Promise((resolve) => {
                exec(`taskkill /F /T /PID ${processInfo.pid}`, (err) => {
                    if (err) {
                        console.error(`Failed to kill process ${processInfo.pid}:`, err.message);
                    } else {
                        console.log(`Killed process ${processInfo.pid} for socket ${socketId}`);
                    }
                    resolve();
                });
            })
        );
    }
    
    await Promise.all(killPromises);
    
    // Final cleanup
    await cleanupAllTempDrives();
    
    console.log('Cleanup complete. Exiting...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nCleaning up all running processes and drives...');
    
    const killPromises = [];
    for (const [socketId, processInfo] of runningProcesses.entries()) {
        killPromises.push(
            new Promise((resolve) => {
                exec(`taskkill /F /T /PID ${processInfo.pid}`, (err) => {
                    if (err) {
                        console.error(`Failed to kill process ${processInfo.pid}:`, err.message);
                    } else {
                        console.log(`Killed process ${processInfo.pid} for socket ${socketId}`);
                    }
                    resolve();
                });
            })
        );
    }
    
    await Promise.all(killPromises);
    
    // Final cleanup
    await cleanupAllTempDrives();
    
    console.log('Cleanup complete. Exiting...');
    process.exit(0);
});

module.exports = {
    handleTerminalConnection
};
