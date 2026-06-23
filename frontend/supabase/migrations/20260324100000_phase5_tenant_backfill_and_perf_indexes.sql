-- Phase 5: Tenant data backfill + migration safety (non-breaking, additive)
-- Safe to run before strict tenant guard or strict RLS.
-- Does NOT add NOT NULL constraints.

BEGIN;

-- 1) Deterministic backfill for organisation_id where parent ticket has it.
UPDATE public.ticket_assignments ta
SET organisation_id = t.organisation_id
FROM public.tickets t
WHERE ta.ticket_id = t.id
  AND ta.organisation_id IS NULL
  AND t.organisation_id IS NOT NULL;

UPDATE public.ticket_comments tc
SET organisation_id = t.organisation_id
FROM public.tickets t
WHERE tc.ticket_id = t.id
  AND tc.organisation_id IS NULL
  AND t.organisation_id IS NOT NULL;

UPDATE public.fe_action_tokens fat
SET organisation_id = t.organisation_id
FROM public.tickets t
WHERE fat.ticket_id = t.id
  AND fat.organisation_id IS NULL
  AND t.organisation_id IS NOT NULL;

UPDATE public.sla_tracking st
SET organisation_id = t.organisation_id
FROM public.tickets t
WHERE st.ticket_id = t.id
  AND st.organisation_id IS NULL
  AND t.organisation_id IS NOT NULL;

UPDATE public.fe_proof_backup_queue q
SET organisation_id = t.organisation_id
FROM public.tickets t
WHERE q.ticket_id = t.id
  AND q.organisation_id IS NULL
  AND t.organisation_id IS NOT NULL;

UPDATE public.parsed_emails pe
SET organisation_id = re.organisation_id
FROM public.raw_emails re
WHERE pe.raw_email_id = re.id
  AND pe.organisation_id IS NULL
  AND re.organisation_id IS NOT NULL;

COMMIT;

-- 2) Tenant-scoped performance indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_tickets_org_status_created_at
  ON public.tickets (organisation_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_org_ticket_number
  ON public.tickets (organisation_id, ticket_number);

CREATE INDEX IF NOT EXISTS idx_ticket_assignments_org_ticket_created_at
  ON public.ticket_assignments (organisation_id, ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_org_ticket_created_at
  ON public.ticket_comments (organisation_id, ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fe_action_tokens_org_ticket_type_state
  ON public.fe_action_tokens (organisation_id, ticket_id, action_type, token_state);

CREATE INDEX IF NOT EXISTS idx_fe_action_tokens_org_fe_active
  ON public.fe_action_tokens (organisation_id, fe_id, used, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_emails_org_status_created_at
  ON public.raw_emails (organisation_id, processing_status, created_at);

CREATE INDEX IF NOT EXISTS idx_parsed_emails_org_ticket_created
  ON public.parsed_emails (organisation_id, ticket_created, created_at);

CREATE INDEX IF NOT EXISTS idx_queue_org_created_at
  ON public.fe_proof_backup_queue (organisation_id, created_at);

-- 3) Legacy visibility checks (run manually after migration)
-- SELECT count(*) AS legacy_null_org_tickets FROM public.tickets WHERE organisation_id IS NULL;
-- SELECT count(*) AS legacy_null_org_assignments FROM public.ticket_assignments WHERE organisation_id IS NULL;
-- SELECT count(*) AS legacy_null_org_tokens FROM public.fe_action_tokens WHERE organisation_id IS NULL;
