import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

const TOKEN_SNAKE_TO_CAMEL = {
  ticket_id: "ticketId",
  fe_id: "feId",
  action_type: "actionType",
  expires_at: "expiresAt",
  used: "used",
  token_state: "tokenState",
  activated_at: "activatedAt",
  revoked_at: "revokedAt",
  organisation_id: "organisationId",
  used_at: "usedAt",
};

function tokenPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [snake, camel] of Object.entries(TOKEN_SNAKE_TO_CAMEL)) {
    if (!Object.prototype.hasOwnProperty.call(patch, snake)) continue;
    const v = patch[snake];
    if ((snake.endsWith("_at") || snake === "expires_at") && v != null) {
      data[camel] = new Date(String(v));
    } else {
      data[camel] = v;
    }
  }
  return data;
}

function tokenInsertToPrisma(row) {
  const data = tokenPatchToPrisma(row);
  if (row.id) data.id = row.id;
  if (!data.tokenState && row.action_type) {
    data.tokenState = row.action_type === "RESOLUTION" ? "LOCKED" : "ACTIVE";
  }
  return data;
}

export async function insertFeActionToken(payload) {
  try {
    await prisma.feActionToken.create({ data: tokenInsertToPrisma(payload) });
    return { error: null };
  } catch (err) {
    throw toSupabaseStyleError(err);
  }
}

export async function insertFeActionTokenReturning(payload, select = "id") {
  try {
    const row = await prisma.feActionToken.create({ data: tokenInsertToPrisma(payload) });
    const mapped = mapPrismaRowToSnake(row);
    if (select === "id") return { data: { id: mapped?.id }, error: null };
    return { data: mapped, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getFeActionTokenById(tokenId, selectCols = "*") {
  try {
    const row = await prisma.feActionToken.findUnique({ where: { id: tokenId } });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getFeActionTokenByIdSingle(tokenId, selectCols = "*") {
  try {
    const row = await prisma.feActionToken.findUnique({ where: { id: tokenId } });
    if (!row) return { data: null, error: { message: "not found", code: "PGRST116" } };
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getUnusedFeActionTokenById(tokenId) {
  try {
    const row = await prisma.feActionToken.findFirst({
      where: { id: tokenId, used: false },
    });
    if (!row) return { data: null, error: { message: "not found", code: "PGRST116" } };
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findReusableFeActionToken({
  ticketId,
  feId,
  actionType,
  allowedStates,
  nowIso,
  hasTokenState,
}) {
  try {
    const where = {
      ticketId,
      feId,
      actionType,
      used: false,
      expiresAt: { gt: new Date(nowIso) },
      ...(hasTokenState && allowedStates?.length
        ? { tokenState: { in: allowedStates } }
        : {}),
    };
    const row = await prisma.feActionToken.findFirst({
      where,
      select: { id: true },
    });
    return row?.id ?? null;
  } catch (err) {
    throw toSupabaseStyleError(err);
  }
}

export async function markFeActionTokenUsedAtomic({
  tokenId,
  updatePayload,
  hasTokenState,
  nowIso,
  allowedStates = ["ACTIVE", "LOCKED"],
}) {
  try {
    const row = await prisma.feActionToken.findFirst({
      where: {
        id: tokenId,
        used: false,
        expiresAt: { gt: new Date(nowIso) },
        ...(hasTokenState ? { tokenState: { in: allowedStates } } : {}),
      },
      select: { id: true },
    });
    if (!row) throw new Error("Token already used or invalid");
    await prisma.feActionToken.update({
      where: { id: tokenId },
      data: tokenPatchToPrisma(updatePayload),
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.message === "Token already used or invalid") throw err;
    throw toSupabaseStyleError(err);
  }
}

export async function findResolutionFallbackToken({ ticketId, feId, nowIso }) {
  try {
    const row = await prisma.feActionToken.findFirst({
      where: {
        ticketId,
        actionType: "RESOLUTION",
        used: false,
        expiresAt: { gt: new Date(nowIso) },
        ...(feId ? { feId } : {}),
      },
      select: { id: true },
    });
    return row?.id ?? null;
  } catch (err) {
    throw toSupabaseStyleError(err);
  }
}

export async function activateLockedResolutionToken({ ticketId, feId, updatePayload, nowIso }) {
  try {
    const row = await prisma.feActionToken.updateMany({
      where: {
        ticketId,
        actionType: "RESOLUTION",
        tokenState: "LOCKED",
        used: false,
        expiresAt: { gt: new Date(nowIso) },
        ...(feId ? { feId } : {}),
      },
      data: tokenPatchToPrisma(updatePayload),
    });
    if (row.count === 0) return null;
    const activated = await prisma.feActionToken.findFirst({
      where: {
        ticketId,
        actionType: "RESOLUTION",
        tokenState: "ACTIVE",
        used: false,
        expiresAt: { gt: new Date(nowIso) },
        ...(feId ? { feId } : {}),
      },
      select: { id: true },
    });
    return activated?.id ?? null;
  } catch (err) {
    throw toSupabaseStyleError(err);
  }
}

export async function revokeFeActionTokensForTicket({ ticketId, updatePayload, hasTokenState }) {
  try {
    await prisma.feActionToken.updateMany({
      where: {
        ticketId,
        used: false,
        ...(hasTokenState ? { tokenState: { in: ["LOCKED", "ACTIVE"] } } : {}),
      },
      data: tokenPatchToPrisma(updatePayload),
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function markFeActionTokenExpired(tokenId) {
  try {
    await prisma.feActionToken.updateMany({
      where: { id: tokenId, used: false },
      data: { tokenState: "EXPIRED" },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function markFeActionTokenUsedSimple(tokenId) {
  try {
    await prisma.feActionToken.update({
      where: { id: tokenId },
      data: { used: true },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function findActiveFeActionTokenForTicket(ticketId, nowIso) {
  try {
    const row = await prisma.feActionToken.findFirst({
      where: {
        ticketId,
        used: false,
        expiresAt: { gt: new Date(nowIso) },
      },
      orderBy: { createdAt: "desc" },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findActiveResolutionTokenForTicket({
  ticketId,
  nowIso,
  tokenState = "ACTIVE",
}) {
  try {
    const row = await prisma.feActionToken.findFirst({
      where: {
        ticketId,
        actionType: "RESOLUTION",
        tokenState,
        used: false,
        expiresAt: { gt: new Date(nowIso) },
      },
      select: { id: true },
    });
    return { data: row ? { id: row.id } : null, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listFeActionTokensByFeAndTicketIds(feId, ticketIds, selectCols) {
  try {
    const rows = await prisma.feActionToken.findMany({
      where: { feId, ticketId: { in: ticketIds } },
      orderBy: { createdAt: "desc" },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findActiveResolutionTokenScoped({
  ticketId,
  tenantId,
  nowIso,
  hasTokenState,
  hasOrgOnTokens,
}) {
  try {
    const where = {
      ticketId,
      actionType: "RESOLUTION",
      used: false,
      expiresAt: { gt: new Date(nowIso) },
      ...(hasOrgOnTokens && tenantId ? { organisationId: tenantId } : {}),
      ...(hasOrgOnTokens && !tenantId ? { organisationId: null } : {}),
      ...(hasTokenState ? { tokenState: { in: ["LOCKED", "ACTIVE"] } } : {}),
    };
    const row = await prisma.feActionToken.findFirst({
      where,
      select: { id: true, feId: true, createdAt: true },
    });
    return row
      ? {
          id: row.id,
          fe_id: row.feId,
          created_at: row.createdAt?.toISOString() ?? null,
        }
      : null;
  } catch {
    return null;
  }
}

export async function consumeOnSiteTokenForTicket(ticketId) {
  try {
    const row = await prisma.feActionToken.findFirst({
      where: { ticketId, actionType: "ON_SITE", used: false },
      select: { id: true },
    });
    if (!row) return { data: [], error: null };
    await prisma.feActionToken.update({
      where: { id: row.id },
      data: { used: true },
    });
    return { data: [{ id: row.id }], error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
