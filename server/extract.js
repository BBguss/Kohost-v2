
const AdmZip = require('adm-zip');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { cpus } = require('os');

/**
 * Ultra-fast parallel extraction with optimizations for network drives
 * Added onProgress callback support
 */
const extractZip = async (buffer, destination, onProgress = null) => {
    try {
        console.log(`[Extract] Starting extraction to: ${destination}`);

        if (!Buffer.isBuffer(buffer)) {
            throw new Error('Input is not a valid buffer.');
        }

        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();

        if (!entries || entries.length === 0) {
            throw new Error('Zip archive is empty or invalid header.');
        }

        const totalEntries = entries.length;
        let processedCount = 0;

        // Pre-process ALL entries once (avoid repeated normalize calls)
        const processedEntries = entries
            .filter(e => !e.entryName.includes('..')) // Security check
            .map(entry => {
                const safeName = path.normalize(entry.entryName).replace(/^(\.\.(\/|\\|$))+/, '');
                const destPath = path.join(destination, safeName);
                return {
                    entry,
                    destPath,
                    isDirectory: entry.isDirectory,
                    parentDir: path.dirname(destPath)
                };
            });

        // Separate folders and files
        const folders = processedEntries.filter(e => e.isDirectory);
        const files = processedEntries.filter(e => !e.isDirectory);

        // Collect all unique directories (including parent dirs of files)
        const allDirs = new Set([destination]);
        
        folders.forEach(f => allDirs.add(f.destPath));
        files.forEach(f => allDirs.add(f.parentDir));

        // Create ALL directories in parallel (MUCH faster than sequential)
        await Promise.all(
            Array.from(allDirs).map(dir => 
                fsp.mkdir(dir, { recursive: true }).catch(() => {}) // Ignore if exists
            )
        );

        // Aggressive parallelism based on CPU cores
        const isUNCPath = destination.startsWith('\\\\') || destination.startsWith('//');
        const BATCH_SIZE = isUNCPath 
            ? Math.max(cpus().length * 2, 10)
            : Math.max(cpus().length * 4, 20);

        console.log(`[Extract] Using batch size: ${BATCH_SIZE} (${files.length} files)`);

        // Process files in batches WITHOUT delays
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            
            await Promise.all(batch.map(async ({ entry, destPath }) => {
                const data = entry.getData();
                try {
                    await fsp.writeFile(destPath, data);
                } catch (err) {
                    if (err.code === 'UNKNOWN' || err.errno === -4094) {
                        fs.writeFileSync(destPath, data);
                    } else {
                        throw err;
                    }
                }
            }));

            // Update Progress Realtime
            processedCount += batch.length;
            if (onProgress) {
                const percent = Math.round((processedCount / files.length) * 100);
                onProgress(percent);
            }
        }
        
        console.log(`[Extract] ✓ Extracted ${entries.length} items`);
        
    } catch (error) {
        console.error('[Extract] Error:', error.message);
        throw new Error('Failed to extract: ' + error.message);
    }
};

module.exports = { extractZip };
