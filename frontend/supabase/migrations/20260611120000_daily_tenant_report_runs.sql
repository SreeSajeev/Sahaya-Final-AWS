-- Idempotency + audit for daily tenant operations report emails (worker-only).

CREATE TABLE IF NOT EXISTS public.daily_tenant_report_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  report_date       DATE NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'dry_run')),
  recipient_count   INTEGER,
  ticket_count      INTEGER,
  error             TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_tenant_report_runs_org_date_unique UNIQUE (organisation_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_tenant_report_runs_report_date
  ON public.daily_tenant_report_runs (report_date DESC);

COMMENT ON TABLE public.daily_tenant_report_runs IS
  'One row per organisation per IST report day; prevents duplicate daily ops report emails.';

ALTER TABLE public.daily_tenant_report_runs ENABLE ROW LEVEL SECURITY;
