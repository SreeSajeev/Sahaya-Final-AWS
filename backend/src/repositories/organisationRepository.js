import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

const ORG_SNAKE_TO_CAMEL = {
  name: "name",
  slug: "slug",
  status: "status",
  email: "email",
  spoc_name: "spocName",
  spoc_email: "spocEmail",
  spoc_phone: "spocPhone",
  incoming_emails: "incomingEmails",
  outgoing_emails: "outgoingEmails",
  review_field_label: "reviewFieldLabel",
  review_field_helper_text: "reviewFieldHelperText",
};

function orgPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [snake, camel] of Object.entries(ORG_SNAKE_TO_CAMEL)) {
    if (!Object.prototype.hasOwnProperty.call(patch, snake)) continue;
    data[camel] = patch[snake];
  }
  return data;
}

export async function listOrganisations() {
  
    try {
      const rows = await prisma.organisation.findMany({
        select: { id: true, name: true, slug: true, createdAt: true, status: true },
        orderBy: { name: "asc" },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function getOrganisationById(id, selectCols = "*") {
  
    try {
      const row = await prisma.organisation.findUnique({ where: { id } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function insertOrganisation(payload, selectCols = "id, name, slug, created_at, status") {
  
    try {
      const row = await prisma.organisation.create({ data: orgPatchToPrisma(payload) });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findOrganisationIdBySlug(slug) {
  
    try {
      const row = await prisma.organisation.findFirst({
        where: { slug },
        select: { id: true },
      });
      return { data: row ? { id: row.id } : null, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function findOrganisationsBySlugs(slugs, selectCols = "slug, name") {
  
    try {
      const rows = await prisma.organisation.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, name: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listOrganisationIds() {
  
    try {
      const rows = await prisma.organisation.findMany({ select: { id: true } });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listOrganisationSlugsAndStatus() {
  
    try {
      const rows = await prisma.organisation.findMany({
        select: { slug: true, status: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listActiveOrganisationsPublic() {
  try {
    const rows = await prisma.organisation.findMany({
      where: { status: "active" },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findOrganisationsByIds(ids, selectCols = "id, name") {
  try {
    const rows = await prisma.organisation.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listOrganisationsByFilter(filter = {}) {
  try {
    /** @type {import('@prisma/client').Prisma.OrganisationWhereInput} */
    const where = {};
    if (filter.organisationId) where.id = filter.organisationId;
    if (filter.slug) where.slug = filter.slug;
    const rows = await prisma.organisation.findMany({
      where,
      select: {
        id: true,
        slug: true,
        spocEmail: true,
        outgoingEmails: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
