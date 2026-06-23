-- ============================================================
-- Security Fix: Restrict access to sensitive tables
-- ============================================================

-- 1. USERS TABLE: Block anonymous access (defense in depth)
-- The existing policies are RESTRICTIVE and correct for authenticated users
-- This adds explicit denial for anonymous users

CREATE POLICY "Block anonymous access" ON users
FOR ALL TO anon
USING (false);

-- 2. RAW_EMAILS TABLE: Restrict to staff or above (contains sensitive email content)
-- Drop the overly permissive policy that allows any authenticated user

DROP POLICY IF EXISTS "Authenticated users can view raw emails" ON raw_emails;

-- Create new policy that only allows staff or above to view raw emails
CREATE POLICY "Staff can view raw emails" ON raw_emails
FOR SELECT TO authenticated
USING (is_staff_or_above(auth.uid()));

-- 3. PARSED_EMAILS TABLE: Same treatment - restrict to staff or above
-- This table also contains extracted data from emails (customer info, locations, etc.)

DROP POLICY IF EXISTS "Authenticated users can view parsed emails" ON parsed_emails;

CREATE POLICY "Staff can view parsed emails" ON parsed_emails
FOR SELECT TO authenticated
USING (is_staff_or_above(auth.uid()));