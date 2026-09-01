import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";
import {
  DEFAULT_TENANT_SLA,
  normalizeEscalationLevels,
} from "../services/tenantSlaEngine.js";

function toSnake(row) {
  if (!row) return null;
  const s = mapPrismaRowToSnake(row);
  if (s && s.escalation_levels == null && row.escalationLevels != null) {
    s.escalation_levels = row.escalationLevels;
  }
  return s;
}

export async function getTenantSlaByOrgId(organisationId) {
  try {
    const row = await prisma.tenantSla.findUnique({ where: { organisationId } });
    return { data: toSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function upsertTenantSlaRow(organisationId, fields) {
  try {
    const escalationLevels = normalizeEscalationLevels(fields.escalation_levels ?? fields.escalationLevels);
    const data = {
      responseMinutes: Number(fields.response_minutes ?? fields.responseMinutes),
      resolutionMinutes: Number(fields.resolution_minutes ?? fields.resolutionMinutes),
      escalationLevels,
      businessHoursEnabled: Boolean(fields.business_hours_enabled ?? fields.businessHoursEnabled),
      startTime: fields.start_time ?? fields.startTime ?? null,
      endTime: fields.end_time ?? fields.endTime ?? null,
      workingDays: fields.working_days ?? fields.workingDays ?? DEFAULT_TENANT_SLA.workingDays,
      timezone: fields.timezone ?? fields.time_zone ?? DEFAULT_TENANT_SLA.timezone,
      updatedAt: new Date(),
    };
    const row = await prisma.tenantSla.upsert({
      where: { organisationId },
      create: {
        organisationId,
        ...data,
      },
      update: data,
    });
    return { data: toSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function ensureDefaultTenantSla(organisationId) {
  const existing = await getTenantSlaByOrgId(organisationId);
  if (existing.data) return existing;
  return upsertTenantSlaRow(organisationId, {
    response_minutes: DEFAULT_TENANT_SLA.responseMinutes,
    resolution_minutes: DEFAULT_TENANT_SLA.resolutionMinutes,
    escalation_levels: DEFAULT_TENANT_SLA.escalationLevels,
    business_hours_enabled: false,
    start_time: DEFAULT_TENANT_SLA.startTime,
    end_time: DEFAULT_TENANT_SLA.endTime,
    working_days: DEFAULT_TENANT_SLA.workingDays,
    timezone: DEFAULT_TENANT_SLA.timezone,
  });
}

export async function updateTicketEscalationLevel(ticketId, level) {
  try {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { escalationLevel: level },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}
