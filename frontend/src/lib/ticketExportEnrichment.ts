/**
 * Appended ticket export columns (additive only — never reorder/rename base columns).
 * Missing data exports as empty string.
 */

export const TICKET_EXPORT_APPENDED_HEADERS = [
  "assigned_fe_name",
  "assigned_date",
  "last_assignment_date",
  "assignment_count",
  "latest_assignment_outcome",
  "closed_at",
  "closure_remarks",
  "review_notes",
  "proof_submitted",
  "proof_submitted_at",
  "proof_count",
  "sla_any_breached",
  "sla_assignment_deadline",
  "sla_onsite_deadline",
  "sla_resolution_deadline",
  "resolution_time_hours",
  "resolution_category",
] as const;

export type TicketExportRow = Record<string, unknown>;

export type SlaExportRow = {
  ticket_id?: string;
  assignment_breached?: boolean;
  onsite_breached?: boolean;
  resolution_breached?: boolean;
  assignment_deadline?: string | null;
  onsite_deadline?: string | null;
  resolution_deadline?: string | null;
};

export type AssignmentExportRow = {
  id?: string;
  ticket_id?: string;
  fe_id?: string;
  assigned_at?: string | null;
  outcome?: string | null;
};

export type FeExportRow = {
  id?: string;
  name?: string | null;
};

export type TicketExportEnrichmentMaps = {
  slaByTicketId: Map<string, SlaExportRow>;
  assignmentsByTicketId: Map<string, AssignmentExportRow[]>;
  feNameById: Map<string, string>;
};

function safeStr(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function boolYesNo(v: boolean | undefined | null): string {
  return v === true ? "Yes" : v === false ? "No" : "";
}

function countProofImages(attachments: unknown): number {
  if (!attachments || typeof attachments !== "object") return 0;
  const a = attachments as Record<string, unknown>;
  if (Array.isArray(a.images)) return a.images.length;
  if (Array.isArray(attachments)) return attachments.length;
  let n = 0;
  for (const v of Object.values(a)) {
    if (v && typeof v === "object") n += 1;
  }
  return n;
}

export function resolutionTimeHours(ticket: TicketExportRow): string {
  const opened = safeStr(ticket.opened_at || ticket.created_at);
  const closed = safeStr(ticket.resolved_at || ticket.updated_at);
  if (!opened || !closed) return "";
  const ms = new Date(closed).getTime() - new Date(opened).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  return String(Math.round((ms / 36e5) * 100) / 100);
}

export function buildTicketExportEnrichmentMaps(
  slaList: SlaExportRow[],
  assignmentList: AssignmentExportRow[],
  feList: FeExportRow[]
): TicketExportEnrichmentMaps {
  const slaByTicketId = new Map<string, SlaExportRow>();
  for (const s of slaList) {
    const id = safeStr(s.ticket_id);
    if (id) slaByTicketId.set(id, s);
  }

  const assignmentsByTicketId = new Map<string, AssignmentExportRow[]>();
  for (const a of assignmentList) {
    const tid = safeStr(a.ticket_id);
    if (!tid) continue;
    const list = assignmentsByTicketId.get(tid) ?? [];
    list.push(a);
    assignmentsByTicketId.set(tid, list);
  }
  for (const [tid, list] of assignmentsByTicketId) {
    list.sort(
      (x, y) =>
        new Date(safeStr(y.assigned_at) || 0).getTime() -
        new Date(safeStr(x.assigned_at) || 0).getTime()
    );
    assignmentsByTicketId.set(tid, list);
  }

  const feNameById = new Map<string, string>();
  for (const fe of feList) {
    const id = safeStr(fe.id);
    if (id) feNameById.set(id, safeStr(fe.name));
  }

  return { slaByTicketId, assignmentsByTicketId, feNameById };
}

export function buildSlaMapsFromClientRows(
  slaRows: Array<{
    ticket_id: string;
    assignment_breached?: boolean;
    onsite_breached?: boolean;
    resolution_breached?: boolean;
  }>
): Map<string, SlaExportRow> {
  const m = new Map<string, SlaExportRow>();
  for (const s of slaRows) {
    m.set(s.ticket_id, s);
  }
  return m;
}

/**
 * Values for TICKET_EXPORT_APPENDED_HEADERS (same order).
 */
export function getAppendedTicketExportValues(
  ticket: TicketExportRow,
  maps: TicketExportEnrichmentMaps,
  options?: { feNameOverride?: string }
): string[] {
  const ticketId = safeStr(ticket.id);
  const sla = maps.slaByTicketId.get(ticketId);
  const assignments = maps.assignmentsByTicketId.get(ticketId) ?? [];
  const latest = assignments[0];
  const currentAid = safeStr(ticket.current_assignment_id);
  const currentAssign =
    assignments.find((a) => safeStr(a.id) === currentAid) ?? latest;

  let feName = options?.feNameOverride ?? "";
  if (!feName && currentAssign?.fe_id) {
    feName = maps.feNameById.get(safeStr(currentAssign.fe_id)) ?? "";
  }

  const assignedDate = safeStr(currentAssign?.assigned_at);
  const lastAssignmentDate = safeStr(latest?.assigned_at);
  const assignmentCount = assignments.length > 0 ? String(assignments.length) : "";
  const outcome = safeStr(latest?.outcome);

  const closedAt = safeStr(ticket.resolved_at || (ticket.status === "RESOLVED" ? ticket.updated_at : ""));
  const closureRemarks = safeStr(ticket.verification_remarks);
  const reviewNotes = safeStr(ticket.review_notes);
  const resolutionCategory = safeStr(ticket.resolution_category);

  const proofCount = countProofImages(ticket._export_proof_attachments);
  const proofSubmitted = proofCount > 0 ? "Yes" : "";
  const proofSubmittedAt = safeStr(ticket._export_proof_submitted_at);

  const anyBreached =
    sla &&
    (sla.assignment_breached || sla.onsite_breached || sla.resolution_breached);

  return [
    feName,
    assignedDate,
    lastAssignmentDate,
    assignmentCount,
    outcome,
    closedAt,
    closureRemarks,
    reviewNotes,
    proofSubmitted,
    proofSubmittedAt,
    proofCount > 0 ? String(proofCount) : "",
    boolYesNo(anyBreached ?? null),
    safeStr(sla?.assignment_deadline),
    safeStr(sla?.onsite_deadline),
    safeStr(sla?.resolution_deadline),
    resolutionTimeHours(ticket),
    resolutionCategory,
  ];
}
