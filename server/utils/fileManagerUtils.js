/**
 * ============================================
 * FILE MANAGER UTILITIES
 * ============================================
 * 
 * Utility functions untuk file manager:
 * - Path security validation
 * - Extension whitelist/blacklist
 * - File type detection
 */

const path = require('path');
const fs = require('fs');

// ============================================
// EXTENSION CONFIGURATION
// ============================================

// Extensions yang BOLEH diedit (text files)
const EDITABLE_EXTENSIONS = [
    '.html', '.htm', '.css', '.scss', '.sass', '.less',
    '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
    '.json', '.xml', '.yaml', '.yml',
    '.md', '.markdown', '.txt', '.text',
    '.php', '.py', '.rb', '.java', '.c', '.cpp', '.h',
    '.sql', '.sh', '.bash', '.zsh', '.ps1',
    '.conf', '.config', '.ini', '.cfg',
    '.htaccess', '.gitignore', '.npmrc',
    '.editorconfig', '.prettierrc', '.eslintrc'
];

// Extensions yang DILARANG (binary & sensitive)
const BLOCKED_EXTENSIONS = [
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
    '.exe', '.dll', '.so', '.bin', '.msi',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
    '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.wav', '.flac',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.env', '.env.local', '.env.production', '.env.development',
    '.pem', '.key', '.crt', '.p12'
];

// ============================================
// FRAMEWORK-SPECIFIC EXTENSION WHITELIST
// ============================================
// SOURCE OF TRUTH - Whitelist-only approach (no blacklist)
// Hanya file TEXT yang boleh diedit via editor

const FRAMEWORK_EXTENSIONS = {
    // Laravel Framework
    laravel: [
        '.php',
        '.blade.php',
        '.env.example',
        '.json',
        '.js',
        '.css',
        '.scss',
        '.md',
        '.yml',
        '.yaml',
        '.xml',
        '.txt'
    ],

    // Node.js Backend
    nodejs: [
        '.js',
        '.mjs',
        '.cjs',
        '.json',
        '.env.example',
        '.ts',
        '.md',
        '.yml',
        '.yaml',
        '.txt'
    ],

    // Next.js Framework
    nextjs: [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.json',
        '.css',
        '.scss',
        '.md',
        '.mdx',
        '.env.example',
        '.txt'
    ],

    // React (CRA, Vite, etc)
    react: [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.json',
        '.css',
        '.scss',
        '.md',
        '.txt'
    ],

    // PHP Native (no framework)
    php_native: [
        '.php',
        '.html',
        '.css',
        '.js',
        '.json',
        '.md',
        '.txt',
        '.xml'
    ],

    // HTML Static Site
    html_static: [
        '.html',
        '.css',
        '.js',
        '.json',
        '.md',
        '.txt'
    ]
};

// Extensions yang WAJIB ditolak (global) - tidak boleh diedit apapun frameworknya
const GLOBALLY_BLOCKED_EXTENSIONS = [
    '.env',
    '.log',
    '.zip',
    '.rar',
    '.exe',
    '.bin',
    '.dll',
    '.so',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.mp4',
    '.pdf'
];

// Framework name aliases (normalize different naming conventions)
const FRAMEWORK_ALIASES = {
    // Laravel
    'Laravel': 'laravel',
    'LARAVEL': 'laravel',

    // Node.js
    'Node.js': 'nodejs',
    'node': 'nodejs',
    'NODE': 'nodejs',
    'express': 'nodejs',
    'Express': 'nodejs',

    // Next.js
    'Next.js': 'nextjs',
    'next': 'nextjs',
    'NEXT': 'nextjs',
    'NextJS': 'nextjs',

    // React
    'React': 'react',
    'REACT': 'react',
    'react-vite': 'react',
    'create-react-app': 'react',
    'CRA': 'react',
    'Vite': 'react',

    // PHP Native
    'PHP': 'php_native',
    'php': 'php_native',
    'PHP Native': 'php_native',

    // HTML Static
    'HTML': 'html_static',
    'html': 'html_static',
    'static': 'html_static',
    'HTML Static': 'html_static'
};

// ============================================
// PATH SECURITY FUNCTIONS
// ============================================

/**
 * Validates that a path is safe and within the allowed base path
 * @param {string} basePath - The root path (user's site directory)
 * @param {string} userPath - The relative path from user input
 * @returns {Object} - { valid: boolean, resolvedPath: string, error?: string }
 */
const validatePath = (basePath, userPath) => {
    try {
        // Normalize and clean the user path
        const cleanUserPath = (userPath || '')
            .replace(/\\/g, '/') // Normalize backslashes
            .replace(/^\/+/, '') // Remove leading slashes
            .replace(/\.\.+/g, '') // Remove .. patterns
            .trim();

        // Resolve the full path
        const resolvedPath = path.resolve(basePath, cleanUserPath);

        // Security check: must start with base path
        if (!resolvedPath.startsWith(path.resolve(basePath))) {
            return {
                valid: false,
                resolvedPath: null,
                error: 'FORBIDDEN_PATH',
                message: 'Access denied: path traversal detected'
            };
        }

        // Check for symbolic links (if path exists)
        if (fs.existsSync(resolvedPath)) {
            try {
                const stats = fs.lstatSync(resolvedPath);
                if (stats.isSymbolicLink()) {
                    return {
                        valid: false,
                        resolvedPath: null,
                        error: 'FORBIDDEN_PATH',
                        message: 'Access denied: symbolic links not allowed'
                    };
                }
            } catch (e) {
                // Ignore stat errors, will be caught later
            }
        }

        return {
            valid: true,
            resolvedPath,
            relativePath: cleanUserPath
        };

    } catch (error) {
        return {
            valid: false,
            resolvedPath: null,
            error: 'FORBIDDEN_PATH',
            message: 'Invalid path'
        };
    }
};

/**
 * Check if a file extension is editable (text file)
 * @param {string} filename - Filename with extension
 * @returns {boolean}
 */
const isEditableFile = (filename) => {
    const ext = path.extname(filename).toLowerCase();

    // Files without extension - allow (e.g., Makefile, Dockerfile)
    if (!ext) {
        const noExtAllowed = ['makefile', 'dockerfile', 'jenkinsfile', 'vagrantfile', 'readme', 'license', 'changelog'];
        return noExtAllowed.includes(filename.toLowerCase());
    }

    return EDITABLE_EXTENSIONS.includes(ext);
};

/**
 * Check if a file extension is blocked (binary/sensitive)
 * @param {string} filename - Filename with extension
 * @returns {boolean}
 */
const isBlockedFile = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return BLOCKED_EXTENSIONS.includes(ext);
};

/**
 * Validate file extension for editing operations
 * @param {string} filename - Filename to validate
 * @returns {Object} - { valid: boolean, error?: string }
 */
const validateFileExtension = (filename) => {
    if (isBlockedFile(filename)) {
        return {
            valid: false,
            error: 'INVALID_FILE_TYPE',
            message: `File type not allowed: ${path.extname(filename)}`
        };
    }

    if (!isEditableFile(filename)) {
        return {
            valid: false,
            error: 'INVALID_FILE_TYPE',
            message: `File type not editable: ${path.extname(filename)}`
        };
    }

    return { valid: true };
};

/**
 * Sanitize filename to prevent path injection
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
const sanitizeFilename = (filename) => {
    return filename
        .replace(/[\/\\:*?"<>|]/g, '_') // Replace invalid characters
        .replace(/\.\./g, '') // Remove .. patterns
        .replace(/^\.+/, '') // Remove leading dots (hidden files on Unix)
        .trim()
        .substring(0, 255); // Max filename length
};

/**
 * Get file type category for UI display
 * @param {string} filename - Filename
 * @returns {string} - File type category
 */
const getFileType = (filename) => {
    const ext = path.extname(filename).toLowerCase();

    const typeMap = {
        '.html': 'html', '.htm': 'html',
        '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
        '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
        '.ts': 'typescript', '.tsx': 'typescript',
        '.json': 'json',
        '.md': 'markdown', '.markdown': 'markdown',
        '.xml': 'xml',
        '.yaml': 'yaml', '.yml': 'yaml',
        '.php': 'php',
        '.py': 'python',
        '.sql': 'sql',
        '.sh': 'shell', '.bash': 'shell',
        '.txt': 'text',
        '.vue': 'vue',
        '.svelte': 'svelte'
    };

    return typeMap[ext] || 'text';
};

// ============================================
// FRAMEWORK-AWARE EXTENSION VALIDATION
// ============================================

/**
 * Normalize framework name to internal key
 * @param {string} framework - Framework name from database
 * @returns {string} - Normalized framework key
 */
const normalizeFramework = (framework) => {
    if (!framework) return 'default';

    // Check aliases first
    const normalized = FRAMEWORK_ALIASES[framework];
    if (normalized) return normalized;

    // Check if it's already a valid key
    const lowerFramework = framework.toLowerCase();
    if (FRAMEWORK_EXTENSIONS[lowerFramework]) return lowerFramework;

    return 'default';
};

/**
 * Get allowed extensions for a framework
 * @param {string} framework - Framework name
 * @returns {string[]} - Array of allowed extensions
 */
const getFrameworkExtensions = (framework) => {
    const normalizedFramework = normalizeFramework(framework);
    return FRAMEWORK_EXTENSIONS[normalizedFramework] || FRAMEWORK_EXTENSIONS.html_static;
};

/**
 * Check if filename has dangerous double-extension pattern
 * Example: file.php.jpg, script.js.png
 * @param {string} filename - Filename to check
 * @returns {boolean} - true if dangerous
 */
const hasDangerousDoubleExtension = (filename) => {
    const lowerFilename = filename.toLowerCase();
    const dangerousPatterns = [
        '.php.', '.js.', '.ts.', '.jsx.', '.tsx.',
        '.html.', '.htm.', '.css.', '.scss.',
        '.py.', '.rb.', '.java.', '.sh.',
        '.env.', '.sql.'
    ];

    for (const pattern of dangerousPatterns) {
        if (lowerFilename.includes(pattern)) {
            // Check if pattern is followed by another extension
            const idx = lowerFilename.indexOf(pattern);
            const afterPattern = lowerFilename.substring(idx + pattern.length);
            // If there's still a . in the remaining string, it's double-extension
            if (afterPattern.includes('.') || afterPattern.length > 0) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Check if extension is globally blocked
 * @param {string} ext - Extension with dot (e.g., '.env')
 * @returns {boolean}
 */
const isGloballyBlocked = (ext) => {
    return GLOBALLY_BLOCKED_EXTENSIONS.includes(ext.toLowerCase());
};

/**
 * Validate file extension for a specific framework (FRAMEWORK-AWARE)
 * 
 * LOGIKA:
 * 1. Case-insensitive validation
 * 2. Double-extension berbahaya → TOLAK
 * 3. Globally blocked extensions → TOLAK
 * 4. Extension tidak di whitelist framework → TOLAK
 * 5. Lolos semua → AMAN untuk editor
 * 
 * @param {string} filename - Filename to validate
 * @param {string} framework - Framework name from database
 * @returns {Object} - { valid: boolean, framework: string, error: string|null, message: string }
 */
const validateExtensionForFramework = (filename, framework) => {
    const lowerFilename = filename.toLowerCase();
    const normalizedFramework = normalizeFramework(framework);
    const allowedExtensions = getFrameworkExtensions(normalizedFramework);

    // 1. Check for dangerous double-extension (e.g., file.php.jpg)
    if (hasDangerousDoubleExtension(filename)) {
        return {
            valid: false,
            framework: normalizedFramework,
            error: 'INVALID_FILE_TYPE',
            message: `Double extension detected: "${filename}". This pattern is not allowed.`
        };
    }

    // 2. Get file extension (case-insensitive)
    let ext = path.extname(lowerFilename);

    // 3. Special handling for .blade.php (Laravel)
    if (normalizedFramework === 'laravel' && lowerFilename.endsWith('.blade.php')) {
        if (allowedExtensions.includes('.blade.php')) {
            return {
                valid: true,
                framework: normalizedFramework,
                error: null,
                message: 'Valid Laravel Blade template'
            };
        }
    }

    // 4. Special handling for .env.example
    if (lowerFilename.endsWith('.env.example')) {
        if (allowedExtensions.includes('.env.example')) {
            return {
                valid: true,
                framework: normalizedFramework,
                error: null,
                message: 'Valid environment example file'
            };
        }
    }

    // 5. Check globally blocked extensions
    if (isGloballyBlocked(ext)) {
        return {
            valid: false,
            framework: normalizedFramework,
            error: 'INVALID_FILE_TYPE',
            message: `Extension "${ext}" is globally blocked and cannot be edited.`
        };
    }

    // 6. Files without extension are not allowed
    if (!ext) {
        return {
            valid: false,
            framework: normalizedFramework,
            error: 'INVALID_FILE_TYPE',
            message: 'Files without extension are not allowed for editing.'
        };
    }

    // 7. Check if extension is in framework whitelist (case-insensitive)
    const isAllowed = allowedExtensions.some(allowed => allowed.toLowerCase() === ext);

    if (!isAllowed) {
        return {
            valid: false,
            framework: normalizedFramework,
            error: 'INVALID_FILE_TYPE',
            message: `Extension "${ext}" is not allowed for ${normalizedFramework} projects. Allowed: ${allowedExtensions.join(', ')}`
        };
    }

    // 8. All checks passed - file is safe for editor
    return {
        valid: true,
        framework: normalizedFramework,
        error: null,
        message: `Valid ${ext} file for ${normalizedFramework}`
    };
};

/**
 * Check if file is editable for a specific framework
 * @param {string} filename - Filename
 * @param {string} framework - Framework name
 * @returns {boolean}
 */
const isEditableForFramework = (filename, framework) => {
    const result = validateExtensionForFramework(filename, framework);
    return result.valid;
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Path security
    validatePath,
    sanitizeFilename,

    // Extension validation (generic)
    isEditableFile,
    isBlockedFile,
    validateFileExtension,
    getFileType,

    // Framework-aware validation (RECOMMENDED)
    validateExtensionForFramework,
    isEditableForFramework,
    getFrameworkExtensions,
    normalizeFramework,

    // Constants
    EDITABLE_EXTENSIONS,
    BLOCKED_EXTENSIONS,
    FRAMEWORK_EXTENSIONS,
    FRAMEWORK_ALIASES
};
