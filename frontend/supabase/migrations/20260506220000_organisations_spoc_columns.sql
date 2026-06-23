-- Single point of contact fields for tenant organisations (editable from CRM UI).
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS spoc_name text,
  ADD COLUMN IF NOT EXISTS spoc_email text,
  ADD COLUMN IF NOT EXISTS spoc_phone text;
