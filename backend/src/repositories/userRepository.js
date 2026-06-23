import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { scopeQueryByTenant } from "../middleware/tenantContext.js";
import { isPrismaDbMode } from "./db/mode.js";
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
  if (isPrismaDbMode()) {
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
  return supabase.from("users").select(select).eq("auth_id", authId).maybeSingle();
}

export async function findTenantContextUserByAuthId(authId) {
  const select = "id, role, organisation_id, is_active, active";
  if (isPrismaDbMode()) {
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
  const { data } = await supabase.from("users").select(select).eq("auth_id", authId).maybeSingle();
  return data ?? null;
}

export async function findUserByAuthId(authId, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.user.findFirst({ where: { authId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("users").select(selectCols).eq("auth_id", authId).maybeSingle();
}

export async function findUserByEmail(email, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.user.findUnique({ where: { email: String(email) } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("users").select(selectCols).eq("email", email).maybeSingle();
}

export async function findUserById(userId, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.user.findUnique({ where: { id: userId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("users").select(selectCols).eq("id", userId).maybeSingle();
}

export async function findUserNameById(userId) {
  if (isPrismaDbMode()) {
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
  return supabase.from("users").select("name").eq("id", userId).maybeSingle();
}

export async function insertUser(payload) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.user.create({ data: userPatchToPrisma(payload) });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("users").insert(payload).select("*").single();
}

export async function updateUserById(userId, patch, selectCols = "*") {
  if (isPrismaDbMode()) {
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
  return supabase.from("users").update(patch).eq("id", userId).select(selectCols).single();
}

export async function updateUserAuthIdById(userId, authId, selectCols = "*") {
  return updateUserById(userId, { auth_id: authId }, selectCols);
}

export async function listUsersScoped(req, { limit, offset, organisationId, approvalStatus, role }) {
  if (isPrismaDbMode()) {
    try {
      const where = { ...buildPrismaOrgWhere(req) };
      if (req?.isSuperAdmin && organisationId) where.organisationId = organisationId;
      if (approvalStatus) where.approvalStatus = approvalStatus;
      if (role) where.role = role;
      const rows = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("users").select("*").order("created_at", { ascending: false });
  if (!req.isSuperAdmin) {
    q = scopeQueryByTenant(q, req);
  } else if (organisationId) {
    q = q.eq("organisation_id", organisationId);
  }
  if (approvalStatus) q = q.eq("approval_status", approvalStatus);
  if (role) q = q.eq("role", role);
  q = q.range(offset, offset + limit - 1);
  return q;
}

export async function listUsersOrganisationIds(limit) {
  if (isPrismaDbMode()) {
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
  return supabase.from("users").select("organisation_id").limit(limit + 1);
}

export async function countUsersGlobal() {
  if (isPrismaDbMode()) {
    try {
      const count = await prisma.user.count();
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("users").select("id", { count: "exact", head: true });
}

export async function findUsersByEmails(emails, selectCols = "email, name") {
  if (isPrismaDbMode()) {
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
  return supabase.from("users").select(selectCols).in("email", emails);
}

export async function findUsersByIds(ids, selectCols = "id, name, email") {
  if (isPrismaDbMode()) {
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
  return supabase.from("users").select(selectCols).in("id", ids);
}

export async function findMeProfileByAuthId(authId) {
  const select =
    "id, name, email, role, active, is_active, client_slug, organisation_id, approval_status, created_at";
  if (isPrismaDbMode()) {
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
  return supabase.from("users").select(select).eq("auth_id", authId).maybeSingle();
}

export async function findUserByEmailForLookup(email) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.user.findUnique({ where: { email: String(email) } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("users").select("name, email").eq("email", email).maybeSingle();
}
