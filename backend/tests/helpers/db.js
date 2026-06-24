import crypto from "crypto";
import { prisma } from "../../src/db/prisma.js";
import { uniqueSlug, uniqueTicketNumber, uniqueEmail } from "./testContext.js";

/** @typedef {import('@prisma/client').PrismaClient} PrismaClient */

const TRACKER = {
  organisationIds: [],
  userIds: [],
  feIds: [],
  ticketIds: [],
  assignmentIds: [],
  commentIds: [],
  slaIds: [],
  tokenIds: [],
  tenantClientIds: [],
  otpSessionIds: [],
  complaintPointIds: [],
  rawEmailIds: [],
  parsedEmailIds: [],
  auditLogIds: [],
};

export function trackCleanup(type, id) {
  if (id && TRACKER[`${type}Ids`]) {
    TRACKER[`${type}Ids`].push(id);
  }
}

export async function cleanupTestData() {
  const del = async (model, ids) => {
    if (!ids.length) return;
    try {
      await prisma[model].deleteMany({ where: { id: { in: ids } } });
    } catch {
      /* best-effort */
    }
  };

  await del("auditLog", TRACKER.auditLogIds);
  await del("ticketComment", TRACKER.commentIds);
  await del("feActionToken", TRACKER.tokenIds);
  await del("slaTracking", TRACKER.slaIds);
  await del("ticketAssignment", TRACKER.assignmentIds);
  await del("parsedEmail", TRACKER.parsedEmailIds);
  await del("rawEmail", TRACKER.rawEmailIds);
  await del("publicOtpSession", TRACKER.otpSessionIds);
  await del("publicComplaintSubmission", []);
  await del("ticket", TRACKER.ticketIds);
  await del("tenantComplaintPoint", TRACKER.complaintPointIds);
  await del("tenantClient", TRACKER.tenantClientIds);
  await del("fieldExecutive", TRACKER.feIds);
  await del("user", TRACKER.userIds);
  await del("organisation", TRACKER.organisationIds);

  for (const key of Object.keys(TRACKER)) {
    TRACKER[key] = [];
  }
}

export async function createTestOrganisation(overrides = {}) {
  const slug = overrides.slug || uniqueSlug("org");
  const org = await prisma.organisation.create({
    data: {
      name: overrides.name || `Test Org ${slug}`,
      slug,
      status: overrides.status || "active",
      email: overrides.email || `org-${slug}@test.sahaya.local`,
    },
  });
  trackCleanup("organisation", org.id);
  return org;
}

export async function createTestUser(organisationId, overrides = {}) {
  const email = overrides.email || uniqueEmail(overrides.role || "user");
  const user = await prisma.user.create({
    data: {
      name: overrides.name || "Test User",
      email,
      role: overrides.role || "ADMIN",
      active: true,
      isActive: true,
      approvalStatus: "approved",
      organisationId,
      authId: overrides.authId || crypto.randomUUID(),
      clientSlug: overrides.clientSlug || null,
    },
  });
  trackCleanup("user", user.id);
  return user;
}

export async function createTestFieldExecutive(organisationId, overrides = {}) {
  const fe = await prisma.fieldExecutive.create({
    data: {
      name: overrides.name || "Test FE",
      email: overrides.email || uniqueEmail("fe"),
      phone: overrides.phone || "919999999999",
      active: true,
      organisationId,
      userId: overrides.userId ?? null,
    },
  });
  trackCleanup("fe", fe.id);
  return fe;
}

export async function createTestTicket(organisationId, overrides = {}) {
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: overrides.ticketNumber || uniqueTicketNumber(),
      status: overrides.status || "OPEN",
      organisationId,
      clientSlug: overrides.clientSlug || null,
      vehicleNumber: overrides.vehicleNumber || "KA01TEST1234",
      location: overrides.location || "Test Location",
      source: overrides.source || "MANUAL",
    },
  });
  trackCleanup("ticket", ticket.id);
  return ticket;
}

export async function createTestTenantClient(organisationId, overrides = {}) {
  const slug = overrides.slug || uniqueSlug("client");
  const row = await prisma.tenantClient.create({
    data: {
      organisationId,
      name: overrides.name || `Test Client ${slug}`,
      slug,
      status: overrides.status || "active",
    },
  });
  trackCleanup("tenantClient", row.id);
  return row;
}

export async function loadSeedIds() {
  const org = await prisma.organisation.findFirst({
    where: { slug: { startsWith: "test-seed-org" } },
    orderBy: { createdAt: "desc" },
  });
  if (!org) return null;

  const [admin, fe, ticket, tenantClient] = await Promise.all([
    prisma.user.findFirst({
      where: { organisationId: org.id, role: "ADMIN" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.fieldExecutive.findFirst({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ticket.findFirst({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tenantClient.findFirst({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { org, admin, fe, ticket, tenantClient };
}
