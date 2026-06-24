import crypto from "crypto";

export const hasTestDatabase = Boolean(process.env.DATABASE_URL);

export const describeIfDb = hasTestDatabase ? describe : describe.skip;

export function uniqueSlug(prefix = "test") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function uniqueTicketNumber() {
  return `TST-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function uniqueEmail(role = "user") {
  return `${role}.${Date.now()}.${crypto.randomBytes(3).toString("hex")}@test.sahaya.local`;
}

export function superAdminReq() {
  return { isSuperAdmin: true, tenantId: null };
}

export function tenantReq(organisationId) {
  return { isSuperAdmin: false, tenantId: organisationId };
}

export function otherTenantReq(organisationId) {
  return { isSuperAdmin: false, tenantId: organisationId };
}
