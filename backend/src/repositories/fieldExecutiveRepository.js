import { prisma } from "../db/prisma.js";
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
  
    try {
      const row = await prisma.fieldExecutive.create({ data: fePatchToPrisma(payload) });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function getFieldExecutiveOrgByIdScoped(req, id) {
  
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

export async function updateFieldExecutiveById(id, patch) {
  
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

export async function getFieldExecutiveByIdScoped(req, id, selectCols = "*") {
  
    try {
      const row = await prisma.fieldExecutive.findFirst({
        where: { id, ...buildPrismaOrgWhere(req) },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listFieldExecutivesScoped(req, { limit, offset, organisationIdOverride, activeOnly
}) {
  
    try {
      const where = { ...buildPrismaOrgWhere(req) };
      // Super-admin: optional org filter (required for assign UIs so cross-tenant FEs are not listed).
      // Tenant users: ignore override that points outside their tenant (scope already applied).
      if (organisationIdOverride) {
        if (req?.isSuperAdmin) {
          where.organisationId = organisationIdOverride;
        } else if (req?.tenantId && String(organisationIdOverride) === String(req.tenantId)) {
          where.organisationId = organisationIdOverride;
        }
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

export async function listAllFieldExecutivesScoped(req) {
  
    try {
      const rows = await prisma.fieldExecutive.findMany({
        where: buildPrismaOrgWhere(req),
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listFieldExecutivesOrganisationIds(limit) {
  
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

export async function countFieldExecutivesGlobal() {
  
    try {
      const count = await prisma.fieldExecutive.count();
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
}

export async function getFieldExecutiveContactById(feId) {
  
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

export async function findFieldExecutiveByUserId(userId, tenantId = null) {
  
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

export async function findFieldExecutiveByName(name, tenantId = null) {
  
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

export async function getFieldExecutiveById(feId, selectCols = "*") {
  
    try {
      const row = await prisma.fieldExecutive.findUnique({ where: { id: feId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findFieldExecutiveByUserIdFull(userId, selectCols = "*") {
  
    try {
      const row = await prisma.fieldExecutive.findFirst({ where: { userId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listFieldExecutivesByOrganisationId(organisationId) {
  try {
    const rows = await prisma.fieldExecutive.findMany({
      where: { organisationId },
      select: { id: true, name: true, email: true, active: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findFieldExecutivesByIds(ids, selectCols = "id, name, email") {
  try {
    const rows = await prisma.fieldExecutive.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listUnlinkedFieldExecutivesByOrganisation(organisationId) {
  try {
    const rows = await prisma.fieldExecutive.findMany({
      where: { organisationId, userId: null },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function updateFieldExecutiveIfUserIdNull(feId, patch) {
  try {
    const existing = await prisma.fieldExecutive.findFirst({
      where: { id: feId, userId: null },
    });
    if (!existing) return { data: null, error: null };
    const row = await prisma.fieldExecutive.update({
      where: { id: feId },
      data: fePatchToPrisma(patch),
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listAllFieldExecutivesOrdered(selectCols = "*") {
  try {
    const rows = await prisma.fieldExecutive.findMany({
      orderBy: { name: "asc" },
    });
    const data = mapPrismaRowsToSnake(rows);
    if (selectCols === "*") return { data, error: null };
    const cols = String(selectCols)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const filtered = data.map((row) => {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const col of cols) {
        if (Object.prototype.hasOwnProperty.call(row, col)) out[col] = row[col];
      }
      return out;
    });
    return { data: filtered, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
