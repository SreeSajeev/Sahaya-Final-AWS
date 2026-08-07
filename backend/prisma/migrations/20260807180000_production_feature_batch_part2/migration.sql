-- Production feature batch part 2 (additive, backward compatible).
-- F1: client company_short_name
-- F4: resolution location master + ticket snapshots
-- F5: immutable close form snapshot on tickets

-- ========== F1: Company Short Name ==========
ALTER TABLE "tenant_clients" ADD COLUMN IF NOT EXISTS "company_short_name" TEXT;
CREATE INDEX IF NOT EXISTS "tenant_clients_company_short_name_idx"
  ON "tenant_clients" ("company_short_name");
CREATE INDEX IF NOT EXISTS "tenant_clients_organisation_id_idx"
  ON "tenant_clients" ("organisation_id");

-- ========== F4: Resolution Location Master ==========
CREATE TABLE IF NOT EXISTS "tenant_resolution_locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" UUID,
  "updated_by" UUID,
  CONSTRAINT "tenant_resolution_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_resolution_locations_org_name_unique"
  ON "tenant_resolution_locations" ("organisation_id", "name");

CREATE INDEX IF NOT EXISTS "tenant_resolution_locations_organisation_id_idx"
  ON "tenant_resolution_locations" ("organisation_id");

CREATE INDEX IF NOT EXISTS "tenant_resolution_locations_is_active_idx"
  ON "tenant_resolution_locations" ("is_active");

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "resolution_location_id" UUID;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "resolution_location_name" TEXT;

CREATE INDEX IF NOT EXISTS "tickets_resolution_location_id_idx"
  ON "tickets" ("resolution_location_id");

DO $$ BEGIN
  ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_resolution_location_id_fkey"
    FOREIGN KEY ("resolution_location_id")
    REFERENCES "tenant_resolution_locations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ========== F5: Configurable Verify & Close snapshot ==========
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "close_form_snapshot" JSONB;
