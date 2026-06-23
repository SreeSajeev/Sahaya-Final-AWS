-- Phase 6: RLS tightening strategy (safe, staged, non-breaking)
-- This script intentionally avoids forcing restrictive policies immediately.
-- Backend service-role remains unaffected by RLS policies in Supabase.

-- 1) Enable RLS on frontend-readable tables if not already enabled.
ALTER TABLE IF EXISTS public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fe_action_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sla_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.raw_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parsed_emails ENABLE ROW LEVEL SECURITY;

-- 2) Add permissive "authenticated read by org" baseline policies.
-- Note: uses users(auth_id -> organisation_id) mapping.
DO $$
BEGIN
  IF to_regclass('public.tickets') IS NOT NULL THEN
    EXECUTE $policy$
      CREATE POLICY IF NOT EXISTS tickets_tenant_read
      ON public.tickets
      FOR SELECT
      TO authenticated
      USING (
        organisation_id IS NULL
        OR organisation_id IN (
          SELECT u.organisation_id
          FROM public.users u
          WHERE u.auth_id = auth.uid()
        )
      )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ticket_comments') IS NOT NULL THEN
    EXECUTE $policy$
      CREATE POLICY IF NOT EXISTS ticket_comments_tenant_read
      ON public.ticket_comments
      FOR SELECT
      TO authenticated
      USING (
        organisation_id IS NULL
        OR organisation_id IN (
          SELECT u.organisation_id
          FROM public.users u
          WHERE u.auth_id = auth.uid()
        )
      )
    $policy$;
  END IF;
END $$;

-- 3) Keep writes controlled by backend API/service-role for now.
-- No strict frontend write policies added in this phase to avoid flow breakage.

-- 4) Observability query helpers:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
