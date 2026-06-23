import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { isPrismaDbMode } from "./db/mode.js";
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
  if (isPrismaDbMode()) {
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
  return supabase
    .from("organisations")
    .select("id, name, slug, created_at, status")
    .order("name", { ascending: true });
}

export async function getOrganisationById(id, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.organisation.findUnique({ where: { id } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("organisations").select(selectCols).eq("id", id).maybeSingle();
}

export async function insertOrganisation(payload, selectCols = "id, name, slug, created_at, status") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.organisation.create({ data: orgPatchToPrisma(payload) });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("organisations").insert(payload).select(selectCols).single();
}

export async function findOrganisationIdBySlug(slug) {
  if (isPrismaDbMode()) {
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
  return supabase.from("organisations").select("id").eq("slug", slug).maybeSingle();
}

export async function findOrganisationsBySlugs(slugs, selectCols = "slug, name") {
  if (isPrismaDbMode()) {
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
  return supabase.from("organisations").select(selectCols).in("slug", slugs);
}

export async function listOrganisationIds() {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.organisation.findMany({ select: { id: true } });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("organisations").select("id");
}

export async function listOrganisationSlugsAndStatus() {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.organisation.findMany({
        select: { slug: true, status: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("organisations").select("slug, status");
}
