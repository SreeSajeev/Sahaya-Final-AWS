-- Tenant-managed client organisations (branches / end customers under a tenant).
-- Additive only — does not modify organisations, tickets, or users.

CREATE TABLE IF NOT EXISTS public.tenant_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  website TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_clients_organisation_slug_unique UNIQUE (organisation_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tenant_clients_organisation_id
  ON public.tenant_clients (organisation_id);

CREATE INDEX IF NOT EXISTS idx_tenant_clients_org_status
  ON public.tenant_clients (organisation_id, status);

COMMENT ON TABLE public.tenant_clients IS
  'End-customer / branch records owned by a tenant (organisations row). tickets.client_slug references slug within tenant.';

ALTER TABLE public.tenant_clients ENABLE ROW LEVEL SECURITY;

-- Authenticated users: read clients for their tenant; super admins read all (staff bypass via API service role for writes).
CREATE POLICY tenant_clients_select_authenticated ON public.tenant_clients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND COALESCE(u.active, true)
        AND (
          u.role = 'SUPER_ADMIN'
          OR u.organisation_id = tenant_clients.organisation_id
        )
    )
  );
