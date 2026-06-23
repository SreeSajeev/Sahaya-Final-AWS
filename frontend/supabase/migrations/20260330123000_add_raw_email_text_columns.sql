-- Ensure raw email content is always accessible without digging into JSON payloads.
-- These columns are additive; existing payload column remains the source of truth.

ALTER TABLE public.raw_emails
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS raw_html text;

