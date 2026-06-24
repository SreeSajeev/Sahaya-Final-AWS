import dotenv from "dotenv";
import { beforeAll, afterAll } from "vitest";

dotenv.config({ path: ".env.test" });
dotenv.config();

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DB_MODE = "prisma";
process.env.SMS_TEST_MODE = "true";
process.env.SMS_ENABLED = "false";
process.env.PUBLIC_COMPLAINTS_ENABLED = process.env.PUBLIC_COMPLAINTS_ENABLED || "true";
process.env.PUBLIC_OTP_ALLOW_SMS_SKIP = "true";
process.env.PUBLIC_OTP_HMAC_SECRET =
  process.env.PUBLIC_OTP_HMAC_SECRET || "test-otp-hmac-secret-for-ci-only";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    console.warn("[repo-setup] DATABASE_URL not set — repository tests will be skipped");
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
