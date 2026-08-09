-- Additive performance indexes for ticket list/search/analytics (no destructive ops).

CREATE INDEX IF NOT EXISTS "tickets_org_created_at_idx"
  ON "tickets" ("organisation_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "tickets_org_status_idx"
  ON "tickets" ("organisation_id", "status");

CREATE INDEX IF NOT EXISTS "tickets_org_client_slug_idx"
  ON "tickets" ("organisation_id", "client_slug");

CREATE INDEX IF NOT EXISTS "tickets_complaint_id_idx"
  ON "tickets" ("complaint_id");

CREATE INDEX IF NOT EXISTS "tickets_current_assignment_id_idx"
  ON "tickets" ("current_assignment_id");
