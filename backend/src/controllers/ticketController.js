
// src/controllers/ticketController.js
// Backend-authoritative, demo-safe lifecycle controller

import { assertValidTransition } from "../services/ticketStateMachine.js";
import { createActionToken } from "../services/tokenService.js";
import { sendFETokenEmail } from "../services/emailService.js";
import { handleClientResolutionNotification } from "../services/clientNotificationService.js";
import { setAssignmentDeadline } from "../services/slaService.js";
import { sendFESms, buildFEActionURL } from "../services/smsService.js";
import { redactFeActionUrls, redactPhone } from "../utils/redact.js";
import { consumeOnSiteTokenForTicket } from "../repositories/feActionTokenRepository.js";
import { insertAssignment, getAssignmentByTicketId } from "../repositories/assignmentRepository.js";
import { listCommentsForTicketUnscoped } from "../repositories/commentRepository.js";
import { getFieldExecutiveById } from "../repositories/fieldExecutiveRepository.js";
import { commentHasUsableProof } from "../services/proofPresenceService.js";
import {
  getTicketByIdUnscopedSingle,
  getTicketStatusById,
  updateTicketStatus,
  updateTicketFields,
  updateTicketById,
} from "../repositories/ticketQueryRepository.js";

async function ticketHasRealProof(ticketId) {
  const { data: comments } = await listCommentsForTicketUnscoped(ticketId, { limit: 100, offset: 0 });
  return (comments || []).some((c) => commentHasUsableProof(c));
}

/* =====================================================
   ASSIGN FE TO TICKET
===================================================== */
export async function assignFieldExecutive(req, res) {
  try {
    const ticketId = req.params.id;
    const { feId } = req.body;

    const { data: ticket, error } = await getTicketStatusById(ticketId);

    if (error || !ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    assertValidTransition(ticket.status, "ASSIGNED");

    const { error: insertError } = await insertAssignment({
      ticket_id: ticketId,
      fe_id: feId,
    });

    if (insertError) throw insertError;

    const { error: updateError } = await updateTicketStatus(ticketId, "ASSIGNED");

    if (updateError) throw updateError;

    setAssignmentDeadline(ticketId).catch((err) =>
      console.error("[SLA] setAssignmentDeadline after assign", ticketId, err.message)
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/* =====================================================
   GENERATE ON-SITE TOKEN
===================================================== */
export async function generateOnSiteToken(req, res) {
  try {
    const ticketId = req.params.id;

    const { data: assignment, error: assignmentError } = await getAssignmentByTicketId(ticketId, "fe_id");

    if (assignmentError || !assignment) {
      return res.status(400).json({ error: "FE not assigned" });
    }

    const { data: ticket, error: ticketError } = await getTicketByIdUnscopedSingle(
      ticketId,
      "status, ticket_number"
    );

    if (ticketError || !ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    assertValidTransition(ticket.status, "EN_ROUTE");

    const token = await createActionToken({
      ticketId,
      feId: assignment.fe_id,
      actionType: "ON_SITE",
    });

    const { error: updateError } = await updateTicketStatus(ticketId, "EN_ROUTE");

    if (updateError) throw updateError;

    await sendFETokenEmail({
      feId: assignment.fe_id,
      ticketNumber: ticket.ticket_number,
      token,
      type: "ON_SITE",
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/* =====================================================
   VERIFY ON-SITE & ISSUE RESOLUTION TOKEN
===================================================== */
export async function verifyOnSiteAndIssueResolution(req, res) {
  try {
    const ticketId = req.params.id;

    const { data: ticket, error: ticketError } = await getTicketByIdUnscopedSingle(
      ticketId,
      "status, ticket_number"
    );

    if (ticketError || !ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    assertValidTransition(ticket.status, "ON_SITE");

    /* 🔒 Ensure ON_SITE proof exists (real attachment metadata — never body text) */
    if (!(await ticketHasRealProof(ticketId))) {
      return res.status(400).json({
        error: "ON_SITE proof not uploaded",
      });
    }

    const { data: assignment } = await getAssignmentByTicketId(ticketId, "fe_id");

    if (!assignment) {
      return res.status(400).json({ error: "FE not assigned" });
    }

    /* 🔐 Consume ON_SITE token (single-use) */
    const { data: consumed, error: consumeError } = await consumeOnSiteTokenForTicket(ticketId);

    if (consumeError) throw consumeError;

    if (!consumed || consumed.length === 0) {
      return res.status(400).json({
        error: "ON_SITE token already consumed or missing",
      });
    }

    /* 🔄 Issue RESOLUTION token */
    const token = await createActionToken({
      ticketId,
      feId: assignment.fe_id,
      actionType: "RESOLUTION",
    });

    await sendFETokenEmail({
      feId: assignment.fe_id,
      ticketNumber: ticket.ticket_number,
      token,
      type: "RESOLUTION",
    });

    // Optional: Resolution SMS to FE (does not block flow)
    try {
      const { data: fe } = await getFieldExecutiveById(assignment.fe_id, "name, phone");

      if (fe?.phone && String(fe.phone).trim()) {
        const resolutionUrl = buildFEActionURL(token);
        const feName =
          fe.name && String(fe.name).trim()
            ? String(fe.name).trim()
            : "Field Executive";
        const smsMessage = `${feName},
Ticket ID: ${ticket.ticket_number}

Resolution Action:
${resolutionUrl}

- Pariskq IoT Support Team`;

        console.log("📩 Sending Resolution SMS to:", redactPhone(fe.phone));
        console.log("📩 Resolution SMS Body:", redactFeActionUrls(smsMessage));
        await sendFESms({ phoneNumber: fe.phone, message: smsMessage });
      }
    } catch (err) {
      console.error("[Resolution SMS] Failed:", err?.message || err);
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/* =====================================================
   VERIFY RESOLUTION & CLOSE TICKET
===================================================== */
export async function verifyAndCloseTicket(req, res) {
  try {
    const ticketId = req.params.id;

    const { data: ticket, error: ticketError } = await getTicketByIdUnscopedSingle(
      ticketId,
      "status, opened_by_email, ticket_number"
    );

    if (ticketError || !ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    assertValidTransition(ticket.status, "RESOLVED");

    /* 🔒 Ensure RESOLUTION proof exists (real attachment metadata — never body text) */
    if (!(await ticketHasRealProof(ticketId))) {
      return res.status(400).json({
        error: "Resolution proof not uploaded",
      });
    }

    const { error: updateError, conflict } = await updateTicketById(
      ticketId,
      {
        status: "RESOLVED",
        resolved_at: new Date().toISOString(),
      },
      { expectedStatus: ticket.status }
    );
    if (conflict) {
      return res.status(409).json({ error: "Ticket status changed; refresh and retry", code: "STATUS_CONFLICT" });
    }
    if (updateError) throw updateError;

    await handleClientResolutionNotification(ticketId);

    return res.json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
