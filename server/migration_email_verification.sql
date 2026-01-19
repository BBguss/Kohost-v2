-- ============================================
-- MIGRATION: Add Email Verification Support
-- ============================================
-- File ini menambahkan kolom dan tabel yang diperlukan untuk fitur verifikasi email
-- Jalankan dengan: mysql -u root -p kohost_v2 < migration_email_verification.sql

-- ============================================
-- 1. TAMBAH KOLOM email_verified DI TABEL USERS
-- ============================================
-- Kolom ini menandakan apakah email user sudah diverifikasi
-- - 0 (FALSE) = email belum diverifikasi
-- - 1 (TRUE) = email sudah diverifikasi
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- ============================================
-- 2. BUAT TABEL email_verifications
-- ============================================
-- Tabel ini menyimpan token verifikasi email yang dikirim ke user
-- Token ini akan digunakan untuk memverifikasi email user
CREATE TABLE IF NOT EXISTS email_verifications (
  -- id: primary key auto increment
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- user_id: foreign key ke tabel users
  user_id VARCHAR(50) NOT NULL,
  
  -- token: kode unik yang dikirim ke email user
  -- User akan mengklik link yang berisi token ini untuk verifikasi
  token VARCHAR(255) NOT NULL UNIQUE,
  
  -- expires_at: waktu kadaluarsa token (default: 24 jam)
  -- Setelah waktu ini, token tidak bisa digunakan lagi
  expires_at DATETIME NOT NULL,
  
  -- created_at: waktu pembuatan token
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- is_used: menandakan apakah token sudah digunakan
  -- 0 = belum digunakan, 1 = sudah digunakan
  is_used BOOLEAN DEFAULT FALSE,
  
  -- Foreign key constraint
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  
  -- Index untuk mempercepat pencarian berdasarkan token
  INDEX idx_token (token),
  
  -- Index untuk mempercepat pencarian berdasarkan user_id
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. BUAT TABEL password_resets (Bonus)
-- ============================================
-- Tabel ini untuk menyimpan token reset password
CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_used BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
