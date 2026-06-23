-- Add FE token lifecycle states and assignment notification tracking.
-- Safe-additive migration; creates fe_action_tokens if absent.

CREATE TABLE IF NOT EXISTS public.fe_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  fe_id UUID NOT NULL REFERENCES public.field_executives(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('ON_SITE', 'RESOLUTION')),
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE public.fe_action_tokens
  ADD COLUMN IF NOT EXISTS token_state TEXT,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Backfill token_state for legacy rows.
UPDATE public.fe_action_tokens
SET token_state = CASE
  WHEN used = true THEN 'USED'
  WHEN expires_at < now() THEN 'EXPIRED'
  WHEN action_type = 'RESOLUTION' THEN 'LOCKED'
  ELSE 'ACTIVE'
END
WHERE token_state IS NULL;

ALTER TABLE public.fe_action_tokens
  ALTER COLUMN token_state SET NOT NULL;

ALTER TABLE public.fe_action_tokens
  DROP CONSTRAINT IF EXISTS fe_action_tokens_token_state_check;

ALTER TABLE public.fe_action_tokens
  ADD CONSTRAINT fe_action_tokens_token_state_check
  CHECK (token_state IN ('LOCKED', 'ACTIVE', 'USED', 'EXPIRED', 'REVOKED'));

ALTER TABLE public.fe_action_tokens
  DROP CONSTRAINT IF EXISTS fe_action_tokens_resolution_used_state_check;

ALTER TABLE public.fe_action_tokens
  ADD CONSTRAINT fe_action_tokens_resolution_used_state_check
  CHECK (
    action_type <> 'RESOLUTION'
    OR used = false
    OR token_state = 'USED'
  );

ALTER TABLE public.fe_action_tokens
  DROP CONSTRAINT IF EXISTS fe_action_tokens_resolution_locked_unused_check;

ALTER TABLE public.fe_action_tokens
  ADD CONSTRAINT fe_action_tokens_resolution_locked_unused_check
  CHECK (
    action_type <> 'RESOLUTION'
    OR token_state <> 'LOCKED'
    OR used = false
  );

ALTER TABLE public.ticket_assignments
  ADD COLUMN IF NOT EXISTS on_site_confirmed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS on_site_proof_comment_id UUID REFERENCES public.ticket_comments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_notification_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS assignment_notification_id TEXT;

CREATE INDEX IF NOT EXISTS idx_fe_action_tokens_ticket_action_state
  ON public.fe_action_tokens (ticket_id, action_type, token_state)
  WHERE token_state IN ('LOCKED', 'ACTIVE');

CREATE INDEX IF NOT EXISTS idx_fe_action_tokens_fe_expires_at
  ON public.fe_action_tokens (fe_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_ticket_assignments_ticket_fe
  ON public.ticket_assignments (ticket_id, fe_id);

CREATE INDEX IF NOT EXISTS idx_ticket_assignments_assignment_notification_sent
  ON public.ticket_assignments (assignment_notification_sent_at)
  WHERE assignment_notification_sent_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fe_action_tokens_resolution_non_terminal
  ON public.fe_action_tokens (ticket_id)
  WHERE action_type = 'RESOLUTION' AND token_state IN ('LOCKED', 'ACTIVE');
