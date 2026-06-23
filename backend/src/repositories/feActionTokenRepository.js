import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { isPrismaDbMode } from "./db/mode.js";
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
  idempotency_key: "idempotencyKey",
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
  if (isPrismaDbMode()) {
    try {
      await prisma.feActionToken.create({ data: tokenInsertToPrisma(payload) });
      return { error: null };
    } catch (err) {
      throw toSupabaseStyleError(err);
    }
  }
  const { error } = await supabase.from("fe_action_tokens").insert(payload);
  if (error) throw error;
  return { error: null };
}

export async function insertFeActionTokenReturning(payload, select = "id") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.feActionToken.create({ data: tokenInsertToPrisma(payload) });
      const mapped = mapPrismaRowToSnake(row);
      if (select === "id") return { data: { id: mapped?.id }, error: null };
      return { data: mapped, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("fe_action_tokens").insert(payload).select(select).single();
}

export async function getFeActionTokenById(tokenId, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.feActionToken.findUnique({ where: { id: tokenId } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("fe_action_tokens").select(selectCols).eq("id", tokenId).maybeSingle();
}

export async function getFeActionTokenByIdSingle(tokenId, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.feActionToken.findUnique({ where: { id: tokenId } });
      if (!row) return { data: null, error: { message: "not found", code: "PGRST116" } };
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("fe_action_tokens").select(selectCols).eq("id", tokenId).single();
}

export async function getUnusedFeActionTokenById(tokenId) {
  if (isPrismaDbMode()) {
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
  return supabase.from("fe_action_tokens").select("*").eq("id", tokenId).eq("used", false).single();
}

export async function findReusableFeActionToken({
  ticketId,
  feId,
  actionType,
  allowedStates,
  nowIso,
  hasTokenState,
}) {
  if (isPrismaDbMode()) {
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
  let query = supabase
    .from("fe_action_tokens")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("action_type", actionType)
    .eq("fe_id", feId)
    .eq("used", false)
    .gt("expires_at", nowIso);
  if (hasTokenState && allowedStates?.length) {
    query = query.in("token_state", allowedStates);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function markFeActionTokenUsedAtomic({
  tokenId,
  updatePayload,
  hasTokenState,
  nowIso,
  allowedStates = ["ACTIVE", "LOCKED"],
}) {
  if (isPrismaDbMode()) {
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
  let query = supabase
    .from("fe_action_tokens")
    .update(updatePayload)
    .eq("id", tokenId)
    .eq("used", false)
    .gt("expires_at", nowIso);
  if (hasTokenState) {
    query = query.in("token_state", allowedStates);
  }
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Token already used or invalid");
  return true;
}

export async function findResolutionFallbackToken({ ticketId, feId, nowIso }) {
  if (isPrismaDbMode()) {
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
  let fallbackQuery = supabase
    .from("fe_action_tokens")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("action_type", "RESOLUTION")
    .eq("used", false)
    .gt("expires_at", nowIso);
  if (feId) fallbackQuery = fallbackQuery.eq("fe_id", feId);
  const { data, error } = await fallbackQuery.maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function activateLockedResolutionToken({ ticketId, feId, updatePayload, nowIso }) {
  if (isPrismaDbMode()) {
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
  let query = supabase
    .from("fe_action_tokens")
    .update(updatePayload)
    .eq("ticket_id", ticketId)
    .eq("action_type", "RESOLUTION")
    .eq("token_state", "LOCKED")
    .eq("used", false)
    .gt("expires_at", nowIso);
  if (feId) query = query.eq("fe_id", feId);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function revokeFeActionTokensForTicket({ ticketId, updatePayload, hasTokenState }) {
  if (isPrismaDbMode()) {
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
  let query = supabase
    .from("fe_action_tokens")
    .update(updatePayload)
    .eq("ticket_id", ticketId)
    .eq("used", false);
  if (hasTokenState) {
    query = query.in("token_state", ["LOCKED", "ACTIVE"]);
  }
  return query;
}

export async function markFeActionTokenExpired(tokenId) {
  if (isPrismaDbMode()) {
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
  return supabase
    .from("fe_action_tokens")
    .update({ token_state: "EXPIRED" })
    .eq("id", tokenId)
    .eq("used", false);
}

export async function markFeActionTokenUsedSimple(tokenId) {
  if (isPrismaDbMode()) {
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
  return supabase.from("fe_action_tokens").update({ used: true }).eq("id", tokenId);
}

export async function findActiveFeActionTokenForTicket(ticketId, nowIso) {
  if (isPrismaDbMode()) {
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
  return supabase
    .from("fe_action_tokens")
    .select("*")
    .eq("ticket_id", ticketId)
    .eq("used", false)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function findActiveResolutionTokenForTicket({
  ticketId,
  nowIso,
  tokenState = "ACTIVE",
}) {
  if (isPrismaDbMode()) {
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
  return supabase
    .from("fe_action_tokens")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("action_type", "RESOLUTION")
    .eq("token_state", tokenState)
    .eq("used", false)
    .gt("expires_at", nowIso)
    .maybeSingle();
}

export async function listFeActionTokensByFeAndTicketIds(feId, ticketIds, selectCols) {
  if (isPrismaDbMode()) {
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
  return supabase
    .from("fe_action_tokens")
    .select(selectCols)
    .eq("fe_id", feId)
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: false });
}

export async function findActiveResolutionTokenScoped({
  ticketId,
  tenantId,
  nowIso,
  hasTokenState,
  hasOrgOnTokens,
}) {
  if (isPrismaDbMode()) {
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
  let query = supabase
    .from("fe_action_tokens")
    .select("id, fe_id, created_at")
    .eq("ticket_id", ticketId)
    .eq("action_type", "RESOLUTION")
    .eq("used", false)
    .gt("expires_at", nowIso);
  if (hasOrgOnTokens && tenantId) query = query.eq("organisation_id", tenantId);
  if (hasOrgOnTokens && !tenantId) query = query.is("organisation_id", null);
  if (hasTokenState) {
    query = query.in("token_state", ["LOCKED", "ACTIVE"]);
  }
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data ?? null;
}

export async function consumeOnSiteTokenForTicket(ticketId) {
  if (isPrismaDbMode()) {
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
  return supabase
    .from("fe_action_tokens")
    .update({ used: true })
    .eq("ticket_id", ticketId)
    .eq("action_type", "ON_SITE")
    .eq("used", false)
    .select("id")
    .limit(1);
}
