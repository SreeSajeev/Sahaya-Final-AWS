// src/services/tokenService.js
// Single-responsibility token lifecycle service

import crypto from "crypto"
import { supabase } from "../supabaseClient.js"
import { hasPublicColumn } from "./schemaCompatService.js"
import { FE_ACTION_TOKEN_EXPIRY_HOURS, SAFE_TOKEN_LIFECYCLE } from "../config/appConfig.js"

export const TOKEN_STATES = {
  LOCKED: "LOCKED",
  ACTIVE: "ACTIVE",
  USED: "USED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
}

function buildExpiryIso(hours = FE_ACTION_TOKEN_EXPIRY_HOURS) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

async function findReusableToken({ ticketId, feId, actionType, allowedStates, nowIso }) {
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  let query = supabase
    .from("fe_action_tokens")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("action_type", actionType)
    .eq("fe_id", feId)
    .eq("used", false)
    .gt("expires_at", nowIso)

  if (hasTokenState && allowedStates?.length) {
    query = query.in("token_state", allowedStates)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

async function insertToken({
  ticketId,
  feId,
  actionType,
  tokenState,
  expiresAtIso,
  idempotencyKey = null,
}) {
  const tokenId = crypto.randomUUID()
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  const hasIdempotencyKey = await hasPublicColumn("fe_action_tokens", "idempotency_key")

  const payload = {
    id: tokenId,
    ticket_id: ticketId,
    fe_id: feId,
    action_type: actionType,
    expires_at: expiresAtIso,
    used: false,
  }
  if (hasTokenState) payload.token_state = tokenState
  if (hasIdempotencyKey) payload.idempotency_key = idempotencyKey
  else if (idempotencyKey) {
    console.warn("[token-service] fe_action_tokens.idempotency_key missing; skipping safe write")
  }

  const { error } = await supabase.from("fe_action_tokens").insert(payload)
  if (error) throw error
  return tokenId
}

export async function issueAssignmentTokenPair({
  ticketId,
  feId,
  expiryHours = FE_ACTION_TOKEN_EXPIRY_HOURS,
  idempotencyKey = null,
}) {
  const nowIso = new Date().toISOString()
  const expiresAtIso = buildExpiryIso(expiryHours)

  const existingOnSite = await findReusableToken({
    ticketId,
    feId,
    actionType: "ON_SITE",
    allowedStates: [TOKEN_STATES.ACTIVE],
    nowIso,
  })

  const existingResolution = await findReusableToken({
    ticketId,
    feId,
    actionType: "RESOLUTION",
    allowedStates: [TOKEN_STATES.LOCKED],
    nowIso,
  })

  let onSiteToken = existingOnSite
  let resolutionToken = existingResolution

  if (!onSiteToken) {
    try {
      onSiteToken = await insertToken({
        ticketId,
        feId,
        actionType: "ON_SITE",
        tokenState: TOKEN_STATES.ACTIVE,
        expiresAtIso,
        idempotencyKey,
      })
    } catch (_err) {
      onSiteToken = await findReusableToken({
        ticketId,
        feId,
        actionType: "ON_SITE",
        allowedStates: [TOKEN_STATES.ACTIVE],
        nowIso,
      })
      if (!onSiteToken) throw _err
    }
  }

  if (!resolutionToken) {
    try {
      resolutionToken = await insertToken({
        ticketId,
        feId,
        actionType: "RESOLUTION",
        tokenState: TOKEN_STATES.LOCKED,
        expiresAtIso,
        idempotencyKey,
      })
    } catch (_err) {
      resolutionToken = await findReusableToken({
        ticketId,
        feId,
        actionType: "RESOLUTION",
        allowedStates: [TOKEN_STATES.LOCKED],
        nowIso,
      })
      if (!resolutionToken) throw _err
    }
  }

  return { onSiteToken, resolutionToken }
}

/**
 * Create FE action token
 * - One active, unexpired token per (ticket_id, action_type)
 * - Idempotent and race-safe
 */
export async function createActionToken({
  ticketId,
  feId,
  actionType,
}) {
  const nowIso = new Date().toISOString()
  const tokenState = actionType === "RESOLUTION" ? TOKEN_STATES.LOCKED : TOKEN_STATES.ACTIVE
  const reusableStates = actionType === "RESOLUTION" ? [TOKEN_STATES.LOCKED] : [TOKEN_STATES.ACTIVE]

  const existing = await findReusableToken({
    ticketId,
    feId,
    actionType,
    allowedStates: reusableStates,
    nowIso,
  })

  if (existing) {
    return existing
  }

  const expiresAtIso = buildExpiryIso()

  try {
    return await insertToken({
      ticketId,
      feId,
      actionType,
      tokenState,
      expiresAtIso,
    })
  } catch (insertError) {
    const retry = await findReusableToken({
      ticketId,
      feId,
      actionType,
      allowedStates: reusableStates,
      nowIso,
    })
    if (retry) return retry
    throw insertError
  }
}

/**
 * Mark token as used (atomic single-use guarantee)
 */
export async function markTokenUsed(tokenId) {
  const nowIso = new Date().toISOString()
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  const hasUsedAt = await hasPublicColumn("fe_action_tokens", "used_at")

  const updatePayload = { used: true }
  if (hasTokenState) updatePayload.token_state = TOKEN_STATES.USED
  if (hasUsedAt) updatePayload.used_at = nowIso

  let query = supabase
    .from("fe_action_tokens")
    .update(updatePayload)
    .eq("id", tokenId)
    .eq("used", false)
    .gt("expires_at", nowIso)
  if (hasTokenState) {
    query = query.in("token_state", [TOKEN_STATES.ACTIVE, TOKEN_STATES.LOCKED])
  }
  const { data, error } = await query.select("id")

  if (error) {
    throw error
  }

  if (!data || data.length === 0) {
    throw new Error("Token already used or invalid")
  }

  return true
}

export async function activateResolutionTokenAfterOnSiteProof({ ticketId, feId = null }) {
  const nowIso = new Date().toISOString()
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  const hasActivatedAt = await hasPublicColumn("fe_action_tokens", "activated_at")

  if (!hasTokenState || !SAFE_TOKEN_LIFECYCLE) {
    // Legacy-compatible fallback: token_state may not exist; treat unresolved resolution token as usable.
    let fallbackQuery = supabase
      .from("fe_action_tokens")
      .select("id")
      .eq("ticket_id", ticketId)
      .eq("action_type", "RESOLUTION")
      .eq("used", false)
      .gt("expires_at", nowIso)
    if (feId) fallbackQuery = fallbackQuery.eq("fe_id", feId)
    const { data, error } = await fallbackQuery.maybeSingle()
    if (error) throw error
    return data?.id ?? null
  }

  const updatePayload = { token_state: TOKEN_STATES.ACTIVE }
  if (hasActivatedAt) updatePayload.activated_at = nowIso

  let query = supabase
    .from("fe_action_tokens")
    .update(updatePayload)
    .eq("ticket_id", ticketId)
    .eq("action_type", "RESOLUTION")
    .eq("token_state", TOKEN_STATES.LOCKED)
    .eq("used", false)
    .gt("expires_at", nowIso)

  if (feId) query = query.eq("fe_id", feId)

  const { data, error } = await query.select("id").maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export async function revokeTokensForTicket({ ticketId, reason = null }) {
  const nowIso = new Date().toISOString()
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  const hasRevokedAt = await hasPublicColumn("fe_action_tokens", "revoked_at")
  const hasIdempotencyKey = await hasPublicColumn("fe_action_tokens", "idempotency_key")

  const updatePayload = { used: true }
  if (hasTokenState) updatePayload.token_state = TOKEN_STATES.REVOKED
  if (hasRevokedAt) updatePayload.revoked_at = nowIso
  if (hasIdempotencyKey) updatePayload.idempotency_key = reason ?? null

  let query = supabase
    .from("fe_action_tokens")
    .update(updatePayload)
    .eq("ticket_id", ticketId)
    .eq("used", false)
  if (hasTokenState) {
    query = query.in("token_state", [TOKEN_STATES.LOCKED, TOKEN_STATES.ACTIVE])
  }
  const { error } = await query

  if (error) throw error
}

export function isTokenExpired(expiresAt) {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() <= Date.now()
}
