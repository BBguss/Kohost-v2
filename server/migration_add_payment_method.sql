-- Migration: Add method column to payments table
USE kolabpanel;

-- Add method column (MySQL doesn't support IF NOT EXISTS on ADD COLUMN)
-- If column already exists, this will error but can be ignored
ALTER TABLE payments 
ADD COLUMN method VARCHAR(10) DEFAULT 'BANK' 
AFTER plan;

-- Update existing records to have BANK as default method
UPDATE payments SET method = 'BANK' WHERE method IS NULL;
