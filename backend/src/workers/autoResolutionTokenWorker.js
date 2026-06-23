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

import { supabase } from "../supabaseClient.js";
import { createActionToken } from "../services/tokenService.js";
import { sendFETokenEmail } from "../services/emailService.js";
import { sendFESms, buildFEActionURL } from "../services/smsService.js";
import {
  DISABLE_AUTO_RESOLUTION_WORKER,
  SAFE_TOKEN_LIFECYCLE,
  WORKER_TENANT_ISOLATION_ENABLED,
} from "../config/appConfig.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";

const BATCH_SIZE = 10;

async function hasOnSiteProof({ ticketId, tenantId = null }) {
  // Deterministic ON_SITE proof detection:
  // A ticket is considered having ON_SITE proof when:
  // - There exists at least one `ticket_comments` row with source="FE" for the ticket
  // - And attachments contain proof evidence in either legacy `image_base64`
  //   or new `images[]` (length > 0).
  //
  // This avoids brittle text matching in `ticket_comments.body`.
  const hasOrgOnComments = await hasPublicColumn("ticket_comments", "organisation_id");
  let query = supabase
    .from("ticket_comments")
    .select("id, attachments")
    .eq("ticket_id", ticketId)
    .eq("source", "FE")
    .order("created_at", { ascending: false })
    .limit(10);
  if (hasOrgOnComments && tenantId) query = query.eq("organisation_id", tenantId);
  if (hasOrgOnComments && !tenantId) query = query.is("organisation_id", null);
  const { data, error } = await query;

  if (error || !Array.isArray(data) || data.length === 0) return false;

  for (const c of data) {
    try {
      const att = c?.attachments;
      if (!att || typeof att !== "object") continue;

      // Legacy: attachments.image_base64
      if (typeof att.image_base64 === "string" && att.image_base64.trim() !== "") {
        return true;
      }

      // New: attachments.images[]
      if (Array.isArray(att.images) && att.images.length > 0) {
        // Be defensive: only treat as evidence if at least one item has image_base64.
        const hasAnyImageBase64 = att.images.some(
          (it) =>
            it &&
            typeof it === "object" &&
            typeof it.image_base64 === "string" &&
            it.image_base64.trim() !== ""
        );
        if (hasAnyImageBase64) return true;
        // If images[] exists but items are malformed, keep checking other comments.
      }
    } catch (_e) {
      // Defensive: if any malformed JSON throws during access, continue scanning.
      continue;
    }
  }

  return false;
}

async function getActiveResolutionToken({ ticketId, tenantId = null }) {
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state");
  const hasOrgOnTokens = await hasPublicColumn("fe_action_tokens", "organisation_id");
  const nowIso = new Date().toISOString();
  let query = supabase
    .from("fe_action_tokens")
    .select("id, fe_id, created_at")
    .eq("ticket_id", ticketId)
    .eq("action_type", "RESOLUTION")
    .eq("used", false)
    .gt("expires_at", nowIso);
  if (hasOrgOnTokens && tenantId) query = query.eq("organisation_id", tenantId);
  if (hasOrgOnTokens && !tenantId) query = query.is("organisation_id", null);
  if (hasTokenState) {
    query = query.in("token_state", ["LOCKED", "ACTIVE"]);
  }
  const { data, error } = await query.maybeSingle();

  if (error) return null;
  return data ?? null;
}

async function getAssignedFe({ assignmentId, tenantId = null }) {
  if (!assignmentId) return null;
  const hasOrgOnAssignments = await hasPublicColumn("ticket_assignments", "organisation_id");
  let query = supabase
    .from("ticket_assignments")
    .select("fe_id")
    .eq("id", assignmentId);
  if (hasOrgOnAssignments && tenantId) query = query.eq("organisation_id", tenantId);
  if (hasOrgOnAssignments && !tenantId) query = query.is("organisation_id", null);
  const { data, error } = await query.single();

  if (error || !data?.fe_id) return null;
  return data.fe_id;
}

async function sendResolutionTokenSms({ feId, ticketNumber, token, location, vehicleNumber }) {
  const { data: fe } = await supabase
    .from("field_executives")
    .select("name, phone")
    .eq("id", feId)
    .maybeSingle();

  if (!fe?.phone || String(fe.phone).trim() === "") return;

  const resolutionUrl = buildFEActionURL(token);
  const locationShort = location ? String(location).slice(0, 25) : "N/A";
  const smsMessage = `TKT:${ticketNumber ?? "N/A"}
Veh:${vehicleNumber ?? "N/A"}
Loc:${locationShort}
Action:${resolutionUrl}
-Pariskq`;

  // sendFESms never throws; it returns a boolean.
  await sendFESms({ phoneNumber: fe.phone, message: smsMessage });
}

async function getWorkerTenantScopes() {
  if (!WORKER_TENANT_ISOLATION_ENABLED) return [null];
  const hasOrgOnTickets = await hasPublicColumn("tickets", "organisation_id");
  if (!hasOrgOnTickets) return [null];
  const { data: orgRows } = await supabase.from("organisations").select("id");
  const tenantIds = Array.isArray(orgRows) ? orgRows.map((r) => r.id).filter(Boolean) : [];
  return [null, ...tenantIds];
}

async function runAutoResolutionTokenWorkerForScope(tenantId = null) {
  if (DISABLE_AUTO_RESOLUTION_WORKER) return;
  // In safe lifecycle mode, assignment/proof flow owns resolution activation.
  // Keep worker inert to avoid duplicate/broken resolution links.
  if (SAFE_TOKEN_LIFECYCLE) return;

  // Only consider ON_SITE tickets with an assignment.
  const hasOrgOnTickets = await hasPublicColumn("tickets", "organisation_id");
  let ticketsQuery = supabase
    .from("tickets")
    .select("id, ticket_number, vehicle_number, location, current_assignment_id, organisation_id")
    .eq("status", "ON_SITE")
    .not("current_assignment_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (hasOrgOnTickets && tenantId) ticketsQuery = ticketsQuery.eq("organisation_id", tenantId);
  if (hasOrgOnTickets && !tenantId) ticketsQuery = ticketsQuery.is("organisation_id", null);
  const { data: tickets, error } = await ticketsQuery;

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

      // 1) Confirm proof exists.
      const hasProof = await hasOnSiteProof({ ticketId, tenantId: scopedTenantId });
      if (!hasProof) continue;

      // Defensive: ticket may have moved to REJECTED after this batch was fetched (or data fixed out-of-band).
      const { data: freshTicket } = await supabase
        .from("tickets")
        .select("status")
        .eq("id", ticketId)
        .maybeSingle();
      if (freshTicket?.status === "REJECTED") continue;

      // 2) Skip if an active RESOLUTION token already exists.
      const activeToken = await getActiveResolutionToken({ ticketId, tenantId: scopedTenantId });
      if (activeToken?.id) continue;

      // 3) Create token for the assigned FE.
      const feId = await getAssignedFe({ assignmentId, tenantId: scopedTenantId });
      if (!feId) continue;

      const resolutionTokenId = await createActionToken({
        ticketId,
        feId,
        actionType: "RESOLUTION",
      });

      // 4) Notifications (email + optional SMS).
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

