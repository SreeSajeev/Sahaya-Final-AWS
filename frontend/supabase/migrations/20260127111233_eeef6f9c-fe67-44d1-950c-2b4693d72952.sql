-- ============================================================
-- Fix: Infinite recursion on users table RLS
-- The users table policies should NOT use is_staff_or_above/is_admin 
-- because those functions query the users table themselves
-- ============================================================

-- Drop the problematic INSERT policy we added
DROP POLICY IF EXISTS "Users can insert own profile" ON users;

-- Re-create the INSERT policy without using helper functions
-- This is safe because auth.uid() is a built-in Supabase function
CREATE POLICY "Users can insert own profile" ON users
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = auth_id);

-- Note: The existing SELECT policies on users table are fine because they
-- use auth.uid() = auth_id directly, not the helper functions