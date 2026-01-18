
const fs = require('fs');
const path = require('path');
const os = require('os');
const pool = require('../db'); 
const { STORAGE_ROOT, SSH_ROOT_PATH } = require('../config/paths');

const ensureWritableDirSync = (dirPath, isRemote = false) => {
    try {
        if (!dirPath) return;

        if (fs.existsSync(dirPath)) {
            const stats = fs.statSync(dirPath);
            if (stats.isFile()) {
                // If it's a file (e.g. httpd-vhosts.conf), check if we can write to its parent dir
                // or just check if the file itself is writable
                try {
                    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
                    return; // File exists and is accessible, stop here.
                } catch (accessErr) {
                    console.error(`[storage] File '${dirPath}' exists but is not writable.`);
                    throw accessErr;
                }
            }
        } else {
            // Path doesn't exist, assume it's a directory we need to create
            // (Unless it looks like a file extension, but we assume dirs for new paths)
            fs.mkdirSync(dirPath, { recursive: true });
        }

        if (isRemote) return;
        
        // Only run the write test if it is a DIRECTORY
        const stats = fs.statSync(dirPath);
        if (stats.isDirectory()) {
            const probe = path.join(dirPath, `.write_test_${Date.now()}_${Math.random().toString(16).slice(2)}`);
            fs.writeFileSync(probe, 'ok');
            fs.unlinkSync(probe);
        }
    } catch (e) {
        // Don't crash the app, just log warning
        console.warn(`[storage] Warning: Could not verify access to ${dirPath}. Error: ${e.message}`);
    }
};

const getSafePath = async (userId, siteName, relativePath) => {
    const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return null;
    const username = users[0].username;

    const userDir = path.join(STORAGE_ROOT, username);
    const siteDir = path.join(userDir, siteName);
    // Remove leading slashes to prevent root traversal from join
    const safeRel = (relativePath || '/').replace(/^(\/|\\)+/, '');
    const safePath = path.resolve(siteDir, safeRel); 

    // Prevent directory traversal out of siteDir
    if (!safePath.startsWith(siteDir)) return null;
    
    // Construct SSH Path (Remote Linux path mapping)
    const sshPath = `${SSH_ROOT_PATH}/${username}/${siteName}`;
    
    return { fullPath: safePath, siteDir, userDir, sshPath };
};

const getCpuUsage = async () => {
    const startUsage = os.cpus().map(cpu => cpu.times);
    await new Promise(resolve => setTimeout(resolve, 100));
    const endUsage = os.cpus().map(cpu => cpu.times);
    
    let totalIdle = 0, totalTick = 0;
    startUsage.forEach((start, i) => {
        const end = endUsage[i];
        const idle = end.idle - start.idle;
        const total = (end.user + end.nice + end.sys + end.irq + end.idle) - 
                      (start.user + start.nice + start.sys + start.irq + start.idle);
        totalIdle += idle;
        totalTick += total;
    });
    
    const percentage = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 0;
    return percentage.toFixed(1);
};

module.exports = {
    ensureWritableDirSync,
    getSafePath,
    getCpuUsage
};
