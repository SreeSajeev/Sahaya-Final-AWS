-- Add approval_status to users table for organisation-based signup with admin approval.
-- Allowed values: 'pending', 'approved', 'rejected'. Default 'pending' for new signups.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';

-- Treat all existing users as approved. (With DEFAULT 'pending', existing rows get 'pending'
-- on ADD COLUMN, so we must update both NULL and 'pending' to avoid blocking everyone.)
UPDATE users
SET approval_status = 'approved'
WHERE approval_status IS NULL OR approval_status = 'pending';
