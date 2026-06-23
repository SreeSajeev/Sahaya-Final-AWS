import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { scopeQueryByTenant } from "../middleware/tenantContext.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";

const FE_SNAKE_TO_CAMEL = {
  name: "name",
  email: "email",
  phone: "phone",
  base_location: "baseLocation",
  skills: "skills",
  active: "active",
  organisation_id: "organisationId",
  user_id: "userId",
};

function fePatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [snake, camel] of Object.entries(FE_SNAKE_TO_CAMEL)) {
    if (!Object.prototype.hasOwnProperty.call(patch, snake)) continue;
    data[camel] = patch[snake];
  }
  return data;
}

export async function insertFieldExecutive(payload) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.create({ data: fePatchToPrisma(payload) });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("field_executives").insert(payload).select("*").single();
}

export async function getFieldExecutiveOrgByIdScoped(req, id) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.findFirst({
        where: { id, ...buildPrismaOrgWhere(req) },
        select: { id: true, organisationId: true },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("field_executives").select("id, organisation_id").eq("id", id);
  q = scopeQueryByTenant(q, req);
  return q.maybeSingle();
}

export async function updateFieldExecutiveById(id, patch) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.update({
        where: { id },
        data: fePatchToPrisma(patch),
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("field_executives").update(patch).eq("id", id).select("*").single();
}

export async function getFieldExecutiveByIdScoped(req, id, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.findFirst({
        where: { id, ...buildPrismaOrgWhere(req) },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("field_executives").select(selectCols).eq("id", id);
  q = scopeQueryByTenant(q, req);
  return q.maybeSingle();
}

export async function listFieldExecutivesScoped(req, { limit, offset, organisationIdOverride, activeOnly }) {
  if (isPrismaDbMode()) {
    try {
      const where = { ...buildPrismaOrgWhere(req) };
      if (req?.isSuperAdmin && organisationIdOverride) {
        where.organisationId = organisationIdOverride;
      }
      if (activeOnly) where.active = true;
      const rows = await prisma.fieldExecutive.findMany({
        where,
        orderBy: { name: "asc" },
        skip: offset,
        take: limit,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("field_executives").select("*").order("name", { ascending: true });
  if (!req.isSuperAdmin) {
    q = scopeQueryByTenant(q, req);
  } else if (organisationIdOverride) {
    q = q.eq("organisation_id", organisationIdOverride);
  }
  if (activeOnly) q = q.eq("active", true);
  q = q.range(offset, offset + limit - 1);
  return q;
}

export async function listAllFieldExecutivesScoped(req) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.fieldExecutive.findMany({
        where: buildPrismaOrgWhere(req),
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("field_executives").select("*");
  q = scopeQueryByTenant(q, req);
  return q;
}

export async function listFieldExecutivesOrganisationIds(limit) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.fieldExecutive.findMany({
        select: { organisationId: true },
        take: limit + 1,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("field_executives").select("organisation_id").limit(limit + 1);
}

export async function countFieldExecutivesGlobal() {
  if (isPrismaDbMode()) {
    try {
      const count = await prisma.fieldExecutive.count();
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("field_executives").select("id", { count: "exact", head: true });
}

export async function getFieldExecutiveContactById(feId) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.findUnique({
        where: { id: feId },
        select: { email: true, phone: true },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("field_executives").select("email, phone").eq("id", feId).maybeSingle();
}

export async function findFieldExecutiveByUserId(userId, tenantId = null) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.findFirst({
        where: {
          userId,
          ...(tenantId ? { organisationId: tenantId } : {}),
        },
        select: { id: true, organisationId: true },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("field_executives").select("id, organisation_id").eq("user_id", userId);
  if (tenantId) q = q.eq("organisation_id", tenantId);
  return q.maybeSingle();
}

export async function findFieldExecutiveByName(name, tenantId = null) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.findFirst({
        where: {
          name,
          ...(tenantId ? { organisationId: tenantId } : {}),
        },
        select: { id: true, organisationId: true },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("field_executives").select("id, organisation_id").eq("name", name);
  if (tenantId) q = q.eq("organisation_id", tenantId);
  return q.maybeSingle();
}

export async function getFieldExecutiveById(feId, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.findUnique({ where: { id: feId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("field_executives").select(selectCols).eq("id", feId).maybeSingle();
}

export async function findFieldExecutiveByUserIdFull(userId, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.fieldExecutive.findFirst({ where: { userId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("field_executives").select(selectCols).eq("user_id", userId).maybeSingle();
}
