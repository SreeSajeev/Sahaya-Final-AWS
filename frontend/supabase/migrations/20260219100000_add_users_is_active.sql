-- Add is_active to users table for activation/deactivation.
-- Existing columns unchanged. Existing users default to active.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Backfill from existing active column so current behavior is preserved
UPDATE users SET is_active = COALESCE(active, true) WHERE is_active IS NULL;

-- Ensure default for new rows
ALTER TABLE users
  ALTER COLUMN is_active SET DEFAULT TRUE;
