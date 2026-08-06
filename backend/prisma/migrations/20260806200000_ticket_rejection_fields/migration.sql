-- Additive rejection audit columns on tickets.
-- Does not backfill historical REJECTED rows (timeline/comments remain source for those).
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMPTZ;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "rejected_by" UUID;
