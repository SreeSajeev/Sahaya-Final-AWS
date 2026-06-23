-- Add geographic state to tickets (nullable for backward compatibility).
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS state TEXT;

COMMENT ON COLUMN public.tickets.state IS
  'Indian state or union territory for the ticket site. Set at create/assign/edit; not derived from location.';

CREATE INDEX IF NOT EXISTS idx_tickets_state
  ON public.tickets (state)
  WHERE state IS NOT NULL;
