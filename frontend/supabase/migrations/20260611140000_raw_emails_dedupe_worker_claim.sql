-- CRIT-03: Email dedupe + worker claim support (additive only).
-- Rollback: 20260611140000_raw_emails_dedupe_worker_claim_rollback.sql

ALTER TABLE public.raw_emails
  ADD COLUMN IF NOT EXISTS processing_claimed_at timestamptz;

COMMENT ON COLUMN public.raw_emails.processing_claimed_at IS
  'Set when autoTicketWorker atomically claims a PENDING row as PROCESSING; used for stale reclaim.';

-- Unique Postmark MessageID when no duplicates exist (safe deploy).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.raw_emails
    WHERE message_id IS NOT NULL AND btrim(message_id) <> ''
    GROUP BY message_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_emails_message_id_unique
      ON public.raw_emails (message_id)
      WHERE message_id IS NOT NULL AND btrim(message_id) <> '';
  ELSE
    RAISE NOTICE 'idx_raw_emails_message_id_unique skipped: duplicate message_id rows exist — dedupe manually then re-run index creation';
  END IF;
END $$;
