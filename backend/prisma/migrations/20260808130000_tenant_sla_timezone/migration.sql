-- Tenant SLA timezone for business-hours calculations (IANA, e.g. Asia/Kolkata).
ALTER TABLE "tenant_slas"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'Asia/Kolkata';
