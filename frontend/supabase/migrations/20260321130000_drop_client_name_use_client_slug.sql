-- Revert optional client_name column; client identity uses existing client_slug on tickets.
ALTER TABLE public.tickets
  DROP COLUMN IF EXISTS client_name;
