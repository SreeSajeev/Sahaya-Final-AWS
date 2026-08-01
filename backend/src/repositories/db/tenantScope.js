/** Same sentinel as middleware/tenantContext — no rows when tenant missing for non–super-admin */
export const TENANT_DENY_SENTINEL = "00000000-0000-0000-0000-000000000000";

/**
 * Prisma WHERE fragment for organisation scoping (mirrors scopeQueryByTenant).
 * @param {import('express').Request | { isSuperAdmin?: boolean, tenantId?: string | null } | null | undefined} req
 * @param {string} orgField camelCase Prisma field name, default organisationId
 */
export function buildPrismaOrgWhere(req, orgField = "organisationId") {
  if (req?.isSuperAdmin) return {};
  if (!req?.tenantId) return { [orgField]: TENANT_DENY_SENTINEL };
  return { [orgField]: req.tenantId };
}
