import dotenv from "dotenv";
import { vi, beforeAll, afterAll } from "vitest";

dotenv.config({ path: ".env.test" });
dotenv.config();

process.env.NODE_ENV = "test";
process.env.DB_MODE = "prisma";
process.env.SAHAYA_TEST_MODE = "1";
process.env.SMS_TEST_MODE = "true";
process.env.SMS_ENABLED = "false";
process.env.PUBLIC_COMPLAINTS_ENABLED = "true";
process.env.PUBLIC_OTP_ALLOW_SMS_SKIP = "true";
process.env.PUBLIC_OTP_HMAC_SECRET =
  process.env.PUBLIC_OTP_HMAC_SECRET || "test-otp-hmac-secret-for-ci-only";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.PROVISION_SERVER_SIDE_ENABLED = "true";
process.env.TENANT_CLIENTS_ENABLED = "true";

vi.mock("../../src/middleware/auth.js", () => ({
  requireAuth(req, _res, next) {
    const authId = req.headers["x-test-auth-id"] || "00000000-0000-0000-0000-000000000001";
    const email = req.headers["x-test-email"] || "admin@test.sahaya.local";
    req.user = { id: authId, email };
    // Populate appUser early so attachTenantContext (often mounted before requireAppUser)
    // can resolve tenantId the same way production JWT resolution does.
    if (req.headers["x-test-user-id"]) {
      const role = req.headers["x-test-role"] || "ADMIN";
      const organisationId = req.headers["x-test-org-id"] || null;
      req.appUser = {
        id: req.headers["x-test-user-id"],
        role,
        organisation_id: organisationId,
        organisationId,
        is_active: true,
        active: true,
        email,
      };
    }
    next();
  },
  requireAppUser(req, res, next) {
    if (!req.headers["x-test-user-id"]) {
      return res.status(403).json({ error: "App user required (set x-test-user-id)" });
    }
    const role = req.headers["x-test-role"] || "ADMIN";
    const organisationId = req.headers["x-test-org-id"] || null;
    req.appUser = {
      id: req.headers["x-test-user-id"],
      role,
      organisation_id: organisationId,
      organisationId,
      is_active: true,
      active: true,
      email: req.headers["x-test-email"] || "admin@test.sahaya.local",
    };
    next();
  },
}));

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    console.warn("[integration-setup] DATABASE_URL not set — integration tests will be skipped");
    return;
  }
  const { prisma } = await import("../../src/db/prisma.js");
  await prisma.$connect();
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const { prisma } = await import("../../src/db/prisma.js");
  await prisma.$disconnect();
});
