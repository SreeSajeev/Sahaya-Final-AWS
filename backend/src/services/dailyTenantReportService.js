import {
  findReportRunByOrgAndDate,
  insertDailyTenantReportRun,
  isDailyTenantReportRunsTableReady,
  reclaimFailedReportRun,
  upsertDailyTenantReportRun,
} from "../repositories/dailyTenantReportRunRepository.js";
import {
  listAssignmentFeIdsByIds,
  listAssignmentsByIdsForDailyReport,
  listAssignmentsInAssignedAtWindow,
  listAssignmentStatsByTicketIdsForDailyReport,
} from "../repositories/assignmentRepository.js";
import { listFeProofCommentsByTicketIds } from "../repositories/commentRepository.js";
import { listFieldExecutivesByOrganisationId } from "../repositories/fieldExecutiveRepository.js";
import { listOrganisations } from "../repositories/organisationRepository.js";
import { listPublicSubmissionsByTicketIds } from "../repositories/publicComplaintSubmissionRepository.js";
import { listSlaByTicketIdsForOrg } from "../repositories/slaRepository.js";
import { listTenantClientsByOrganisationId } from "../repositories/tenantClientRepository.js";
import {
  listResolvedTicketsForFeStats,
  listTicketIdsByOrgAndIds,
  listTicketsByIdsForDailyReport,
  listTicketsCreatedInWindowForOrg,
  listTicketsResolvedInWindowForOrg,
  listTicketsUpdatedInWindowForOrg,
} from "../repositories/ticketQueryRepository.js";
import { listTenantAdminUsers } from "../repositories/userRepository.js";
import { logEvent } from "../utils/structuredLog.js";
import {
  getPreviousIstReportDay,
  isInstantInWindow,
} from "../utils/reportDateWindow.js";
import {
  buildDailyReportCsvFilename,
  buildDailyTicketReportCsv,
} from "./dailyTicketReportCsvService.js";
import { sendDailyTenantReportEmail } from "./emailService.js";
import { hasPublicColumn } from "./schemaCompatService.js";

const CHUNK = 200;

/** @type {boolean | null} */
let reportRunsTableReadyCache = null;

function isUserActive(row) {
  const active = row.is_active ?? row.active;
  return active !== false;
}

function isUserApproved(row) {
  const status = row.approval_status ?? "approved";
  return status === "approved";
}

/**
 * Abort all report work when migration has not been applied.
 * @returns {Promise<boolean>}
 */
export async function isReportRunsTableReady() {
  if (reportRunsTableReadyCache !== null) return reportRunsTableReadyCache;

  const { ready, error } = await isDailyTenantReportRunsTableReady();
  if (error) {
    throw new Error(`Failed to verify daily_tenant_report_runs: ${error.message}`);
  }

  reportRunsTableReadyCache = ready;
  return ready;
}

/**
 * @param {string} organisationId
 */
export async function loadTenantAdminRecipients(organisationId) {
  const { data, error } = await listTenantAdminUsers(organisationId);

  if (error) throw new Error(`Failed to load tenant admins: ${error.message}`);

  return (data || []).filter(
    (u) =>
      u.role === "ADMIN" &&
      u.organisation_id === organisationId &&
      u.email &&
      String(u.email).trim() !== "" &&
      isUserActive(u) &&
      isUserApproved(u)
  );
}

/**
 * @param {string} organisationId
 * @param {string} reportDate — YYYY-MM-DD
 */
async function getExistingReportRun(organisationId, reportDate) {
  const { data, error } = await findReportRunByOrgAndDate(organisationId, reportDate);

  if (error) {
    throw new Error(`Failed to check report run: ${error.message}`);
  }
  return data;
}

/**
 * @param {object} row
 */
async function upsertReportRun(row) {
  const { error } = await upsertDailyTenantReportRun(row);
  if (error) {
    throw new Error(`Failed to record report run: ${error.message}`);
  }
}

/**
 * Atomically claim org/report_date for this worker (insert or reclaim failed).
 * @returns {Promise<{ claimed: boolean, reason?: string, status?: string }>}
 */
async function tryClaimReportRun(organisationId, reportDate, recipientCount) {
  const existing = await getExistingReportRun(organisationId, reportDate);
  if (existing && ["sent", "dry_run", "skipped"].includes(existing.status)) {
    return { claimed: false, reason: "already_completed", status: existing.status };
  }

  const { error: insertError } = await insertDailyTenantReportRun({
    organisation_id: organisationId,
    report_date: reportDate,
    status: "pending",
    recipient_count: recipientCount,
  });

  if (!insertError) {
    return { claimed: true };
  }

  if (insertError.code !== "23505") {
    throw new Error(`Failed to claim report run: ${insertError.message}`);
  }

  const { data: reclaimed, error: reclaimError } = await reclaimFailedReportRun(
    organisationId,
    reportDate,
    recipientCount
  );

  if (reclaimError) {
    throw new Error(`Failed to reclaim report run: ${reclaimError.message}`);
  }
  if (reclaimed) {
    return { claimed: true };
  }

  const current = await getExistingReportRun(organisationId, reportDate);
  if (current?.status === "pending") {
    return { claimed: false, reason: "in_progress", status: "pending" };
  }
  if (current && ["sent", "dry_run", "skipped"].includes(current.status)) {
    return { claimed: false, reason: "already_completed", status: current.status };
  }

  return { claimed: false, reason: "claim_lost", status: current?.status };
}

/**
 * Org-scoped assignments in the report window (avoids cross-tenant scans when possible).
 * @param {string} organisationId
 * @param {Date} windowStart
 * @param {Date} windowEnd
 * @param {boolean} hasAssignmentOrgId
 */
async function loadAssignmentsInWindowForOrg(
  organisationId,
  windowStart,
  windowEnd,
  hasAssignmentOrgId
) {
  const { data, error } = await listAssignmentsInAssignedAtWindow(
    organisationId,
    windowStart,
    windowEnd,
    hasAssignmentOrgId
  );
  if (error) throw new Error(`Assignment query failed: ${error.message}`);

  if (hasAssignmentOrgId) {
    return (data || []).filter(
      (row) =>
        (!row.organisation_id || row.organisation_id === organisationId) &&
        isInstantInWindow(row.assigned_at, windowStart, windowEnd)
    );
  }

  const assignmentRows = data || [];
  const candidateTicketIds = [
    ...new Set(assignmentRows.map((a) => a.ticket_id).filter(Boolean)),
  ];
  const allowedTicketIds = new Set();
  for (let i = 0; i < candidateTicketIds.length; i += CHUNK) {
    const chunk = candidateTicketIds.slice(i, i + CHUNK);
    const { data: scopedTickets, error: ticketErr } = await listTicketIdsByOrgAndIds(
      organisationId,
      chunk
    );
    if (ticketErr) throw new Error(`Assignment ticket scope failed: ${ticketErr.message}`);
    for (const t of scopedTickets || []) allowedTicketIds.add(String(t.id));
  }

  return assignmentRows.filter(
    (row) =>
      allowedTicketIds.has(String(row.ticket_id)) &&
      isInstantInWindow(row.assigned_at, windowStart, windowEnd)
  );
}

/**
 * @param {string} organisationId
 * @param {Date} windowStart
 * @param {Date} windowEnd
 * @param {boolean} hasAssignmentOrgId
 * @param {boolean} hasResolvedAt
 */
async function collectActivityTicketIds(
  organisationId,
  windowStart,
  windowEnd,
  hasAssignmentOrgId,
  hasResolvedAt
) {
  const ticketIds = new Set();
  /** @type {Map<string, Set<string>>} */
  const activityTypesByTicketId = new Map();
  /** @type {Map<string, number>} */
  const assignCountInWindow = new Map();

  const addActivity = (ticketId, type) => {
    if (!ticketId) return;
    const id = String(ticketId);
    ticketIds.add(id);
    if (!activityTypesByTicketId.has(id)) activityTypesByTicketId.set(id, new Set());
    activityTypesByTicketId.get(id).add(type);
  };

  const { data: createdRows, error: createdErr } = await listTicketsCreatedInWindowForOrg(
    organisationId,
    windowStart,
    windowEnd
  );
  if (createdErr) throw new Error(`Created ticket query failed: ${createdErr.message}`);
  for (const row of createdRows || []) {
    if (isInstantInWindow(row.created_at ?? row.opened_at, windowStart, windowEnd)) {
      addActivity(row.id, "Created");
    }
  }

  const { data: updatedRows, error: updatedErr } = await listTicketsUpdatedInWindowForOrg(
    organisationId,
    windowStart,
    windowEnd
  );
  if (updatedErr) throw new Error(`Updated ticket query failed: ${updatedErr.message}`);
  for (const row of updatedRows || []) {
    if (!isInstantInWindow(row.updated_at, windowStart, windowEnd)) continue;
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    const updatedAt = new Date(row.updated_at).getTime();
    if (Math.abs(updatedAt - createdAt) > 2000) {
      addActivity(row.id, "Updated");
    }
    if (
      !hasResolvedAt &&
      row.status === "RESOLVED" &&
      isInstantInWindow(row.updated_at, windowStart, windowEnd)
    ) {
      addActivity(row.id, "Resolved");
      addActivity(row.id, "Closed");
    }
  }

  if (hasResolvedAt) {
    const { data: resolvedRows, error: resolvedErr } = await listTicketsResolvedInWindowForOrg(
      organisationId,
      windowStart,
      windowEnd
    );
    if (resolvedErr) throw new Error(`Resolved ticket query failed: ${resolvedErr.message}`);
    for (const row of resolvedRows || []) {
      if (isInstantInWindow(row.resolved_at, windowStart, windowEnd)) {
        addActivity(row.id, "Resolved");
        addActivity(row.id, "Closed");
      }
    }
  }

  const assignmentRows = await loadAssignmentsInWindowForOrg(
    organisationId,
    windowStart,
    windowEnd,
    hasAssignmentOrgId
  );

  for (const a of assignmentRows) {
    const id = String(a.ticket_id);
    const count = (assignCountInWindow.get(id) || 0) + 1;
    assignCountInWindow.set(id, count);
    addActivity(a.ticket_id, count > 1 ? "Reassigned" : "Assigned");
  }

  const activityTypesPlain = new Map();
  for (const [id, set] of activityTypesByTicketId) {
    activityTypesPlain.set(id, [...set].sort());
  }

  return { ticketIds: [...ticketIds], activityTypesByTicketId: activityTypesPlain };
}

/**
 * @param {string} organisationId
 * @param {string[]} ticketIds
 * @param {{ hasResolvedAt: boolean, hasReviewNotes: boolean, hasResolutionCategory: boolean }} schemaFlags
 */
async function loadTicketsByIds(organisationId, ticketIds, schemaFlags) {
  if (ticketIds.length === 0) return [];
  const rows = [];
  for (let i = 0; i < ticketIds.length; i += CHUNK) {
    const chunk = ticketIds.slice(i, i + CHUNK);
    const { data, error } = await listTicketsByIdsForDailyReport(organisationId, chunk, schemaFlags);
    if (error) throw new Error(`Failed to load tickets: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows.filter((t) => t.organisation_id === organisationId);
}

/**
 * @param {Array<Record<string, unknown>>} tickets
 */
async function loadAssignmentsForTickets(tickets) {
  const currentAssignmentByTicketId = new Map();
  if (tickets.length === 0) return currentAssignmentByTicketId;

  const currentIds = tickets.map((t) => t.current_assignment_id).filter(Boolean);

  if (currentIds.length > 0) {
    for (let i = 0; i < currentIds.length; i += CHUNK) {
      const chunk = currentIds.slice(i, i + CHUNK);
      const { data } = await listAssignmentsByIdsForDailyReport(chunk);
      for (const row of data || []) {
        currentAssignmentByTicketId.set(String(row.ticket_id), row);
      }
    }
  }

  return currentAssignmentByTicketId;
}

/**
 * @param {string[]} ticketIds
 * @param {string} organisationId
 * @param {boolean} hasAssignmentOrgId
 */
async function loadAssignmentStatsByTicketId(ticketIds, organisationId, hasAssignmentOrgId) {
  const map = new Map();
  if (ticketIds.length === 0) return map;

  for (let i = 0; i < ticketIds.length; i += CHUNK) {
    const chunk = ticketIds.slice(i, i + CHUNK);
    const { data, error } = await listAssignmentStatsByTicketIdsForDailyReport(
      chunk,
      organisationId,
      hasAssignmentOrgId
    );
    if (error) {
      console.error("[dailyReport] assignment stats load failed", error.message);
      continue;
    }
    for (const row of data || []) {
      if (hasAssignmentOrgId && row.organisation_id !== organisationId) continue;
      const tid = String(row.ticket_id);
      const prev = map.get(tid) ?? { count: 0, lastAssignedAt: "", latestOutcome: "" };
      prev.count += 1;
      const at = row.assigned_at ? String(row.assigned_at) : "";
      if (at && (!prev.lastAssignedAt || new Date(at) > new Date(prev.lastAssignedAt))) {
        prev.lastAssignedAt = at;
        prev.latestOutcome = row.outcome != null ? String(row.outcome) : "";
      }
      map.set(tid, prev);
    }
  }
  return map;
}

/**
 * @param {string[]} ticketIds
 */
async function loadProofStatsByTicketId(ticketIds) {
  const map = new Map();
  if (ticketIds.length === 0) return map;

  for (let i = 0; i < ticketIds.length; i += CHUNK) {
    const chunk = ticketIds.slice(i, i + CHUNK);
    const { data, error } = await listFeProofCommentsByTicketIds(chunk);
    if (error) {
      console.error("[dailyReport] proof stats load failed", error.message);
      continue;
    }
    for (const row of data || []) {
      const tid = String(row.ticket_id);
      if (map.has(tid)) continue;
      let proofCount = 0;
      const att = row.attachments;
      if (att && typeof att === "object") {
        if (Array.isArray(att.images)) proofCount = att.images.length;
        else if (Array.isArray(att)) proofCount = att.length;
        else proofCount = Object.keys(att).length;
      }
      if (proofCount > 0) {
        map.set(tid, {
          proofCount,
          proofSubmittedAt: row.created_at ? String(row.created_at) : "",
        });
      }
    }
  }
  return map;
}

/**
 * @param {string} organisationId
 */
async function loadFieldExecutives(organisationId) {
  const { data, error } = await listFieldExecutivesByOrganisationId(organisationId);
  if (error) throw new Error(`Failed to load FEs: ${error.message}`);
  const map = new Map();
  for (const fe of data || []) map.set(String(fe.id), fe);
  return map;
}

/**
 * @param {string} organisationId
 * @param {string[]} ticketIds
 */
async function loadPublicSubmissions(organisationId, ticketIds) {
  const map = new Map();
  if (ticketIds.length === 0) return map;
  for (let i = 0; i < ticketIds.length; i += CHUNK) {
    const chunk = ticketIds.slice(i, i + CHUNK);
    const { data } = await listPublicSubmissionsByTicketIds(organisationId, chunk);
    for (const row of data || []) {
      if (row.organisation_id !== organisationId) continue;
      map.set(String(row.ticket_id), row);
    }
  }
  return map;
}

/**
 * @param {string} organisationId
 */
async function loadTenantClientsBySlug(organisationId) {
  const { data } = await listTenantClientsByOrganisationId(organisationId);
  const map = new Map();
  for (const row of data || []) {
    map.set(String(row.slug).toLowerCase(), row);
  }
  return map;
}

/**
 * @param {string} organisationId
 * @param {string[]} ticketIds — already org-scoped
 * @param {boolean} hasSlaOrgId
 */
async function loadSlaByTicketId(organisationId, ticketIds, hasSlaOrgId) {
  const map = new Map();
  if (ticketIds.length === 0) return map;

  for (let i = 0; i < ticketIds.length; i += CHUNK) {
    const chunk = ticketIds.slice(i, i + CHUNK);
    const { data, error } = await listSlaByTicketIdsForOrg(organisationId, chunk, hasSlaOrgId);
    if (error) {
      console.warn("[DAILY_REPORT] sla_tracking chunk skipped:", error.message);
      continue;
    }
    for (const row of data || []) {
      if (hasSlaOrgId && row.organisation_id && row.organisation_id !== organisationId) {
        continue;
      }
      map.set(String(row.ticket_id), row);
    }
  }
  return map;
}

/**
 * @param {string} organisationId
 * @param {Date} windowStart
 * @param {Date} windowEnd
 * @param {boolean} hasAssignmentOrgId
 * @param {boolean} hasResolvedAt
 */
async function computeFePerformance(
  organisationId,
  windowStart,
  windowEnd,
  hasAssignmentOrgId,
  hasResolvedAt
) {
  const feMap = await loadFieldExecutives(organisationId);

  /** @type {Map<string, { feId: string, name: string, assigned: number, closed: number }>} */
  const stats = new Map();
  const ensure = (feId) => {
    const id = String(feId);
    if (!stats.has(id)) {
      const fe = feMap.get(id);
      stats.set(id, {
        feId: id,
        name: fe?.name || "Unknown FE",
        assigned: 0,
        closed: 0,
      });
    }
    return stats.get(id);
  };

  const assignmentRows = await loadAssignmentsInWindowForOrg(
    organisationId,
    windowStart,
    windowEnd,
    hasAssignmentOrgId
  );

  for (const a of assignmentRows) {
    ensure(a.fe_id).assigned += 1;
  }

  let resolvedTickets = [];
  const { data: resolvedData, error: resolvedError } = await listResolvedTicketsForFeStats(
    organisationId,
    windowStart,
    windowEnd,
    hasResolvedAt
  );
  if (resolvedError) {
    console.warn(
      `[DAILY_REPORT] resolved FE stats${hasResolvedAt ? "" : " (fallback)"} skipped:`,
      resolvedError.message
    );
  } else {
    resolvedTickets = hasResolvedAt
      ? resolvedData || []
      : (resolvedData || []).map((t) => ({ ...t, resolved_at: t.updated_at }));
  }

  const assignmentIds = resolvedTickets.map((t) => t.current_assignment_id).filter(Boolean);
  const assignmentFeById = new Map();
  for (let i = 0; i < assignmentIds.length; i += CHUNK) {
    const chunk = assignmentIds.slice(i, i + CHUNK);
    const { data: rows } = await listAssignmentFeIdsByIds(chunk);
    for (const row of rows || []) assignmentFeById.set(String(row.id), row.fe_id);
  }

  for (const t of resolvedTickets) {
    const resolvedInstant = t.resolved_at;
    if (!isInstantInWindow(resolvedInstant, windowStart, windowEnd)) continue;
    if (!t.current_assignment_id) continue;
    const feId = assignmentFeById.get(String(t.current_assignment_id));
    if (feId) ensure(feId).closed += 1;
  }

  return [...stats.values()].sort((a, b) => b.closed - a.closed || b.assigned - a.assigned);
}

/**
 * @param {Array<Record<string, unknown>>} tickets
 * @param {Date} windowStart
 * @param {Date} windowEnd
 * @param {boolean} hasResolvedAt
 */
function buildSummaryMetrics(tickets, windowStart, windowEnd, hasResolvedAt) {
  const createdToday = tickets.filter((t) =>
    isInstantInWindow(t.created_at ?? t.opened_at, windowStart, windowEnd)
  ).length;

  const closedToday = tickets.filter((t) => {
    if (t.status !== "RESOLVED") return false;
    if (hasResolvedAt) {
      return isInstantInWindow(t.resolved_at, windowStart, windowEnd);
    }
    return isInstantInWindow(t.updated_at, windowStart, windowEnd);
  }).length;

  const openTickets = tickets.filter((t) => t.status === "OPEN").length;
  const pendingReview = tickets.filter(
    (t) => t.status === "NEEDS_REVIEW" || t.needs_review === true
  ).length;
  const assignedTickets = tickets.filter(
    (t) => t.status === "ASSIGNED" || Boolean(t.current_assignment_id)
  ).length;
  const unassignedTickets = tickets.filter(
    (t) =>
      ["OPEN", "NEEDS_REVIEW"].includes(String(t.status)) && !t.current_assignment_id
  ).length;

  const highPriority = tickets.filter((t) => t.priority === true).length;

  return {
    createdToday,
    closedToday,
    openTickets,
    pendingReview,
    assignedTickets,
    unassignedTickets,
    highPriority,
    totalActivityTickets: tickets.length,
  };
}

function buildCategoryBreakdown(tickets) {
  const counts = new Map();
  for (const t of tickets) {
    const key = (t.category && String(t.category).trim()) || "Uncategorized";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function buildLocationBreakdown(tickets, limit = 10) {
  const counts = new Map();
  for (const t of tickets) {
    const key = (t.location && String(t.location).trim()) || "Not specified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * @param {object} params
 * @param {{ id: string, name: string }} params.organisation
 * @param {boolean} [params.dryRun]
 * @param {ReturnType<typeof getPreviousIstReportDay>} [params.reportDay]
 * @param {boolean} params.hasResolvedAt
 * @param {boolean} params.hasReviewNotes
 * @param {boolean} params.hasResolutionCategory
 * @param {boolean} params.hasAssignmentOrgId
 * @param {boolean} params.hasSlaOrgId
 */
export async function generateAndSendDailyReportForOrganisation({
  organisation,
  dryRun = false,
  reportDay = getPreviousIstReportDay(),
  hasResolvedAt,
  hasReviewNotes = false,
  hasResolutionCategory = false,
  hasAssignmentOrgId,
  hasSlaOrgId,
}) {
  const organisationId = organisation.id;
  const orgName = organisation.name || "Organisation";

  const recipients = await loadTenantAdminRecipients(organisationId);
  if (recipients.length === 0) {
    await upsertReportRun({
      organisation_id: organisationId,
      report_date: reportDay.dateStr,
      status: "skipped",
      recipient_count: 0,
      ticket_count: 0,
      error: "no_tenant_admins",
      sent_at: new Date().toISOString(),
    });
    return { skipped: true, reason: "no_recipients" };
  }

  const claim = await tryClaimReportRun(organisationId, reportDay.dateStr, recipients.length);
  if (!claim.claimed) {
    return {
      skipped: true,
      reason: claim.reason || "not_claimed",
      status: claim.status,
    };
  }

  try {
    const { ticketIds, activityTypesByTicketId } = await collectActivityTicketIds(
      organisationId,
      reportDay.windowStart,
      reportDay.windowEnd,
      hasAssignmentOrgId,
      hasResolvedAt
    );

    const maxCsv = Number(process.env.DAILY_REPORT_MAX_TICKETS_CSV) || 5000;
    if (ticketIds.length > maxCsv) {
      throw new Error(`Ticket count ${ticketIds.length} exceeds cap ${maxCsv}`);
    }

    const tickets = await loadTicketsByIds(organisationId, ticketIds, {
      hasResolvedAt,
      hasReviewNotes,
      hasResolutionCategory,
    });
    const assignmentMap = await loadAssignmentsForTickets(tickets);
    const feById = await loadFieldExecutives(organisationId);
    const publicSubmissionByTicketId = await loadPublicSubmissions(organisationId, ticketIds);
    const tenantClientBySlug = await loadTenantClientsBySlug(organisationId);
    const slaByTicketId = await loadSlaByTicketId(organisationId, ticketIds, hasSlaOrgId);
    const assignmentStatsByTicketId = await loadAssignmentStatsByTicketId(
      ticketIds,
      organisationId,
      hasAssignmentOrgId
    );
    const proofStatsByTicketId = await loadProofStatsByTicketId(ticketIds);
    const fePerformance = await computeFePerformance(
      organisationId,
      reportDay.windowStart,
      reportDay.windowEnd,
      hasAssignmentOrgId,
      hasResolvedAt
    );

    const summary = buildSummaryMetrics(
      tickets,
      reportDay.windowStart,
      reportDay.windowEnd,
      hasResolvedAt
    );
    const categories = buildCategoryBreakdown(tickets);
    const locations = buildLocationBreakdown(tickets);

    let slaBreaches = 0;
    let agingTickets = 0;
    const agingDays = Number(process.env.DAILY_REPORT_AGING_DAYS) || 3;
    const agingCutoff = new Date(reportDay.windowEnd.getTime() - agingDays * 24 * 60 * 60 * 1000);

    for (const t of tickets) {
      const sla = slaByTicketId.get(String(t.id));
      if (sla?.assignment_breached || sla?.resolution_breached) slaBreaches += 1;
      const opened = t.opened_at || t.created_at;
      if (
        opened &&
        new Date(opened).getTime() <= agingCutoff.getTime() &&
        t.status !== "RESOLVED" &&
        t.status !== "REJECTED"
      ) {
        agingTickets += 1;
      }
    }

    const csv = buildDailyTicketReportCsv({
      orgName,
      tickets,
      feById,
      currentAssignmentByTicketId: assignmentMap,
      publicSubmissionByTicketId,
      tenantClientBySlug,
      slaByTicketId,
      activityTypesByTicketId,
      assignmentStatsByTicketId,
      proofStatsByTicketId,
    });

    const csvFilename = buildDailyReportCsvFilename(orgName, reportDay);

    const emailPayload = {
      orgName,
      reportDay,
      summary: { ...summary, slaBreaches, agingTickets },
      categories,
      locations,
      fePerformance,
      csvFilename,
      csvContent: csv,
    };

    if (dryRun) {
      logEvent("dailyTenantReport.dryRun", {
        organisationId,
        reportDate: reportDay.dateStr,
        recipientCount: recipients.length,
        ticketCount: tickets.length,
      });
      await upsertReportRun({
        organisation_id: organisationId,
        report_date: reportDay.dateStr,
        status: "dry_run",
        recipient_count: recipients.length,
        ticket_count: tickets.length,
        sent_at: new Date().toISOString(),
      });
      return { dryRun: true, ticketCount: tickets.length, recipientCount: recipients.length };
    }

    let sentCount = 0;
    for (const recipient of recipients) {
      const result = await sendDailyTenantReportEmail({
        toEmail: String(recipient.email).trim(),
        adminName: recipient.name,
        ...emailPayload,
      });
      if (result.ok) sentCount += 1;
    }

    const finalStatus = sentCount > 0 ? "sent" : "failed";
    await upsertReportRun({
      organisation_id: organisationId,
      report_date: reportDay.dateStr,
      status: finalStatus,
      recipient_count: recipients.length,
      ticket_count: tickets.length,
      error: sentCount === 0 ? "all_sends_failed" : null,
      sent_at: new Date().toISOString(),
    });

    logEvent("dailyTenantReport.completed", {
      organisationId,
      reportDate: reportDay.dateStr,
      status: finalStatus,
      sentCount,
      ticketCount: tickets.length,
    });

    return { sent: sentCount > 0, sentCount, ticketCount: tickets.length };
  } catch (err) {
    await upsertReportRun({
      organisation_id: organisationId,
      report_date: reportDay.dateStr,
      status: "failed",
      error: err?.message || "unknown_error",
      sent_at: new Date().toISOString(),
    });
    throw err;
  }
}

/**
 * @param {{ dryRun?: boolean }} [options]
 */
export async function runDailyReportsForAllTenants(options = {}) {
  const tableReady = await isReportRunsTableReady();
  if (!tableReady) {
    const message = "daily_tenant_report_runs table missing — apply migration before enabling reports";
    console.error(`[DAILY_REPORT] ${message}`);
    logEvent("dailyTenantReport.aborted", { reason: "migration_missing" });
    return { aborted: true, reason: "migration_missing", results: [] };
  }

  const dryRun = options.dryRun === true;
  const reportDay = getPreviousIstReportDay();

  const [hasResolvedAt, hasReviewNotes, hasResolutionCategory, hasAssignmentOrgId, hasSlaOrgId] =
    await Promise.all([
    hasPublicColumn("tickets", "resolved_at"),
    hasPublicColumn("tickets", "review_notes"),
    hasPublicColumn("tickets", "resolution_category"),
    hasPublicColumn("ticket_assignments", "organisation_id"),
    hasPublicColumn("sla_tracking", "organisation_id"),
  ]);

  if (!hasResolvedAt) {
    console.warn("[DAILY_REPORT] tickets.resolved_at missing — using updated_at fallbacks for close metrics");
  }

  const { data: orgs, error } = await listOrganisations();

  if (error) throw new Error(`Failed to load organisations: ${error.message}`);

  const results = [];
  for (const org of (orgs || []).filter((o) => o.status === "active")) {
    try {
      const result = await generateAndSendDailyReportForOrganisation({
        organisation: org,
        dryRun,
        reportDay,
        hasResolvedAt,
        hasReviewNotes,
        hasResolutionCategory,
        hasAssignmentOrgId,
        hasSlaOrgId,
      });
      results.push({ organisationId: org.id, orgName: org.name, ...result });
    } catch (err) {
      console.error("[DAILY_REPORT] org failed", org.id, err.message);
      results.push({ organisationId: org.id, orgName: org.name, error: err.message });
    }
  }

  return { reportDay, results };
}
