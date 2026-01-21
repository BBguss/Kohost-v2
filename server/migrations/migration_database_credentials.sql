-- ============================================
-- MIGRATION: Database User Credentials System
-- ============================================
-- Adds tables for multi-user database isolation
-- Each user gets their own MySQL credentials
-- Run this migration: mysql -u root -p kohost < migration_database_credentials.sql

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- TABLE: user_db_credentials
-- ============================================
-- Stores MySQL credentials for each hosting user
-- One MySQL user per hosting panel user

CREATE TABLE IF NOT EXISTS user_db_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,       -- FK to users table
  mysql_user VARCHAR(64) NOT NULL UNIQUE,    -- MySQL username (kohost_u_{user_id})
  mysql_password_hash VARCHAR(255) NOT NULL, -- Encrypted password (AES-256)
  max_databases INT DEFAULT 5,               -- Max databases this user can create
  max_connections INT DEFAULT 10,            -- Max concurrent MySQL connections
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_mysql_user (mysql_user),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================
-- TABLE: user_databases
-- ============================================
-- Tracks all databases owned by each user
-- Links to sites for site-specific databases

CREATE TABLE IF NOT EXISTS user_databases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,                  -- FK to users table
  site_id VARCHAR(50),                           -- Optional: link to site (can be NULL for standalone DB)
  db_name VARCHAR(64) NOT NULL,                  -- Full MySQL database name (kohost_{user_id}_{name})
  display_name VARCHAR(64) NOT NULL,             -- User-friendly name shown in UI
  db_host VARCHAR(255) DEFAULT 'localhost',      -- MySQL host (localhost or host.docker.internal)
  db_port INT DEFAULT 3306,                      -- MySQL port
  size_mb DECIMAL(10,2) DEFAULT 0,               -- Database size in MB
  tables_count INT DEFAULT 0,                    -- Number of tables
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_db_name (db_name),
  UNIQUE KEY unique_user_display (user_id, display_name),
  INDEX idx_user_id (user_id),
  INDEX idx_site_id (site_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================
-- TABLE: db_audit_logs
-- ============================================
-- Security audit trail for database operations
-- Logs all dangerous/important actions

CREATE TABLE IF NOT EXISTS db_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,                   -- CREATE_DATABASE, DROP_TABLE, IMPORT_SQL, etc.
  database_name VARCHAR(64),
  table_name VARCHAR(64),
  query_preview VARCHAR(500),                    -- First 500 chars of query (for debugging)
  rows_affected INT DEFAULT 0,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  status ENUM('success', 'failed') DEFAULT 'success',
  error_message TEXT,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_database (database_name),
  INDEX idx_executed_at (executed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================
-- TABLE: db_query_history
-- ============================================
-- Stores SQL query history for each user
-- Used for "Recent Queries" feature in SQL Editor

CREATE TABLE IF NOT EXISTS db_query_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  database_name VARCHAR(64) NOT NULL,
  query_text TEXT NOT NULL,
  query_type ENUM('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'OTHER') DEFAULT 'OTHER',
  execution_time_ms INT,                         -- Query execution time in milliseconds
  rows_returned INT DEFAULT 0,
  is_favorite BOOLEAN DEFAULT FALSE,             -- User can star favorite queries
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_database (database_name),
  INDEX idx_executed_at (executed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================
-- MIGRATION: Add mysql_user column to users if not exists
-- ============================================
-- This allows quick lookup of user's MySQL credentials

-- Note: Run this ALTER only if column doesn't exist
-- ALTER TABLE users ADD COLUMN mysql_user VARCHAR(64) AFTER status;


-- ============================================
-- SAMPLE PRIVILEGE GRANTS
-- ============================================
-- These are templates - actual grants are done by the application

-- Create panel admin user (used by Node.js backend)
-- GRANT ALL PRIVILEGES ON *.* TO 'kohost_admin'@'%' WITH GRANT OPTION;

-- Create user-specific MySQL account (template)
-- CREATE USER 'kohost_u_xxx'@'%' IDENTIFIED BY 'random_password';
-- GRANT ALL PRIVILEGES ON `kohost_xxx_%`.* TO 'kohost_u_xxx'@'%';
-- FLUSH PRIVILEGES;


SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify migration success:

-- SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '%db%';
-- DESCRIBE user_db_credentials;
-- DESCRIBE user_databases;
-- DESCRIBE db_audit_logs;
