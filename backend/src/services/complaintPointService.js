import { APP_BASE_URL, TENANT_CLIENTS_ENABLED } from "../config/appConfig.js";
import { safeTrim } from "../utils/http.js";
import { generateUniqueComplaintPointPublicToken } from "../utils/publicToken.js";
import { loadAllowedClientSlugsForTenant, normalizeClientSlug } from "./tenantClientService.js";
import {
  listComplaintPoints as listComplaintPointsRepo,
  findComplaintPointById,
  insertComplaintPoint,
  updateComplaintPointById,
} from "../repositories/tenantComplaintPointRepository.js";

function resolveOrganisationIdForWrite(req, bodyOrganisationId) {
  if (req.isSuperAdmin && bodyOrganisationId) {
    return String(bodyOrganisationId);
  }
  return req.tenantId ?? null;
}

export function buildComplaintPointPublicUrl(publicToken) {
  const base = String(APP_BASE_URL || "").replace(/\/$/, "");
  const token = String(publicToken || "").trim();
  if (!base || !token) return null;
  return `${base}/public/report/${token}`;
}

export function enrichComplaintPointRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    public_url: buildComplaintPointPublicUrl(row.public_token),
  };
}

/**
 * @param {import('express').Request} req
 * @param {{ organisationId?: string | null, status?: string | null }} [opts]
 */
export async function listComplaintPoints(req, opts = {}) {
  const organisationIdFilter = safeTrim(opts.organisationId);
  const statusFilter = safeTrim(opts.status);

  if (!req.isSuperAdmin) {
    if (!req.tenantId) {
      return { data: [], error: null };
    }
  }

  const organisationId = !req.isSuperAdmin
    ? req.tenantId
    : organisationIdFilter || undefined;

  const status =
    statusFilter === "active" || statusFilter === "disabled" ? statusFilter : undefined;

  const { data, error } = await listComplaintPointsRepo({
    organisationId: organisationId ?? undefined,
    status,
  });
  if (error) return { data: [], error };
  return { data: (data ?? []).map(enrichComplaintPointRow), error: null };
}

/**
 * @param {import('express').Request} req
 * @param {string} id
 */
export async function getComplaintPointById(req, id) {
  const { data, error } = await findComplaintPointById(id);

  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };
  if (!req.isSuperAdmin && req.tenantId && data.organisation_id !== req.tenantId) {
    return { data: null, error: null, forbidden: true };
  }
  return { data: enrichComplaintPointRow(data), error: null };
}

async function validateDefaultClientSlugForOrg(req, organisationId, slug) {
  if (!slug) return null;
  const normalized = normalizeClientSlug(slug);
  if (!normalized) {
    return { status: 400, message: "default_client_slug format is invalid" };
  }
  if (!TENANT_CLIENTS_ENABLED) {
    return null;
  }
  const allowed = await loadAllowedClientSlugsForTenant({
    ...req,
    tenantId: organisationId,
    isSuperAdmin: false,
  });
  if (!allowed.has(normalized)) {
    return {
      status: 400,
      message: `default_client_slug "${normalized}" is not an active client for this tenant`,
    };
  }
  return null;
}

/**
 * @param {import('express').Request} req
 * @param {object} body — validated create body
 */
export async function createComplaintPoint(req, body) {
  const organisationId = resolveOrganisationIdForWrite(req, body.organisation_id);
  if (!organisationId) {
    return {
      error: {
        status: req.isSuperAdmin ? 400 : 403,
        message: req.isSuperAdmin ? "organisation_id is required" : "Tenant context missing",
      },
    };
  }

  const slugError = await validateDefaultClientSlugForOrg(
    req,
    organisationId,
    body.default_client_slug
  );
  if (slugError) return { error: slugError };

  let publicToken;
  try {
    publicToken = await generateUniqueComplaintPointPublicToken();
  } catch (err) {
    return { error: { status: 500, message: err?.message || "Failed to generate public token" } };
  }

  const nowIso = new Date().toISOString();
  const insert = {
    organisation_id: organisationId,
    name: body.name,
    description: body.description ?? null,
    building: body.building ?? null,
    floor: body.floor ?? null,
    site_name: body.site_name ?? null,
    asset_reference: body.asset_reference ?? null,
    default_client_slug: body.default_client_slug ?? null,
    default_category: body.default_category ?? null,
    default_issue_type: body.default_issue_type ?? null,
    public_token: publicToken,
    status: "active",
    token_version: 1,
    created_at: nowIso,
    updated_at: nowIso,
    created_by_user_id: req.appUser?.id ?? null,
  };

  const { data, error } = await insertComplaintPoint(insert);

  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("tenant_complaint_points_org_name_unique") || msg.includes("duplicate key")) {
      return {
        error: { status: 400, message: `Complaint point name "${body.name}" already exists for this tenant` },
      };
    }
    if (msg.includes("tenant_complaint_points_org_token_unique")) {
      return { error: { status: 500, message: "Public token collision; retry" } };
    }
    return { error: { status: 400, message: msg } };
  }

  return { data: enrichComplaintPointRow(data) };
}

/**
 * @param {import('express').Request} req
 * @param {string} id
 * @param {object} body — validated update body
 */
export async function updateComplaintPoint(req, id, body) {
  const existing = await getComplaintPointById(req, id);
  if (existing.forbidden) return { error: { status: 403, message: "Forbidden" } };
  if (!existing.data) return { error: { status: 404, message: "Complaint point not found" } };

  const patch = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.building !== undefined) patch.building = body.building;
  if (body.floor !== undefined) patch.floor = body.floor;
  if (body.site_name !== undefined) patch.site_name = body.site_name;
  if (body.asset_reference !== undefined) patch.asset_reference = body.asset_reference;
  if (body.default_category !== undefined) patch.default_category = body.default_category;
  if (body.default_issue_type !== undefined) patch.default_issue_type = body.default_issue_type;

  if (body.default_client_slug !== undefined) {
    const slugError = await validateDefaultClientSlugForOrg(
      req,
      existing.data.organisation_id,
      body.default_client_slug
    );
    if (slugError) return { error: slugError };
    patch.default_client_slug = body.default_client_slug;
  }

  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === "disabled") {
      patch.disabled_at = new Date().toISOString();
    } else {
      patch.disabled_at = null;
    }
  }

  const { data, error } = await updateComplaintPointById(id, patch);

  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("tenant_complaint_points_org_name_unique") || msg.includes("duplicate key")) {
      return { error: { status: 400, message: "Complaint point name already exists for this tenant" } };
    }
    return { error: { status: 400, message: msg } };
  }

  return { data: enrichComplaintPointRow(data) };
}

/**
 * @param {import('express').Request} req
 * @param {string} id
 */
export async function disableComplaintPoint(req, id) {
  const existing = await getComplaintPointById(req, id);
  if (existing.forbidden) return { error: { status: 403, message: "Forbidden" } };
  if (!existing.data) return { error: { status: 404, message: "Complaint point not found" } };
  if (existing.data.status === "disabled") {
    return { data: existing.data };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await updateComplaintPointById(id, {
    status: "disabled",
    disabled_at: nowIso,
    updated_at: nowIso,
  });

  if (error) return { error: { status: 400, message: error.message } };
  return { data: enrichComplaintPointRow(data) };
}

/**
 * @param {import('express').Request} req
 * @param {string} id
 */
export async function regenerateComplaintPointToken(req, id) {
  const existing = await getComplaintPointById(req, id);
  if (existing.forbidden) return { error: { status: 403, message: "Forbidden" } };
  if (!existing.data) return { error: { status: 404, message: "Complaint point not found" } };

  let publicToken;
  try {
    publicToken = await generateUniqueComplaintPointPublicToken();
  } catch (err) {
    return { error: { status: 500, message: err?.message || "Failed to generate public token" } };
  }

  const nextVersion = Number(existing.data.token_version ?? 1) + 1;
  const nowIso = new Date().toISOString();

  const { data, error } = await updateComplaintPointById(id, {
    public_token: publicToken,
    token_version: nextVersion,
    updated_at: nowIso,
  });

  if (error) return { error: { status: 400, message: error.message } };
  return {
    data: enrichComplaintPointRow(data),
    previous_token_version: existing.data.token_version ?? 1,
  };
}

/** Soft delete — sets status disabled (no row removal). */
export async function deleteComplaintPoint(req, id) {
  return disableComplaintPoint(req, id);
}
