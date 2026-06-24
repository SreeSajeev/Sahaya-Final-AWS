import { TENANT_CLIENTS_ENABLED } from "../config/appConfig.js";
import { normalizeClientSlug } from "./tenantClientService.js";
import { safeTrim } from "../utils/http.js";
import { findActiveTenantClientBySlug } from "../repositories/tenantClientRepository.js";
import { listOrganisationsByFilter } from "../repositories/organisationRepository.js";
import { listClientUsersByOrganisation } from "../repositories/userRepository.js";

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeEmail(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || !SIMPLE_EMAIL_RE.test(s)) return null;
  return s;
}

/**
 * @param {unknown} json
 * @returns {string[]}
 */
function emailsFromJsonArray(json) {
  if (!Array.isArray(json)) return [];
  const out = [];
  for (const item of json) {
    const e = normalizeEmail(item);
    if (e) out.push(e);
  }
  return out;
}

/**
 * @param {{ email: string; source: string }[]} items
 * @param {string | null} email
 * @param {string} source
 */
function pushUnique(items, seen, email, source) {
  const e = normalizeEmail(email);
  if (!e) return;
  const key = e.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ email: e, source });
}

/**
 * Resolve organisation id for client slug lookup (tenant-scoped).
 * @param {import('express').Request} req
 * @param {string | null | undefined} organisationIdOverride
 * @returns {string | null}
 */
function resolveOrganisationId(req, organisationIdOverride) {
  const override = safeTrim(organisationIdOverride);
  if (req.isSuperAdmin && override) return override;
  return req.tenantId ?? null;
}

/**
 * List deduplicated notification email candidates for a client slug.
 * @param {import('express').Request} req
 * @param {{ clientSlug: string; organisationId?: string | null }} opts
 * @returns {Promise<{ items: { email: string; source: string }[]; organisationId: string | null } | { error: string; status: number }>}
 */
export async function listClientNotificationEmails(req, { clientSlug, organisationId: organisationIdOverride }) {
  const slugKey = normalizeClientSlug(clientSlug);
  if (!slugKey) {
    return { error: "client slug required", status: 400 };
  }

  const organisationId = resolveOrganisationId(req, organisationIdOverride);
  if (!req.isSuperAdmin && !organisationId) {
    return { error: "Tenant context missing", status: 403 };
  }

  /** @type {{ email: string; source: string }[]} */
  const items = [];
  const seen = new Set();

  let orgIdForUsers = organisationId;

  if (TENANT_CLIENTS_ENABLED) {
    const { data: tenantClient, error: tcErr } = await findActiveTenantClientBySlug(
      slugKey,
      organisationId
    );
    if (tcErr) return { error: tcErr.message, status: 500 };

    if (tenantClient) {
      orgIdForUsers = tenantClient.organisation_id ?? organisationId;
      pushUnique(items, seen, tenantClient.contact_email, "contact_email");
    }
  }

  // Legacy org slug match and/or tenant parent org comms (spoc + outgoing).
  const orgFilter = organisationId
    ? { organisationId }
    : req.isSuperAdmin
      ? { slug: slugKey }
      : { slug: slugKey };

  const { data: orgRows, error: orgErr } = await listOrganisationsByFilter(orgFilter);
  if (orgErr) return { error: orgErr.message, status: 500 };

  for (const org of orgRows ?? []) {
    const orgSlug = normalizeClientSlug(org.slug);
    const matchesLegacySlug = orgSlug === slugKey;
    const matchesTenantParent =
      TENANT_CLIENTS_ENABLED && organisationId && String(org.id) === String(organisationId);

    if (!matchesLegacySlug && !matchesTenantParent) continue;

    if (!orgIdForUsers) orgIdForUsers = org.id ?? null;
    pushUnique(items, seen, org.spoc_email, "spoc_email");
    for (const e of emailsFromJsonArray(org.outgoing_emails)) {
      pushUnique(items, seen, e, "outgoing_emails");
    }
  }

  if (orgIdForUsers) {
    const { data: users, error: usersErr } = await listClientUsersByOrganisation(orgIdForUsers);

    if (usersErr) return { error: usersErr.message, status: 500 };

    for (const u of users ?? []) {
      if (u.active === false) continue;
      const userSlug = normalizeClientSlug(u.client_slug);
      if (userSlug !== slugKey) continue;
      pushUnique(items, seen, u.email, "client_user");
    }
  }

  return { items, organisationId: orgIdForUsers ?? organisationId ?? null };
}

/**
 * Validate notify list is subset of allowed client emails.
 * @param {string[]} notifyEmails
 * @param {{ email: string }[]} allowed
 * @returns {{ ok: true; validated: string[] } | { ok: false; error: string }}
 */
export function validateNotifyEmailsAgainstAllowed(notifyEmails, allowed) {
  if (!Array.isArray(notifyEmails) || notifyEmails.length === 0) {
    return { ok: true, validated: [] };
  }

  const allowedSet = new Set(
    (allowed ?? [])
      .map((a) => normalizeEmail(a.email))
      .filter(Boolean)
      .map((e) => String(e).toLowerCase())
  );

  const validated = [];
  const seen = new Set();

  for (const raw of notifyEmails) {
    const e = normalizeEmail(raw);
    if (!e) continue;
    const key = e.toLowerCase();
    if (!allowedSet.has(key)) {
      return { ok: false, error: "One or more notification emails are not allowed for this client" };
    }
    if (seen.has(key)) continue;
    seen.add(key);
    validated.push(e);
  }

  return { ok: true, validated };
}
