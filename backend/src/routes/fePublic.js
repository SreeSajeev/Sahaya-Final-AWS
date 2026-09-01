import express from "express";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import {
  getFeActionTokenById,
} from "../repositories/feActionTokenRepository.js";
import { getTicketByIdUnscoped } from "../repositories/ticketQueryRepository.js";
import { listResolutionLocations } from "../services/resolutionLocationService.js";
import { validateFeActionTokenLifecycle } from "../services/fePublicTokenGuard.js";
import { jsonError, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { maskTokenForLog } from "../utils/tokenRedact.js";

const router = express.Router();

/** Columns required server-side for validation / tenant guard (not all exposed in JSON). */
const TOKEN_CONTEXT_SELECT_BASE =
  "id, action_type, token_state, used, expires_at, ticket_id";

/** Columns returned to FEActionPage (plus organisation_id for server-side tenant guard). */
const TICKET_CONTEXT_SELECT_BASE =
  "status, ticket_number, vehicle_number, category, issue_type, location, short_description, opened_by_email, organisation_id";

function buildPublicTokenPayload(actionToken, effectiveTokenState) {
  return {
    id: actionToken.id,
    action_type: actionToken.action_type,
    token_state: effectiveTokenState,
  };
}

function buildPublicTicketPayload(ticket) {
  return {
    status: ticket.status,
    ticket_number: ticket.ticket_number,
    vehicle_number: ticket.vehicle_number ?? null,
    category: ticket.category ?? null,
    issue_type: ticket.issue_type ?? null,
    location: ticket.location ?? null,
    short_description: ticket.short_description ?? null,
    remarks: ticket.remarks ?? null,
    description: ticket.description ?? null,
    opened_by_email: ticket.opened_by_email ?? null,
    contact_number: ticket.contact_number ?? null,
  };
}

async function tokenContextSelectColumns() {
  const parts = TOKEN_CONTEXT_SELECT_BASE.split(", ");
  if (await hasPublicColumn("fe_action_tokens", "organisation_id")) {
    parts.push("organisation_id");
  }
  return parts.join(", ");
}

async function ticketContextSelectColumns() {
  const parts = TICKET_CONTEXT_SELECT_BASE.split(", ");
  if (await hasPublicColumn("tickets", "remarks")) parts.push("remarks");
  if (await hasPublicColumn("tickets", "description")) parts.push("description");
  if (await hasPublicColumn("tickets", "contact_number")) parts.push("contact_number");
  return parts.join(", ");
}

/**
 * Public FE context endpoint (no JWT required).
 * FE uses magic link with tokenId; we must return enough context to render the page
 * WITHOUT allowing any DB mutation here.
 *
 * GET /fe/action/:tokenId/context
 */
router.get("/action/:tokenId/context", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const startedAt = Date.now();
  const tokenId = req.params.tokenId;
  if (!tokenId) return jsonError(res, 400, "Token missing");

  try {
    const tokenSelect = await tokenContextSelectColumns();

    const { data: actionToken, error: tokenError } = await getFeActionTokenById(tokenId, tokenSelect);

    if (tokenError) return jsonError(res, 500, tokenError.message);
    if (!actionToken) return jsonError(res, 404, "Invalid token");

    const lifecycle = await validateFeActionTokenLifecycle(actionToken, { tokenId });
    if (!lifecycle.ok) {
      return jsonError(res, lifecycle.status, lifecycle.message, { code: lifecycle.code });
    }
    const effectiveTokenState = lifecycle.effectiveTokenState;

    const ticketSelect = await ticketContextSelectColumns();
    const { data: ticket, error: ticketError } = await getTicketByIdUnscoped(
      actionToken.ticket_id,
      ticketSelect
    );

    if (ticketError) return jsonError(res, 500, ticketError.message);
    if (!ticket) return jsonError(res, 404, "Ticket not found");
    if (ticket.status === "REJECTED") {
      return jsonError(res, 403, "Ticket rejected — action not allowed", { code: "TICKET_REJECTED" });
    }

    if (
      actionToken.organisation_id &&
      ticket.organisation_id &&
      actionToken.organisation_id !== ticket.organisation_id
    ) {
      return jsonError(res, 403, "Forbidden", { code: "TENANT_MISMATCH" });
    }

    logEvent("fePublic.actionContext", {
      tokenId: maskTokenForLog(tokenId),
      ticketId: actionToken.ticket_id,
      actionType: actionToken.action_type,
      tokenState: effectiveTokenState ?? null,
      ms: Date.now() - startedAt,
    });

    return jsonOk(res, {
      token: buildPublicTokenPayload(actionToken, effectiveTokenState),
      ticket: buildPublicTicketPayload(ticket),
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load context");
  }
});

/**
 * Active attended/resolution locations for the ticket's organisation (magic-link FE proof).
 * GET /fe/action/:tokenId/resolution-locations
 */
router.get("/action/:tokenId/resolution-locations", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const tokenId = req.params.tokenId;
  if (!tokenId) return jsonError(res, 400, "Token missing");

  try {
    const tokenSelect = await tokenContextSelectColumns();
    const { data: actionToken, error: tokenError } = await getFeActionTokenById(tokenId, tokenSelect);
    if (tokenError) return jsonError(res, 500, tokenError.message);
    if (!actionToken) return jsonError(res, 404, "Invalid token");

    const lifecycle = await validateFeActionTokenLifecycle(actionToken, { tokenId });
    if (!lifecycle.ok) {
      return jsonError(res, lifecycle.status, lifecycle.message, { code: lifecycle.code });
    }

    const { data: ticket, error: ticketError } = await getTicketByIdUnscoped(
      actionToken.ticket_id,
      "organisation_id, status"
    );
    if (ticketError) return jsonError(res, 500, ticketError.message);
    if (!ticket) return jsonError(res, 404, "Ticket not found");
    if (ticket.status === "REJECTED") {
      return jsonError(res, 403, "Ticket rejected — action not allowed", { code: "TICKET_REJECTED" });
    }

    if (
      actionToken.organisation_id &&
      ticket.organisation_id &&
      actionToken.organisation_id !== ticket.organisation_id
    ) {
      return jsonError(res, 403, "Forbidden", { code: "TENANT_MISMATCH" });
    }

    const orgId = ticket.organisation_id ?? actionToken.organisation_id ?? null;
    if (!orgId) return jsonOk(res, { items: [] });

    const result = await listResolutionLocations(
      { tenantId: orgId, isSuperAdmin: false },
      { organisation_id: orgId, active_only: true }
    );
    if (result.error) {
      return jsonError(res, result.error.status ?? 500, result.error.message);
    }
    return jsonOk(res, { items: result.data ?? [] });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load resolution locations");
  }
});

export default router;

