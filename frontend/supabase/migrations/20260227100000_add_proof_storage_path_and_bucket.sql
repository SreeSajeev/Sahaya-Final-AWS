-- Add optional storage path for FE proof backup (resolution proof uploaded to Supabase Storage)
ALTER TABLE ticket_assignments
  ADD COLUMN IF NOT EXISTS proof_storage_path TEXT;

-- Create private bucket for FE proofs (if storage schema exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('fe-proofs', 'fe-proofs', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
