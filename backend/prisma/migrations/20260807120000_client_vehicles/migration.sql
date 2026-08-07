-- Client vehicle master + ticket vehicle FK/snapshots (additive, backward compatible).

CREATE TABLE IF NOT EXISTS "client_vehicles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "vehicle_number" TEXT NOT NULL,
  "vehicle_type" TEXT,
  "vehicle_name" TEXT,
  "registration_number" TEXT,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" UUID,
  "updated_by" UUID,
  CONSTRAINT "client_vehicles_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "client_vehicles"
    ADD CONSTRAINT "client_vehicles_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "client_vehicles_client_vehicle_number_unique"
  ON "client_vehicles" ("client_id", "vehicle_number");

CREATE INDEX IF NOT EXISTS "client_vehicles_organisation_id_idx"
  ON "client_vehicles" ("organisation_id");

CREATE INDEX IF NOT EXISTS "client_vehicles_client_id_idx"
  ON "client_vehicles" ("client_id");

CREATE INDEX IF NOT EXISTS "client_vehicles_vehicle_number_idx"
  ON "client_vehicles" ("vehicle_number");

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "vehicle_id" UUID;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "vehicle_name" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "vehicle_type" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "registration_number" TEXT;

CREATE INDEX IF NOT EXISTS "tickets_vehicle_id_idx" ON "tickets" ("vehicle_id");

DO $$ BEGIN
  ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "client_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
