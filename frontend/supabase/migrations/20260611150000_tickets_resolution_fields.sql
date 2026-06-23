-- Additive nullable columns for resolution metadata on tickets.
-- Existing rows and close workflows remain valid; close route persists when columns exist.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS resolution_category text;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS review_notes text;

COMMENT ON COLUMN public.tickets.resolution_category IS 'Tenant-configured resolution category chosen at close';
COMMENT ON COLUMN public.tickets.review_notes IS 'Optional review notes captured at close';
