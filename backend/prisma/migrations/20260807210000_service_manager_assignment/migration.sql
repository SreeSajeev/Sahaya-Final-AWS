-- Service Manager assignment workflow (additive, backward compatible).
-- Generalizes ticket_assignments to support FIELD_EXECUTIVE | SERVICE_MANAGER.

ALTER TABLE "ticket_assignments"
  ADD COLUMN IF NOT EXISTS "assignment_type" TEXT NOT NULL DEFAULT 'FIELD_EXECUTIVE';

ALTER TABLE "ticket_assignments"
  ADD COLUMN IF NOT EXISTS "assigned_user_id" UUID;

ALTER TABLE "ticket_assignments"
  ADD COLUMN IF NOT EXISTS "assigned_role" TEXT;

ALTER TABLE "ticket_assignments"
  ADD COLUMN IF NOT EXISTS "assigned_by" UUID;

ALTER TABLE "ticket_assignments"
  ADD COLUMN IF NOT EXISTS "assignment_remarks" TEXT;

-- Historical rows remain FIELD_EXECUTIVE with fe_id set.
-- Service Manager assignments store assigned_user_id and may leave fe_id null.
ALTER TABLE "ticket_assignments" ALTER COLUMN "fe_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "ticket_assignments_assignment_type_idx"
  ON "ticket_assignments" ("assignment_type");

CREATE INDEX IF NOT EXISTS "ticket_assignments_assigned_user_id_idx"
  ON "ticket_assignments" ("assigned_user_id");

DO $$ BEGIN
  ALTER TABLE "ticket_assignments"
    ADD CONSTRAINT "ticket_assignments_assigned_user_id_fkey"
    FOREIGN KEY ("assigned_user_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ticket_assignments"
    ADD CONSTRAINT "ticket_assignments_assigned_by_fkey"
    FOREIGN KEY ("assigned_by")
    REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enforce assignee shape without rewriting historical FE rows.
DO $$ BEGIN
  ALTER TABLE "ticket_assignments"
    ADD CONSTRAINT "ticket_assignments_type_assignee_check"
    CHECK (
      (
        "assignment_type" = 'FIELD_EXECUTIVE'
        AND "fe_id" IS NOT NULL
      )
      OR (
        "assignment_type" = 'SERVICE_MANAGER'
        AND "assigned_user_id" IS NOT NULL
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
