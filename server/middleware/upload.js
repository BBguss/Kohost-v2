/**
 * MULTER UPLOAD MIDDLEWARE
 * ========================
 * Menggunakan diskStorage untuk upload stream-based (bukan memory).
 * File disimpan sementara di temp folder sebelum diproses.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Temp directory untuk uploaded files
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'kohost-uploads');

// Ensure temp directory exists
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

// Disk storage configuration - file disimpan ke disk bukan memory
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp_random_originalname
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${uniqueSuffix}_${sanitizedName}`);
  }
});

// File filter untuk validasi
const fileFilter = (req, file, cb) => {
  // Allow all files for now, validation akan dilakukan di controller
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit per file
    files: 1 // Max 1 file per request
  }
});

// Export temp dir juga untuk cleanup purposes
module.exports = upload;
module.exports.UPLOAD_TEMP_DIR = UPLOAD_TEMP_DIR;
