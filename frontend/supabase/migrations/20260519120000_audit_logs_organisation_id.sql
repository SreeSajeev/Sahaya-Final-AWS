-- Optional tenant column for audit log scoping (backend uses schemaCompat probe).
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organisation_id_created
  ON public.audit_logs (organisation_id, created_at DESC);

-- Backfill org from tickets where entity is a ticket.
UPDATE public.audit_logs al
SET organisation_id = t.organisation_id
FROM public.tickets t
WHERE al.entity_type = 'ticket'
  AND al.entity_id = t.id
  AND al.organisation_id IS NULL
  AND t.organisation_id IS NOT NULL;
