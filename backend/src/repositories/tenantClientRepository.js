import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

function tenantClientInsertToPrisma(insert) {
  return {
    organisationId: insert.organisation_id,
    name: insert.name,
    slug: insert.slug,
    website: insert.website ?? null,
    contactName: insert.contact_name ?? null,
    contactEmail: insert.contact_email ?? null,
    contactPhone: insert.contact_phone ?? null,
    status: insert.status,
    updatedAt: insert.updated_at ? new Date(insert.updated_at) : new Date(),
  };
}

function tenantClientPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  if (Object.prototype.hasOwnProperty.call(patch, "name")) data.name = patch.name;
  if (Object.prototype.hasOwnProperty.call(patch, "slug")) data.slug = patch.slug;
  if (Object.prototype.hasOwnProperty.call(patch, "website")) data.website = patch.website;
  if (Object.prototype.hasOwnProperty.call(patch, "contact_name")) data.contactName = patch.contact_name;
  if (Object.prototype.hasOwnProperty.call(patch, "contact_email")) data.contactEmail = patch.contact_email;
  if (Object.prototype.hasOwnProperty.call(patch, "contact_phone")) data.contactPhone = patch.contact_phone;
  if (Object.prototype.hasOwnProperty.call(patch, "status")) data.status = patch.status;
  if (Object.prototype.hasOwnProperty.call(patch, "updated_at")) {
    data.updatedAt = new Date(String(patch.updated_at));
  }
  return data;
}

export async function listTenantClientsQuery({ isSuperAdmin, tenantId, organisationIdFilter, statusFilter, activeOnly }) {
  if (isPrismaDbMode()) {
    try {
      /** @type {import('@prisma/client').Prisma.TenantClientWhereInput} */
      const where = {};
      if (!isSuperAdmin) {
        if (!tenantId) return { data: [], error: null };
        where.organisationId = tenantId;
      } else if (organisationIdFilter) {
        where.organisationId = organisationIdFilter;
      }
      if (statusFilter) {
        where.status = statusFilter;
      } else if (activeOnly) {
        where.status = "active";
      }
      const rows = await prisma.tenantClient.findMany({
        where,
        orderBy: { name: "asc" },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: [], error: toSupabaseStyleError(err) };
    }
  }

  let q = supabase.from("tenant_clients").select("*").order("name", { ascending: true });
  if (!isSuperAdmin) {
    if (!tenantId) return { data: [], error: null };
    q = q.eq("organisation_id", tenantId);
  } else if (organisationIdFilter) {
    q = q.eq("organisation_id", organisationIdFilter);
  }
  if (statusFilter) {
    q = q.eq("status", statusFilter);
  } else if (activeOnly) {
    q = q.eq("status", "active");
  }
  const { data, error } = await q;
  return { data: data ?? [], error };
}

export async function getTenantClientByIdRow(id) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.tenantClient.findUnique({ where: { id } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("tenant_clients").select("*").eq("id", id).maybeSingle();
}

export async function insertTenantClientRow(insert) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.tenantClient.create({
        data: tenantClientInsertToPrisma(insert),
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("tenant_clients").insert(insert).select("*").single();
}

export async function updateTenantClientRow(id, patch) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.tenantClient.update({
        where: { id },
        data: tenantClientPatchToPrisma(patch),
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("tenant_clients").update(patch).eq("id", id).select("*").single();
}

export async function loadActiveTenantClientSlugs({ isSuperAdmin, tenantId }) {
  const { data, error } = await listTenantClientsQuery({
    isSuperAdmin,
    tenantId,
    organisationIdFilter: null,
    statusFilter: "active",
    activeOnly: true,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}
