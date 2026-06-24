import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

export async function isDailyTenantReportRunsTableReady() {
  try {
    await prisma.dailyTenantReportRun.findFirst({ select: { id: true } });
    return { ready: true, error: null };
  } catch (err) {
    const msg = String(err?.message || "");
    if (err?.code === "P2021" || /does not exist/i.test(msg)) {
      return { ready: false, error: null };
    }
    return { ready: false, error: toSupabaseStyleError(err) };
  }
}

export async function findReportRunByOrgAndDate(organisationId, reportDate) {
  try {
    const row = await prisma.dailyTenantReportRun.findFirst({
      where: { organisationId, reportDate: new Date(String(reportDate)) },
      select: { id: true, status: true },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function upsertDailyTenantReportRun(row) {
  try {
    const reportDate = new Date(String(row.report_date));
    await prisma.dailyTenantReportRun.upsert({
      where: {
        organisationId_reportDate: {
          organisationId: row.organisation_id,
          reportDate,
        },
      },
      create: {
        organisationId: row.organisation_id,
        reportDate,
        status: row.status,
        recipientCount: row.recipient_count ?? null,
        ticketCount: row.ticket_count ?? null,
        error: row.error ?? null,
        sentAt: row.sent_at ? new Date(String(row.sent_at)) : null,
      },
      update: {
        status: row.status,
        recipientCount: row.recipient_count ?? null,
        ticketCount: row.ticket_count ?? null,
        error: row.error ?? null,
        sentAt: row.sent_at ? new Date(String(row.sent_at)) : null,
      },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function insertDailyTenantReportRun(row) {
  try {
    await prisma.dailyTenantReportRun.create({
      data: {
        organisationId: row.organisation_id,
        reportDate: new Date(String(row.report_date)),
        status: row.status,
        recipientCount: row.recipient_count ?? null,
        ticketCount: row.ticket_count ?? null,
        error: row.error ?? null,
        sentAt: row.sent_at ? new Date(String(row.sent_at)) : null,
      },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function reclaimFailedReportRun(organisationId, reportDate, recipientCount) {
  try {
    const updated = await prisma.dailyTenantReportRun.updateMany({
      where: {
        organisationId,
        reportDate: new Date(String(reportDate)),
        status: "failed",
      },
      data: {
        status: "pending",
        error: null,
        recipientCount,
      },
    });
    if (updated.count === 0) {
      return { data: null, error: null };
    }
    const row = await prisma.dailyTenantReportRun.findFirst({
      where: { organisationId, reportDate: new Date(String(reportDate)) },
      select: { id: true },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function updateDailyTenantReportRun(organisationId, reportDate, patch) {
  try {
    await prisma.dailyTenantReportRun.updateMany({
      where: {
        organisationId,
        reportDate: new Date(String(reportDate)),
      },
      data: {
        ...(patch.status != null ? { status: patch.status } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.ticket_count !== undefined ? { ticketCount: patch.ticket_count } : {}),
        ...(patch.sent_at !== undefined
          ? { sentAt: patch.sent_at ? new Date(String(patch.sent_at)) : null }
          : {}),
      },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}
