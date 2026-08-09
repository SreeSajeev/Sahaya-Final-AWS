import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";

const USER_SNAKE_TO_CAMEL = {
  auth_id: "authId",
  email: "email",
  name: "name",
  role: "role",
  active: "active",
  is_active: "isActive",
  approval_status: "approvalStatus",
  organisation_id: "organisationId",
  client_slug: "clientSlug",
  password_hash: "passwordHash",
  password_changed_at: "passwordChangedAt",
  last_login_at: "lastLoginAt",
};

function userPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [snake, camel] of Object.entries(USER_SNAKE_TO_CAMEL)) {
    if (!Object.prototype.hasOwnProperty.call(patch, snake)) continue;
    data[camel] = patch[snake];
  }
  return data;
}

export async function findAppUserByAuthId(authId) {
  const select = "id, role, is_active, active, organisation_id, name, email";
  
    try {
      const row = await prisma.user.findFirst({
        where: { authId },
        select: {
          id: true,
          role: true,
          isActive: true,
          active: true,
          organisationId: true,
          name: true,
          email: true,
        },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findTenantContextUserByAuthId(authId) {
  const select = "id, role, organisation_id, is_active, active";
  
    try {
      const row = await prisma.user.findFirst({
        where: { authId },
        select: {
          id: true,
          role: true,
          organisationId: true,
          isActive: true,
          active: true,
        },
      });
      return row ? mapPrismaRowToSnake(row) : null;
    } catch {
      return null;
    }
}

export async function findUserByAuthId(authId, selectCols = "*") {
  
    try {
      const row = await prisma.user.findFirst({ where: { authId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findUserByEmail(email, selectCols = "*") {
  
    try {
      const row = await prisma.user.findUnique({ where: { email: String(email) } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findUserById(userId, selectCols = "*") {
  
    try {
      const row = await prisma.user.findUnique({ where: { id: userId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findUserNameById(userId) {
  
    try {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      return { data: row ? { name: row.name } : null, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function insertUser(payload) {
  
    try {
      const row = await prisma.user.create({ data: userPatchToPrisma(payload) });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function updateUserById(userId, patch, selectCols = "*") {
  
    try {
      const row = await prisma.user.update({
        where: { id: userId },
        data: userPatchToPrisma(patch),
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function updateUserAuthIdById(userId, authId, selectCols = "*") {
  return updateUserById(userId, { auth_id: authId }, selectCols);
}

export async function listUsersScoped(req, { limit, offset, organisationId, approvalStatus, role }) {
  try {
    const where = { ...buildPrismaOrgWhere(req) };
    if (req?.isSuperAdmin && organisationId) where.organisationId = organisationId;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (role) where.role = role;
    // Never return password hashes (or other auth secrets) via list APIs.
    const rows = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        isActive: true,
        approvalStatus: true,
        organisationId: true,
        clientSlug: true,
        authId: true,
        createdAt: true,
        lastLoginAt: true,
        passwordChangedAt: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listUsersOrganisationIds(limit) {
  
    try {
      const rows = await prisma.user.findMany({
        select: { organisationId: true },
        take: limit + 1,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function countUsersGlobal() {
  
    try {
      const count = await prisma.user.count();
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
}

export async function findUsersByEmails(emails, selectCols = "email, name") {
  
    try {
      const rows = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { email: true, name: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findUsersByIds(ids, selectCols = "id, name, email") {
  
    try {
      const rows = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findMeProfileByAuthId(authId) {
  const select =
    "id, name, email, role, active, is_active, client_slug, organisation_id, approval_status, created_at";
  
    try {
      const row = await prisma.user.findFirst({
        where: { authId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          isActive: true,
          clientSlug: true,
          organisationId: true,
          approvalStatus: true,
          createdAt: true,
        },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findUserByEmailForLookup(email) {
  
    try {
      const row = await prisma.user.findUnique({ where: { email: String(email) } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listTenantAdminUsers(organisationId) {
  try {
    const rows = await prisma.user.findMany({
      where: { organisationId, role: "ADMIN" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organisationId: true,
        active: true,
        isActive: true,
        approvalStatus: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findUserOrganisationIdByEmail(email) {
  try {
    const row = await prisma.user.findFirst({
      where: { email: String(email), organisationId: { not: null } },
      select: { organisationId: true },
    });
    return { data: row ? { organisation_id: row.organisationId } : null, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listClientUsersByOrganisation(organisationId) {
  try {
    const rows = await prisma.user.findMany({
      where: { organisationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        clientSlug: true,
        organisationId: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listUsersByRole(role, selectCols = "id, email, organisation_id, role") {
  try {
    const rows = await prisma.user.findMany({
      where: { role },
      select: {
        id: true,
        email: true,
        organisationId: true,
        role: true,
      },
    });
    if (selectCols === "*") return { data: mapPrismaRowsToSnake(rows), error: null };
    const cols = String(selectCols)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const data = mapPrismaRowsToSnake(rows).map((row) => {
      /** @type {Record<string, unknown>} */
      const filtered = {};
      for (const col of cols) {
        if (Object.prototype.hasOwnProperty.call(row, col)) filtered[col] = row[col];
      }
      return filtered;
    });
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

/** STAFF + ADMIN users for analytics SM scorecards (tenant-scoped). */
export async function listStaffUsersForAnalytics(req) {
  try {
    const rows = await prisma.user.findMany({
      where: {
        ...buildPrismaOrgWhere(req),
        role: { in: ["STAFF", "ADMIN"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organisationId: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
