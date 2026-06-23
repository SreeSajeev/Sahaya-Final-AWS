import type { Ticket } from "@/lib/types";

export type TicketSortKey = "created_at" | "opened_at" | "client_slug";
export type TicketSortDir = "asc" | "desc";

/** In-memory ticket list sort (used by All Tickets, Review Queue, Tenant View). */
export function compareTickets(
  a: Ticket,
  b: Ticket,
  sortBy: TicketSortKey,
  sortDir: TicketSortDir
): number {
  let cmp = 0;
  if (sortBy === "client_slug") {
    const aSlug = (a.client_slug ?? "").trim().toLowerCase();
    const bSlug = (b.client_slug ?? "").trim().toLowerCase();
    cmp = aSlug.localeCompare(bSlug);
  } else {
    const aKey = sortBy === "created_at" ? a.created_at : a.opened_at;
    const bKey = sortBy === "created_at" ? b.created_at : b.opened_at;
    cmp = new Date(aKey).getTime() - new Date(bKey).getTime();
  }
  return sortDir === "asc" ? cmp : -cmp;
}

export function sortTicketList(
  tickets: Ticket[],
  sortBy: TicketSortKey,
  sortDir: TicketSortDir
): Ticket[] {
  return [...tickets].sort((a, b) => compareTickets(a, b, sortBy, sortDir));
}
