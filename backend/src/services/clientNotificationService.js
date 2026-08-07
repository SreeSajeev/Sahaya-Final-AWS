// src/services/clientNotificationService.js

import { sendClientResolutionEmail } from "./emailService.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactEmail } from "../utils/redact.js";
import { buildResolutionEmailArgsFromTicketId } from "./resolutionEmailEnrichment.js";
import { findResolutionNotificationByTicketId } from "../repositories/ticketResolutionNotificationRepository.js";

/**
 * Legacy thin hook — only sends when the primary close path has not already
 * recorded a resolution notification. Payload is fully enriched from the ticket.
 */
export async function handleClientResolutionNotification(ticketId) {
  try {
    if (!ticketId) {
      console.error("[CLIENT_NOTIFY] Missing ticketId");
      return;
    }

    const { data: alreadySent } = await findResolutionNotificationByTicketId(ticketId);
    if (alreadySent) {
      logEvent("client_notify_resolution_skipped", { ticketId, reason: "email_already_sent" });
      return;
    }

    const enriched = await buildResolutionEmailArgsFromTicketId(ticketId);
    if (!enriched.toEmail) {
      logEvent("client_notify_resolution_skipped", { ticketId, reason: "no_opened_by_email" });
      console.error("[CLIENT_NOTIFY] No client email found");
      return;
    }
    if (!enriched.ticketNumber) {
      logEvent("client_notify_resolution_skipped", { ticketId, reason: "no_ticket_number" });
      return;
    }

    console.log("📧 Sending resolution email to:", redactEmail(enriched.toEmail));

    const emailResult = await sendClientResolutionEmail(enriched.args);
    logEvent("client_notify_resolution_email", {
      ticketId,
      attempted: emailResult?.attempted,
      sent: emailResult?.sent,
      skipped: emailResult?.skipped,
      reason: emailResult?.reason ?? null,
    });
  } catch (err) {
    console.error("[CLIENT_NOTIFY ERROR]", err.message);
  }
}
