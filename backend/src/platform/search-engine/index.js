/**
 * Search Engine — metadata-aware indexing helpers for platform_ticket_data.search_text.
 */
import { buildSearchText } from "../form-engine/index.js";

export function buildTicketSearchDocument(schema, ticket, data) {
  const fromFields = buildSearchText(schema || { fields: [] }, data || {});
  const parts = [ticket?.ticket_number, ticket?.status_key, fromFields].filter(Boolean);
  return parts.join(" ").toLowerCase().slice(0, 20000);
}

/**
 * Naive in-process search (SQL uses tsvector when available).
 */
export function filterTicketsByQuery(tickets, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return tickets || [];
  return (tickets || []).filter((t) => {
    const hay = `${t.ticket_number || ""} ${t.status_key || ""} ${JSON.stringify(t.data_json || t.data || {})}`.toLowerCase();
    return hay.includes(q);
  });
}
