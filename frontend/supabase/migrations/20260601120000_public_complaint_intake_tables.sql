-- Phase 1: Public Complaint Intake — additive tables only.
-- Does not modify tickets, users, organisations, or application code paths.
-- Rollback: see 20260601120000 rollback in Phase 1 runbook (drop only if all three tables are empty).

CREATE TABLE IF NOT EXISTS public.tenant_complaint_points (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  name                TEXT NOT NULL,
  description         TEXT,
  building            TEXT,
  floor               TEXT,
  site_name           TEXT,
  asset_reference     TEXT,
  default_client_slug TEXT,
  default_category    TEXT,
  default_issue_type  TEXT,
  public_token        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'disabled')),
  token_version       INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at         TIMESTAMPTZ,
  created_by_user_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_complaint_points_org_token_unique UNIQUE (public_token),
  CONSTRAINT tenant_complaint_points_org_name_unique UNIQUE (organisation_id, name)
);

CREATE INDEX IF NOT EXISTS idx_complaint_points_org_status
  ON public.tenant_complaint_points (organisation_id, status);

CREATE INDEX IF NOT EXISTS idx_complaint_points_token_active
  ON public.tenant_complaint_points (public_token)
  WHERE status = 'active';

COMMENT ON TABLE public.tenant_complaint_points IS
  'Physical/logical complaint origins for public QR intake. organisation_id immutable after create.';

CREATE TABLE IF NOT EXISTS public.public_otp_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_point_id  UUID NOT NULL REFERENCES public.tenant_complaint_points(id) ON DELETE RESTRICT,
  organisation_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  reporter_name       TEXT NOT NULL,
  reporter_mobile     TEXT NOT NULL,
  otp_hash            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','verified','consumed','expired','locked')),
  attempt_count       INT NOT NULL DEFAULT 0,
  resend_count        INT NOT NULL DEFAULT 0,
  expires_at          TIMESTAMPTZ NOT NULL,
  verified_at         TIMESTAMPTZ,
  consumed_at         TIMESTAMPTZ,
  ticket_id           UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  ip_hash             TEXT,
  user_agent_hash     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_otp_sessions_point_mobile_created
  ON public.public_otp_sessions (complaint_point_id, reporter_mobile, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_otp_sessions_org_status_expires
  ON public.public_otp_sessions (organisation_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_public_otp_sessions_ticket
  ON public.public_otp_sessions (ticket_id)
  WHERE ticket_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.public_complaint_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  complaint_point_id  UUID NOT NULL REFERENCES public.tenant_complaint_points(id) ON DELETE RESTRICT,
  organisation_id     UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  otp_session_id      UUID NOT NULL REFERENCES public.public_otp_sessions(id) ON DELETE RESTRICT,
  reporter_name       TEXT NOT NULL,
  reporter_mobile     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_complaint_submissions_org_created
  ON public.public_complaint_submissions (organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_complaint_submissions_point_created
  ON public.public_complaint_submissions (complaint_point_id, created_at DESC);

-- Backend service-role only (matches fe_action_tokens pattern). No policies = default deny.
ALTER TABLE public.tenant_complaint_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_otp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_complaint_submissions ENABLE ROW LEVEL SECURITY;
