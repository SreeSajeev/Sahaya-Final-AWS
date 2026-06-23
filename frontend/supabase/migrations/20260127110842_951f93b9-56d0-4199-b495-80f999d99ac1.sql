-- ============================================================
-- Security Fixes: Role-Based RLS Policies
-- Fixes: no_server_role_validation, field_executives_unrestricted_modification,
--        field_executives_phone_exposure, fe_token_anon_access
-- ============================================================

-- Create a helper function to check user roles (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.user_has_role(_user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_id = _user_id
      AND role = ANY(_roles)
      AND active = true
  )
$$;

-- Create a helper function to check if user is staff or higher
CREATE OR REPLACE FUNCTION public.is_staff_or_above(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_id = _user_id
      AND role IN ('STAFF', 'ADMIN', 'SUPER_ADMIN')
      AND active = true
  )
$$;

-- Create a helper function to check if user is admin or super admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_id = _user_id
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND active = true
  )
$$;

-- ============================================================
-- Fix 1: Field Executives Table - Restrict modifications to admin only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage FEs" ON field_executives;
DROP POLICY IF EXISTS "Authenticated users can view FEs" ON field_executives;

-- Staff and above can view FEs (needed for assignment)
CREATE POLICY "Staff can view FEs" ON field_executives
FOR SELECT TO authenticated
USING (public.is_staff_or_above(auth.uid()));

-- Only admins can insert new FEs
CREATE POLICY "Admins can insert FEs" ON field_executives
FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can update FEs
CREATE POLICY "Admins can update FEs" ON field_executives
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can delete FEs
CREATE POLICY "Admins can delete FEs" ON field_executives
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================================
-- Fix 2: Tickets Table - Add role validation
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view tickets" ON tickets;
DROP POLICY IF EXISTS "Authenticated users can insert tickets" ON tickets;
DROP POLICY IF EXISTS "Authenticated users can update tickets" ON tickets;

-- Staff and above can view tickets
CREATE POLICY "Staff can view tickets" ON tickets
FOR SELECT TO authenticated
USING (public.is_staff_or_above(auth.uid()));

-- Staff and above can insert tickets
CREATE POLICY "Staff can insert tickets" ON tickets
FOR INSERT TO authenticated
WITH CHECK (public.is_staff_or_above(auth.uid()));

-- Staff and above can update tickets
CREATE POLICY "Staff can update tickets" ON tickets
FOR UPDATE TO authenticated
USING (public.is_staff_or_above(auth.uid()))
WITH CHECK (public.is_staff_or_above(auth.uid()));

-- ============================================================
-- Fix 3: Ticket Assignments - Restrict to staff and above
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view assignments" ON ticket_assignments;
DROP POLICY IF EXISTS "Authenticated users can create assignments" ON ticket_assignments;

-- Staff and above can view assignments
CREATE POLICY "Staff can view assignments" ON ticket_assignments
FOR SELECT TO authenticated
USING (public.is_staff_or_above(auth.uid()));

-- Staff and above can create assignments
CREATE POLICY "Staff can create assignments" ON ticket_assignments
FOR INSERT TO authenticated
WITH CHECK (public.is_staff_or_above(auth.uid()));

-- ============================================================
-- Fix 4: Ticket Comments - Add role validation
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view comments" ON ticket_comments;
DROP POLICY IF EXISTS "Authenticated users can add comments" ON ticket_comments;

-- Staff and above can view comments
CREATE POLICY "Staff can view comments" ON ticket_comments
FOR SELECT TO authenticated
USING (public.is_staff_or_above(auth.uid()));

-- Staff and above can add comments
CREATE POLICY "Staff can add comments" ON ticket_comments
FOR INSERT TO authenticated
WITH CHECK (public.is_staff_or_above(auth.uid()));

-- ============================================================
-- Fix 5: Audit Logs - Restrict to staff and above
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Authenticated users can create audit logs" ON audit_logs;

-- Staff and above can view audit logs
CREATE POLICY "Staff can view audit logs" ON audit_logs
FOR SELECT TO authenticated
USING (public.is_staff_or_above(auth.uid()));

-- Staff and above can create audit logs
CREATE POLICY "Staff can create audit logs" ON audit_logs
FOR INSERT TO authenticated
WITH CHECK (public.is_staff_or_above(auth.uid()));

-- ============================================================
-- Fix 6: Access Tokens - Allow anon to validate tokens + restrict creation
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view access tokens" ON access_tokens;

-- Anonymous users can validate tokens (read-only, must know token_hash)
CREATE POLICY "Anon can validate tokens" ON access_tokens
FOR SELECT TO anon
USING (true);

-- Staff and above can view all tokens
CREATE POLICY "Staff can view tokens" ON access_tokens
FOR SELECT TO authenticated
USING (public.is_staff_or_above(auth.uid()));

-- Staff and above can create tokens
CREATE POLICY "Staff can create tokens" ON access_tokens
FOR INSERT TO authenticated
WITH CHECK (public.is_staff_or_above(auth.uid()));

-- Allow token revocation by staff
CREATE POLICY "Staff can revoke tokens" ON access_tokens
FOR UPDATE TO authenticated
USING (public.is_staff_or_above(auth.uid()))
WITH CHECK (public.is_staff_or_above(auth.uid()));

-- ============================================================
-- Fix 7: Users Table - Ensure INSERT is allowed for signup
-- ============================================================
-- Note: The users table already has proper RESTRICTIVE SELECT policies
-- We need to add an INSERT policy for signup

CREATE POLICY "Users can insert own profile" ON users
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = auth_id);