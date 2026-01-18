
// server/controllers/terminalController.js
const { spawn } = require('child_process');
const { Client } = require('ssh2');
const path = require('path');
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

// Command whitelist configuration
// IMPORTANT: These must match or be prefixes of commands defined in frontend constants.ts
const ALLOWED_COMMANDS = {
    // Database commands (Windows - via PHP_BINARY)
    windows: [
        'php artisan migrate',
        'php artisan migrate:fresh',
        'php artisan migrate:rollback',
        'php artisan migrate:reset',
        'php artisan migrate:status',
        'php artisan db:seed',
        'php artisan tinker'
    ],
    // File/dependency commands (SSH - Synology/Linux)
    ssh: [
        // PHP / Composer
        '/usr/local/bin/php82 /usr/local/bin/composer install',
        '/usr/local/bin/php82 /usr/local/bin/composer update',
        'composer install',
        'composer update',
        
        // NPM / Node (Handling path exports)
        'export PATH=/usr/local/bin:$PATH && npm install',
        'export PATH=/usr/local/bin:$PATH && npm run build',
        'npm install',
        'npm run build',
        'npm run dev',
        'npm start',
        
        // Laravel Artisan (Full path version for SSH)
        '/usr/local/bin/php82 artisan storage:link',
        '/usr/local/bin/php82 artisan cache:clear',
        '/usr/local/bin/php82 artisan config:cache',
        '/usr/local/bin/php82 artisan route:cache',
        '/usr/local/bin/php82 artisan view:clear',
        'php artisan storage:link',
        
        // Git / Utils
        'git pull',
        'git status',
        'ls',
        'pwd',
        'cat'
    ]
};

function getCommandType(command) {
    const trimmed = command.trim();
    
    // Check Windows commands first (DB related)
    if (ALLOWED_COMMANDS.windows.some(cmd => trimmed.startsWith(cmd))) {
        return 'windows';
    }
    
    // Check SSH commands
    // We check if the incoming command STARTS with any of our allowed prefixes
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

async function executeWindowsCommand(socket, command, site, user) {
    return new Promise((resolve, reject) => {
        // Path di Windows (UNC atau Local): \\100.90.80.70\web\project\kohost_users\username\sitename
        const projectPath = path.join(STORAGE_ROOT, user.username, site.name); 
        
        // HIDE PATH: Send generic info instead of raw path
        socket.emit('command_output', {
            type: 'info',
            data: `[Windows] Environment Ready. Executing...\n`
        });
        
        // Parse command - replace 'php' with PHP_BINARY path
        let fullCommand = command.replace(/^php\s/, `"${PHP_BINARY}" `);
        
        // Execute via cmd.exe
        // BUG FIX: Renamed variable from 'process' to 'cmdProcess' to avoid shadowing global process
        const cmdProcess = spawn('cmd.exe', ['/c', fullCommand], {
            cwd: projectPath,
            shell: true,
            env: {
                ...process.env,
                // Add PHP to PATH jika belum ada
                PATH: `${path.dirname(PHP_BINARY)};${process.env.PATH}`
            }
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
        cmdProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code ${code}`));
            }
        });
        
        // Handle errors
        cmdProcess.on('error', (error) => {
            reject(error);
        });
        
        // Timeout protection (5 minutes)
        const timeout = setTimeout(() => {
            cmdProcess.kill();
            reject(new Error('Command timeout (5 minutes)'));
        }, 300000);
        
        cmdProcess.on('close', () => clearTimeout(timeout));
    });
}

async function executeSSHCommand(socket, command, site, user) {
    return new Promise((resolve, reject) => {
        // SSH ke Synology/Linux
        const sshConfig = {
            host: SSH_HOST,
            port: SSH_PORT,
            username: SSH_USER,
            password: SSH_PASSWORD
        };
        
        const conn = new Client();
        
        conn.on('ready', () => {
            // Path di Linux: /volume1/web/project/kohost_users/username/sitename
            // Use site.name as folder name
            const workingDir = path.posix.join(SSH_ROOT_PATH, user.username, site.name);
            
            const fullCommand = `cd "${workingDir}" && ${command}`;
            
            // HIDE PATH & IP: Send generic secure info
            socket.emit('command_output', {
                type: 'info',
                data: `[SSH] Establishing secure connection to node...\n`
            });
            socket.emit('command_output', {
                type: 'info',
                data: `[SSH] Environment: ${site.framework} Container\n`
            });
            
            conn.exec(fullCommand, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }
                
                // Stream stdout
                stream.on('data', (data) => {
                    socket.emit('command_output', {
                        type: 'stdout',
                        data: data.toString()
                    });
                });
                
                // Stream stderr
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
        
        // Timeout untuk SSH connection
        setTimeout(() => {
            if (!conn._sock || !conn._sock.readable) {
                // Only reject if not connected
                // reject(new Error('SSH connection timeout'));
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
            // Validate command
            if (!command || !command.trim()) {
                socket.emit('command_error', {
                    error: 'Empty command'
                });
                return;
            }
            
            // Get command type
            commandType = getCommandType(command);
            
            if (!commandType) {
                socket.emit('command_error', {
                    error: 'Command not allowed. Only whitelisted commands are permitted.\n' +
                           'Allowed: php artisan, composer, npm, git, etc.'
                });
                return;
            }
            
            // Get site and user info
            const site = await getSiteInfo(siteId, socketUser.id);
            const user = await getUserInfo(socketUser.id);
            
            // Emit started event
            socket.emit('command_started', { 
                command,
                type: commandType,
                site: site.name
            });
            
            // Execute command based on type
            if (commandType === 'windows') {
                await executeWindowsCommand(socket, command, site, user);
            } else if (commandType === 'ssh') {
                await executeSSHCommand(socket, command, site, user);
            }
            
            // Log success
            await logCommand(socketUser.id, siteId, command, commandType, 'success');
            
            // Emit completion
            socket.emit('command_completed', {
                command,
                type: commandType,
                status: 'success'
            });
            
        } catch (error) {
            console.error('Command execution error:', error);
            
            // Log error
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
}

module.exports = {
    handleTerminalConnection
};
