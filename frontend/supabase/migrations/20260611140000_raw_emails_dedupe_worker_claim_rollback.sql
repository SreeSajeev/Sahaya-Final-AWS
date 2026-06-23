-- Rollback for 20260611140000_raw_emails_dedupe_worker_claim.sql

DROP INDEX IF EXISTS public.idx_raw_emails_message_id_unique;

ALTER TABLE public.raw_emails
  DROP COLUMN IF EXISTS processing_claimed_at;
