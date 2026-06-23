-- Fix cross-tenant ticket visibility for tenant ADMIN / STAFF / FE users.
--
-- Root cause: legacy policy "Staff can view tickets" OR'd with tickets_tenant_read and allowed
-- is_staff_or_above() → any ADMIN/STAFF/SUPER_ADMIN could SELECT all ticket rows.
-- Combined policy also used is_staff_or_above() as first OR branch (global bypass).
--
-- After this migration:
-- * SUPER_ADMIN: all tickets
-- * Other roles: tickets where organisation_id matches OR client_slug matches org slug

CREATE OR REPLACE FUNCTION public.is_super_admin_user(_user_id uuid)
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
      AND upper(trim(both FROM u.role::text)) = 'SUPER_ADMIN'
  );
$$;

COMMENT ON FUNCTION public.is_super_admin_user(uuid) IS
  'True when auth user is an active SUPER_ADMIN (tenant isolation bypass for platform ops).';

-- Legacy permissive policies (still OR-combined with tickets_tenant_read in Postgres)
DROP POLICY IF EXISTS "Staff can view tickets" ON public.tickets;
DROP POLICY IF EXISTS "Authenticated users can view tickets" ON public.tickets;

DROP POLICY IF EXISTS tickets_tenant_read ON public.tickets;

CREATE POLICY tickets_tenant_read ON public.tickets
FOR SELECT
TO authenticated
USING (
  public.is_super_admin_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_id = auth.uid()
      AND COALESCE(u.active, true)
      AND u.organisation_id IS NOT NULL
      AND tickets.organisation_id IS NOT NULL
      AND u.organisation_id = tickets.organisation_id
  )
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
);
