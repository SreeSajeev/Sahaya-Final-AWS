-- Add dedicated incident_title column (separate from issue_type and short_description).
-- Backward compatible: nullable; legacy tickets keep issue_type only.

ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "incident_title" TEXT;

CREATE INDEX IF NOT EXISTS "tickets_incident_title_idx"
  ON "tickets" ("incident_title")
  WHERE "incident_title" IS NOT NULL;
