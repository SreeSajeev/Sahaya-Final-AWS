// src/services/clientNotificationService.js

import { supabase } from "../supabaseClient.js";
import { sendClientResolutionEmail } from "./emailService.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactEmail } from "../utils/redact.js";

export async function handleClientResolutionNotification(ticketId) {
  try {
    if (!ticketId) {
      console.error("[CLIENT_NOTIFY] Missing ticketId");
      return;
    }

    // Fetch ticket details
    const { data: ticket, error } = await supabase
      .from("tickets")
      .select("opened_by_email, ticket_number")
      .eq("id", ticketId)
      .single();

    if (error || !ticket) {
      console.error("[CLIENT_NOTIFY] Ticket fetch failed", error?.message || error);
      return;
    }

    if (!ticket.opened_by_email) {
      logEvent("client_notify_resolution_skipped", { ticketId, reason: "no_opened_by_email" });
      console.error("[CLIENT_NOTIFY] No client email found");
      return;
    }

    console.log("📧 Sending resolution email to:", redactEmail(ticket.opened_by_email));

    const emailResult = await sendClientResolutionEmail({
      toEmail: ticket.opened_by_email,
      ticketNumber: ticket.ticket_number,
    });
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
