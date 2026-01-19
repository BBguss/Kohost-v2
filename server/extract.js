/**
 * ============================================
 * STREAM-BASED ZIP EXTRACTION
 * ============================================
 * 
 * Menggunakan unzipper untuk extract ZIP secara stream-based.
 * Tidak membaca ZIP ke memory - langsung stream dari disk.
 * 
 * Security:
 * - Path traversal protection (../)
 * - File count limit
 * - Total size limit
 * - User isolation via destination check
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const unzipper = require('unzipper');

// Default limits
const DEFAULT_MAX_FILES = 1000;
const DEFAULT_MAX_SIZE_MB = 100; // 100MB total extracted size

/**
 * Validates that a path is safe (no directory traversal)
 * @param {string} entryPath - Path dari ZIP entry
 * @param {string} destRoot - Root destination folder
 * @returns {boolean} - true if safe
 */
const isPathSafe = (entryPath, destRoot) => {
    // Normalize and resolve the full path
    const normalizedEntry = path.normalize(entryPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.resolve(destRoot, normalizedEntry);

    // Check if path stays within destination root
    return fullPath.startsWith(path.resolve(destRoot));
};

/**
 * Extracts a ZIP file using streams (not memory buffer)
 * 
 * @param {string} zipFilePath - Path to the ZIP file on disk
 * @param {string} destination - Target extraction directory
 * @param {Object} options - Optional limits
 * @param {number} options.maxFiles - Max number of files allowed
 * @param {number} options.maxSizeMB - Max total extracted size in MB
 * @returns {Promise<Object>} - Extraction result
 */
const extractZipStream = async (zipFilePath, destination, options = {}) => {
    const maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
    const maxSizeBytes = (options.maxSizeMB || DEFAULT_MAX_SIZE_MB) * 1024 * 1024;

    console.log(`[Extract] ========================================`);
    console.log(`[Extract] 📦 Stream extraction starting...`);
    console.log(`[Extract] Source: ${zipFilePath}`);
    console.log(`[Extract] Destination: ${destination}`);
    console.log(`[Extract] Limits: ${maxFiles} files, ${options.maxSizeMB || DEFAULT_MAX_SIZE_MB}MB`);

    // Validate source file exists
    if (!fs.existsSync(zipFilePath)) {
        return {
            success: false,
            status: 'invalid_zip',
            message: 'ZIP file not found'
        };
    }

    // Ensure destination exists
    if (!fs.existsSync(destination)) {
        await fsp.mkdir(destination, { recursive: true });
    }

    let fileCount = 0;
    let totalBytes = 0;
    const extractedFiles = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(zipFilePath)
            .pipe(unzipper.Parse())
            .on('entry', async (entry) => {
                const entryPath = entry.path;
                const type = entry.type; // 'File' or 'Directory'

                // Security check: path traversal
                if (!isPathSafe(entryPath, destination)) {
                    console.warn(`[Extract] ⚠️ Blocked path traversal attempt: ${entryPath}`);
                    entry.autodrain();
                    return;
                }

                // Skip entries with dangerous names
                if (entryPath.includes('..') || entryPath.startsWith('/') || entryPath.startsWith('\\')) {
                    console.warn(`[Extract] ⚠️ Skipped dangerous entry: ${entryPath}`);
                    entry.autodrain();
                    return;
                }

                // Check file count limit
                if (fileCount >= maxFiles) {
                    console.warn(`[Extract] ⚠️ File count limit reached (${maxFiles})`);
                    entry.autodrain();
                    return;
                }

                // Construct safe destination path
                const normalizedPath = path.normalize(entryPath).replace(/^(\.\.(\/|\\|$))+/, '');
                const destPath = path.join(destination, normalizedPath);

                if (type === 'Directory') {
                    // Create directory
                    try {
                        if (!fs.existsSync(destPath)) {
                            await fsp.mkdir(destPath, { recursive: true });
                        }
                    } catch (err) {
                        console.error(`[Extract] Failed to create dir: ${destPath}`, err.message);
                    }
                    entry.autodrain();
                } else {
                    // File - stream to destination
                    fileCount++;

                    // Ensure parent directory exists
                    const parentDir = path.dirname(destPath);
                    if (!fs.existsSync(parentDir)) {
                        try {
                            fs.mkdirSync(parentDir, { recursive: true });
                        } catch (err) {
                            console.error(`[Extract] Failed to create parent: ${parentDir}`);
                        }
                    }

                    // Create write stream and pipe entry to it
                    const writeStream = fs.createWriteStream(destPath);

                    entry.on('data', (chunk) => {
                        totalBytes += chunk.length;

                        // Check size limit
                        if (totalBytes > maxSizeBytes) {
                            console.warn(`[Extract] ⚠️ Size limit exceeded`);
                            writeStream.destroy();
                            entry.autodrain();
                        }
                    });

                    entry
                        .pipe(writeStream)
                        .on('finish', () => {
                            extractedFiles.push(normalizedPath);
                        })
                        .on('error', (err) => {
                            console.error(`[Extract] Write error for ${destPath}:`, err.message);
                        });
                }
            })
            .on('close', () => {
                console.log(`[Extract] ✅ Extraction complete`);
                console.log(`[Extract] Files: ${fileCount}, Size: ${(totalBytes / 1024 / 1024).toFixed(2)}MB`);

                resolve({
                    success: true,
                    status: 'success',
                    message: `Extracted ${fileCount} files`,
                    stats: {
                        fileCount,
                        totalBytes,
                        totalMB: (totalBytes / 1024 / 1024).toFixed(2)
                    }
                });
            })
            .on('error', (err) => {
                console.error('[Extract] Stream error:', err);
                resolve({
                    success: false,
                    status: 'invalid_zip',
                    message: 'Failed to extract ZIP: ' + err.message
                });
            });
    });
};

/**
 * Legacy function - backward compatible with old buffer-based approach
 * Converts buffer to temp file then uses stream extraction
 * 
 * @deprecated Use extractZipStream with file path instead
 */
const extractZip = async (bufferOrPath, destination) => {
    console.log(`[Extract] Legacy extractZip called`);

    // If it's a buffer (old approach), write to temp file first
    if (Buffer.isBuffer(bufferOrPath)) {
        const tempPath = path.join(require('os').tmpdir(), `kohost_temp_${Date.now()}.zip`);
        await fsp.writeFile(tempPath, bufferOrPath);

        try {
            const result = await extractZipStream(tempPath, destination);
            // Clean up temp file
            await fsp.unlink(tempPath).catch(() => { });
            return result;
        } catch (err) {
            await fsp.unlink(tempPath).catch(() => { });
            throw err;
        }
    }

    // If it's a path string, use stream extraction directly
    if (typeof bufferOrPath === 'string') {
        return await extractZipStream(bufferOrPath, destination);
    }

    throw new Error('Invalid input: expected Buffer or file path');
};

module.exports = {
    extractZip,           // Legacy backward compatible
    extractZipStream,     // New stream-based (preferred)
    isPathSafe            // Exported for testing
};
