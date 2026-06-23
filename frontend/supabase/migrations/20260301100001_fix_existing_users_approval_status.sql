-- One-time fix: existing users were left as 'pending' because ADD COLUMN DEFAULT 'pending'
-- sets that value on existing rows, and the previous UPDATE only targeted NULL.
-- This approves everyone who is currently 'pending' so logins work again.
-- (After this, only new public signups will have approval_status = 'pending'.)
UPDATE users
SET approval_status = 'approved'
WHERE approval_status = 'pending';
