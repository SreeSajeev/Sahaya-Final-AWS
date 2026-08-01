import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

const OTP_SESSION_SNAKE_TO_CAMEL = {
  complaint_point_id: "complaintPointId",
  organisation_id: "organisationId",
  reporter_name: "reporterName",
  reporter_mobile: "reporterMobile",
  otp_hash: "otpHash",
  status: "status",
  attempt_count: "attemptCount",
  resend_count: "resendCount",
  expires_at: "expiresAt",
  verified_at: "verifiedAt",
  consumed_at: "consumedAt",
  ticket_id: "ticketId",
  ip_hash: "ipHash",
  user_agent_hash: "userAgentHash",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

function otpSessionPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [snake, camel] of Object.entries(OTP_SESSION_SNAKE_TO_CAMEL)) {
    if (!Object.prototype.hasOwnProperty.call(patch, snake)) continue;
    const v = patch[snake];
    if (
      (snake === "expires_at" ||
        snake === "verified_at" ||
        snake === "consumed_at" ||
        snake === "created_at" ||
        snake === "updated_at") &&
      v != null
    ) {
      data[camel] = new Date(String(v));
    } else {
      data[camel] = v;
    }
  }
  return data;
}

function otpSessionCreateToPrisma(row) {
  const data = otpSessionPatchToPrisma(row);
  if (row.id) data.id = row.id;
  return data;
}

export async function countRecentOtpSessions(complaintPointId, mobile10, sinceIso) {
  try {
    const count = await prisma.publicOtpSession.count({
      where: {
        complaintPointId,
        reporterMobile: mobile10,
        createdAt: { gte: new Date(sinceIso) },
      },
    });
    return count;
  } catch (err) {
    throw new Error(err?.message || "count failed");
  }
}

export async function findPendingOtpSession(complaintPointId, mobile10) {
  try {
    const now = new Date();
    const row = await prisma.publicOtpSession.findFirst({
      where: {
        complaintPointId,
        reporterMobile: mobile10,
        status: "pending",
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
    return mapPrismaRowToSnake(row);
  } catch (err) {
    throw new Error(err?.message || "lookup failed");
  }
}

export async function updateOtpSessionById(id, patch, { statusEq } = {}) {
  try {
    const where = { id, ...(statusEq ? { status: statusEq } : {}) };
    await prisma.publicOtpSession.updateMany({
      where,
      data: otpSessionPatchToPrisma(patch),
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function insertOtpSession(row) {
  try {
    await prisma.publicOtpSession.create({ data: otpSessionCreateToPrisma(row) });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function findOtpSessionById(id, selectCols = "*") {
  try {
    const row = await prisma.publicOtpSession.findUnique({ where: { id } });
    const mapped = mapPrismaRowToSnake(row);
    if (!mapped || selectCols === "*") return { data: mapped, error: null };
    const cols = String(selectCols)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    /** @type {Record<string, unknown>} */
    const filtered = {};
    for (const col of cols) {
      if (Object.prototype.hasOwnProperty.call(mapped, col)) filtered[col] = mapped[col];
    }
    return { data: filtered, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findOtpSessionByIdForUpdate(id) {
  const rows = await prisma.$queryRaw`
    SELECT *
    FROM public.public_otp_sessions
    WHERE id = ${id}::uuid
    FOR UPDATE
  `;
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ?? null;
}

export async function listOtpSessionsByIds(ids) {
  try {
    const rows = await prisma.publicOtpSession.findMany({ where: { id: { in: ids } } });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
