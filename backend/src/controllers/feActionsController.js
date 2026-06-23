import { supabase } from "../supabaseClient.js";
import { jsonRes, jsonOk, safeDbErrorForClient } from "../utils/http.js";
import { maskTokenForLog } from "../utils/tokenRedact.js";

export async function validateFeActionToken(req, res) {
  try {
    const { token } = req.params;

    if (!token) {
      return jsonRes(res, 400, { error: "Token missing" });
    }

    const nowISO = new Date().toISOString();

    const { data: actionToken, error } = await supabase
      .from("fe_action_tokens")
      .select("*")
      .eq("id", token)
      .single();

    if (error || !actionToken) {
      return jsonRes(res, 404, { error: "Invalid token" });
    }

    if (actionToken.used) {
      return jsonRes(res, 410, { error: "Token already used" });
    }

    if (actionToken.expires_at <= nowISO) {
      return jsonRes(res, 410, { error: "Token expired" });
    }

    // 🔥 FOR DEMO: fetch ticket separately without lifecycle enforcement
    const { data: ticket } = await supabase
      .from("tickets")
      .select("id, ticket_number, status, organisation_id")
      .eq("id", actionToken.ticket_id)
      .single();

    if (ticket?.status === "REJECTED") {
      return jsonRes(res, 403, { error: "Ticket has been rejected" });
    }
    if (
      actionToken.organisation_id &&
      ticket?.organisation_id &&
      actionToken.organisation_id !== ticket.organisation_id
    ) {
      console.warn("[FE_ACTION_VALIDATE] tenant mismatch", {
        tokenId: maskTokenForLog(token),
        tokenOrg: actionToken.organisation_id,
        ticketOrg: ticket.organisation_id,
      });
      return jsonRes(res, 403, { error: "Forbidden" });
    }

    return jsonOk(res, {
      ticketId: actionToken.ticket_id,
      feId: actionToken.fe_id,
      actionType: actionToken.action_type,
      ticketNumber: ticket?.ticket_number || "DEMO",
      ticketStatus: ticket?.status || "ASSIGNED",
      expiresAt: actionToken.expires_at,
    });

  } catch (err) {
    console.error("[validateFeActionToken]", err.message);
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Token validation failed") });
  }
}
