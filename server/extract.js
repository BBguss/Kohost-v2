const AdmZip = require('adm-zip');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

/**
 * Extracts a ZIP buffer to a target directory manually using parallel processing for speed.
 * Bypasses automatic chmod to support UNC paths.
 * 
 * @param {Buffer} buffer - The zip file buffer.
 * @param {string} destination - The target directory path.
 * @returns {Promise<void>}
 */
const extractZip = async (buffer, destination) => {
    try {
        console.log(`[Extract] Starting fast extraction to: ${destination}`);

        if (!Buffer.isBuffer(buffer)) {
            throw new Error('Input is not a valid buffer.');
        }

        // Ensure destination exists
        if (!fs.existsSync(destination)) {
            await fsp.mkdir(destination, { recursive: true });
        }

        // Load zip (AdmZip is synchronous in parsing headers, which is fast enough)
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();

        if (!entries || entries.length === 0) {
            throw new Error('Zip archive is empty or invalid header.');
        }

        // 1. Separate Folders and Files to process Folders FIRST
        // This prevents race conditions where a file tries to write to a folder that isn't created yet
        const folderEntries = [];
        const fileEntries = [];

        entries.forEach(entry => {
            if (entry.entryName.includes('..')) return; // Security check
            
            if (entry.isDirectory) {
                folderEntries.push(entry);
            } else {
                fileEntries.push(entry);
            }
        });

        // 2. Create all directories sequentially (fast operation)
        // We use a Set to avoid redundant mkdir calls for nested paths handled by recursive:true
        const createdDirs = new Set();
        
        // Ensure destination is in set
        createdDirs.add(path.resolve(destination));

        for (const entry of folderEntries) {
            const safeEntryName = path.normalize(entry.entryName).replace(/^(\.\.(\/|\\|$))+/, '');
            const destPath = path.join(destination, safeEntryName);
            
            if (!createdDirs.has(destPath)) {
                // Synchronous mkdir is safer for structure creation to guarantee existence before file writes
                if (!fs.existsSync(destPath)) {
                    fs.mkdirSync(destPath, { recursive: true });
                }
                createdDirs.add(destPath);
            }
        }

        // Ensure parent dirs for files exist (in case zip didn't have explicit folder entries)
        for (const entry of fileEntries) {
            const safeEntryName = path.normalize(entry.entryName).replace(/^(\.\.(\/|\\|$))+/, '');
            const destPath = path.join(destination, safeEntryName);
            const parentDir = path.dirname(destPath);
            
            if (!createdDirs.has(parentDir)) {
                if (!fs.existsSync(parentDir)) {
                    fs.mkdirSync(parentDir, { recursive: true });
                }
                createdDirs.add(parentDir);
            }
        }

        // 3. Process Files in Batches (Parallelism)
        // Extracting all at once causes EMFILE (too many open files) or memory spikes.
        // Batch size of 20-50 is usually optimal for network shares (UNC).
        const BATCH_SIZE = 50; 
        
        for (let i = 0; i < fileEntries.length; i += BATCH_SIZE) {
            const batch = fileEntries.slice(i, i + BATCH_SIZE);
            
            // Write files in parallel within the batch
            await Promise.all(batch.map(async (entry) => {
                const safeEntryName = path.normalize(entry.entryName).replace(/^(\.\.(\/|\\|$))+/, '');
                const destPath = path.join(destination, safeEntryName);
                
                // getData() is synchronous (CPU bound), writeFile is async (IO bound)
                // We await the IO part to let the event loop handle other tasks
                const data = entry.getData(); 
                await fsp.writeFile(destPath, data);
            }));
        }
        
        console.log(`[Extract] Successfully extracted ${entries.length} items.`);
        
    } catch (error) {
        console.error('[Extract] Critical Error:', error);
        const msg = error.message.includes('Invalid filename') 
            ? 'Invalid encoding or filename in zip.' 
            : error.message;
        throw new Error('Failed to extract zip file: ' + msg);
    }
};

module.exports = { extractZip };