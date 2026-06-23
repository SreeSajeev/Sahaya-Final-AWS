-- Fix frontend Supabase `.from('tickets')` reads for Staff / Super Admin on organisation-scoped rows.
--
-- Phase 6 `tickets_tenant_read` allowed:
--   organisation_id IS NULL OR organisation_id IN (SELECT users.organisation_id WHERE auth.uid() = users.auth_id)
-- For SUPER_ADMIN, `users.organisation_id` is typically NULL → the IN (NULL) predicate does not match real tenant UUIDs,
-- so rows with non-null `organisation_id` were denied unless another policy existed.
--
-- Create helper if DB never ran migration 20260127110842 (otherwise OR REPLACE refreshes definition).
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

-- This policy restores tenant isolation for non–staff users while allowing any staff-tier role to SELECT all tickets.

DROP POLICY IF EXISTS tickets_tenant_read ON public.tickets;

CREATE POLICY tickets_tenant_read ON public.tickets
FOR SELECT
TO authenticated
USING (
  public.is_staff_or_above(auth.uid())
  OR organisation_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_id = auth.uid()
      AND u.organisation_id IS NOT NULL
      AND u.organisation_id = tickets.organisation_id
  )
);
