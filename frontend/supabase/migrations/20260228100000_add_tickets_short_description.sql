-- Additive only: short_description for ticket summary (remarks or first 200 chars of email body).
-- Does not remove or alter existing columns.
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS short_description text;

COMMENT ON COLUMN public.tickets.short_description IS 'Brief issue summary: from remarks or first 200 chars of email body. Used for display and OPEN eligibility (with vehicle_number + location).';
