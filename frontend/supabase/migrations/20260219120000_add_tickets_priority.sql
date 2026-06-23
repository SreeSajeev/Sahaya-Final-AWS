-- Add priority flag to tickets (visual/informational only).
-- Does not affect lifecycle, status, SLA, or worker logic.
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS priority boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tickets.priority IS 'Informational highlight flag; does not affect workflow or SLA.';
