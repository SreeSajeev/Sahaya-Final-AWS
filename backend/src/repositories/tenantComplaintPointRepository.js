import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

const POINT_SNAKE_TO_CAMEL = {
  organisation_id: "organisationId",
  name: "name",
  description: "description",
  building: "building",
  floor: "floor",
  site_name: "siteName",
  asset_reference: "assetReference",
  default_client_slug: "defaultClientSlug",
  default_category: "defaultCategory",
  default_issue_type: "defaultIssueType",
  public_token: "publicToken",
  status: "status",
  token_version: "tokenVersion",
  created_at: "createdAt",
  updated_at: "updatedAt",
  disabled_at: "disabledAt",
  created_by_user_id: "createdByUserId",
};

function pointPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [snake, camel] of Object.entries(POINT_SNAKE_TO_CAMEL)) {
    if (!Object.prototype.hasOwnProperty.call(patch, snake)) continue;
    const v = patch[snake];
    if (
      (snake === "created_at" || snake === "updated_at" || snake === "disabled_at") &&
      v != null
    ) {
      data[camel] = new Date(String(v));
    } else {
      data[camel] = v;
    }
  }
  return data;
}

function pointCreateToPrisma(row) {
  return pointPatchToPrisma(row);
}

export async function findActiveComplaintPointByPublicToken(publicToken) {
  try {
    const row = await prisma.tenantComplaintPoint.findFirst({
      where: { publicToken, status: "active" },
      select: {
        id: true,
        organisationId: true,
        name: true,
        status: true,
        publicToken: true,
      },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findComplaintPointByPublicToken(publicToken) {
  try {
    const row = await prisma.tenantComplaintPoint.findFirst({
      where: { publicToken },
      select: { id: true },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listComplaintPoints({ organisationId, status, orderByName = true } = {}) {
  try {
    const rows = await prisma.tenantComplaintPoint.findMany({
      where: {
        ...(organisationId ? { organisationId } : {}),
        ...(status === "active" || status === "disabled" ? { status } : {}),
      },
      orderBy: orderByName ? { name: "asc" } : undefined,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: [], error: toSupabaseStyleError(err) };
  }
}

export async function findComplaintPointById(id) {
  try {
    const row = await prisma.tenantComplaintPoint.findUnique({ where: { id } });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findComplaintPointByIdSelect(id, selectCols) {
  try {
    const row = await prisma.tenantComplaintPoint.findUnique({ where: { id } });
    const mapped = mapPrismaRowToSnake(row);
    if (!mapped) return { data: null, error: null };
    if (selectCols === "*") return { data: mapped, error: null };
    const cols = String(selectCols)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    /** @type {Record<string, unknown>} */
    const filtered = {};
    for (const col of cols) {
      if (Object.prototype.hasOwnProperty.call(mapped, col)) filtered[col] = mapped[col];
    }
    return { data: filtered, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function insertComplaintPoint(row) {
  try {
    const created = await prisma.tenantComplaintPoint.create({
      data: pointCreateToPrisma(row),
    });
    return { data: mapPrismaRowToSnake(created), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function updateComplaintPointById(id, patch) {
  try {
    const updated = await prisma.tenantComplaintPoint.update({
      where: { id },
      data: pointPatchToPrisma(patch),
    });
    return { data: mapPrismaRowToSnake(updated), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getComplaintPointStatus(id) {
  try {
    const row = await prisma.tenantComplaintPoint.findUnique({
      where: { id },
      select: { status: true },
    });
    return row?.status ?? null;
  } catch {
    return null;
  }
}
