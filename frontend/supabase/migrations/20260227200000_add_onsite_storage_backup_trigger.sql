-- ON_SITE (and RESOLUTION) proof backup: trigger enqueues rows for async upload to Storage.
-- Actual upload is done by backend worker (proofBackupQueueProcessor). Insert is never blocked.

-- Queue table: worker reads from here and uploads to fe-proofs bucket
CREATE TABLE IF NOT EXISTS fe_proof_backup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_comment_id UUID NOT NULL REFERENCES ticket_comments(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('ON_SITE', 'RESOLUTION')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fe_proof_backup_queue_created_at
  ON fe_proof_backup_queue(created_at);

COMMENT ON TABLE fe_proof_backup_queue IS 'Queue for backing up FE proof images to Supabase Storage; processed by backend worker.';

-- Trigger function: enqueue row for backup; never fail the insert
CREATE OR REPLACE FUNCTION backup_fe_proof_to_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.attachments IS NOT NULL
     AND NEW.attachments->>'image_base64' IS NOT NULL
     AND NEW.attachments->>'action_type' IN ('ON_SITE', 'RESOLUTION') THEN
    BEGIN
      INSERT INTO fe_proof_backup_queue (ticket_comment_id, ticket_id, action_type)
      VALUES (
        NEW.id,
        NEW.ticket_id,
        COALESCE(NEW.attachments->>'action_type', 'ON_SITE')
      );
      RAISE NOTICE 'Proof backup queued: % (%)', NEW.id, COALESCE(NEW.attachments->>'action_type', 'ON_SITE');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Proof backup queue failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION backup_fe_proof_to_storage() IS 'Enqueues FE proof for Storage backup; never blocks ticket_comments insert.';

-- Trigger: after insert on ticket_comments
DROP TRIGGER IF EXISTS trg_backup_fe_proof_to_storage ON ticket_comments;
CREATE TRIGGER trg_backup_fe_proof_to_storage
  AFTER INSERT ON ticket_comments
  FOR EACH ROW
  EXECUTE FUNCTION backup_fe_proof_to_storage();

-- Ensure private bucket exists (if storage schema present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('fe-proofs', 'fe-proofs', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
