import express from "express";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { attachTenantContext, isTenantAllowed, requireTenantOrSuperAdmin } from "../middleware/tenantContext.js";
import { insertAuditLog } from "../services/auditLogService.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import { jsonError, jsonOk, safeTrim } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { buildCreatorDisplayByTicketId } from "../utils/ticketDisplayEnrichment.js";
import { findOrganisationsBySlugs } from "../repositories/organisationRepository.js";
import { findUsersByEmails } from "../repositories/userRepository.js";
import { listTenantClientsByOrganisationId } from "../repositories/tenantClientRepository.js";
import {
  findFieldExecutiveByUserId,
  findFieldExecutiveByName,
} from "../repositories/fieldExecutiveRepository.js";
import { listFeActionTokensByFeAndTicketIds } from "../repositories/feActionTokenRepository.js";
import { listSlaRowsByTicketIds } from "../repositories/slaRepository.js";
import { computeTicketSlaView, DEFAULT_TENANT_SLA } from "../services/tenantSlaEngine.js";
import {
  listAssignmentsByFeId,
  getAssignmentWithTicketByFeAndTicket,
} from "../repositories/assignmentRepository.js";
import { getTicketByIdUnscoped, updateTicketById } from "../repositories/ticketQueryRepository.js";
import { insertComment, listCommentsForTicketIds } from "../repositories/commentRepository.js";
import { z } from "zod";

const router = express.Router();

router.use(requireAuth);
router.use(attachTenantContext({ requireAuthenticated: false }));
router.use(requireAppUser);
router.use(requireTenantOrSuperAdmin);

async function resolveFeIdFromAppUser(req) {
  const appUserId = req.appUser?.id ? String(req.appUser.id) : null;
  if (appUserId && (await hasPublicColumn("field_executives", "user_id"))) {
    const { data: byUserRow } = await findFieldExecutiveByUserId(appUserId, req.tenantId ?? null);
    if (byUserRow?.id) return byUserRow.id;
  }

  const name = req.appUser?.name ? String(req.appUser.name).trim() : "";
  if (!name) return null;
  const { data } = await findFieldExecutiveByName(name, req.tenantId ?? null);
  return data?.id ?? null;
}

/**
 * Shared enrichment for FE ticket payloads (list + single).
 * @param {{ ticket: object, assignmentDueAt: string | null, assignedAt?: string | null }[]} pairs
 */
async function enrichFeTicketPairs({ pairs, feId, req, startedAt }) {
  const tickets = pairs.map((p) => p.ticket).filter(Boolean);
  const ticketIds = tickets.map((t) => t.id).filter(Boolean);
  const assignmentDueByTicketId = new Map(
    pairs.filter((p) => p.ticket?.id).map((p) => [p.ticket.id, p.assignmentDueAt ?? null])
  );
  const assignedAtByTicketId = new Map(
    pairs.filter((p) => p.ticket?.id).map((p) => [p.ticket.id, p.assignedAt ?? null])
  );

  const slaByTicketId = new Map();
  if (ticketIds.length > 0) {
    const { data: slaRows, error: slaErr } = await listSlaRowsByTicketIds(
      ticketIds,
      "ticket_id, assignment_deadline, onsite_deadline, resolution_deadline, assignment_breached, onsite_breached, resolution_breached"
    );
    if (!slaErr && Array.isArray(slaRows)) {
      for (const r of slaRows) {
        if (r?.ticket_id) slaByTicketId.set(r.ticket_id, r);
      }
    }
  }

  const clientSlugs = Array.from(
    new Set(
      tickets.map((t) => (t?.client_slug != null ? String(t.client_slug).trim() : "")).filter((s) => s !== "")
    )
  );
  const orgNameBySlug = new Map();
  if (clientSlugs.length > 0) {
    const { data: orgRows, error: orgErr } = await findOrganisationsBySlugs(clientSlugs);
    if (!orgErr && Array.isArray(orgRows)) {
      for (const o of orgRows) {
        const slug = o?.slug != null ? String(o.slug).trim() : "";
        if (slug) orgNameBySlug.set(slug, o?.name ?? null);
      }
    }
  }

  // Contact details belong to the tenant client rather than the ticket.  Add them to the
  // FE-scoped payload so printable offline worksheets do not need another client API call.
  const clientContactBySlug = new Map();
  if (req.tenantId) {
    const { data: clientRows, error: clientErr } = await listTenantClientsByOrganisationId(req.tenantId);
    if (!clientErr && Array.isArray(clientRows)) {
      for (const client of clientRows) {
        const slug = client?.slug != null ? String(client.slug).trim() : "";
        if (!slug) continue;
        clientContactBySlug.set(slug, {
          contact_person: client.contact_name != null && String(client.contact_name).trim() !== ""
            ? String(client.contact_name).trim()
            : null,
          contact_number: client.contact_phone != null && String(client.contact_phone).trim() !== ""
            ? String(client.contact_phone).trim()
            : null,
        });
      }
    }
  }

  const deriveClientNameFromOpenedByEmail = (openedByEmail) => {
    if (openedByEmail == null) return null;
    const email = String(openedByEmail).trim();
    if (!email) return null;
    const local = email.includes("@") ? email.split("@")[0] : email;
    const s = local.replace(/[._-]+/g, " ").trim();
    return s ? s : null;
  };

  const reporterEmails = Array.from(
    new Set(
      tickets
        .map((t) => (t?.opened_by_email != null ? String(t.opened_by_email).trim() : ""))
        .filter((e) => e !== "")
    )
  );
  const reporterNameByEmail = new Map();
  if (reporterEmails.length > 0) {
    const { data: userRows, error: userErr } = await findUsersByEmails(reporterEmails);
    if (!userErr && Array.isArray(userRows)) {
      for (const u of userRows) {
        const em = u?.email != null ? String(u.email).trim() : "";
        const nm = u?.name != null ? String(u.name).trim() : "";
        if (em && nm) {
          reporterNameByEmail.set(em, nm);
          reporterNameByEmail.set(em.toLowerCase(), nm);
        }
      }
    }
  }

  /** @type {Map<string, object[]>} */
  const tokenRowsByTicketAndType = new Map();
  let token_query_rows = 0;
  let token_query_error = null;
  if (ticketIds.length > 0) {
    const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state");

    const cols = hasTokenState
      ? "id, ticket_id, fe_id, action_type, expires_at, used, token_state, created_at"
      : "id, ticket_id, fe_id, action_type, expires_at, used, created_at";

    const { data: tokRows, error: tokErr } = await listFeActionTokensByFeAndTicketIds(
      feId,
      ticketIds,
      cols
    );

    token_query_rows = !tokErr && Array.isArray(tokRows) ? tokRows.length : 0;
    if (tokErr) {
      token_query_error = tokErr.message;
      logEvent("feMe.token_query_error", { message: tokErr.message, feId });
    } else {
      logEvent("feMe.token_query_rows", { count: token_query_rows, ticketIds: ticketIds.length, feId });
    }

    if (!tokErr && Array.isArray(tokRows)) {
      for (const tok of tokRows) {
        const tid = tok?.ticket_id;
        const type = tok?.action_type;
        if (!tid || !type) continue;
        const key = `${tid}:${type}`;
        if (!tokenRowsByTicketAndType.has(key)) tokenRowsByTicketAndType.set(key, []);
        tokenRowsByTicketAndType.get(key).push(tok);
      }
    }
  }

  const nowMs = Date.now();
  const pickDisplayToken = (rows, { resolution } = { resolution: false }) => {
    if (!rows?.length) return { chosen: null, actionable: false };
    const sorted = [...rows].sort((a, b) => {
      const tb = new Date(b?.created_at ?? 0).getTime();
      const ta = new Date(a?.created_at ?? 0).getTime();
      return tb - ta;
    });
    const notExpired = (r) => {
      const ex = r?.expires_at ? new Date(r.expires_at).getTime() : 0;
      return ex > nowMs;
    };
    const activePrefer = sorted.find((r) => !r.used && notExpired(r));
    const chosen = activePrefer || sorted[0];
    if (!chosen) return { chosen: null, actionable: false };
    let actionable = !chosen.used && notExpired(chosen);
    if (actionable && resolution) {
      const ts = chosen?.token_state != null ? String(chosen.token_state).trim().toUpperCase() : "";
      if (ts === "LOCKED") actionable = false;
    }
    return { chosen, actionable };
  };

  const tokenIsLocked = (tok) => {
    const ts = tok?.token_state != null ? String(tok.token_state).trim().toUpperCase() : "";
    return ts === "LOCKED";
  };

  const normalizeText = (raw) => {
    if (raw == null) return null;
    const s = String(raw).trim();
    return s !== "" ? s : null;
  };

  let attachSuccessOnSite = 0;
  let attachSuccessResolution = 0;
  let attachMissingOnSite = 0;
  let attachMissingResolution = 0;
  const missingSamples = [];

  const creatorByTicketId = await buildCreatorDisplayByTicketId(tickets);

  const enriched = tickets.map((t) => {
    const slug = t?.client_slug != null ? String(t.client_slug).trim() : "";
    const clientNameFromOrg = slug ? orgNameBySlug.get(slug) : null;
    const clientNameFromEmail = deriveClientNameFromOpenedByEmail(t?.opened_by_email);
    const client_name = clientNameFromOrg || clientNameFromEmail || "Not provided";
    const clientContact = slug ? clientContactBySlug.get(slug) : null;

    const onSiteRows = tokenRowsByTicketAndType.get(`${t.id}:ON_SITE`) ?? [];
    const resolutionRows = tokenRowsByTicketAndType.get(`${t.id}:RESOLUTION`) ?? [];
    const activeResolutionRow =
      resolutionRows.find((r) => {
        if (r?.used) return false;
        const ex = r?.expires_at ? new Date(r.expires_at).getTime() : 0;
        return ex > nowMs;
      }) ?? null;
    const resolution_locked = activeResolutionRow ? tokenIsLocked(activeResolutionRow) : false;

    const { chosen: onSite, actionable: onSiteActionable } = pickDisplayToken(onSiteRows, {
      resolution: false,
    });
    const { chosen: resolution, actionable: resolutionActionable } = pickDisplayToken(resolutionRows, {
      resolution: true,
    });

    if (onSiteRows.length) attachSuccessOnSite += 1;
    else {
      attachMissingOnSite += 1;
      logEvent("feMe.token_attach_missing", { ticket_id: t.id, type: "ON_SITE" });
      if (missingSamples.length < 12) missingSamples.push({ ticket_id: t.id, type: "ON_SITE" });
    }
    if (resolutionRows.length) attachSuccessResolution += 1;
    else {
      attachMissingResolution += 1;
      logEvent("feMe.token_attach_missing", { ticket_id: t.id, type: "RESOLUTION" });
      if (missingSamples.length < 12) missingSamples.push({ ticket_id: t.id, type: "RESOLUTION" });
    }

    const assignment_due = assignmentDueByTicketId.get(t.id) ?? null;
    const assigned_at = assignedAtByTicketId.get(t.id) ?? null;
    const ticketRemarks = normalizeText(t?.remarks);
    const shortDescription =
      normalizeText(t?.short_description) ?? normalizeText(t?.description);

    const emRaw = t?.opened_by_email != null ? String(t.opened_by_email).trim() : "";
    let reporter_display = null;
    if (emRaw) {
      const nm = reporterNameByEmail.get(emRaw) || reporterNameByEmail.get(emRaw.toLowerCase());
      if (nm) {
        reporter_display = `${nm} reported this ticket (${emRaw})`;
      } else {
        const derived = deriveClientNameFromOpenedByEmail(t.opened_by_email);
        reporter_display = derived ? `${derived} reported this ticket (${emRaw})` : `Ticket reporter / contact: ${emRaw}`;
      }
    }

    const toTokenPayload = (chosen, actionable) => {
      if (!chosen) return null;
      return {
        id: chosen.id,
        expires_at: chosen.expires_at,
        used: Boolean(chosen.used),
        actionable: Boolean(actionable),
        ...(chosen.token_state != null ? { token_state: chosen.token_state } : {}),
      };
    };

    return {
      ...t,
      client_name,
      contact_person: clientContact?.contact_person ?? null,
      contact_number: clientContact?.contact_number ?? null,
      reporter_display,
      creator_display: creatorByTicketId.get(t.id) ?? null,
      // Preserve DB remarks; do not overwrite with short_description.
      remarks: ticketRemarks,
      short_description: shortDescription ?? t?.short_description ?? null,
      sla: slaByTicketId.get(t.id) ?? null,
      tenant_sla: computeTicketSlaView(t, {
        assignedAt: assigned_at,
        escalationLevels: DEFAULT_TENANT_SLA.escalationLevels,
      }),
      tokens: {
        onSite: toTokenPayload(onSite, onSiteActionable),
        resolution: toTokenPayload(resolution, resolutionActionable),
      },
      resolution_locked,
      assignment_due,
      assigned_at,
    };
  });

  logEvent("feMe.token_diagnostics", {
    tenantId: req.tenantId ?? null,
    feId,
    token_query_rows,
    token_query_error,
    token_attach_success: {
      on_site: attachSuccessOnSite,
      resolution: attachSuccessResolution,
    },
    token_attach_missing: {
      on_site: attachMissingOnSite,
      resolution: attachMissingResolution,
    },
    missing_sample: missingSamples,
  });

  logEvent("feMe.tickets", { tenantId: req.tenantId ?? null, feId, ms: Date.now() - startedAt, count: tickets.length });
  return enriched;
}

/**
 * GET /fe/me/tickets
 * Returns tickets assigned to the current FE (compat mode: FE resolved by name).
 */
router.get("/me/tickets", async (req, res) => {
  const startedAt = Date.now();
  try {
    const feId = await resolveFeIdFromAppUser(req);
    if (!feId) return jsonOk(res, { items: [] });

    const hasAssignDue = await hasPublicColumn("ticket_assignments", "assignment_due_at");

    const { data: assignments, error } = await listAssignmentsByFeId(feId);
    if (error) return jsonError(res, 500, error.message);

    const pairs = (assignments || [])
      .map((a) => ({
        assignmentId: a.id,
        ticket: a.tickets,
        assignmentDueAt: hasAssignDue ? (a.assignment_due_at ?? null) : null,
        assignedAt: a.created_at ?? null,
      }))
      .filter((p) => {
        if (!p.ticket) return false;
        const currentId = p.ticket.current_assignment_id;
        if (currentId == null || String(currentId).trim() === "") return false;
        return String(currentId) === String(p.assignmentId);
      })
      .map((p) => ({
        ticket: p.ticket,
        assignmentDueAt: p.assignmentDueAt,
        assignedAt: p.assignedAt,
      }));

    const enriched = await enrichFeTicketPairs({ pairs, feId, req, startedAt });
    return jsonOk(res, { items: enriched });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load FE tickets");
  }
});

/**
 * GET /fe/me/tickets/:ticketId
 * Same payload shape as list items, for a single ticket assigned to this FE.
 */
router.get("/me/tickets/:ticketId", async (req, res) => {
  const startedAt = Date.now();
  const ticketId = req.params.ticketId;
  try {
    const feId = await resolveFeIdFromAppUser(req);
    if (!feId) return jsonOk(res, { item: null });

    const hasAssignDue = await hasPublicColumn("ticket_assignments", "assignment_due_at");

    const { data: row, error } = await getAssignmentWithTicketByFeAndTicket(feId, ticketId);

    if (error) return jsonError(res, 500, error.message);
    if (!row?.tickets) return jsonOk(res, { item: null });

    const currentId = row.tickets.current_assignment_id;
    if (
      currentId == null ||
      String(currentId).trim() === "" ||
      String(currentId) !== String(row.id)
    ) {
      return jsonOk(res, { item: null });
    }

    const pairs = [
      {
        ticket: row.tickets,
        assignmentDueAt: hasAssignDue ? (row.assignment_due_at ?? null) : null,
        assignedAt: row.created_at ?? null,
      },
    ];
    const enriched = await enrichFeTicketPairs({ pairs, feId, req, startedAt });
    return jsonOk(res, { item: enriched[0] ?? null });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load FE ticket");
  }
});

/**
 * POST /fe/me/tickets/:ticketId/remarks
 * Append-only additional/correction remark for the assigned FE (JWT-derived identity).
 * Reuses ticket_comments; never overwrites tickets.remarks.
 */
router.post("/me/tickets/:ticketId/remarks", async (req, res) => {
  const startedAt = Date.now();
  const ticketId = req.params.ticketId;
  const rawRemark = req.body?.remark ?? req.body?.body;
  const body = safeTrim(rawRemark);
  if (!ticketId) return jsonError(res, 400, "ticket id required");
  if (!body) return jsonError(res, 400, "Additional remark is required.");
  if (body.length > 4000) {
    return jsonError(res, 400, "Additional remark must be 4000 characters or fewer.");
  }

  try {
    const feId = await resolveFeIdFromAppUser(req);
    if (!feId) return jsonError(res, 403, "Field executive identity required");

    const { data: row, error } = await getAssignmentWithTicketByFeAndTicket(feId, ticketId);
    if (error) return jsonError(res, 500, error.message);
    if (!row?.tickets) return jsonError(res, 404, "Ticket not found or not assigned to you");

    const ticket = row.tickets;
    const currentId = ticket.current_assignment_id;
    if (
      currentId == null ||
      String(currentId).trim() === "" ||
      String(currentId) !== String(row.id)
    ) {
      return jsonError(res, 403, "Ticket is not currently assigned to you");
    }

    if (!isTenantAllowed(req, ticket.organisation_id)) {
      return jsonError(res, 403, "Forbidden");
    }

    const authorId = req.appUser?.id ? String(req.appUser.id) : null;
    const { data, error: insertErr } = await insertComment({
      ticket_id: ticketId,
      body,
      source: "FE",
      author_id: authorId,
      organisation_id: ticket.organisation_id ?? null,
      attachments: {
        fe_remark: {
          event_type: "FE_ADDITIONAL_REMARK",
        },
      },
    });
    if (insertErr) return jsonError(res, 500, insertErr.message);

    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: ticketId,
      action: "fe_additional_remark_added",
      ticket_organisation_id: ticket.organisation_id ?? null,
      client_slug: ticket.client_slug ?? null,
      actor_fe_id: feId,
      actor_role: "FIELD_EXECUTIVE",
      metadata: { comment_id: data?.id ?? null, event_type: "FE_ADDITIONAL_REMARK" },
    });

    logEvent("feMe.remarks.create", {
      tenantId: req.tenantId ?? null,
      ticketId,
      feId,
      ms: Date.now() - startedAt,
    });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to add remark");
  }
});

/**
 * POST /fe/tickets/:id/status-action
 * Body: { action: "MARK_ON_SITE" | "MARK_WORK_COMPLETE" }
 *
 * This is an interim lifecycle endpoint to remove direct frontend writes.
 * It enforces tenant guard and only allows specific status transitions.
 */
router.post("/tickets/:id/status-action", async (req, res) => {
  const startedAt = Date.now();
  const ticketId = req.params.id;
  const action = req.body?.action;
  if (!ticketId) return jsonError(res, 400, "ticket id required");
  if (action !== "MARK_ON_SITE" && action !== "MARK_WORK_COMPLETE") {
    return jsonError(res, 400, "Invalid action");
  }

  try {
    const { data: ticket, error: ticketErr } = await getTicketByIdUnscoped(
      ticketId,
      "id, status, organisation_id, client_slug"
    );
    if (ticketErr) return jsonError(res, 500, ticketErr.message);
    if (!ticket) return jsonError(res, 404, "Ticket not found");
    if (!isTenantAllowed(req, ticket.organisation_id)) return jsonError(res, 403, "Forbidden");
    if (ticket.status === "REJECTED") return jsonError(res, 400, "Ticket rejected");

    const nowIso = new Date().toISOString();
    let nextStatus = null;
    if (action === "MARK_ON_SITE") {
      if (ticket.status !== "ASSIGNED") return jsonError(res, 409, `Cannot mark on-site from ${ticket.status}`);
      nextStatus = "ON_SITE";
    }
    if (action === "MARK_WORK_COMPLETE") {
      if (ticket.status !== "ON_SITE") return jsonError(res, 409, `Cannot mark work complete from ${ticket.status}`);
      nextStatus = "RESOLVED_PENDING_VERIFICATION";
    }

    const { data: updated, error: updErr } = await updateTicketById(ticketId, {
      status: nextStatus,
      updated_at: nowIso,
    });
    if (updErr) return jsonError(res, 500, updErr.message);

    const feId = await resolveFeIdFromAppUser(req);
    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: ticketId,
      action: action === "MARK_ON_SITE" ? "fe_status_changed_to_ON_SITE" : "fe_status_changed_to_RESOLVED_PENDING_VERIFICATION",
      ticket_organisation_id: ticket.organisation_id ?? null,
      client_slug: ticket.client_slug ?? null,
      actor_fe_id: feId,
      actor_role: "FIELD_EXECUTIVE",
      metadata: {
        previous_status: ticket.status,
        new_status: nextStatus,
        fe_name: req.appUser?.name ?? null,
      },
    });

    logEvent("feMe.statusAction", { tenantId: req.tenantId ?? null, ticketId, action, ms: Date.now() - startedAt });
    return jsonOk(res, updated);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to update status");
  }
});

/**
 * POST /fe/me/tickets/comments-batch
 * Batch-load comments for assigned tickets (FE printable worksheet). Avoids N+1.
 */
router.post("/me/tickets/comments-batch", async (req, res) => {
  const startedAt = Date.now();
  const parsed = z
    .object({
      ticket_ids: z.array(z.string().uuid()).min(1).max(100),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return jsonError(res, 400, "ticket_ids (1–100 UUIDs) required");
  }

  try {
    const feId = await resolveFeIdFromAppUser(req);
    if (!feId) return jsonError(res, 403, "Field executive identity required");

    const ticketIds = parsed.data.ticket_ids;
    const { data: assignments, error: aErr } = await listAssignmentsByFeId(feId);
    if (aErr) return jsonError(res, 500, aErr.message);

    const allowed = new Set();
    for (const row of assignments ?? []) {
      const ticket = row.tickets;
      if (!ticket?.id) continue;
      const currentId = ticket.current_assignment_id;
      if (
        currentId == null ||
        String(currentId).trim() === "" ||
        String(currentId) !== String(row.id)
      ) {
        continue;
      }
      if (!isTenantAllowed(req, ticket.organisation_id)) continue;
      allowed.add(String(ticket.id));
    }

    const scopedIds = ticketIds.filter((id) => allowed.has(id));
    const { data: byTicket, error } = await listCommentsForTicketIds(scopedIds, {
      limitPerTicket: 200,
    });
    if (error) return jsonError(res, 500, error.message);

    logEvent("feMe.commentsBatch", {
      tenantId: req.tenantId ?? null,
      requested: ticketIds.length,
      allowed: scopedIds.length,
      ms: Date.now() - startedAt,
    });
    return jsonOk(res, { by_ticket_id: byTicket ?? {} });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load comments");
  }
});

export default router;

