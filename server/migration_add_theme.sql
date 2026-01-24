-- Migration: Add theme column to users table
USE kolabpanel;

-- Add theme column
ALTER TABLE users 
ADD COLUMN theme VARCHAR(10) DEFAULT 'light';

-- Update existing records if needed (optional)
-- UPDATE users SET theme = 'light' WHERE theme IS NULL;
