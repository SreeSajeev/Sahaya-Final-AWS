-- Per-tenant inbound/outbound email routing (JSON arrays of addresses, backward-compatible defaults).
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS incoming_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outgoing_emails jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.organisations.incoming_emails IS
  'Mailbox addresses (support@tenant.com) used to match inbound Postmark To; tickets get this organisation_id.';
COMMENT ON COLUMN public.organisations.outgoing_emails IS
  'Addresses suitable for Reply-To / tenant-facing comms; optional use by email workers.';
