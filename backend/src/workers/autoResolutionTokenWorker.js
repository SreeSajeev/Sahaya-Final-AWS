/**
 * autoResolutionTokenWorker.js
 *
 * Polls for tickets that are currently in ON_SITE and have an active assignment,
 * then (once) creates + notifies FE with a RESOLUTION token when an ON_SITE proof exists.
 *
 * Safety goals:
 * - No DB schema changes
 * - No SLA lifecycle changes
 * - Avoid duplicate token creation (active token check)
 * - Avoid duplicate email/SMS by skipping when any active RESOLUTION token exists
 * - Per-ticket try/catch so failures do not stop the worker loop
 */

import { createActionToken } from "../services/tokenService.js";
import { sendFETokenEmail } from "../services/emailService.js";
import { sendFESms, buildFEActionURL } from "../services/smsService.js";
import {
  DISABLE_AUTO_RESOLUTION_WORKER,
  SAFE_TOKEN_LIFECYCLE,
  WORKER_TENANT_ISOLATION_ENABLED,
} from "../config/appConfig.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import { findActiveResolutionTokenScoped } from "../repositories/feActionTokenRepository.js";
import { listOrganisationIds } from "../repositories/organisationRepository.js";
import { listFeCommentsWithAttachmentsForWorker } from "../repositories/commentRepository.js";
import { getAssignmentFeIdById } from "../repositories/assignmentRepository.js";
import { getFieldExecutiveContactById } from "../repositories/fieldExecutiveRepository.js";
import { listOnSiteTicketsForWorker, getTicketStatusById } from "../repositories/ticketQueryRepository.js";

const BATCH_SIZE = 10;

async function hasOnSiteProof({ ticketId, tenantId = null }) {
  const { data, error } = await listFeCommentsWithAttachmentsForWorker(ticketId, {
    limit: 10,
    tenantId,
  });

  if (error || !Array.isArray(data) || data.length === 0) return false;

  for (const c of data) {
    try {
      const att = c?.attachments;
      if (!att || typeof att !== "object") continue;

      if (typeof att.image_base64 === "string" && att.image_base64.trim() !== "") {
        return true;
      }

      if (Array.isArray(att.images) && att.images.length > 0) {
        const hasAnyImageBase64 = att.images.some(
          (it) =>
            it &&
            typeof it === "object" &&
            typeof it.image_base64 === "string" &&
            it.image_base64.trim() !== ""
        );
        if (hasAnyImageBase64) return true;
      }
    } catch (_e) {
      continue;
    }
  }

  return false;
}

async function getActiveResolutionToken({ ticketId, tenantId = null }) {
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state");
  const hasOrgOnTokens = await hasPublicColumn("fe_action_tokens", "organisation_id");
  const nowIso = new Date().toISOString();
  return findActiveResolutionTokenScoped({
    ticketId,
    tenantId,
    nowIso,
    hasTokenState,
    hasOrgOnTokens,
  });
}

async function getAssignedFe({ assignmentId, tenantId = null }) {
  return getAssignmentFeIdById(assignmentId, tenantId);
}

async function sendResolutionTokenSms({ feId, ticketNumber, token, location, vehicleNumber }) {
  const { data: fe } = await getFieldExecutiveContactById(feId);

  if (!fe?.phone || String(fe.phone).trim() === "") return;

  const resolutionUrl = buildFEActionURL(token);
  const locationShort = location ? String(location).slice(0, 25) : "N/A";
  const smsMessage = `TKT:${ticketNumber ?? "N/A"}
Veh:${vehicleNumber ?? "N/A"}
Loc:${locationShort}
Action:${resolutionUrl}
-Pariskq`;

  await sendFESms({ phoneNumber: fe.phone, message: smsMessage });
}

async function getWorkerTenantScopes() {
  if (!WORKER_TENANT_ISOLATION_ENABLED) return [null];
  const hasOrgOnTickets = await hasPublicColumn("tickets", "organisation_id");
  if (!hasOrgOnTickets) return [null];
  const { data: orgRows } = await listOrganisationIds();
  const tenantIds = Array.isArray(orgRows) ? orgRows.map((r) => r.id).filter(Boolean) : [];
  return [null, ...tenantIds];
}

async function runAutoResolutionTokenWorkerForScope(tenantId = null) {
  if (DISABLE_AUTO_RESOLUTION_WORKER) return;
  if (SAFE_TOKEN_LIFECYCLE) return;

  const { data: tickets, error } = await listOnSiteTicketsForWorker({
    limit: BATCH_SIZE,
    tenantId,
  });

  if (error) return;
  if (!tickets || tickets.length === 0) return;

  for (const ticket of tickets) {
    try {
      const ticketId = ticket.id;
      const ticketNumber = ticket.ticket_number;
      const assignmentId = ticket.current_assignment_id;
      const location = ticket.location ?? null;
      const vehicleNumber = ticket.vehicle_number ?? null;
      const scopedTenantId = ticket.organisation_id ?? tenantId ?? null;
      console.log(JSON.stringify({
        worker: "autoResolutionTokenWorker",
        tenantId: scopedTenantId,
        jobId: ticketId,
        event: "processing_ticket",
      }));

      const hasProof = await hasOnSiteProof({ ticketId, tenantId: scopedTenantId });
      if (!hasProof) continue;

      const { data: freshTicket } = await getTicketStatusById(ticketId);
      if (freshTicket?.status === "REJECTED") continue;

      const activeToken = await getActiveResolutionToken({ ticketId, tenantId: scopedTenantId });
      if (activeToken?.id) continue;

      const feId = await getAssignedFe({ assignmentId, tenantId: scopedTenantId });
      if (!feId) continue;

      const resolutionTokenId = await createActionToken({
        ticketId,
        feId,
        actionType: "RESOLUTION",
      });

      await sendFETokenEmail({
        feId,
        ticketNumber,
        token: resolutionTokenId,
        type: "RESOLUTION",
      });

      await sendResolutionTokenSms({
        feId,
        ticketNumber,
        token: resolutionTokenId,
        location,
        vehicleNumber,
      });
    } catch (err) {
      console.error("[AutoResolutionTokenWorker] ticket failed:", ticket?.id, err?.message || err);
    }
  }
}

export async function runAutoResolutionTokenWorker() {
  const scopes = await getWorkerTenantScopes();
  for (const tenantId of scopes) {
    await runAutoResolutionTokenWorkerForScope(tenantId);
  }
}
