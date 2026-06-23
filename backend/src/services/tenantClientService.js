import { supabase } from "../supabaseClient.js";
import { safeTrim } from "../utils/http.js";

export function normalizeClientSlug(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveOrganisationIdForWrite(req, bodyOrganisationId) {
  if (req.isSuperAdmin && bodyOrganisationId) {
    return String(bodyOrganisationId);
  }
  return req.tenantId ?? null;
}

/**
 * Active client slugs for import validation (tenant-scoped unless super admin).
 * @returns {Promise<Set<string>>}
 */
export async function loadAllowedClientSlugsForTenant(req) {
  let q = supabase
    .from("tenant_clients")
    .select("slug, organisation_id")
    .eq("status", "active");

  if (!req.isSuperAdmin) {
    if (!req.tenantId) return new Set();
    q = q.eq("organisation_id", req.tenantId);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const slugs = new Set();
  for (const row of data ?? []) {
    const key = normalizeClientSlug(row.slug);
    if (key) slugs.add(key);
  }
  return slugs;
}

/**
 * @param {import('express').Request} req
 * @param {{ organisationId?: string | null, status?: string | null, activeOnly?: boolean }} opts
 */
export async function listTenantClients(req, opts = {}) {
  const organisationIdFilter = safeTrim(opts.organisationId);
  const statusFilter = safeTrim(opts.status);
  const activeOnly = opts.activeOnly === true;

  let q = supabase
    .from("tenant_clients")
    .select("*")
    .order("name", { ascending: true });

  if (!req.isSuperAdmin) {
    if (!req.tenantId) {
      return { data: [], error: null };
    }
    q = q.eq("organisation_id", req.tenantId);
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

export async function getTenantClientById(req, id) {
  const { data, error } = await supabase.from("tenant_clients").select("*").eq("id", id).maybeSingle();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };
  if (!req.isSuperAdmin && req.tenantId && data.organisation_id !== req.tenantId) {
    return { data: null, error: null, forbidden: true };
  }
  return { data, error: null };
}

export async function createTenantClient(req, body) {
  const name = safeTrim(body?.name);
  const slug = normalizeClientSlug(body?.slug);
  if (!name || !slug) {
    return { error: { status: 400, message: "name and slug are required" } };
  }

  const organisationId = resolveOrganisationIdForWrite(req, safeTrim(body?.organisation_id));
  if (!organisationId) {
    return {
      error: {
        status: req.isSuperAdmin ? 400 : 403,
        message: req.isSuperAdmin ? "organisation_id is required" : "Tenant context missing",
      },
    };
  }

  const statusRaw = safeTrim(body?.status);
  const status = statusRaw === "inactive" ? "inactive" : "active";
  const nowIso = new Date().toISOString();

  const insert = {
    organisation_id: organisationId,
    name,
    slug,
    website: safeTrim(body?.website),
    contact_name: safeTrim(body?.contact_name),
    contact_email: safeTrim(body?.contact_email),
    contact_phone: safeTrim(body?.contact_phone),
    status,
    updated_at: nowIso,
  };

  const { data, error } = await supabase.from("tenant_clients").insert(insert).select("*").single();
  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("tenant_clients_organisation_slug_unique") || msg.includes("duplicate key")) {
      return { error: { status: 400, message: `Client slug "${slug}" already exists for this tenant` } };
    }
    return { error: { status: 400, message: msg } };
  }
  return { data };
}

export async function updateTenantClient(req, id, body) {
  const existing = await getTenantClientById(req, id);
  if (existing.forbidden) return { error: { status: 403, message: "Forbidden" } };
  if (!existing.data) return { error: { status: 404, message: "Client not found" } };

  const patch = { updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "name")) {
    const name = safeTrim(body.name);
    if (!name) return { error: { status: 400, message: "name cannot be empty" } };
    patch.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "slug")) {
    const slug = normalizeClientSlug(body.slug);
    if (!slug) return { error: { status: 400, message: "slug cannot be empty" } };
    patch.slug = slug;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "website")) {
    patch.website = safeTrim(body.website);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "contact_name")) {
    patch.contact_name = safeTrim(body.contact_name);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "contact_email")) {
    patch.contact_email = safeTrim(body.contact_email);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "contact_phone")) {
    patch.contact_phone = safeTrim(body.contact_phone);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "status")) {
    const s = safeTrim(body.status);
    if (s !== "active" && s !== "inactive") {
      return { error: { status: 400, message: "status must be active or inactive" } };
    }
    patch.status = s;
  }

  const keys = Object.keys(patch).filter((k) => k !== "updated_at");
  if (keys.length === 0) {
    return { error: { status: 400, message: "No valid fields to update" } };
  }

  const { data, error } = await supabase
    .from("tenant_clients")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("tenant_clients_organisation_slug_unique") || msg.includes("duplicate key")) {
      return { error: { status: 400, message: "Client slug already exists for this tenant" } };
    }
    return { error: { status: 400, message: msg } };
  }
  return { data };
}

/** Soft delete — sets status inactive (no row removal). */
export async function deleteTenantClient(req, id) {
  const existing = await getTenantClientById(req, id);
  if (existing.forbidden) return { error: { status: 403, message: "Forbidden" } };
  if (!existing.data) return { error: { status: 404, message: "Client not found" } };
  if (existing.data.status === "inactive") {
    return { data: existing.data };
  }

  const { data, error } = await supabase
    .from("tenant_clients")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { error: { status: 400, message: error.message } };
  return { data };
}
