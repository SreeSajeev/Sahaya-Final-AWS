/**
 * Test database seed — idempotent baseline for repository + integration tests.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node prisma/seed-test.js
 *
 * Creates (or reuses) a test organisation with admin, FE, tenant client, and sample ticket.
 */

import dotenv from "dotenv";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env.test" });
dotenv.config();

const prisma = new PrismaClient();

const SEED_ORG_SLUG = "test-seed-org";
const SEED_ADMIN_EMAIL = "test-seed-admin@test.sahaya.local";
const SEED_SUPER_EMAIL = "test-seed-super@test.sahaya.local";
const SEED_FE_EMAIL = "test-seed-fe@test.sahaya.local";
const SEED_CLIENT_SLUG = "test-seed-client";

async function upsertOrganisation() {
  let org = await prisma.organisation.findFirst({ where: { slug: SEED_ORG_SLUG } });
  if (!org) {
    org = await prisma.organisation.create({
      data: {
        name: "Test Seed Organisation",
        slug: SEED_ORG_SLUG,
        status: "active",
        // Live organisations have no `email` column — use spoc/incoming emails.
        spocEmail: "spoc@test.sahaya.local",
        incomingEmails: ["seed-org@test.sahaya.local"],
      },
    });
    console.log("[seed] created organisation", org.id);
  } else {
    console.log("[seed] reusing organisation", org.id);
  }
  return org;
}

async function upsertUser({ email, role, organisationId, authId }) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: `Seed ${role}`,
        role,
        active: true,
        isActive: true,
        approvalStatus: "approved",
        organisationId: role === "SUPER_ADMIN" ? organisationId : organisationId,
        authId: authId || crypto.randomUUID(),
      },
    });
    console.log(`[seed] created ${role} user`, user.id);
  } else {
    console.log(`[seed] reusing ${role} user`, user.id);
  }
  return user;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[seed] DATABASE_URL is required");
    process.exit(1);
  }

  const org = await upsertOrganisation();

  const superAdmin = await upsertUser({
    email: SEED_SUPER_EMAIL,
    role: "SUPER_ADMIN",
    organisationId: org.id,
    authId: "00000000-0000-0000-0000-000000000099",
  });

  const admin = await upsertUser({
    email: SEED_ADMIN_EMAIL,
    role: "ADMIN",
    organisationId: org.id,
    authId: "00000000-0000-0000-0000-000000000001",
  });

  const feUser = await upsertUser({
    email: SEED_FE_EMAIL,
    role: "FIELD_EXECUTIVE",
    organisationId: org.id,
    authId: "00000000-0000-0000-0000-000000000002",
  });

  let fe = await prisma.fieldExecutive.findFirst({
    where: { organisationId: org.id, email: SEED_FE_EMAIL },
  });
  if (!fe) {
    fe = await prisma.fieldExecutive.create({
      data: {
        name: "Seed Field Executive",
        email: SEED_FE_EMAIL,
        phone: "919876543210",
        active: true,
        organisationId: org.id,
        userId: feUser.id,
      },
    });
    console.log("[seed] created field executive", fe.id);
  }

  let tenantClient = await prisma.tenantClient.findFirst({
    where: { organisationId: org.id, slug: SEED_CLIENT_SLUG },
  });
  if (!tenantClient) {
    tenantClient = await prisma.tenantClient.create({
      data: {
        organisationId: org.id,
        name: "Seed Tenant Client",
        slug: SEED_CLIENT_SLUG,
        status: "active",
        contactEmail: "client-contact@test.sahaya.local",
      },
    });
    console.log("[seed] created tenant client", tenantClient.id);
  }

  let ticket = await prisma.ticket.findFirst({
    where: { organisationId: org.id, ticketNumber: { startsWith: "SEED-" } },
  });
  if (!ticket) {
    ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `SEED-${Date.now()}`,
        status: "OPEN",
        organisationId: org.id,
        clientSlug: SEED_CLIENT_SLUG,
        vehicleNumber: "KA01SEED001",
        location: "Seed Test Location",
        source: "MANUAL",
        openedByEmail: SEED_ADMIN_EMAIL,
      },
    });
    console.log("[seed] created sample ticket", ticket.id);
  }

  console.log(
    JSON.stringify(
      {
        organisationId: org.id,
        superAdminId: superAdmin.id,
        adminId: admin.id,
        feId: fe.id,
        feUserId: feUser.id,
        tenantClientId: tenantClient.id,
        ticketId: ticket.id,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
