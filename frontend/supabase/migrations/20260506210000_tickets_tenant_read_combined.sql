-- Fix production when `tickets_tenant_read` was replaced by a slug-only variant and ticket reads broke.
--
-- Common causes:
-- * `public.is_staff_or_above(auth.uid())` is false because `users.auth_id` ≠ Supabase JWT `sub`
--   (UI can still show Super Admin from `/auth/me` while Postgres RLS denies).
-- * Super admins often have `organisation_id` NULL, so "slug match via users JOIN organisations"
--   never fires for them.
--
-- This migration: hardens `is_staff_or_above`, then sets one SELECT policy that allows:
--   staff bypass, slug-based tenant rows, legacy organisation_id match, and NULL-org ticket rows.

CREATE OR REPLACE FUNCTION public.is_staff_or_above(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_id = _user_id
      AND COALESCE(u.active, true)
      AND upper(trim(both FROM u.role::text)) IN (
        'STAFF',
        'ADMIN',
        'SUPER_ADMIN'
      )
  );
$$;

DROP POLICY IF EXISTS tickets_tenant_read ON public.tickets;

CREATE POLICY tickets_tenant_read ON public.tickets
FOR SELECT
TO authenticated
USING (
  public.is_staff_or_above(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.organisations o ON o.id = u.organisation_id
    WHERE u.auth_id = auth.uid()
      AND COALESCE(u.active, true)
      AND o.slug IS NOT NULL
      AND tickets.client_slug IS NOT NULL
      AND lower(trim(both FROM o.slug::text)) = lower(trim(both FROM tickets.client_slug::text))
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_id = auth.uid()
      AND COALESCE(u.active, true)
      AND u.organisation_id IS NOT NULL
      AND tickets.organisation_id IS NOT NULL
      AND u.organisation_id = tickets.organisation_id
  )
  -- Rows with no org UUID: staff only (avoids exposing orphan tickets to every authenticated user)
  OR (
    tickets.organisation_id IS NULL
    AND public.is_staff_or_above(auth.uid())
  )
);
