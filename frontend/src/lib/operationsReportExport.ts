/**
 * Additive Operations / specialized report builders for Analytics exports.
 * Does not alter existing ticket CSV enrichment headers.
 */

import {
  extractResolutionOtherDetails,
  formatResolutionCategoryDisplay,
} from "@/lib/resolutionDisplay";
import { resolveTicketPriorityLevel, priorityDisplayLabel } from "@/lib/priority";
import {
  buildTicketExportEnrichmentMaps,
  type AssignmentExportRow,
  type FeExportRow,
  type SlaExportRow,
  type TicketExportEnrichmentMaps,
} from "@/lib/ticketExportEnrichment";
import type { FeScorecard } from "@/lib/analyticsMetrics";
import { feScorecardsToCsvRows } from "@/lib/analyticsMetrics";
import { createCSVDownload } from "@/lib/csvExport";
import { todayIST } from "@/lib/dateUtils";

const MS_PER_HOUR = 1000 * 60 * 60;
const OPEN_PIPELINE = new Set([
  "OPEN",
  "NEEDS_REVIEW",
  "ASSIGNED",
  "EN_ROUTE",
  "ON_SITE",
  "RESOLVED_PENDING_VERIFICATION",
  "REOPENED",
  "FE_ATTEMPT_FAILED",
]);

function safe(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function normalizeSlugKey(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** Prefer ticket field; fall back to client-slug map when Analytics rows only have slug. */
function companyShortName(
  ticket: Record<string, unknown>,
  maps?: { companyShortNameBySlug?: Record<string, string> }
): string {
  const direct = safe(ticket.company_short_name).trim();
  if (direct) return direct;
  const rawSlug = safe(ticket.client_slug);
  if (!rawSlug || !maps?.companyShortNameBySlug) return "";
  const byKey = maps.companyShortNameBySlug[normalizeSlugKey(rawSlug)];
  if (byKey) return byKey;
  return maps.companyShortNameBySlug[rawSlug] ?? "";
}

export type OperationsReportExportContext = {
  sla?: Record<string, unknown>[];
  ticket_assignments?: Record<string, unknown>[];
  field_executives?: Record<string, unknown>[];
  /** slug (normalized or raw) → company_short_name */
  companyShortNameBySlug?: Record<string, string>;
};

type OperationsEnrichmentMaps = TicketExportEnrichmentMaps & {
  companyShortNameBySlug?: Record<string, string>;
  userNameById?: Map<string, string>;
};

function ticketAgeHours(ticket: Record<string, unknown>): string {
  if (!OPEN_PIPELINE.has(String(ticket.status))) return "";
  const opened = ticket.opened_at ?? ticket.created_at;
  if (!opened) return "";
  const ms = Date.now() - new Date(String(opened)).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  return String(Math.round((ms / MS_PER_HOUR) * 10) / 10);
}

function slaStatusLabel(sla: SlaExportRow | undefined): string {
  if (!sla) return "";
  const any =
    sla.assignment_breached || sla.onsite_breached || sla.resolution_breached;
  return any ? "Breached" : "On Track";
}

function issueReported(ticket: Record<string, unknown>): string {
  const parts = [
    safe(ticket.category),
    safe(ticket.issue_type),
    safe(ticket.short_description),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildEnrichmentMapsFromContext(
  ctx: OperationsReportExportContext
): OperationsEnrichmentMaps {
  return {
    ...buildTicketExportEnrichmentMaps(
      (ctx.sla ?? []) as SlaExportRow[],
      (ctx.ticket_assignments ?? []) as AssignmentExportRow[],
      (ctx.field_executives ?? []) as FeExportRow[]
    ),
    companyShortNameBySlug: ctx.companyShortNameBySlug,
  };
}

/** Comprehensive ops register — closest CRM replacement for manual Excel. */
export function buildOperationsReportRows(
  tickets: Record<string, unknown>[],
  maps: OperationsEnrichmentMaps
): string[][] {
  // Grouped column order for management readability (Ticket → Assignment → Timeline → Resolution → Verification → SLA)
  const closeFormLabels = Array.from(new Set(tickets.flatMap((ticket) => {
    const snapshot = ticket.close_form_snapshot as { fields?: Array<{ label?: unknown }> } | null;
    return Array.isArray(snapshot?.fields) ? snapshot.fields.map((field) => safe(field?.label)).filter(Boolean) : [];
  })));
  const headers = [
    "Ticket Number",
    "Complaint ID",
    "Client",
    "Company Short Name",
    "Vehicle Number",
    "Vehicle Name",
    "Vehicle Type",
    "Category",
    "Incident Title",
    "Issue Type",
    "Priority",
    "State",
    "Reported Location",
    "Attended Location",
    "Assigned To",
    "Assignment Type",
    "Assigned Role",
    "Assigned Date",
    "Current Status",
    "Current Assignment ID",
    "Resolution Date",
    "Ticket Age Hours",
    "Issue Reported",
    "Resolution Category",
    "Resolution Category Display",
    "Other Resolution Text",
    "Resolution Remarks",
    "Rejection Reason",
    "Rejected At",
    "Location Notes",
    "Proof Status",
    "SLA Status",
    "SLA Assignment Breached",
    "SLA Onsite Breached",
    "SLA Resolution Breached",
    "Response SLA Minutes",
    "Resolution SLA Minutes",
    "Response Due",
    "Resolution Due",
    "Escalation Level",
    ...closeFormLabels.map((label) => `Close Form: ${label}`),
  ];

  const rows = tickets.map((t) => {
    const id = safe(t.id);
    const assigns = maps.assignmentsByTicketId.get(id) ?? [];
    const currentAid = safe(t.current_assignment_id);
    const current =
      assigns.find((a) => safe(a.id) === currentAid) ?? assigns[0];
    let feName = "";
    if (current?.fe_id) feName = maps.feNameById.get(safe(current.fe_id)) ?? "";
    const assignmentType = safe(current?.assignment_type) || (current?.fe_id ? "FIELD_EXECUTIVE" : "");
    const assignedRole = safe(current?.assigned_role) || (assignmentType === "SERVICE_MANAGER" ? "STAFF" : assignmentType === "FIELD_EXECUTIVE" ? "FIELD_EXECUTIVE" : "");
    const assigneeDisplay =
      assignmentType === "SERVICE_MANAGER"
        ? (maps.userNameById?.get(safe(current?.assigned_user_id)) || feName || "Service Manager")
        : feName;
    const sla = maps.slaByTicketId.get(id);
    const cat = safe(t.resolution_category);
    const remarks = safe(t.verification_remarks);
    const other = extractResolutionOtherDetails(cat, remarks);
    const display = formatResolutionCategoryDisplay(cat, remarks);
    const proofSubmitted =
      assigns.some((a) => a.outcome === "SUCCESS")
        ? "Submitted (SUCCESS)"
        : String(t.status) === "RESOLVED"
          ? "Closed"
          : String(t.status) === "RESOLVED_PENDING_VERIFICATION"
            ? "Pending verification"
            : "";

    const priority = priorityDisplayLabel(
      resolveTicketPriorityLevel({
        priority_level: t.priority_level as string | null,
        priority: t.priority === true,
      })
    );

    const snapshot = t.close_form_snapshot as { fields?: Array<{ id?: string; label?: string }>; values?: Record<string, unknown> } | null;
    const closeValuesByLabel = new Map(
      (snapshot?.fields ?? []).map((field) => [safe(field.label), safe(snapshot?.values?.[safe(field.id)])])
    );
    return [
      safe(t.ticket_number),
      safe(t.complaint_id),
      safe(t.client_slug),
      companyShortName(t, maps),
      safe(t.vehicle_number),
      safe(t.vehicle_name),
      safe(t.vehicle_type),
      safe(t.category),
      safe(t.incident_title),
      safe(t.issue_type),
      priority,
      safe(t.state),
      safe(t.location),
      safe(t.resolution_location_name),
      assigneeDisplay,
      assignmentType,
      assignedRole,
      safe(current?.assigned_at),
      safe(t.status),
      currentAid,
      safe(t.resolved_at),
      ticketAgeHours(t),
      issueReported(t),
      cat,
      display,
      other,
      remarks,
      safe(t.rejection_reason),
      safe(t.rejected_at),
      safe(t.review_notes),
      proofSubmitted,
      slaStatusLabel(sla),
      sla?.assignment_breached === true ? "Yes" : sla ? "No" : "",
      sla?.onsite_breached === true ? "Yes" : sla ? "No" : "",
      sla?.resolution_breached === true ? "Yes" : sla ? "No" : "",
      safe(t.response_sla_minutes),
      safe(t.resolution_sla_minutes),
      safe(t.response_due_at),
      safe(t.resolution_due_at),
      safe(t.escalation_level),
      ...closeFormLabels.map((label) => closeValuesByLabel.get(label) ?? ""),
    ];
  });

  return [headers, ...rows];
}

export function buildSlaReportRows(
  tickets: Record<string, unknown>[],
  maps: OperationsEnrichmentMaps
): string[][] {
  const headers = [
    "Ticket Number",
    "Status",
    "Client",
    "Company Short Name",
    "Field Executive",
    "Assignment SLA Breached",
    "Onsite SLA Breached",
    "Resolution SLA Breached",
    "Any Breach",
    "Assignment Deadline",
    "Onsite Deadline",
    "Resolution Deadline",
  ];
  const rows: string[][] = [];
  for (const t of tickets) {
    const id = safe(t.id);
    if (String(t.status) === "REJECTED") continue;
    const sla = maps.slaByTicketId.get(id);
    if (!sla) continue;
    const assigns = maps.assignmentsByTicketId.get(id) ?? [];
    const currentAid = safe(t.current_assignment_id);
    const current =
      assigns.find((a) => safe(a.id) === currentAid) ?? assigns[0];
    const feName = current?.fe_id
      ? maps.feNameById.get(safe(current.fe_id)) ?? ""
      : "";
    const any =
      !!(sla.assignment_breached || sla.onsite_breached || sla.resolution_breached);
    rows.push([
      safe(t.ticket_number),
      safe(t.status),
      safe(t.client_slug),
      companyShortName(t, maps),
      feName,
      sla.assignment_breached === true ? "Yes" : "No",
      sla.onsite_breached === true ? "Yes" : "No",
      sla.resolution_breached === true ? "Yes" : "No",
      any ? "Yes" : "No",
      safe(sla.assignment_deadline),
      safe(sla.onsite_deadline),
      safe(sla.resolution_deadline),
    ]);
  }
  return [headers, ...rows];
}

export function buildResolutionReportRows(
  tickets: Record<string, unknown>[],
  maps?: OperationsEnrichmentMaps
): string[][] {
  const headers = [
    "Ticket Number",
    "Complaint ID",
    "Vehicle Number",
    "Vehicle Name",
    "Vehicle Type",
    "Client",
    "Company Short Name",
    "Reported Issue",
    "Resolution Category",
    "Resolution Category Display",
    "Other Resolution Text",
    "Resolution Remarks",
    "Location Notes",
    "Proof Status",
    "Resolved At",
  ];
  const resolved = tickets.filter((t) => String(t.status) === "RESOLVED");
  const rows = resolved.map((t) => {
    const cat = safe(t.resolution_category);
    const remarks = safe(t.verification_remarks);
    const issue = issueReported(t);
    let proof = "Closed";
    if (maps) {
      const assigns = maps.assignmentsByTicketId.get(safe(t.id)) ?? [];
      if (assigns.some((a) => a.outcome === "SUCCESS")) proof = "Submitted (SUCCESS)";
    }
    return [
      safe(t.ticket_number),
      safe(t.complaint_id),
      safe(t.vehicle_number),
      safe(t.vehicle_name),
      safe(t.vehicle_type),
      safe(t.client_slug),
      companyShortName(t, maps),
      issue,
      cat,
      formatResolutionCategoryDisplay(cat, remarks),
      extractResolutionOtherDetails(cat, remarks),
      remarks,
      safe(t.review_notes),
      proof,
      safe(t.resolved_at),
    ];
  });
  return [headers, ...rows];
}

export function buildVerificationReportRows(
  tickets: Record<string, unknown>[],
  maps: OperationsEnrichmentMaps
): string[][] {
  const headers = [
    "Ticket Number",
    "Complaint ID",
    "Vehicle Number",
    "Vehicle Name",
    "Vehicle Type",
    "Client",
    "Company Short Name",
    "Status",
    "Field Executive",
    "Resolution Category",
    "Resolution Category Display",
    "Other Resolution Text",
    "Location Notes",
    "Resolution Remarks",
    "Resolved At",
    "Proof Hint",
  ];
  const relevant = tickets.filter((t) => {
    const s = String(t.status);
    return s === "RESOLVED_PENDING_VERIFICATION" || s === "RESOLVED";
  });
  const rows = relevant.map((t) => {
    const id = safe(t.id);
    const assigns = maps.assignmentsByTicketId.get(id) ?? [];
    const currentAid = safe(t.current_assignment_id);
    const current =
      assigns.find((a) => safe(a.id) === currentAid) ?? assigns[0];
    const feName = current?.fe_id
      ? maps.feNameById.get(safe(current.fe_id)) ?? ""
      : "";
    const cat = safe(t.resolution_category);
    const remarks = safe(t.verification_remarks);
    const proof =
      assigns.some((a) => a.outcome === "SUCCESS") || String(t.status) === "RESOLVED"
        ? "Likely submitted (SUCCESS / closed)"
        : String(t.status) === "RESOLVED_PENDING_VERIFICATION"
          ? "Pending verification"
          : "";
    return [
      safe(t.ticket_number),
      safe(t.complaint_id),
      safe(t.vehicle_number),
      safe(t.vehicle_name),
      safe(t.vehicle_type),
      safe(t.client_slug),
      companyShortName(t, maps),
      safe(t.status),
      feName,
      cat,
      formatResolutionCategoryDisplay(cat, remarks),
      extractResolutionOtherDetails(cat, remarks),
      safe(t.review_notes),
      remarks,
      safe(t.resolved_at),
      proof,
    ];
  });
  return [headers, ...rows];
}

export function downloadFePerformanceReport(feScorecards: FeScorecard[]): void {
  const rows = feScorecardsToCsvRows(feScorecards);
  createCSVDownload(rows, `executive-performance-${todayIST()}.csv`);
}

export function downloadOperationsReport(
  tickets: Record<string, unknown>[],
  ctx: OperationsReportExportContext
): void {
  const maps = buildEnrichmentMapsFromContext(ctx);
  createCSVDownload(
    buildOperationsReportRows(tickets, maps),
    `operations-report-${todayIST()}.csv`
  );
}

export function downloadSlaReport(
  tickets: Record<string, unknown>[],
  ctx: OperationsReportExportContext
): void {
  const maps = buildEnrichmentMapsFromContext(ctx);
  createCSVDownload(buildSlaReportRows(tickets, maps), `sla-report-${todayIST()}.csv`);
}

export function downloadResolutionReport(
  tickets: Record<string, unknown>[],
  ctx?: OperationsReportExportContext
): void {
  const maps = ctx ? buildEnrichmentMapsFromContext(ctx) : undefined;
  createCSVDownload(
    buildResolutionReportRows(tickets, maps),
    `resolution-report-${todayIST()}.csv`
  );
}

export function downloadVerificationReport(
  tickets: Record<string, unknown>[],
  ctx: OperationsReportExportContext
): void {
  const maps = buildEnrichmentMapsFromContext(ctx);
  createCSVDownload(
    buildVerificationReportRows(tickets, maps),
    `verification-report-${todayIST()}.csv`
  );
}
