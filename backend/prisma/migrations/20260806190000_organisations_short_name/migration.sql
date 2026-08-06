-- Additive: organisation short name for operator search/display.
-- Does not backfill or alter existing name/slug values.
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "short_name" TEXT;
