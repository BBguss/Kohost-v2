// Debug script untuk cek storage
require('./loadEnv').loadEnv();
const { STORAGE_ROOT } = require('./config/paths');
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const calculateDirSize = (dirPath) => {
    let totalSize = 0;
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            const itemPath = path.join(dirPath, item.name);
            const stats = fs.lstatSync(itemPath);
            if (stats.isSymbolicLink()) continue;
            if (item.isDirectory()) {
                totalSize += calculateDirSize(itemPath);
            } else {
                totalSize += stats.size;
            }
        }
    } catch (e) {
        console.warn(`Could not read: ${dirPath}`, e.message);
    }
    return totalSize;
};

async function debug() {
    console.log('==========================================');
    console.log('STORAGE DEBUG');
    console.log('==========================================');
    console.log('STORAGE_ROOT:', STORAGE_ROOT);
    console.log('');

    if (!fs.existsSync(STORAGE_ROOT)) {
        console.log('❌ STORAGE_ROOT does not exist!');
        process.exit(1);
    }

    console.log('📁 Contents of STORAGE_ROOT:');
    const items = fs.readdirSync(STORAGE_ROOT);
    items.forEach(item => {
        const itemPath = path.join(STORAGE_ROOT, item);
        const stats = fs.statSync(itemPath);
        if (stats.isDirectory()) {
            const size = calculateDirSize(itemPath);
            console.log(`  📂 ${item}: ${(size / 1024 / 1024).toFixed(2)} MB`);

            // List subdirectories (sites)
            const subItems = fs.readdirSync(itemPath);
            subItems.forEach(subItem => {
                const subPath = path.join(itemPath, subItem);
                if (fs.statSync(subPath).isDirectory()) {
                    const subSize = calculateDirSize(subPath);
                    console.log(`      📂 ${subItem}: ${(subSize / 1024 / 1024).toFixed(2)} MB`);
                }
            });
        }
    });

    console.log('');
    console.log('📊 Sites from Database:');
    const [sites] = await pool.execute('SELECT id, name, user_id, storage_used FROM sites LIMIT 10');
    for (const site of sites) {
        const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [site.user_id]);
        const username = users[0]?.username || 'unknown';
        const siteDir = path.join(STORAGE_ROOT, username, site.name);
        const actualSize = fs.existsSync(siteDir) ? calculateDirSize(siteDir) : 0;
        console.log(`  Site: ${site.name}`);
        console.log(`    User: ${username}`);
        console.log(`    Path: ${siteDir}`);
        console.log(`    Exists: ${fs.existsSync(siteDir)}`);
        console.log(`    DB Storage: ${site.storage_used?.toFixed(2) || 0} MB`);
        console.log(`    Actual Size: ${(actualSize / 1024 / 1024).toFixed(2)} MB`);
        console.log('');
    }

    pool.end();
}

debug().catch(console.error);
