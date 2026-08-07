-- Tenant-configurable SLA + ticket SLA snapshots (additive).

CREATE TABLE IF NOT EXISTS "tenant_slas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL,
  "response_minutes" INTEGER NOT NULL,
  "resolution_minutes" INTEGER NOT NULL,
  "escalation_levels" JSONB NOT NULL DEFAULT '[{"level":1,"percent":50},{"level":2,"percent":75},{"level":3,"percent":100},{"level":4,"percent":150}]'::jsonb,
  "business_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
  "start_time" TEXT,
  "end_time" TEXT,
  "working_days" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_slas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_slas_organisation_id_key"
  ON "tenant_slas" ("organisation_id");

DO $$ BEGIN
  ALTER TABLE "tenant_slas"
    ADD CONSTRAINT "tenant_slas_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "response_sla_minutes" INTEGER;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "resolution_sla_minutes" INTEGER;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "response_due_at" TIMESTAMPTZ;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "resolution_due_at" TIMESTAMPTZ;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "escalation_level" INTEGER;

CREATE INDEX IF NOT EXISTS "tickets_response_due_at_idx" ON "tickets" ("response_due_at");
CREATE INDEX IF NOT EXISTS "tickets_resolution_due_at_idx" ON "tickets" ("resolution_due_at");
